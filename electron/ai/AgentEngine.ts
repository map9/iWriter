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
import type { BaseMessage } from '@langchain/core/messages'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import { createDeepAgent, type DeepAgentRunStream } from 'deepagents'
import { Command } from '@langchain/langgraph'
import { HumanMessage, SystemMessage, isAIMessage, isToolMessage, isHumanMessage } from '@langchain/core/messages'
import {
  modelCallLimitMiddleware,
  toolCallLimitMiddleware,
} from 'langchain'

import type { AiProviderConfig, AiAgentDomain, AiAgentMode, AiThinkingLevel, ThreadMessage } from '../../src/types/ai'
import { isAiProviderUsable, resolveApiKeyReference } from '../../src/types/ai'
import { getModelBudgetInfo } from '../../src/ai/model/model-budget'
import { estimateTextTokens } from '../../src/ai/model/token-estimation'
import { createChatModel } from './providers/ModelFactory'
import { SnapshotBroker } from './document/SnapshotBroker'
import type { CheckpointerInstance } from './checkpoint/CheckpointerFactory'
import { getCheckpointer } from './checkpoint/CheckpointerFactory'
import { ThreadListQuery, metaToAiThread } from './thread/ThreadListQuery'
import type {
  SendMessageRequest,
  ResumeDecision,
  CompactInputRequest,
  CompactInputResponse,
  SessionContextStatsResponse,
} from './ipc/protocol'
import { convertLcMessages } from './ipc/MessageAdapter'
import { StreamEventAdapter } from './ipc/StreamEventAdapter'
import { RendererEventBridge } from './ipc/RendererEventBridge'
import { buildUserMessage } from './ipc/UserMessageBuilder'
import { resolveThreadRuntime } from './runtime/ThreadRuntimeResolver'
import { ThreadRuntimeStore, type InterruptedRun } from './runtime/ThreadRuntimeStore'
import { buildAgentFilesystem, FILE_WRITE_INTERRUPT_ON_NAMES, type AgentFilesystemScaffold } from './scaffold/filesystem/AgentFilesystem'
import { decideFilesystemWriteApproval, isFilesystemWriteToolName } from './scaffold/approval/FilesystemApprovalPolicy'
import { AiConfigStore, resolveAiApiKeyEnvVar } from './config/AiConfigStore'
import { generateThreadTitle } from '../../src/ai/thread/title'
import { IWriterAgentContextSchema, type IWriterAgentContext } from './runtime/AgentContext'
import { createTaskToolCompatMiddleware } from './scaffold/middleware/TaskToolCompatMiddleware'
import { createOrphanToolCallStripperMiddleware } from './scaffold/middleware/OrphanToolCallStripperMiddleware'
import { createHumanRespondMessageMiddleware, RESPOND_MARKER } from './scaffold/middleware/HumanRespondMessageMiddleware'
import { CheckpointerAdmin } from './checkpoint/CheckpointerAdmin'
import { MIDDLEWARE_CONFIG, createInstrumentedFallbackMiddleware } from './scaffold/middleware/middleware-config'
import { buildMemorySources, createReadonlyMemoryMiddleware } from './scaffold/memory/MemorySources'
import type { DomainStrategy } from './domain/DomainStrategy'
import { EditDomainStrategy } from './domain/edit/EditDomainStrategy'
import { CreativeDomainStrategy } from './domain/creative/CreativeDomainStrategy'
import { detectInputLanguage, type DetectedInputLanguage } from '../../src/ai/message/detectInputLanguage'

// ── Types ───────────────────────────────────────────────────────────────────

type DeepAgentInstance = { streamEvents: unknown }
type HitlActionRequest = { name: string; args: Record<string, unknown> }
type TokenCounter = (messages: BaseMessage[], tools?: unknown) => number
type SummarizationMiddlewareOptions = {
  model: BaseChatModel
  tokenCounter: TokenCounter
}
type CreateDeepAgentWithSummarization = (
  params: Parameters<typeof createDeepAgent>[0] & {
    summarizationMiddlewareOptions?: SummarizationMiddlewareOptions
  },
) => DeepAgentInstance

export class AgentEngine {
  private snapshotBroker: SnapshotBroker
  private rendererBridge: RendererEventBridge
  private aiRootPath: string
  private bundledSkillsPath: string

  /** One AbortController per active streaming threadId */
  private activeRuns = new Map<string, AbortController>()
  /** Thread-scoped runtime data: editor context + pending interrupts. */
  private runtimeStore = new ThreadRuntimeStore()

  /** Agent cache keyed by thread + runtime + filesystem fingerprint. */
  private agentCache = new Map<string, { agent: DeepAgentInstance, scaffold: AgentFilesystemScaffold }>()
  /** One model fallback notification per thread turn, even when cached agents retry/resume. */
  private fallbackNotifiedTurnKeys = new Set<string>()

  /** Initialized once on first use */
  private checkpointerInstance: CheckpointerInstance | null = null
  private checkpointerAdmin: CheckpointerAdmin | null = null
  private threadListQuery: ThreadListQuery | null = null

  /** Domain strategy table — add new domains here only. AgentEngine itself never branches on domain. */
  private readonly strategies: Record<AiAgentDomain, DomainStrategy>

  constructor(private getWebContents: () => WebContents | null) {
    this.snapshotBroker = new SnapshotBroker(getWebContents)
    this.rendererBridge = new RendererEventBridge(getWebContents)
    this.aiRootPath = path.join(app.getPath('home'), '.iwriter', 'ai')
    this.bundledSkillsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'builtin-skills')
      : path.join(app.getAppPath(), 'electron', 'ai', 'builtin-skills')
    this.strategies = {
      editing: new EditDomainStrategy(this.snapshotBroker, this.aiRootPath, this.runtimeStore),
      creative: new CreativeDomainStrategy(
        this.snapshotBroker,
        this.aiRootPath,
        this.runtimeStore,
        () => this.invalidateAgentCache(),
      ),
    }
    // 目录初始化移至 initialize()（异步），不在构造函数同步执行
  }

  // ── Public: lifecycle ─────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    // 首次使用 AI 时初始化目录与技能（异步，不阻塞启动路径）
    await this.ensureAiDirectories()
    const ci = await getCheckpointer()
    this.checkpointerInstance = ci
    this.checkpointerAdmin = new CheckpointerAdmin(ci)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawMessages: any[] = t.channel_values?.messages ?? []
      await this._maybeRehydrateInterrupt(threadId, rawMessages)
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
    this._clearFallbackNotificationKeys(threadId)
    this._deleteCachedAgentsForThread(threadId)
    this.checkpointerAdmin?.deleteThread(threadId)
  }

  clearThreads(): void {
    this.threadListQuery?.clearMetas()
    this.runtimeStore.clear()
    this.activeRuns.clear()
    this.fallbackNotifiedTurnKeys.clear()
    this._clearAgentCache()
    this.checkpointerAdmin?.clearAll()
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
        thinkingLevel: runtime.thinkingLevel,
      })
    } else {
      this.threadListQuery!.updateMeta(threadId, {
        domain: runtime.domain,
        mode: runtime.mode,
        modelId: runtime.modelId,
        providerConfigId: runtime.providerConfig.id,
        thinkingLevel: runtime.thinkingLevel,
        originFilePath: existingMeta?.originFilePath ?? req.editorContext.filePath,
      })
    }

    // Update thread-scoped context from request
    const language = detectInputLanguage([req.userText], req.uiLocale)
    this.runtimeStore.setContext(threadId, {
      activeFilePath: req.editorContext.filePath ?? null,
      workspacePath: req.editorContext.folderPath ?? null,
      language,
      attachmentTextFilePaths: req.attachments?.textFilePaths ?? [],
      attachmentBinaryFilePaths: req.attachments?.binaryFilePaths ?? [],
      attachmentDirectories: req.attachments?.directories ?? [],
    })
    this.runtimeStore.setCurrentTurnId(threadId, turnId)

    // Auto-title from first message
    if (isNewThread) {
      this.threadListQuery!.setTitle(threadId, generateThreadTitle(req.userText))
    }

    const userContent = buildUserMessage(req)
    this._assertWithinBudget(runtime.providerConfig, runtime.domain, runtime.mode, runtime.modelId, runtime.thinkingLevel, userContent, language)

    // If this thread was left in an interrupted state (e.g., app restart during HITL),
    // clear the stale in-memory entry so the new message starts a fresh run.
    if (this.runtimeStore.getInterrupted(threadId)) {
      console.warn('[AgentEngine] sendMessage: clearing stale interrupted state for threadId:', threadId)
      this.runtimeStore.clearInterrupted(threadId)
    }

    // Run agent in background
    this._runSession(threadId, runtime.providerConfig, runtime.domain, runtime.mode, runtime.modelId, runtime.thinkingLevel, userContent, language).catch(err => {
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
      thinkingLevel: runtime.thinkingLevel,
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((part: any) => part?.type === 'text')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const hasUsableProvider = settings.providerConfigs.some(config =>
      isAiProviderUsable(config, { resolveApiKey: resolveAiApiKeyEnvVar })
    )
    if (!hasUsableProvider) {
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
      thinkingLevel: runtime.thinkingLevel,
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
    this._clearFallbackNotificationKeys(threadId, this.runtimeStore.getCurrentTurnId(threadId))
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

    const fullDecisions = this._mergeResumeDecisions(interrupted, decisions)

    // Map decisions[] → LangGraph HITLResponse decisions.
    // decisions[i] corresponds to actionRequests[i] — array position is the contract.
    const lgDecisions = fullDecisions.map((d, idx) => {
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
      if (d.type === 'responded') {
        if (!d.message?.trim()) {
          throw new Error('[AgentEngine] responded decision requires non-empty message')
        }
        // Use reject channel to satisfy langchain HITL's allowed-decisions constraint.
        // HumanRespondMessageMiddleware strips the marker and removes status:'error'
        // before the message reaches the LLM, so it reads as guidance, not a failure.
        return {
          type: 'reject' as const,
          message: `${RESPOND_MARKER}${d.message}`,
        }
      }
      return {
        type: 'reject' as const,
        message: d.message ?? 'User rejected the edit.',
      }
    })

    const hiResp = { decisions: lgDecisions }

    const language = this.runtimeStore.getContext(threadId)?.language ?? 'en-US'
    const resumePromise = this._continueSession(
      threadId,
      runtime.providerConfig,
      runtime.domain,
      runtime.mode,
      runtime.modelId,
      runtime.thinkingLevel,
      new Command({ resume: hiResp }),
      language,
    )
    resumePromise.catch(err => console.error('[AgentEngine] _continueSession error:', err))

    if (fullDecisions.some(d => d.type === 'responded')) {
      // Housekeeping: strip RESPOND_MARKER after the resumed stream has settled, so we clean
      // both the new checkpoint and any LangGraph write rows produced during resume.
      resumePromise.finally(() => {
        this.checkpointerAdmin?.stripRespondMarkers(threadId).catch(() => { /* ignore */ })
      }).catch(() => { /* ignore */ })
    }
  }

  private _mergeResumeDecisions(interrupted: InterruptedRun, reviewDecisions: ResumeDecision[]): ResumeDecision[] {
    const fullDecisions: ResumeDecision[] = Array.from(
      { length: interrupted.actionRequestCount },
      () => ({ type: 'rejected' as const, message: 'User did not review this action.' }),
    )

    for (const [indexText, decision] of Object.entries(interrupted.autoDecisionsByIndex ?? {})) {
      const index = Number(indexText)
      if (Number.isInteger(index) && index >= 0 && index < fullDecisions.length) {
        fullDecisions[index] = this._cloneResumeDecision(decision)
      }
    }

    const reviewIndices = interrupted.reviewActionOriginalIndices
      ?? reviewDecisions.map((_, index) => index)

    reviewDecisions.forEach((decision, reviewIndex) => {
      const originalIndex = reviewIndices[reviewIndex]
      if (originalIndex === undefined || originalIndex < 0 || originalIndex >= fullDecisions.length) return
      fullDecisions[originalIndex] = this._cloneResumeDecision(decision)
    })

    return fullDecisions
  }

  private _cloneResumeDecision(decision: ResumeDecision): ResumeDecision {
    if (decision.type === 'approved') return { type: 'approved' }
    if (decision.type === 'edited') {
      return {
        type: 'edited',
        editedArgs: decision.editedArgs ? { ...decision.editedArgs } : undefined,
        message: decision.message,
      }
    }
    if (decision.type === 'responded') {
      return { type: 'responded', message: decision.message }
    }
    return { type: 'rejected', message: decision.message }
  }

  // ── Private: run session ──────────────────────────────────────────────────

  private async _runSession(
    threadId: string,
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkingLevel: AiThinkingLevel,
    userContent: string,
    language: DetectedInputLanguage,
  ): Promise<void> {
    const agent = this._getOrCreateAgent(threadId, config, domain, mode, modelId, thinkingLevel, language)
    const abortController = new AbortController()
    this.activeRuns.set(threadId, abortController)

    const turnId = this.runtimeStore.getCurrentTurnId(threadId)
    const runConfig = {
      configurable: this._buildRunConfigurable(threadId),
      context: this._buildRunContext(threadId, domain),
      signal: abortController.signal,
      recursionLimit: MIDDLEWARE_CONFIG.recursionLimit,
      runName: `${domain}:initial`,
      metadata: { threadId, turnId, phase: 'initial' },
      tags: ['phase:initial'],
    }

    await this._seedSummarizationBaseline(threadId)
    await this._streamLoop(threadId, agent, { messages: [new HumanMessage(userContent)] }, runConfig)
  }

  private async _continueSession(
    threadId: string,
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkingLevel: AiThinkingLevel,
    command: typeof Command.prototype,
    language: DetectedInputLanguage,
  ): Promise<void> {
    const agent = this._getOrCreateAgent(threadId, config, domain, mode, modelId, thinkingLevel, language)
    const abortController = new AbortController()
    this.activeRuns.set(threadId, abortController)

    const turnId = this.runtimeStore.getCurrentTurnId(threadId)
    const runConfig = {
      configurable: this._buildRunConfigurable(threadId),
      context: this._buildRunContext(threadId, domain),
      signal: abortController.signal,
      recursionLimit: MIDDLEWARE_CONFIG.recursionLimit,
      runName: `${domain}:resume`,
      metadata: { threadId, turnId, phase: 'resume' },
      tags: ['phase:resume'],
    }

    await this._seedSummarizationBaseline(threadId)
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
    const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined
    const adapter = new StreamEventAdapter(threadId, turnId, this.rendererBridge)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const run = await (agent.streamEvents as any)(input, { ...runConfig, version: 'v3' }) as DeepAgentRunStream
      await Promise.all([
        adapter.consumeMessages(run.messages),
        adapter.consumeToolCalls(run.toolCalls),
        adapter.consumeSubagents(run.subagents),
      ])
      await run.output.catch((err: unknown) => {
        if (!abortController?.signal.aborted && !run.interrupted) throw err
      })

      if (abortController?.signal.aborted) {
        this.activeRuns.delete(threadId)
        return
      }

      if (run.interrupted) {
        const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined
        const partialMessage: ThreadMessage | undefined = adapter.buildPartialMessage(turnId)

        if (partialMessage) {
          this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })
        }

        if (run.interrupts.length > 0) {
          await this._handleInterrupt(threadId, run.interrupts[0]!.payload, partialMessage)
        } else {
          console.warn('[AgentEngine] run interrupted but no interrupts payload', { threadId })
        }

        this.activeRuns.delete(threadId)
        return
      }

      if (!adapter.hasVisibleAssistantOutput()) {
        const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined
        const errorMsg = adapter.hasAnyAssistantSignal()
          ? '模型没有返回可显示内容或可执行工具调用，可能生成了非法工具调用参数。请重试。'
          : '模型没有返回可显示内容。请重试。'
        this.threadListQuery?.updateMeta(threadId, { hasError: true, updatedAt: Date.now() })
        this.rendererBridge.sendRunError({ threadId, turnId, error: errorMsg })
        this.rendererBridge.sendRunDone({ threadId, turnId })
        return
      }

      this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })
      const sessionDomain = this.threadListQuery?.getMeta(threadId)?.domain ?? 'editing'
      this.strategies[sessionDomain].onSessionComplete?.({
        threadId,
        workspacePath: this.runtimeStore.getContext(threadId)?.workspacePath ?? null,
      })
      await this._detectAndNotifySummarization(threadId)
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
        this._clearFallbackNotificationKeys(threadId, this.runtimeStore.getCurrentTurnId(threadId))
        this.runtimeStore.clearCurrentTurnId(threadId)
      }
      this.activeRuns.delete(threadId)
    }
  }

  // ── Private: interrupt handling ───────────────────────────────────────────

  private _prepareActionRequestsForReview(
    threadId: string,
    actionRequests: HitlActionRequest[],
  ): {
    reviewActionRequests: HitlActionRequest[]
    reviewActionOriginalIndices: number[]
    autoDecisionsByIndex: Record<number, ResumeDecision>
    autoRejects: Array<{ toolName: string; filePath: string; message: string }>
  } {
    const workspacePath = this.runtimeStore.getContext(threadId)?.workspacePath ?? null
    const reviewActionRequests: HitlActionRequest[] = []
    const reviewActionOriginalIndices: number[] = []
    const autoDecisionsByIndex: Record<number, ResumeDecision> = {}
    const autoRejects: Array<{ toolName: string; filePath: string; message: string }> = []
    let hasAutoReject = false

    actionRequests.forEach((actionRequest, index) => {
      if (!isFilesystemWriteToolName(actionRequest.name)) {
        reviewActionRequests.push(actionRequest)
        reviewActionOriginalIndices.push(index)
        return
      }

      const decision = decideFilesystemWriteApproval({
        toolName: actionRequest.name,
        args: actionRequest.args ?? {},
        workspacePath,
      })

      if (decision.kind === 'requires-review') {
        reviewActionRequests.push(actionRequest)
        reviewActionOriginalIndices.push(index)
        return
      }

      autoDecisionsByIndex[index] = decision.decision
      if (decision.kind === 'auto-reject') {
        hasAutoReject = true
        const primaryPath = actionRequest.args?.file_path ?? actionRequest.args?.source_path
        autoRejects.push({
          toolName: actionRequest.name,
          filePath: typeof primaryPath === 'string' ? primaryPath : '',
          message: decision.decision.message ?? decision.reason,
        })
      }
    })

    if (hasAutoReject) {
      actionRequests.forEach((_actionRequest, index) => {
        if (autoDecisionsByIndex[index]) return
        autoDecisionsByIndex[index] = {
          type: 'rejected',
          message: 'Skipped because another filesystem operation in this batch was rejected by policy.',
        }
      })
      return {
        reviewActionRequests: [],
        reviewActionOriginalIndices: [],
        autoDecisionsByIndex,
        autoRejects,
      }
    }

    return {
      reviewActionRequests,
      reviewActionOriginalIndices,
      autoDecisionsByIndex,
      autoRejects,
    }
  }

  private async _handleInterrupt(
    threadId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interruptValue: any,
    partialMessage?: ThreadMessage,
  ): Promise<void> {
    // interruptValue: HITLRequest { actionRequests: [{ name, args }], reviewConfigs: [...] }
    const actionRequests: HitlActionRequest[] =
      interruptValue?.actionRequests ?? []
    const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined

    if (!actionRequests.length) {
      console.warn('[AgentEngine] Interrupt with no actionRequests:', interruptValue)
      return
    }

    const domain = this.threadListQuery?.getMeta(threadId)?.domain ?? 'editing'
    const strategy = this.strategies[domain]
    const prepared = this._prepareActionRequestsForReview(threadId, actionRequests)

    // Domain-specific mixed-kind guard: auto-reject non-dominant kinds before review
    const mixedDecisions = strategy.preDecideMixed?.(prepared.reviewActionRequests, prepared.reviewActionOriginalIndices)
    if (mixedDecisions) {
      for (const [origIdxStr, decision] of Object.entries(mixedDecisions)) {
        const origIdx = Number(origIdxStr)
        prepared.autoDecisionsByIndex[origIdx] = decision
        const pos = prepared.reviewActionOriginalIndices.indexOf(origIdx)
        if (pos >= 0) {
          prepared.reviewActionRequests.splice(pos, 1)
          prepared.reviewActionOriginalIndices.splice(pos, 1)
        }
      }
    }

    this.runtimeStore.setInterrupted(threadId, {
      actionRequestCount: actionRequests.length,
      actionNames: actionRequests.map(ar => ar.name),
      turnId,
      reviewActionOriginalIndices: prepared.reviewActionOriginalIndices,
      autoDecisionsByIndex: prepared.autoDecisionsByIndex,
    })

    if (!prepared.reviewActionRequests.length) {
      for (const autoReject of prepared.autoRejects) {
        this.rendererBridge.sendRunFilesystemAutoReject({
          threadId,
          toolName: autoReject.toolName,
          filePath: autoReject.filePath,
          message: autoReject.message,
        })
      }
      setTimeout(() => {
        this.resumeRun(threadId, []).catch(err => console.error('[AgentEngine] auto resumeRun error:', err))
      }, 0)
      return
    }

    const reviews = await strategy.buildReviewItems({
      threadId,
      turnId,
      actionRequests: prepared.reviewActionRequests,
      partialMessage,
    })

    this.rendererBridge.sendRunInterrupted({
      threadId,
      turnId,
      reviews,
      actionRequests: prepared.reviewActionRequests,
    })
  }

  // ── Private: interrupt rehydration on thread reopen ──────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _maybeRehydrateInterrupt(threadId: string, lcMessages: any[]): Promise<void> {
    if (this.runtimeStore.getInterrupted(threadId)) return
    if (this.activeRuns.has(threadId)) return
    if (!lcMessages.length) return

    const domain = this.threadListQuery?.getMeta(threadId)?.domain ?? 'editing'
    const interruptOnNames = new Set([
      ...this.strategies[domain].getInterruptOnNames(),
      ...FILE_WRITE_INTERRUPT_ON_NAMES,
    ])

    // Collect all tool_call_ids that already have a ToolMessage response
    const responded = new Set<string>()
    for (const m of lcMessages) {
      if (isToolMessage(m) && m.tool_call_id) responded.add(m.tool_call_id)
    }

    // Find the last AIMessage; bail if a human or non-tool message follows it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastAi: any = null
    for (let i = lcMessages.length - 1; i >= 0; i--) {
      const m = lcMessages[i]
      if (isAIMessage(m)) { lastAi = m; break }
      if (isHumanMessage(m)) return
    }
    if (!lastAi?.tool_calls?.length) return

    // Collect orphan tool_calls that belong to this domain's interruptOn set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionRequests: HitlActionRequest[] = (lastAi.tool_calls as any[])
      .filter((tc) => tc.id && !responded.has(tc.id) && interruptOnNames.has(tc.name))
      .map((tc) => ({ name: tc.name as string, args: (tc.args ?? {}) as Record<string, unknown> }))

    if (!actionRequests.length) return

    const turnId = `rehydrated-${crypto.randomUUID()}`
    this.runtimeStore.setCurrentTurnId(threadId, turnId)
    const rehydrateStrategy = this.strategies[domain]
    const prepared = this._prepareActionRequestsForReview(threadId, actionRequests)

    // Domain-specific mixed-kind guard
    const mixedDecisions = rehydrateStrategy.preDecideMixed?.(prepared.reviewActionRequests, prepared.reviewActionOriginalIndices)
    if (mixedDecisions) {
      for (const [origIdxStr, decision] of Object.entries(mixedDecisions)) {
        const origIdx = Number(origIdxStr)
        prepared.autoDecisionsByIndex[origIdx] = decision
        const pos = prepared.reviewActionOriginalIndices.indexOf(origIdx)
        if (pos >= 0) {
          prepared.reviewActionRequests.splice(pos, 1)
          prepared.reviewActionOriginalIndices.splice(pos, 1)
        }
      }
    }

    this.runtimeStore.setInterrupted(threadId, {
      actionRequestCount: actionRequests.length,
      actionNames: actionRequests.map((a) => a.name),
      turnId,
      reviewActionOriginalIndices: prepared.reviewActionOriginalIndices,
      autoDecisionsByIndex: prepared.autoDecisionsByIndex,
    })

    if (!prepared.reviewActionRequests.length) {
      for (const autoReject of prepared.autoRejects) {
        this.rendererBridge.sendRunFilesystemAutoReject({
          threadId,
          toolName: autoReject.toolName,
          filePath: autoReject.filePath,
          message: autoReject.message,
        })
      }
      await this.resumeRun(threadId, [])
      return
    }

    let reviews: import('./domain/DomainStrategy').DomainReviewItem[] = []
    try {
      reviews = await rehydrateStrategy.buildReviewItems({
        threadId,
        turnId,
        actionRequests: prepared.reviewActionRequests,
      })
    } catch (err) {
      console.warn('[AgentEngine] _maybeRehydrateInterrupt: buildReviewItems failed:', err)
    }

    this.rendererBridge.sendRunInterrupted({
      threadId,
      turnId,
      reviews,
      actionRequests: prepared.reviewActionRequests,
    })
  }

  // ── Public: cache management ──────────────────────────────────────────────

  /** Clears the agent cache so the next turn rebuilds agents (e.g. after new skills are written). */
  invalidateAgentCache(): void {
    this._clearAgentCache()
  }

  // ── Private: agent cache ──────────────────────────────────────────────────

  private _getOrCreateAgent(
    threadId: string,
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkingLevel: AiThinkingLevel,
    language: DetectedInputLanguage = 'en-US',
  ): DeepAgentInstance {
    const workspacePath = this.runtimeStore.getContext(threadId)?.workspacePath ?? null
    const skillSources = this.strategies[domain].getSkillSources?.(this.aiRootPath) ?? []
    const filesystemFingerprint = `${workspacePath ?? ''}:${skillSources.join('|') || 'no-skills'}`
    // Include apiKey and baseUrl in the key so that credential updates immediately
    // produce a new agent instance rather than reusing a stale one.
    const resolvedApiKey = resolveApiKeyReference(config.apiKey, resolveAiApiKeyEnvVar)
    const keyFingerprint = resolvedApiKey ? resolvedApiKey.slice(-8) : ''
    const cacheKey = `${threadId}:${config.id}:${domain}:${mode}:${modelId}:${thinkingLevel ?? ''}:${language}:${keyFingerprint}:${config.baseUrl ?? ''}:${config.fallbackModelId ?? ''}:${filesystemFingerprint}`
    const cached = this.agentCache.get(cacheKey)
    if (cached) return cached.agent

    const scaffold = buildAgentFilesystem({
      workspacePath,
      aiRootPath: this.aiRootPath,
      skillSources,
    })
    const model = createChatModel(config, { modelId, thinkingLevel })
    const capabilities = this.strategies[domain].buildCapabilities({ mode, workspacePath, language })
    const memorySources = this._buildMemoryPaths(domain)

    const fallbackModels: BaseChatModel[] = []
    if (config.fallbackModelId && config.fallbackModelId !== modelId) {
      try {
        fallbackModels.push(createChatModel(config, { modelId: config.fallbackModelId, thinkingLevel }))
      } catch (err) {
        console.warn(
          `[AgentEngine] Failed to instantiate fallback model "${config.fallbackModelId}" for provider "${config.id}":`,
          err,
        )
      }
    }

    const summarizationMiddlewareOptions: SummarizationMiddlewareOptions = {
      // Summary generation should be plain text. Reusing the agent thinking level here
      // wastes reasoning budget and can make summaries contain non-text content blocks.
      model: createChatModel(config, { modelId, thinkingLevel, disableThinking: true }),
      tokenCounter: this._makeCjkTokenCounter(),
    }

    const agent = (createDeepAgent as unknown as CreateDeepAgentWithSummarization)({
      model,
      systemPrompt: this.strategies[domain].getSystemPrompt(mode, language),
      tools: capabilities.tools,
      backend: scaffold.backend,
      summarizationMiddlewareOptions,
      // 记忆改由脚手架的只读中间件承载（本期记忆只读，见 scaffold/memory/MemorySources），
      // 不使用 deepagents 内置 `memory` 选项——后者注入的提示会鼓励 agent 自动写入记忆。
      checkpointer: this.checkpointerInstance?.checkpointer,
      interruptOn: { ...capabilities.interruptOn, ...scaffold.interruptOn },
      subagents: capabilities.subAgents,
      // Middleware ordering note:
      // createDeepAgent places its built-in SummarizationMiddleware BEFORE customMiddleware
      // (outer wrapper), so our custom middlewares below run INNER (closer to the LLM).
      // HITL+summarization safety: SummarizationMiddleware splits messages into old/recent at
      // cutoffIndex. RESPOND_MARKER is always on the most-recent ToolMessage (current HITL
      // cycle), so it falls in the preserved (inner) portion — never in the old portion sent
      // to the summary LLM. HumanRespondMessage (inner) then strips the marker before the
      // main LLM call. Both LLMs remain marker-free; the invariant from Phase 4 §B1.4 holds.
      middleware: [
        ...scaffold.middlewares,
        createOrphanToolCallStripperMiddleware(),
        createHumanRespondMessageMiddleware(),
        createTaskToolCompatMiddleware(),
        modelCallLimitMiddleware(MIDDLEWARE_CONFIG.modelCallLimit),
        toolCallLimitMiddleware(MIDDLEWARE_CONFIG.toolCallLimit),
        ...(memorySources.length
          ? [createReadonlyMemoryMiddleware({ backend: scaffold.backend, sources: memorySources })]
          : []),
        ...(fallbackModels.length
          ? [createInstrumentedFallbackMiddleware(fallbackModels, (fallbackModelId) => {
              this._notifyModelFallbackOnce(threadId, fallbackModelId)
            })]
          : []),
      ],
      contextSchema: IWriterAgentContextSchema,
    })

    this.agentCache.set(cacheKey, { agent, scaffold })
    return agent
  }

  private _buildRunConfigurable(threadId: string): Record<string, string> {
    return this.runtimeStore.buildConfigurable(threadId)
  }

  private _fallbackNotificationKey(threadId: string, turnId: string | null): string {
    return `${threadId}:${turnId ?? '__no_turn__'}`
  }

  private _clearFallbackNotificationKeys(threadId: string, turnId?: string | null): void {
    if (turnId !== undefined) {
      this.fallbackNotifiedTurnKeys.delete(this._fallbackNotificationKey(threadId, turnId))
      return
    }

    const prefix = `${threadId}:`
    for (const key of this.fallbackNotifiedTurnKeys) {
      if (key.startsWith(prefix)) this.fallbackNotifiedTurnKeys.delete(key)
    }
  }

  private _notifyModelFallbackOnce(threadId: string, fallbackModelId: string): void {
    const turnId = this.runtimeStore.getCurrentTurnId(threadId)
    const key = this._fallbackNotificationKey(threadId, turnId)
    if (this.fallbackNotifiedTurnKeys.has(key)) return

    this.fallbackNotifiedTurnKeys.add(key)
    this.rendererBridge.sendRunModelFallback({ threadId, fallbackModelId })
  }

  private _buildRunContext(threadId: string, domain: AiAgentDomain): IWriterAgentContext {
    return this.runtimeStore.buildContext(threadId, domain)
  }

  private _cleanupScaffold(scaffold: AgentFilesystemScaffold): void {
    for (const dir of scaffold.tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  private _clearAgentCache(): void {
    for (const cached of this.agentCache.values()) {
      this._cleanupScaffold(cached.scaffold)
    }
    this.agentCache.clear()
  }

  private _deleteCachedAgentsForThread(threadId: string): void {
    for (const [key, cached] of this.agentCache) {
      if (!key.startsWith(`${threadId}:`)) continue
      this._cleanupScaffold(cached.scaffold)
      this.agentCache.delete(key)
    }
  }

  private async _seedSummarizationBaseline(threadId: string): Promise<void> {
    if (this.runtimeStore.getLastSummarizationCutoff(threadId) !== undefined) return
    if (!this.checkpointerInstance) return
    try {
      const tuple = await this.checkpointerInstance.checkpointer.get({
        configurable: { thread_id: threadId },
      })
      if (!tuple) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cutoffIndex: unknown = ((tuple as any).channel_values ?? {})._summarizationEvent?.cutoffIndex
      if (typeof cutoffIndex === 'number' && cutoffIndex > 0) {
        this.runtimeStore.setLastSummarizationCutoff(threadId, cutoffIndex)
      }
    } catch {
      // Non-fatal — baseline stays undefined; first run will still detect correctly
    }
  }

  private async _detectAndNotifySummarization(threadId: string): Promise<void> {
    if (!this.checkpointerInstance) return
    try {
      const tuple = await this.checkpointerInstance.checkpointer.get({
        configurable: { thread_id: threadId },
      })
      if (!tuple) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelValues = (tuple as any).channel_values ?? {}
      const cutoffIndex: unknown = channelValues._summarizationEvent?.cutoffIndex
      if (typeof cutoffIndex !== 'number' || cutoffIndex <= 0) return
      const lastCutoff = this.runtimeStore.getLastSummarizationCutoff(threadId)
      if (cutoffIndex === lastCutoff) return
      this.runtimeStore.setLastSummarizationCutoff(threadId, cutoffIndex)
      this.rendererBridge.sendRunContextCompressed({ threadId, compressedMessageCount: cutoffIndex })
    } catch (err) {
      console.warn('[AgentEngine] Failed to detect summarization:', err)
    }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = tuple as any
      const channelValues = t.channel_values ?? {}
      const rawMessages = Array.isArray(channelValues.messages) ? channelValues.messages : []
      const summarizationEvent = channelValues._summarizationEvent
      const effectiveMessages = summarizationEvent?.summaryMessage
        ? [summarizationEvent.summaryMessage, ...rawMessages.slice(summarizationEvent.cutoffIndex ?? 0)]
        : rawMessages
      const language = this.runtimeStore.getContext(threadId)?.language ?? 'en-US'
      const workspacePath = this.runtimeStore.getContext(threadId)?.workspacePath ?? null
      const capabilities = this.strategies[domain].buildCapabilities({ mode, workspacePath, language })
      const systemPrompt = new SystemMessage(this.strategies[domain].getSystemPrompt(mode, language))
      return this._countTokensCjkAware(
        [systemPrompt, ...effectiveMessages],
        capabilities.tools as unknown as Array<Record<string, unknown>>
      )
    } catch (err) {
      console.warn('[AgentEngine] Failed to compute current session tokens:', err)
      return 0
    }
  }

  private _makeCjkTokenCounter(): TokenCounter {
    return (messages: BaseMessage[], tools?: unknown): number =>
      this._countTokensCjkAware(messages, (tools as Array<Record<string, unknown>>) ?? [])
  }

  private _countTokensCjkAware(
    messages: BaseMessage[],
    tools: Array<Record<string, unknown>>,
  ): number {
    let total = 0
    for (const tool of tools ?? []) {
      total += estimateTextTokens(JSON.stringify(tool))
    }
    for (const msg of messages) {
      let text = ''
      if (typeof msg.content === 'string') {
        text = msg.content
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block['type'] === 'text') text += (block['text'] as string) ?? ''
          if (block['type'] === 'reasoning') text += (block['reasoning'] as string) ?? ''
          if (block['type'] === 'thinking') text += (block['thinking'] as string) ?? ''
          if (block['type'] === 'tool_call') text += JSON.stringify(block['args'] ?? {})
          if (block['type'] === 'tool_use') text += JSON.stringify(block['input'] ?? {})
        }
      }
      if (isAIMessage(msg) && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        text += JSON.stringify(msg.tool_calls)
      }
      total += estimateTextTokens(text)
    }
    return total
  }

  // ── Private: init ─────────────────────────────────────────────────────────

  private async _ensureInitialized(): Promise<void> {
    if (!this.checkpointerInstance) await this.initialize()
  }

  private async ensureAiDirectories(): Promise<void> {
    const dirs = [
      this.aiRootPath,
      path.join(this.aiRootPath, 'memory'),
      path.join(this.aiRootPath, 'memory', 'edit'),
      path.join(this.aiRootPath, 'memory', 'creative'),
      path.join(this.aiRootPath, 'skills'),
      path.join(this.aiRootPath, 'skills', 'common'),
      path.join(this.aiRootPath, 'skills', 'edit'),
      path.join(this.aiRootPath, 'skills', 'creative'),
      path.join(this.aiRootPath, 'skills', 'creative', 'common'),
      path.join(this.aiRootPath, 'skills', 'creative', 'main'),
      path.join(this.aiRootPath, 'skills', 'creative', 'planner'),
      path.join(this.aiRootPath, 'skills', 'creative', 'writer'),
      path.join(this.aiRootPath, 'skills', 'creative', 'consistency'),
      path.join(this.aiRootPath, 'skills', 'creative', 'explorer'),
      path.join(this.aiRootPath, 'skills', 'creative', 'researcher'),
      path.join(this.aiRootPath, 'skills', 'creative', 'writing-style'),
      path.join(this.aiRootPath, 'subagents'),
      path.join(this.aiRootPath, 'empty-fs'),
    ]
    await Promise.all(dirs.map(dir => fs.promises.mkdir(dir, { recursive: true })))
    await this.syncBundledSkills()
  }

  /**
   * 同步内置技能目录。
   * 使用版本跳过：生产环境下若应用版本未变，则跳过递归拷贝，
   * 避免每次启动都执行 ~40 次 rmSync + 若干次 cpSync 的磁盘操作。
   */
  private async syncBundledSkills(): Promise<void> {
    if (!fs.existsSync(this.bundledSkillsPath)) return
    const targetRoot = path.join(this.aiRootPath, 'skills')

    // 版本跳过：生产环境下若版本文件匹配，则跳过全量同步
    const versionFile = path.join(this.aiRootPath, '.skills-sync-version')
    const currentVersion = app.getVersion()
    const isDev = !app.isPackaged
    if (!isDev) {
      try {
        const savedVersion = await fs.promises.readFile(versionFile, 'utf-8')
        if (savedVersion.trim() === currentVersion) {
          console.debug('[AgentEngine] Bundled skills already up to date, skipping sync')
          return
        }
      } catch {
        // 版本文件不存在或读取失败，继续执行同步
      }
    }

    // 旧版按 creative 子代理平铺在顶层的目录，整体迁移到 skills/creative/* 下。
    // writing-style 含用户生成数据，先迁移再清理。
    const oldWritingStyleDir = path.join(targetRoot, 'writing-style')
    const newWritingStyleDir = path.join(targetRoot, 'creative', 'writing-style')
    if (fs.existsSync(oldWritingStyleDir)) {
      await fs.promises.mkdir(newWritingStyleDir, { recursive: true })
      const styleEntries = fs.readdirSync(oldWritingStyleDir, { withFileTypes: true })
      for (const entry of styleEntries) {
        if (!entry.isDirectory()) continue
        const from = path.join(oldWritingStyleDir, entry.name)
        const to = path.join(newWritingStyleDir, entry.name)
        if (!fs.existsSync(to)) {
          await fs.promises.rename(from, to)
        }
      }
    }

    const legacyTopLevelCreativeDirs = ['main', 'planner', 'writer', 'consistency', 'explorer', 'researcher', 'writing-style']
    const obsoleteTopLevelSkills = [
      ...legacyTopLevelCreativeDirs,
      // 旧顶层 common 含 story-craft skills，新顶层 common 改为 web-research，语义已变，
      // 先清空再由 bundled creative/common、common 重新填充。
      'common',
      '_consistency',
      '_explorer',
      '_planner',
      '_writer',
      'arc-progression-check',
      'behavior-from-psychology',
      'brainstorm-quality',
      'branch-comparison',
      'causal-chain-construction',
      'character-arc-planning',
      'character-behavior-check',
      'character-complexity',
      'character-decision-logic',
      'character-potential',
      'character-voice',
      'common-sense-audit',
      'conflict-design',
      'deep-pov',
      'dialogue-craft',
      'foreshadowing-audit',
      'foreshadowing-placement',
      'information-density',
      'pacing-control',
      'plot-extrapolation',
      'pov-consistency-check',
      'scene-structure',
      'sensory-grounding',
      'show-vs-tell',
      'skill-creator',
      'story-logic',
      'structural-diagnosis',
      'style-consistency-check',
      'subtext-craft',
      'thematic-depth',
      'web-research',
    ]
    await Promise.all(
      obsoleteTopLevelSkills.map(name =>
        fs.promises.rm(path.join(targetRoot, name), { recursive: true, force: true })
      )
    )

    const entries = fs.readdirSync(this.bundledSkillsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourceDir = path.join(this.bundledSkillsPath, entry.name)
      const targetDir = path.join(targetRoot, entry.name)
      await fs.promises.mkdir(targetDir, { recursive: true })
      // dereference: true resolves any packaged symlinks inside scoped source dirs.
      fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
    }

    // 写入版本文件，下次启动（同版本）直接跳过
    await fs.promises.writeFile(versionFile, currentVersion, 'utf-8')
  }

  private _buildMemoryPaths(domain: AiAgentDomain): string[] {
    return buildMemorySources(this.aiRootPath, this.strategies[domain].getMemoryDir())
  }

  private _assertWithinBudget(
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkingLevel: AiThinkingLevel,
    userContent: string,
    language: DetectedInputLanguage = 'en-US',
  ): void {
    const systemPrompt = this.strategies[domain].getSystemPrompt(mode, language)
    const inputTokens = estimateTextTokens(systemPrompt) + estimateTextTokens(userContent)
    const model = createChatModel(config, { modelId, thinkingLevel })
    const budgetInfo = getModelBudgetInfo((model as BaseChatModel & { profile?: ModelProfile }).profile)
    const allowedBudget = budgetInfo.triggerTokens

    if (inputTokens <= allowedBudget) return

    throw new Error(
      `当前请求预计约 ${inputTokens} tokens，已超过摘要触发预算 ${allowedBudget}。请先点击 Compact 压缩输入，或减少附件与上下文。`
    )
  }
}
