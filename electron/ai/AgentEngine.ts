/**
 * AgentEngine — manages deepagents instances and session lifecycle.
 *
 * V3 Architecture (LangGraph HITL aligned):
 * - threadId IS the sessionId (no separate ephemeral sessionId)
 * - Checkpointer manages all conversation history
 * - interruptOn replaces EditProposalManager's Promise-based HITL
 * - Interrupts are emitted as a single ai:run-interrupted event with
 *   proposal payload + partial assistant message
 * - Resume accepts a batch decisions[] array matching actionRequests[] in order
 * - decisions support three types: approve / edit / reject
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import type { WebContents } from 'electron'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { StructuredTool } from '@langchain/core/tools'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import { CompositeBackend, createDeepAgent, FilesystemBackend, LocalShellBackend } from 'deepagents'
import { Command } from '@langchain/langgraph'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { countTokensApproximately } from 'langchain'

import type { AiProviderConfig, AiAgentDomain, AiAgentMode, ThreadMessage, EditProposal } from '../../src/types/ai'
import { BLOCK_EDIT_TOOLS } from '../../src/types/ai'
import { getModelBudgetInfo } from '../../src/ai/model-budget'
import { estimateTextTokens } from '../../src/ai/token-estimation'
import { createChatModel } from './providers/ModelFactory'
import { buildDocumentTools } from './tools/DocumentTools'
import { buildEditProposalTools } from './tools/EditProposalTools'
import { buildCreativeArtifactTools } from './tools/CreativeArtifactTools'
import { SnapshotBroker } from './document/SnapshotBroker'
import type { CheckpointerInstance } from './checkpoint/CheckpointerFactory'
import { getCheckpointer } from './checkpoint/CheckpointerFactory'
import { ThreadListQuery, metaToAiThread } from './thread/ThreadListQuery'
import type {
  SendMessageRequest,
  ResumeDecision,
  SerializedSnapshot,
  CompactInputRequest,
  CompactInputResponse,
  SessionContextStatsResponse,
} from './ipc/protocol'
import {
  convertLcMessages,
  buildProposalFromAction,
} from './ipc/MessageAdapter'
import { StreamEventAdapter } from './ipc/StreamEventAdapter'
import { RendererEventBridge } from './ipc/RendererEventBridge'
import { buildUserMessage } from './ipc/UserMessageBuilder'
import { AttachedFileBackend } from './runtime/AttachedFileBackend'
import { buildFilesystemMounts, type FilesystemMount } from './runtime/FilesystemMounts'
import { resolveThreadRuntime } from './runtime/ThreadRuntimeResolver'
import { ThreadRuntimeStore } from './runtime/ThreadRuntimeStore'
import { AiConfigStore } from './config/AiConfigStore'

// Import system prompts from src (shared)
import { EDIT_SYSTEM_PROMPT } from '../../src/ai/thread/system-prompts/edit'
import { MINIMAL_SYSTEM_PROMPT } from '../../src/ai/thread/system-prompts/minimal'
import { CREATIVE_SYSTEM_PROMPT } from '../../src/ai/thread/system-prompts/creative'

// ── Types ───────────────────────────────────────────────────────────────────

type DeepAgentInstance = ReturnType<typeof createDeepAgent>

export class AgentEngine {
  private snapshotBroker: SnapshotBroker
  private rendererBridge: RendererEventBridge
  private aiRootPath: string
  private bundledSkillsPath: string

  /** One AbortController per active streaming threadId */
  private activeRuns = new Map<string, AbortController>()
  /** Thread-scoped runtime data: editor context + pending interrupts. */
  private runtimeStore = new ThreadRuntimeStore()

  /** Agent cache keyed by "configId:mode:modelId" */
  private agentCache = new Map<string, DeepAgentInstance>()

  /** Initialized once on first use */
  private checkpointerInstance: CheckpointerInstance | null = null
  private threadListQuery: ThreadListQuery | null = null

  constructor(private getWebContents: () => WebContents | null) {
    this.snapshotBroker = new SnapshotBroker(getWebContents)
    this.rendererBridge = new RendererEventBridge(getWebContents)
    this.aiRootPath = path.join(app.getPath('home'), '.iwriter', 'ai')
    this.bundledSkillsPath = path.join(app.getAppPath(), 'electron', 'ai', 'builtin-skills')
    this.ensureAiDirectories()
  }

  // ── Public: lifecycle ─────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const ci = await getCheckpointer()
    this.checkpointerInstance = ci
    this.threadListQuery = new ThreadListQuery(ci)
  }

  // ── Public: thread list (IPC ai:get-threads) ──────────────────────────────

  async getThreads() {
    await this._ensureInitialized()
    return (this.threadListQuery?.loadMetas() ?? []).map(metaToAiThread)
  }

  async getThreadMessages(threadId: string): Promise<import('../../src/types/ai').ThreadMessage[]> {
    await this._ensureInitialized()
    try {
      const tuple = await this.checkpointerInstance!.checkpointer.get({
        configurable: { thread_id: threadId },
      })
      if (!tuple) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = tuple as any
      // checkpointer.get() returns the checkpoint object directly (not wrapped in { checkpoint: ... })
      const rawMessages: any[] = t.channel_values?.messages ?? []
      return convertLcMessages(rawMessages)
    } catch (err) {
      console.error('[AgentEngine] getThreadMessages error:', err)
      return []
    }
  }

  deleteThread(threadId: string): void {
    this.threadListQuery?.deleteMeta(threadId)
    this.runtimeStore.deleteThread(threadId)
    this.activeRuns.delete(threadId)
    if (this.checkpointerInstance?.backend === 'sqlite' && this.checkpointerInstance.db) {
      try {
        this.checkpointerInstance.db
          .prepare('DELETE FROM checkpoints WHERE thread_id = ?')
          .run(threadId)
        this.checkpointerInstance.db
          .prepare('DELETE FROM writes WHERE thread_id = ?')
          .run(threadId)
      } catch { /* ignore */ }
    }
  }

  clearThreads(): void {
    this.threadListQuery?.clearMetas()
    this.runtimeStore.clear()
    this.activeRuns.clear()
    if (this.checkpointerInstance?.backend === 'sqlite' && this.checkpointerInstance.db) {
      try {
        this.checkpointerInstance.db.prepare('DELETE FROM checkpoints').run()
        this.checkpointerInstance.db.prepare('DELETE FROM writes').run()
      } catch { /* ignore */ }
    }
  }

  // ── Public: send message ──────────────────────────────────────────────────

  async sendMessage(req: SendMessageRequest): Promise<{ threadId: string }> {
    await this._ensureInitialized()

    const settings = AiConfigStore.loadSettings()

    // Resolve or create thread
    const threadId = req.threadId
      ?? `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const existingMeta = req.threadId ? this.threadListQuery?.getMeta(req.threadId) : null
    const runtime = resolveThreadRuntime(settings, req, existingMeta)
    const turnId = req.turnId ?? `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const isNewThread = !existingMeta
    if (isNewThread) {
      this.threadListQuery!.createMeta({
        id: threadId,
        domain: runtime.domain,
        mode: runtime.mode,
        modelId: runtime.modelId,
        providerConfigId: runtime.providerConfig.id,
        originFilePath: req.editorContext.filePath,
        thinkMode: runtime.thinkMode,
      })
    } else {
      this.threadListQuery!.updateMeta(threadId, {
        domain: runtime.domain,
        mode: runtime.mode,
        modelId: runtime.modelId,
        providerConfigId: runtime.providerConfig.id,
        thinkMode: runtime.thinkMode,
        originFilePath: existingMeta?.originFilePath ?? req.editorContext.filePath,
      })
    }

    // Update thread-scoped context from request
    this.runtimeStore.setContext(threadId, {
      activeFilePath: req.editorContext.filePath ?? null,
      workspacePath: req.editorContext.folderPath ?? null,
      attachmentTextFilePaths: req.attachments?.textFilePaths ?? [],
      attachmentBinaryFilePaths: req.attachments?.binaryFilePaths ?? [],
      attachmentDirectories: req.attachments?.directories ?? [],
    })
    this.runtimeStore.setCurrentTurnId(threadId, turnId)

    // Auto-title from first message
    if (isNewThread) {
      this.threadListQuery!.setTitle(threadId, req.userText.slice(0, 80))
    }

    const userContent = buildUserMessage(req)
    this._assertWithinBudget(runtime.providerConfig, runtime.domain, runtime.mode, runtime.modelId, runtime.thinkMode, userContent)

    // If this thread was left in an interrupted state (e.g., app restart during HITL),
    // clear the stale in-memory entry so the new message starts a fresh run.
    if (this.runtimeStore.getInterrupted(threadId)) {
      console.warn('[AgentEngine] sendMessage: clearing stale interrupted state for threadId:', threadId)
      this.runtimeStore.clearInterrupted(threadId)
    }

    // Run agent in background
    this._runSession(threadId, runtime.providerConfig, runtime.domain, runtime.mode, runtime.modelId, runtime.thinkMode, userContent).catch(err => {
      console.error('[AgentEngine] _runSession error:', err)
    })

    return { threadId }
  }

  async compactInput(req: CompactInputRequest): Promise<CompactInputResponse> {
    await this._ensureInitialized()

    const settings = AiConfigStore.loadSettings()
    const meta = req.threadId ? this.threadListQuery?.getMeta(req.threadId) : null
    const runtime = resolveThreadRuntime(settings, {
      userText: req.text,
      domain: req.domain,
      mode: req.mode,
      threadId: req.threadId,
      threadRuntime: req.threadRuntime,
      editorContext: {
        filePath: null,
        isDirty: false,
        folderPath: null,
        openTabs: [],
      },
    }, meta)

    const original = req.text.trim()
    const originalTokens = estimateTextTokens(original)
    if (!original) {
      return { text: '', originalTokens: 0, compactedTokens: 0 }
    }

    const model = createChatModel(runtime.providerConfig, {
      modelId: runtime.modelId,
      thinkMode: runtime.thinkMode,
    })

    const systemPrompt = [
      '你负责压缩用户输入，而不是回答问题。',
      '保留所有明确要求、约束、文件名、数字、步骤、风格偏好和验收标准。',
      '删除寒暄、重复、冗余解释和不影响执行的背景描述。',
      '输出语言保持和原文一致。',
      '只返回压缩后的文本，不要解释。',
    ].join('\n')

    const humanPrompt = [
      '请压缩下面这段用户输入，目标是在不丢失关键执行信息的前提下尽量减少 token。',
      '',
      original,
    ].join('\n')

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ])

    const compacted = typeof response.content === 'string'
      ? response.content.trim()
      : Array.isArray(response.content)
        ? response.content
            .filter((part: any) => part?.type === 'text')
            .map((part: any) => String(part?.text ?? ''))
            .join('')
            .trim()
        : ''

    const nextText = compacted && compacted.length < original.length ? compacted : original
    return {
      text: nextText,
      originalTokens,
      compactedTokens: estimateTextTokens(nextText),
    }
  }

  async getSessionContextStats(req: CompactInputRequest): Promise<SessionContextStatsResponse> {
    await this._ensureInitialized()

    const settings = AiConfigStore.loadSettings()
    const hasEnabledProvider = settings.providerConfigs.some(config => config.enabled)
    if (!hasEnabledProvider) {
      return {
        visible: false,
        currentTokens: 0,
        triggerTokens: 0,
      }
    }

    const meta = req.threadId ? this.threadListQuery?.getMeta(req.threadId) : null
    const runtime = resolveThreadRuntime(settings, {
      userText: req.text ?? '',
      domain: req.domain,
      mode: req.mode,
      threadId: req.threadId,
      threadRuntime: req.threadRuntime,
      editorContext: {
        filePath: null,
        isDirty: false,
        folderPath: null,
        openTabs: [],
      },
    }, meta)

    const model = createChatModel(runtime.providerConfig, {
      modelId: runtime.modelId,
      thinkMode: runtime.thinkMode,
    })
    const profile = (model as BaseChatModel & { profile?: ModelProfile }).profile
    const budget = getModelBudgetInfo(profile)
    if (!budget.maxInputTokens) {
      return {
        visible: false,
        currentTokens: 0,
        triggerTokens: 0,
      }
    }

    const currentTokens = await this._getCurrentSessionTokens(req.threadId, runtime.domain, runtime.mode)
    return {
      visible: true,
      currentTokens,
      triggerTokens: budget.triggerTokens,
      maxInputTokens: budget.maxInputTokens,
    }
  }

  // ── Public: cancel ────────────────────────────────────────────────────────

  cancel(threadId: string): void {
    const ac = this.activeRuns.get(threadId)
    if (ac) {
      ac.abort()
      this.activeRuns.delete(threadId)
    }
    this.runtimeStore.clearInterrupted(threadId)
    this.runtimeStore.clearCurrentTurnId(threadId)
  }

  // ── Public: resume (LangGraph HITL batch decisions) ───────────────────────

  async resumeRun(threadId: string, decisions: ResumeDecision[]): Promise<void> {
    const interrupted = this.runtimeStore.getInterrupted(threadId)
    if (!interrupted) {
      console.warn('[AgentEngine] resumeRun: no interrupted run for threadId:', threadId)
      return
    }
    this.runtimeStore.clearInterrupted(threadId)

    const settings = AiConfigStore.loadSettings()
    const meta = this.threadListQuery?.getMeta(threadId)
    const runtime = resolveThreadRuntime(settings, undefined, meta)
    if (!runtime) {
      console.error('[AgentEngine] resumeRun: could not resolve thread runtime')
      return
    }

    // Map decisions[] → LangGraph HITLResponse decisions.
    // decisions[i] corresponds to actionRequests[i] — array position is the contract.
    const lgDecisions = decisions.map((d, idx) => {
      if (d.type === 'approved') {
        return { type: 'approve' as const }
      }
      if (d.type === 'edited' && d.editedArgs) {
        return {
          type: 'edit' as const,
          editedAction: {
            name: interrupted.actionNames[idx] ?? '',
            args: d.editedArgs,
          },
        }
      }
      return {
        type: 'reject' as const,
        message: d.message ?? 'User rejected the edit.',
      }
    })

    const hiResp = { decisions: lgDecisions }

    this._continueSession(threadId, runtime.providerConfig, runtime.domain, runtime.mode, runtime.modelId, runtime.thinkMode, new Command({ resume: hiResp }))
      .catch(err => console.error('[AgentEngine] _continueSession error:', err))
  }

  // ── Private: run session ──────────────────────────────────────────────────

  private async _runSession(
    threadId: string,
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkMode: string | undefined,
    userContent: string,
  ): Promise<void> {
    const agent = this._getOrCreateAgent(threadId, config, domain, mode, modelId, thinkMode)
    const abortController = new AbortController()
    this.activeRuns.set(threadId, abortController)

    const runConfig = {
      configurable: this._buildRunConfigurable(threadId, domain),
      version: 'v2' as const,
      signal: abortController.signal,
      recursionLimit: 100,
    }

    await this._streamLoop(threadId, agent, { messages: [new HumanMessage(userContent)] }, runConfig)
  }

  private async _continueSession(
    threadId: string,
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkMode: string | undefined,
    command: typeof Command.prototype,
  ): Promise<void> {
    const agent = this._getOrCreateAgent(threadId, config, domain, mode, modelId, thinkMode)
    const abortController = new AbortController()
    this.activeRuns.set(threadId, abortController)

    const runConfig = {
      configurable: this._buildRunConfigurable(threadId, domain),
      version: 'v2' as const,
      signal: abortController.signal,
      recursionLimit: 100,
    }

    await this._streamLoop(threadId, agent, command, runConfig)
  }

  private async _streamLoop(
    threadId: string,
    agent: DeepAgentInstance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runConfig: any,
  ): Promise<void> {
    const abortController = this.activeRuns.get(threadId)
    const adapter = new StreamEventAdapter()

    try {
      for await (const event of await agent.streamEvents(input, runConfig)) {
        if (abortController?.signal.aborted) break
        for (const chunk of adapter.consume(threadId, event)) {
          this.rendererBridge.sendStreamChunk(chunk)
        }
        if (adapter.interrupted) {
          break
        }
      }

      if (abortController?.signal.aborted) {
        this.activeRuns.delete(threadId)
        return
      }

      if (adapter.interrupted) {
        const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined
        const partialMessage: ThreadMessage | undefined = adapter.buildPartialMessage(turnId)

        if (partialMessage) {
          this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })
        }

        if (adapter.interruptPayload) {
          await this._handleInterrupt(threadId, adapter.interruptPayload, partialMessage)
        } else {
          console.warn('[AgentEngine] adapter interrupted without interruptPayload', { threadId })
        }

        this.activeRuns.delete(threadId)
        return
      }

      this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })
      this.rendererBridge.sendRunDone({
        threadId,
        turnId: this.runtimeStore.getCurrentTurnId(threadId) ?? undefined,
      })
    } catch (err) {
      if (abortController?.signal.aborted) {
        this.activeRuns.delete(threadId)
        return
      }
      console.error('[AgentEngine] Stream error:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)

      this.threadListQuery?.updateMeta(threadId, { hasError: true, updatedAt: Date.now() })

      // ai:run-error carries the error message; renderer displays it and resets state.
      // ai:run-done (no message payload) signals completion so the renderer clears streaming UI.
      // Do NOT include a message in ai:run-done — the renderer's onAiRunError handler already
      // creates the chat message, and a second message here causes duplicate error display.
      const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined
      this.rendererBridge.sendRunError({ threadId, turnId, error: errorMsg })
      this.rendererBridge.sendRunDone({ threadId, turnId })
    } finally {
      if (!this.runtimeStore.getInterrupted(threadId)) {
        this.runtimeStore.clearCurrentTurnId(threadId)
      }
      this.activeRuns.delete(threadId)
    }
  }

  // ── Private: interrupt handling ───────────────────────────────────────────

  private async _handleInterrupt(
    threadId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interruptValue: any,
    partialMessage?: ThreadMessage,
  ): Promise<void> {
    // interruptValue: HITLRequest { actionRequests: [{ name, args }], reviewConfigs: [...] }
    const actionRequests: Array<{ name: string; args: Record<string, unknown> }> =
      interruptValue?.actionRequests ?? []
    const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined

    if (!actionRequests.length) {
      console.warn('[AgentEngine] Interrupt with no actionRequests:', interruptValue)
      return
    }

    // Request snapshot using the first action's file path as the primary target.
    // All proposals in one interrupt batch share the same snapshot (block IDs are stable).
    const firstArgs = actionRequests[0].args ?? {}
    const argFilePath = typeof firstArgs.file_path === 'string' ? firstArgs.file_path : null
    const activeFilePath = this.runtimeStore.getContext(threadId)?.activeFilePath ?? null
    const snapshotTargetPath = (argFilePath && argFilePath !== activeFilePath)
      ? argFilePath
      : null

    let snapshot: SerializedSnapshot | null = null
    try {
      snapshot = await this.snapshotBroker.requestSnapshot(snapshotTargetPath)
    } catch (err) {
      console.warn('[AgentEngine] Could not get snapshot for interrupt:', err)
    }

    // Build one proposal per actionRequest, preserving order
    const pendingEditToolCalls = (partialMessage?.toolCalls ?? []).filter(tc =>
      BLOCK_EDIT_TOOLS.has(tc.name) && tc.status !== 'completed'
    )
    const proposals: EditProposal[] = actionRequests.map((ar, index) =>
      buildProposalFromAction(
        ar.name,
        ar.args ?? {},
        snapshot,
        pendingEditToolCalls[index]?.id,
        partialMessage?.id,
        turnId,
      )
    )

    this.runtimeStore.setInterrupted(threadId, {
      actionRequestCount: actionRequests.length,
      actionNames: actionRequests.map(ar => ar.name),
      turnId,
    })

    // Emit single atomic event (replaces old two-event sequence)
    // actionRequests are included so the renderer can align decisions by index
    this.rendererBridge.sendRunInterrupted({ threadId, turnId, proposals, partialMessage, actionRequests })
  }

  // ── Private: agent cache ──────────────────────────────────────────────────

  private _getOrCreateAgent(
    threadId: string,
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkMode?: string,
  ): DeepAgentInstance {
    const mounts = this._getFilesystemMounts(threadId)
    // Include apiKey and baseUrl in the key so that credential updates immediately
    // produce a new agent instance rather than reusing a stale one.
    const keyFingerprint = config.apiKey ? config.apiKey.slice(-8) : ''
    const mountKey = mounts.map(mount => `${mount.virtualPath}:${mount.hostPath}:${mount.kind}`).join('|')
    const cacheKey = `${threadId}:${config.id}:${domain}:${mode}:${modelId}:${thinkMode ?? ''}:${keyFingerprint}:${config.baseUrl ?? ''}:${mountKey}`
    if (this.agentCache.has(cacheKey)) return this.agentCache.get(cacheKey)!

    const model = createChatModel(config, { modelId, thinkMode })
    const capabilities = this._buildAgentCapabilities(domain, mode, mounts)
    const agent = createDeepAgent({
      model,
      systemPrompt: getSystemPrompt(domain, mode),
      tools: capabilities.tools,
      backend: capabilities.backend,
      skills: capabilities.skills,
      memory: [path.join(this.aiRootPath, 'memory', 'AGENTS.md')].filter(fs.existsSync),
      checkpointer: this.checkpointerInstance?.checkpointer,
      interruptOn: capabilities.interruptOn,
    })

    this.agentCache.set(cacheKey, agent)
    return agent
  }

  private _buildRunConfigurable(threadId: string, domain: AiAgentDomain): Record<string, string> {
    return this.runtimeStore.buildConfigurable(threadId, domain)
  }

  private _getFilesystemMounts(threadId: string): FilesystemMount[] {
    const ctx = this.runtimeStore.getContext(threadId)
    return buildFilesystemMounts(ctx?.workspacePath ?? null, {
      textFilePaths: ctx?.attachmentTextFilePaths ?? [],
      binaryFilePaths: ctx?.attachmentBinaryFilePaths ?? [],
      directories: ctx?.attachmentDirectories ?? [],
    })
  }

  private async _getCurrentSessionTokens(
    threadId: string | undefined,
    domain: AiAgentDomain,
    mode: AiAgentMode,
  ): Promise<number> {
    if (!threadId) return 0

    try {
      const tuple = await this.checkpointerInstance!.checkpointer.get({
        configurable: { thread_id: threadId },
      })
      if (!tuple) return 0
      const t = tuple as any
      const channelValues = t.channel_values ?? {}
      const rawMessages = Array.isArray(channelValues.messages) ? channelValues.messages : []
      const summarizationEvent = channelValues._summarizationEvent
      const effectiveMessages = summarizationEvent?.summaryMessage
        ? [summarizationEvent.summaryMessage, ...rawMessages.slice(summarizationEvent.cutoffIndex ?? 0)]
        : rawMessages
      const mounts = this._getFilesystemMounts(threadId)
      const capabilities = this._buildAgentCapabilities(domain, mode, mounts)
      const systemPrompt = new SystemMessage(getSystemPrompt(domain, mode))
      return countTokensApproximately(
        [systemPrompt, ...effectiveMessages],
        capabilities.tools as unknown as Array<Record<string, any>>
      )
    } catch (err) {
      console.warn('[AgentEngine] Failed to compute current session tokens:', err)
      return 0
    }
  }

  // ── Private: init ─────────────────────────────────────────────────────────

  private async _ensureInitialized(): Promise<void> {
    if (!this.checkpointerInstance) await this.initialize()
  }

  private ensureAiDirectories(): void {
    const dirs = [
      this.aiRootPath,
      path.join(this.aiRootPath, 'memory'),
      path.join(this.aiRootPath, 'skills'),
      path.join(this.aiRootPath, 'subagents'),
    ]
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
    this.syncBundledSkills()
  }

  private syncBundledSkills(): void {
    if (!fs.existsSync(this.bundledSkillsPath)) return
    const targetRoot = path.join(this.aiRootPath, 'skills')
    const entries = fs.readdirSync(this.bundledSkillsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourceDir = path.join(this.bundledSkillsPath, entry.name)
      const targetDir = path.join(targetRoot, entry.name)
      fs.mkdirSync(targetDir, { recursive: true })
      const files = fs.readdirSync(sourceDir, { withFileTypes: true })
      for (const file of files) {
        if (!file.isFile()) continue
        fs.copyFileSync(path.join(sourceDir, file.name), path.join(targetDir, file.name))
      }
    }
  }

  private _buildAgentCapabilities(
    domain: AiAgentDomain,
    mode: AiAgentMode,
    mounts: FilesystemMount[]
  ): {
    tools: StructuredTool[]
    skills: string[]
    backend?: CompositeBackend | FilesystemBackend | LocalShellBackend
    interruptOn?: Record<string, { allowedDecisions: string[] }>
  } {
    if (domain === 'creative') {
      return {
        tools: [...buildCreativeArtifactTools(this.aiRootPath)],
        skills: ['/skills/'],
        backend: new LocalShellBackend({ rootDir: this.aiRootPath }),
      }
    }

    if (mode === 'minimal') {
      return { tools: [], skills: [] }
    }

    const docTools = buildDocumentTools(this.snapshotBroker)
    const editTools = buildEditProposalTools()
    const workspaceMount = mounts.find(mount => mount.virtualPath === '/')
    const defaultBackend = new FilesystemBackend({
      rootDir: workspaceMount?.hostPath ?? path.join(this.aiRootPath, 'empty-fs'),
      virtualMode: true,
    })
    const routes = Object.fromEntries(
      mounts
        .filter(mount => mount.virtualPath !== '/')
        .map(mount => [
          mount.virtualPath,
          mount.kind === 'attached_file'
            ? new AttachedFileBackend(mount.hostPath)
            : new FilesystemBackend({ rootDir: mount.hostPath, virtualMode: true }),
        ])
    )
    return {
      tools: [...docTools, ...editTools],
      backend: new CompositeBackend(defaultBackend, routes),
      skills: [],
      interruptOn: {
        edit_block:      { allowedDecisions: ['approve', 'edit', 'reject'] },
        insert_block:    { allowedDecisions: ['approve', 'edit', 'reject'] },
        delete_block:    { allowedDecisions: ['approve', 'reject'] },
        replace_range:   { allowedDecisions: ['approve', 'edit', 'reject'] },
        create_document: { allowedDecisions: ['approve', 'edit', 'reject'] },
      },
    }
  }

  private _assertWithinBudget(
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkMode: string | undefined,
    userContent: string,
  ): void {
    const systemPrompt = getSystemPrompt(domain, mode)
    const inputTokens = estimateTextTokens(systemPrompt) + estimateTextTokens(userContent)
    const model = createChatModel(config, { modelId, thinkMode })
    const budgetInfo = getModelBudgetInfo((model as BaseChatModel & { profile?: ModelProfile }).profile)
    const allowedBudget = budgetInfo.triggerTokens

    if (inputTokens <= allowedBudget) return

    throw new Error(
      `当前请求预计约 ${inputTokens} tokens，已超过摘要触发预算 ${allowedBudget}。请先点击 Compact 压缩输入，或减少附件与上下文。`
    )
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSystemPrompt(domain: AiAgentDomain, mode: AiAgentMode): string {
  if (domain === 'creative') {
    return CREATIVE_SYSTEM_PROMPT
  }
  switch (mode) {
    case 'minimal': return MINIMAL_SYSTEM_PROMPT
    case 'edit': return EDIT_SYSTEM_PROMPT
    default: return EDIT_SYSTEM_PROMPT
  }
}
