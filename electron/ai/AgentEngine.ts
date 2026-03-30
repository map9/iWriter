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
import { createDeepAgent, LocalShellBackend } from 'deepagents'
import { Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'

import type { AiProviderConfig, AiAgentProfile, ThreadMessage, EditProposal } from '../../src/types/ai'
import { createChatModel } from './providers/ModelFactory'
import { buildDocumentTools } from './tools/DocumentTools'
import { buildEditProposalTools } from './tools/EditProposalTools'
import { SnapshotBroker } from './document/SnapshotBroker'
import type { CheckpointerInstance } from './checkpoint/CheckpointerFactory'
import { getCheckpointer } from './checkpoint/CheckpointerFactory'
import { ThreadListQuery, metaToAiThread } from './thread/ThreadListQuery'
import type {
  SendMessageRequest,
  ResumeDecision,
  SerializedSnapshot,
} from './ipc/protocol'
import {
  convertLcMessages,
  buildProposalFromAction,
} from './ipc/MessageAdapter'
import { StreamEventAdapter } from './ipc/StreamEventAdapter'
import { RendererEventBridge } from './ipc/RendererEventBridge'
import { buildUserMessage } from './ipc/UserMessageBuilder'
import { resolveThreadRuntime } from './runtime/ThreadRuntimeResolver'
import { ThreadRuntimeStore } from './runtime/ThreadRuntimeStore'

// Import system prompts from src (shared)
import { WRITE_SYSTEM_PROMPT } from '../../src/ai/thread/system-prompts/write'
import { ASK_SYSTEM_PROMPT } from '../../src/ai/thread/system-prompts/ask'
import { MINIMAL_SYSTEM_PROMPT } from '../../src/ai/thread/system-prompts/minimal'

// ── Types ───────────────────────────────────────────────────────────────────

type DeepAgentInstance = ReturnType<typeof createDeepAgent>

export class AgentEngine {
  private snapshotBroker: SnapshotBroker
  private rendererBridge: RendererEventBridge
  private aiRootPath: string

  /** One AbortController per active streaming threadId */
  private activeRuns = new Map<string, AbortController>()
  /** Thread-scoped runtime data: editor context + pending interrupts. */
  private runtimeStore = new ThreadRuntimeStore()

  /** Agent cache keyed by "configId:profile:modelId" */
  private agentCache = new Map<string, DeepAgentInstance>()

  /** Initialized once on first use */
  private checkpointerInstance: CheckpointerInstance | null = null
  private threadListQuery: ThreadListQuery | null = null

  constructor(private getWebContents: () => WebContents | null) {
    this.snapshotBroker = new SnapshotBroker(getWebContents)
    this.rendererBridge = new RendererEventBridge(getWebContents)
    this.aiRootPath = path.join(app.getPath('home'), '.iwriter', 'ai')
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

    const { AiConfigStore } = await import('./config/AiConfigStore')
    const settings = AiConfigStore.loadSettings()

    // Resolve or create thread
    const threadId = req.threadId
      ?? `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const existingMeta = req.threadId ? this.threadListQuery?.getMeta(req.threadId) : null
    const runtime = resolveThreadRuntime(settings, req, existingMeta)

    const isNewThread = !existingMeta
    if (isNewThread) {
      this.threadListQuery!.createMeta({
        id: threadId,
        profile: runtime.profile,
        modelId: runtime.modelId,
        providerConfigId: runtime.providerConfig.id,
        originFilePath: req.editorContext.filePath,
        thinkMode: runtime.thinkMode,
      })
    } else {
      this.threadListQuery!.updateMeta(threadId, {
        profile: runtime.profile,
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
    })

    // Auto-title from first message
    if (isNewThread) {
      this.threadListQuery!.setTitle(threadId, req.userText.slice(0, 80))
    }

    const userContent = buildUserMessage(req)

    // If this thread was left in an interrupted state (e.g., app restart during HITL),
    // clear the stale in-memory entry so the new message starts a fresh run.
    if (this.runtimeStore.getInterrupted(threadId)) {
      console.warn('[AgentEngine] sendMessage: clearing stale interrupted state for threadId:', threadId)
      this.runtimeStore.clearInterrupted(threadId)
    }

    // Run agent in background
    this._runSession(threadId, runtime.providerConfig, runtime.profile, runtime.modelId, runtime.thinkMode, userContent).catch(err => {
      console.error('[AgentEngine] _runSession error:', err)
    })

    return { threadId }
  }

  // ── Public: cancel ────────────────────────────────────────────────────────

  cancel(threadId: string): void {
    const ac = this.activeRuns.get(threadId)
    if (ac) {
      ac.abort()
      this.activeRuns.delete(threadId)
    }
    this.runtimeStore.clearInterrupted(threadId)
  }

  // ── Public: resume (LangGraph HITL batch decisions) ───────────────────────

  async resumeRun(threadId: string, decisions: ResumeDecision[]): Promise<void> {
    const interrupted = this.runtimeStore.getInterrupted(threadId)
    if (!interrupted) {
      console.warn('[AgentEngine] resumeRun: no interrupted run for threadId:', threadId)
      return
    }
    this.runtimeStore.clearInterrupted(threadId)

    const { AiConfigStore } = await import('./config/AiConfigStore')
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

    this._continueSession(threadId, runtime.providerConfig, runtime.profile, runtime.modelId, runtime.thinkMode, new Command({ resume: hiResp }))
      .catch(err => console.error('[AgentEngine] _continueSession error:', err))
  }

  // ── Private: run session ──────────────────────────────────────────────────

  private async _runSession(
    threadId: string,
    config: AiProviderConfig,
    profile: AiAgentProfile,
    modelId: string,
    thinkMode: string | undefined,
    userContent: string,
  ): Promise<void> {
    const agent = this._getOrCreateAgent(config, profile, modelId, thinkMode)
    const abortController = new AbortController()
    this.activeRuns.set(threadId, abortController)

    const runConfig = {
      configurable: this._buildRunConfigurable(threadId),
      version: 'v2' as const,
      signal: abortController.signal,
      recursionLimit: 100,
    }

    await this._streamLoop(threadId, agent, { messages: [new HumanMessage(userContent)] }, runConfig)
  }

  private async _continueSession(
    threadId: string,
    config: AiProviderConfig,
    profile: AiAgentProfile,
    modelId: string,
    thinkMode: string | undefined,
    command: typeof Command.prototype,
  ): Promise<void> {
    const agent = this._getOrCreateAgent(config, profile, modelId, thinkMode)
    const abortController = new AbortController()
    this.activeRuns.set(threadId, abortController)

    const runConfig = {
      configurable: this._buildRunConfigurable(threadId),
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
        const partialMessage: ThreadMessage | undefined = adapter.buildPartialMessage()

        if (partialMessage) {
          this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })
        }

        if (adapter.interruptPayload) {
          await this._handleInterrupt(threadId, adapter.interruptPayload, partialMessage)
        }

        this.activeRuns.delete(threadId)
        return
      }

      this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })

      this.rendererBridge.sendRunDone({ threadId })
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
      this.rendererBridge.sendRunError({ threadId, error: errorMsg })
      this.rendererBridge.sendRunDone({ threadId })
    } finally {
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
    const proposals: EditProposal[] = actionRequests.map(ar =>
      buildProposalFromAction(ar.name, ar.args ?? {}, snapshot)
    )

    this.runtimeStore.setInterrupted(threadId, {
      actionRequestCount: actionRequests.length,
      actionNames: actionRequests.map(ar => ar.name),
    })

    // Emit single atomic event (replaces old two-event sequence)
    // actionRequests are included so the renderer can align decisions by index
    this.rendererBridge.sendRunInterrupted({ threadId, proposals, partialMessage, actionRequests })
  }

  // ── Private: agent cache ──────────────────────────────────────────────────

  private _getOrCreateAgent(
    config: AiProviderConfig,
    profile: AiAgentProfile,
    modelId: string,
    thinkMode?: string,
  ): DeepAgentInstance {
    // Include apiKey and baseUrl in the key so that credential updates immediately
    // produce a new agent instance rather than reusing a stale one.
    const keyFingerprint = config.apiKey ? config.apiKey.slice(-8) : ''
    const cacheKey = `${config.id}:${profile}:${modelId}:${thinkMode ?? ''}:${keyFingerprint}:${config.baseUrl ?? ''}`
    if (this.agentCache.has(cacheKey)) return this.agentCache.get(cacheKey)!

    const model = createChatModel(config, { modelId, thinkMode })
    const docTools = buildDocumentTools(this.snapshotBroker)
    const editTools = buildEditProposalTools()

    const agent = createDeepAgent({
      model,
      systemPrompt: getSystemPrompt(profile),
      tools: [...docTools, ...editTools],
      backend: new LocalShellBackend({ rootDir: this.aiRootPath }),
      skills: ['/skills/'],
      memory: [path.join(this.aiRootPath, 'memory', 'AGENTS.md')].filter(fs.existsSync),
      checkpointer: this.checkpointerInstance?.checkpointer,
      interruptOn: {
        edit_block:      { allowedDecisions: ['approve', 'edit', 'reject'] },
        insert_block:    { allowedDecisions: ['approve', 'edit', 'reject'] },
        delete_block:    { allowedDecisions: ['approve', 'reject'] },
        replace_range:   { allowedDecisions: ['approve', 'edit', 'reject'] },
        create_document: { allowedDecisions: ['approve', 'edit', 'reject'] },
      },
    })

    this.agentCache.set(cacheKey, agent)
    return agent
  }

  private _buildRunConfigurable(threadId: string): Record<string, string> {
    return this.runtimeStore.buildConfigurable(threadId)
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
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSystemPrompt(profile: AiAgentProfile): string {
  switch (profile) {
    case 'write': return WRITE_SYSTEM_PROMPT
    case 'ask': return ASK_SYSTEM_PROMPT
    case 'minimal': return MINIMAL_SYSTEM_PROMPT
    default: return WRITE_SYSTEM_PROMPT
  }
}
