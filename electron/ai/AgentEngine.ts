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
import { getModelBudgetInfo, HARD_REQUEST_CEILING_TOKENS } from '../../src/ai/model/model-budget'
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
import { WritingSessionRegistry, decideWritingSessionApproval, isBlockEditToolName } from './scaffold/approval/WritingSessionRegistry'
import { AiConfigStore, resolveAiApiKeyEnvVar } from './config/AiConfigStore'
import { generateThreadTitle } from '../../src/ai/thread/title'
import { IWriterAgentContextSchema, type IWriterAgentContext } from './runtime/AgentContext'
import { createTaskToolCompatMiddleware } from './scaffold/middleware/TaskToolCompatMiddleware'
import { createOrphanToolCallStripperMiddleware } from './scaffold/middleware/OrphanToolCallStripperMiddleware'
import { createRateLimitRetryMiddleware } from './scaffold/middleware/RateLimitRetryMiddleware'
import { createHumanRespondMessageMiddleware, RESPOND_MARKER } from './scaffold/middleware/HumanRespondMessageMiddleware'
import { CheckpointerAdmin } from './checkpoint/CheckpointerAdmin'
import { MIDDLEWARE_CONFIG, createInstrumentedFallbackMiddleware } from './scaffold/middleware/middleware-config'
import { buildMemorySources, createReadonlyMemoryMiddleware } from './scaffold/memory/MemorySources'
import type { DomainStrategy } from './domain/DomainStrategy'
import { EditDomainStrategy } from './domain/edit/EditDomainStrategy'
import { CreativeDomainStrategy } from './domain/creative/CreativeDomainStrategy'
import { detectInputLanguage, type DetectedInputLanguage } from '../../src/ai/message/detectInputLanguage'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Success message host-synthesized (via the respond channel) for an approved block-edit that lands
 * in a poisoned resume batch — the renderer already applied the mutation, so this reads as a plain
 * success to the LLM while guaranteeing the tool_call is answered. See resumeRun's poisoned-batch guard.
 */
const BLOCK_EDIT_APPLIED_MESSAGE =
  'The edit was applied successfully by the editor. Block IDs for this file have now shifted — ' +
  're-read with get_document_outline / get_section before starting a new round of edits.'

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
  private bundledSubagentsPath: string

  /** One AbortController per active streaming threadId */
  private activeRuns = new Map<string, AbortController>()
  /** Thread-scoped runtime data: editor context + pending interrupts. */
  private runtimeStore = new ThreadRuntimeStore()

  // Write-session authorization (04.1 §6 Stage 2). Baselines are captured through the unified
  // snapshot route (_captureChapterBaseline: editor buffer if the chapter is open, else disk) and
  // passed explicitly into recordAccumulation; this disk-read capturer is only a last-resort
  // fallback for callers that don't supply a baseline (tests / degraded paths).
  private writingSessions = new WritingSessionRegistry((_threadId, targetFile) => {
    try {
      return fs.readFileSync(targetFile, 'utf-8')
    } catch {
      return null
    }
  })

  /** Agent cache keyed by thread + runtime + filesystem fingerprint. */
  private agentCache = new Map<string, { agent: DeepAgentInstance, scaffold: AgentFilesystemScaffold }>()
  /** One model fallback notification per thread turn, even when cached agents retry/resume. */
  private fallbackNotifiedTurnKeys = new Set<string>()

  /** Initialized once on first use */
  private checkpointerInstance: CheckpointerInstance | null = null
  private checkpointerAdmin: CheckpointerAdmin | null = null
  private threadListQuery: ThreadListQuery | null = null
  private initializationPromise: Promise<void> | null = null

  /** Domain strategy table — add new domains here only. AgentEngine itself never branches on domain. */
  private readonly strategies: Record<AiAgentDomain, DomainStrategy>

  constructor(private getWebContents: () => WebContents | null) {
    this.snapshotBroker = new SnapshotBroker(getWebContents)
    this.rendererBridge = new RendererEventBridge(getWebContents)
    this.aiRootPath = path.join(app.getPath('home'), '.iwriter', 'ai')
    this.bundledSkillsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'builtin-skills')
      : path.join(app.getAppPath(), 'electron', 'ai', 'builtin-skills')
    this.bundledSubagentsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'builtin-subagents')
      : path.join(app.getAppPath(), 'electron', 'ai', 'builtin-subagents')
    this.strategies = {
      editing: new EditDomainStrategy(this.snapshotBroker, this.aiRootPath, this.runtimeStore),
      creative: new CreativeDomainStrategy(
        this.snapshotBroker,
        this.aiRootPath,
        this.runtimeStore,
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
    this.writingSessions.clearThread(threadId)
    this.checkpointerAdmin?.deleteThread(threadId)
  }

  clearThreads(): void {
    this.threadListQuery?.clearMetas()
    this.runtimeStore.clear()
    this.activeRuns.clear()
    this.fallbackNotifiedTurnKeys.clear()
    this._clearAgentCache()
    this.writingSessions.clearAll()
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
    await this._assertWithinBudget(runtime.providerConfig, runtime.domain, runtime.mode, runtime.modelId, runtime.thinkingLevel, userContent, language, threadId)

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

    // M1-2 归因基准：本批次里被自动放行的块编辑已由 renderer 在 ai:resume 前应用落盘，磁盘此刻反映
    // agent 的最新已应用状态。逐会话快照它，供之后的整章终审把「agent 应用之后」的改动（作者手改/
    // 外部改动）标为 hasExternalEdits。放在 finalize 处理前——finalize 关闭会话后就取不到了。
    for (const { file } of this.writingSessions.getActiveSessions(threadId, true)) {
      const snap = await this._captureChapterBaseline(file)
      this.writingSessions.recordAgentSnapshot(threadId, file, snap)
    }

    // An approved confirm_writing_plan opens the write-session authorization (04.1 §6 Stage 2) and
    // anchors the finalize baseline at write-session start (before the writer touches the chapter).
    await this._registerApprovedWritingPlans(threadId, interrupted, fullDecisions)

    // A finalize_chapter decision closes/restores the write-session (M1b-3).
    this._handleFinalizeDecisions(threadId, interrupted, fullDecisions)

    // M1-1: a run-end synthesized finalize card has no live LangGraph interrupt to resume — the host
    // side effects above are the whole job. Complete the run instead of feeding a Command back.
    if (interrupted.syntheticFinalize) {
      this.rendererBridge.sendRunDone({ threadId, turnId: interrupted.turnId })
      this._clearFallbackNotificationKeys(threadId, interrupted.turnId ?? null)
      this.runtimeStore.clearCurrentTurnId(threadId)
      return
    }

    // Poisoned-batch orphan guard. LangChain HITL sets jumpTo:"model" whenever ANY decision in
    // the batch is a reject/respond, which SKIPS ToolNode for the WHOLE batch. Approved block-edit
    // tool calls then never get a ToolMessage and dangle as orphan tool_calls → OpenAI 400
    // "No tool output found for function call ...". Block-edit tools are pure acks (the renderer has
    // ALREADY applied the mutation before ai:resume — see EditProposalTools), so for an approved
    // block-edit in a poisoned batch we host-synthesize a success ToolMessage via the respond
    // channel: every tool_call gets answered, the applied edit stays in history, and we no longer
    // depend on ToolNode running. Non-poisoned batches keep the normal approve→ToolNode path, and
    // non-block-edit tools (e.g. filesystem writes that do real work on execution) are never
    // synthesized — they must still execute via ToolNode.
    const batchPoisoned = fullDecisions.some(d => d.type === 'rejected' || d.type === 'responded')

    // Map decisions[] → LangGraph HITLResponse decisions.
    // decisions[i] corresponds to actionRequests[i] — array position is the contract.
    const lgDecisions = fullDecisions.map((d, idx) => {
      if (d.type === 'approved') {
        if (batchPoisoned && isBlockEditToolName(interrupted.actionNames[idx] ?? '')) {
          return {
            type: 'reject' as const,
            message: `${RESPOND_MARKER}${BLOCK_EDIT_APPLIED_MESSAGE}`,
          }
        }
        return { type: 'approve' as const }
      }
      if (d.type === 'edited' && d.editedArgs) {
        // Same poisoned-batch guard as 'approved': an edited block-edit is also applied by the
        // renderer, so route it through the respond channel to avoid an orphan tool_call.
        if (batchPoisoned && isBlockEditToolName(interrupted.actionNames[idx] ?? '')) {
          return {
            type: 'reject' as const,
            message: `${RESPOND_MARKER}${BLOCK_EDIT_APPLIED_MESSAGE}`,
          }
        }
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

  /** Collect confirm_writing_plan args by original index, to register the write-session authorization at resume. */
  private _stashConfirmPlanArgs(
    actionRequests: HitlActionRequest[],
  ): Record<number, { plan: string; targetFiles: string[] }> {
    const out: Record<number, { plan: string; targetFiles: string[] }> = {}
    actionRequests.forEach((ar, i) => {
      if (ar.name !== 'confirm_writing_plan') return
      const plan = typeof ar.args?.plan === 'string' ? ar.args.plan : ''
      const raw = ar.args?.target_files
      const targetFiles = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
      out[i] = { plan, targetFiles }
    })
    return out
  }

  /** Collect finalize_chapter args by original index, to close/restore the write-session at resume (M1b-3). */
  private _stashFinalizeArgs(
    actionRequests: HitlActionRequest[],
  ): Record<number, { chapter: string; summary?: string }> {
    const out: Record<number, { chapter: string; summary?: string }> = {}
    actionRequests.forEach((ar, i) => {
      if (ar.name !== 'finalize_chapter') return
      const chapter = typeof ar.args?.chapter === 'string' ? ar.args.chapter : ''
      const summary = typeof ar.args?.summary === 'string' ? ar.args.summary : undefined
      out[i] = { chapter, summary }
    })
    return out
  }

  /** Resolve a finalize_chapter `chapter` arg to an absolute disk path (relative → resolved against the workspace). */
  private _resolveChapterPath(threadId: string, chapter: string): string | null {
    const trimmed = chapter.trim()
    if (!trimmed) return null
    if (path.isAbsolute(trimmed)) return path.resolve(trimmed)
    const workspacePath = this.runtimeStore.getContext(threadId)?.workspacePath ?? null
    if (!workspacePath) return null
    return path.resolve(workspacePath, trimmed)
  }

  /** Read a chapter's content through the unified snapshot route (editor buffer if open, else disk). */
  private async _captureChapterBaseline(chapterPath: string): Promise<string | null> {
    try {
      const snapshot = await this.snapshotBroker.requestSnapshot(chapterPath)
      if (snapshot?.viewMarkdown != null) return snapshot.viewMarkdown
    } catch (err) {
      console.warn('[AgentEngine] snapshot baseline capture failed, falling back to disk:', err)
    }
    try {
      return fs.readFileSync(chapterPath, 'utf-8')
    } catch {
      return null
    }
  }

  /**
   * Fill baseline/current on finalize review cards (M1b-3). baseline = the write-session's
   * session-start snapshot (captured when confirm_writing_plan was approved, i.e. before the writer
   * wrote — see _registerApprovedWritingPlans; falls back to current when no session is active);
   * current = the chapter read through the unified snapshot route (editor buffer if open, else disk).
   * Mutates the review payloads in place, mirroring _markAutoApplyReviews.
   */
  private async _enrichFinalizeReviews(
    reviews: import('./domain/DomainStrategy').DomainReviewItem[],
    threadId: string,
  ): Promise<void> {
    for (const r of reviews) {
      if (r.kind !== 'creative') continue
      const payload = r.payload
      if (payload.kind !== 'creative_chapter_finalize') continue
      const chapterPath = this._resolveChapterPath(threadId, payload.chapter)
      const current = chapterPath ? (await this._captureChapterBaseline(chapterPath) ?? '') : ''
      const session = chapterPath ? this.writingSessions.getActiveSession(threadId, chapterPath) : undefined
      payload.baseline = session?.baselineSnapshot ?? current
      payload.current = current
      // M1-2 归因：current 与 agent 最近应用快照不一致 ⇒ 存在「agent 应用之后」的非 agent 改动
      // （作者手改/外部改动）。lastAgentSnapshot 为 null（从未捕获）时不据此标注（未知）。
      const lastAgentSnapshot = session?.lastAgentSnapshot
      payload.hasExternalEdits = lastAgentSnapshot != null && lastAgentSnapshot !== current
    }
  }

  /**
   * On resume, apply the finalize_chapter decision's host side effects (M1b-3):
   *   approve/edit → close the write-session (accepted chapter stays on disk);
   *   responded    → rework: keep the session open (writer revises, A00 finalizes again);
   *   rejected     → restore the session baseline to disk and close the session.
   *
   * The reject restore writes disk directly, like the git_restore tool: an open chapter tab is a
   * clean tab (the auto-applied edits were saved via saveAppliedOpenTab), so the file watcher's
   * external-change handler (handleOpenTabExternalChange) reloads it from disk — no autosave race.
   */
  private _handleFinalizeDecisions(
    threadId: string,
    interrupted: InterruptedRun,
    fullDecisions: ResumeDecision[],
  ): void {
    const argsByIndex = interrupted.finalizeArgsByIndex
    if (!argsByIndex) return
    for (const [idxStr, stashed] of Object.entries(argsByIndex)) {
      const idx = Number(idxStr)
      const decision = fullDecisions[idx]
      if (!decision) continue
      // Rework: keep the write-session open so the next pass keeps auto-accumulating.
      if (decision.type === 'responded') continue
      const chapterPath = this._resolveChapterPath(threadId, stashed.chapter)
      if (!chapterPath) continue
      if (decision.type === 'rejected') {
        const session = this.writingSessions.getActiveSession(threadId, chapterPath)
        if (session?.baselineSnapshot != null) {
          try {
            fs.writeFileSync(chapterPath, session.baselineSnapshot, 'utf-8')
          } catch (err) {
            console.error('[AgentEngine] finalize reject restore failed:', err)
          }
        }
      }
      // approve / edit / reject all close the session.
      this.writingSessions.closeSession(threadId, chapterPath)
    }
  }

  /**
   * M1-1 (变更 C run-end 兜底): when a run finishes cleanly but a write-session is still open with
   * accumulated auto-applied edits, the agent wrote the chapter but never called finalize_chapter —
   * the session would dangle and the chapter would land on disk with no end-of-chapter review. We
   * synthesize a finalize interrupt card per un-finalized session so it flows through the same
   * resume path (_handleFinalizeDecisions closes/restores the session). A session finalized this run
   * was already removed by closeSession, so it never double-cards; rework leaves the session open and
   * a later run-end re-prompts. Returns true if it synthesized an interrupt (caller must NOT send
   * run-done — the run is now interrupted awaiting the finalize decision).
   */
  private async _maybeSynthesizeRunEndFinalize(threadId: string, turnId?: string): Promise<boolean> {
    const domain = this.threadListQuery?.getMeta(threadId)?.domain ?? 'editing'
    // finalize_chapter and the finalize card are creative-domain only.
    if (domain !== 'creative') return false
    const sessions = this.writingSessions.getActiveSessions(threadId)
    if (!sessions.length) return false

    const actionRequests: HitlActionRequest[] = sessions.map(({ file }) => ({
      name: 'finalize_chapter',
      args: { chapter: file },
    }))
    const finalizeArgsByIndex: Record<number, { chapter: string; summary?: string }> = {}
    actionRequests.forEach((ar, i) => {
      finalizeArgsByIndex[i] = { chapter: String(ar.args?.chapter ?? '') }
    })

    this.runtimeStore.setInterrupted(threadId, {
      actionRequestCount: actionRequests.length,
      actionNames: actionRequests.map(a => a.name),
      turnId,
      reviewActionOriginalIndices: actionRequests.map((_, i) => i),
      autoDecisionsByIndex: {},
      finalizeArgsByIndex,
      syntheticFinalize: true,
    })

    const strategy = this.strategies[domain]
    const reviews = await strategy.buildReviewItems({ threadId, turnId, actionRequests })
    await this._enrichFinalizeReviews(reviews, threadId)
    for (const r of reviews) {
      if (r.kind === 'creative' && r.payload.kind === 'creative_chapter_finalize') {
        r.payload.autoFallback = true
      }
    }

    this.rendererBridge.sendRunInterrupted({ threadId, turnId, reviews, actionRequests })
    return true
  }

  /** Flag the review items that are write-session auto-apply, so the renderer applies them silently (no card). */
  private _markAutoApplyReviews(
    reviews: import('./domain/DomainStrategy').DomainReviewItem[],
    reviewOriginalIndices: number[],
    autoApplyOriginalIndices: Set<number>,
  ): void {
    if (!autoApplyOriginalIndices.size) return
    reviews.forEach((r, i) => {
      const origIdx = reviewOriginalIndices[i]
      if (r.kind === 'edit' && origIdx !== undefined && autoApplyOriginalIndices.has(origIdx)) {
        r.payload.autoApply = true
      }
    })
  }

  /**
   * On resume, an approved/edited confirm_writing_plan opens a write-session authorization (edited
   * args win — 改完即契约) AND anchors the finalize baseline at write-session start.
   *
   * Baseline anchor: we pre-activate the session here and capture the baseline *now* — before the
   * writer touches the chapter — so the finalize card's「起点」reflects the pre-writing content.
   * (Stage-2 lazy activation used to capture the baseline at the first auto-approved block edit,
   * which slipped to "after writing" whenever the writer's initial draft bypassed lazy activation —
   * e.g. new chapters landed via create_document, or relative target_files that never matched the
   * authorization set.) Since ensureActiveSession is idempotent, the later Stage-2 capture is
   * skipped. Targets are resolved to absolute paths so relative target_files still register and
   * match subsequent block edits. A not-yet-created chapter captures null → '' (empty = the correct
   * "before writing" baseline).
   */
  private async _registerApprovedWritingPlans(
    threadId: string,
    interrupted: InterruptedRun,
    fullDecisions: ResumeDecision[],
  ): Promise<void> {
    const argsByIndex = interrupted.confirmPlanArgsByIndex
    if (!argsByIndex) return
    for (const [idxStr, stashed] of Object.entries(argsByIndex)) {
      const idx = Number(idxStr)
      const decision = fullDecisions[idx]
      if (!decision || (decision.type !== 'approved' && decision.type !== 'edited')) continue
      let plan = stashed.plan
      let targetFiles = stashed.targetFiles
      if (decision.type === 'edited' && decision.editedArgs) {
        if (typeof decision.editedArgs.plan === 'string') plan = decision.editedArgs.plan
        const raw = decision.editedArgs.target_files
        if (Array.isArray(raw)) targetFiles = raw.filter((x): x is string => typeof x === 'string')
      }
      const resolvedTargets = targetFiles.map(f => this._resolveChapterPath(threadId, f) ?? f)
      this.writingSessions.registerAuthorization(threadId, plan, resolvedTargets)
      for (const target of resolvedTargets) {
        if (!path.isAbsolute(target)) continue
        const baseline = (await this._captureChapterBaseline(target)) ?? ''
        this.writingSessions.ensureActiveSession(threadId, target, baseline)
      }
    }
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
      metadata: { thread_id: threadId, turn_id: turnId, phase: 'initial' },
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
      metadata: { thread_id: threadId, turn_id: turnId, phase: 'resume' },
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
      // M1-1: if the agent finished without finalizing an open write-session, synthesize a run-end
      // finalize card instead of completing — it leaves the thread interrupted awaiting the decision.
      const finalizeTurnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined
      if (await this._maybeSynthesizeRunEndFinalize(threadId, finalizeTurnId)) return
      this.rendererBridge.sendRunDone({
        threadId,
        turnId: finalizeTurnId,
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

  private async _prepareActionRequestsForReview(
    threadId: string,
    actionRequests: HitlActionRequest[],
  ): Promise<{
    reviewActionRequests: HitlActionRequest[]
    reviewActionOriginalIndices: number[]
    autoDecisionsByIndex: Record<number, ResumeDecision>
    autoRejects: Array<{ toolName: string; filePath: string; message: string }>
    /** Original indices of block edits inside an active write-session scope — the renderer applies them silently (M1b Stage 2). */
    autoApplyOriginalIndices: Set<number>
  }> {
    const workspacePath = this.runtimeStore.getContext(threadId)?.workspacePath ?? null
    const reviewActionRequests: HitlActionRequest[] = []
    const reviewActionOriginalIndices: number[] = []
    const autoDecisionsByIndex: Record<number, ResumeDecision> = {}
    const autoRejects: Array<{ toolName: string; filePath: string; message: string }> = []
    const autoApplyOriginalIndices = new Set<number>()
    const authorizedFiles = this.writingSessions.getAuthorizedFiles(threadId)

    // Stage 1 pre-scan — resolve every filesystem-write tool up front so batch poisoning
    // (Stage 4, triggered *only* by a Stage-1 safety reject) is known before Stage 2 mutates
    // any write-session accumulation. Non-poisoned batches then decide in original index order.
    const fsDecisions = new Map<number, ReturnType<typeof decideFilesystemWriteApproval>>()
    let hasAutoReject = false
    actionRequests.forEach((actionRequest, index) => {
      if (!isFilesystemWriteToolName(actionRequest.name)) return
      const decision = decideFilesystemWriteApproval({
        toolName: actionRequest.name,
        args: actionRequest.args ?? {},
        workspacePath,
      })
      fsDecisions.set(index, decision)
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

    // Stage 4 — batch poisoning: a Stage-1 safety reject fails the whole batch (半批落地会造成
    // 不一致状态). Nothing reaches Stage 2, so no session accumulation happens on a poisoned batch.
    if (hasAutoReject) {
      actionRequests.forEach((_actionRequest, index) => {
        const fsDecision = fsDecisions.get(index)
        // Preserve Stage-1 auto decisions (auto-reject keeps its message; auto-approve of an
        // internal virtual path stays approved — ephemeral scratch, not a half-batch landing);
        // everything else is poisoned to rejected.
        if (fsDecision && fsDecision.kind !== 'requires-review') {
          autoDecisionsByIndex[index] = fsDecision.decision
          return
        }
        autoDecisionsByIndex[index] = {
          type: 'rejected',
          message: 'Skipped because another filesystem operation in this batch was rejected by policy.',
        }
      })
      return { reviewActionRequests: [], reviewActionOriginalIndices: [], autoDecisionsByIndex, autoRejects, autoApplyOriginalIndices }
    }

    for (let index = 0; index < actionRequests.length; index++) {
      const actionRequest = actionRequests[index]!
      // Stage 1 — filesystem path policy (auto-approve virtual paths, else human review).
      const fsDecision = fsDecisions.get(index)
      if (fsDecision) {
        if (fsDecision.kind === 'requires-review') {
          reviewActionRequests.push(actionRequest)
          reviewActionOriginalIndices.push(index)
        } else {
          autoDecisionsByIndex[index] = fsDecision.decision
        }
        continue
      }

      // Stage 2 — write-session authorization. A block edit whose target file is inside an active
      // write-session scope is destined for silent auto-apply: lazy-activate the session (capturing
      // the baseline exactly once) and flag its index. It STILL enters the review batch — the
      // renderer, not the host, applies the TipTap mutation (executor.flushReviewedBatch); marking
      // it as auto-apply here lets the renderer flush it without a card. Host-side auto-approval
      // WITHOUT a renderer apply would be a phantom edit, so we never route it to autoDecisionsByIndex.
      if (isBlockEditToolName(actionRequest.name)) {
        const verdict = decideWritingSessionApproval({
          toolName: actionRequest.name,
          args: actionRequest.args ?? {},
          authorizedFiles,
        })
        if (verdict.kind === 'auto-approve') {
          // Capture the pre-edit baseline through the unified snapshot route (editor buffer if the
          // chapter is open, else disk) the first time this file activates — the renderer has not
          // applied the edit yet at interrupt time, so the snapshot is the true "before". Also record
          // the accumulated edit so the finalize card (M1b-3) can report the session's diff.
          const baseline = this.writingSessions.getActiveSession(threadId, verdict.activateFile)
            ? undefined
            : await this._captureChapterBaseline(verdict.activateFile)
          this.writingSessions.recordAccumulation(threadId, verdict.activateFile, {
            toolName: actionRequest.name,
            args: actionRequest.args ?? {},
            at: Date.now(),
          }, baseline)
          autoApplyOriginalIndices.add(index)
        }
      }
      reviewActionRequests.push(actionRequest)
      reviewActionOriginalIndices.push(index)
    }

    return {
      reviewActionRequests,
      reviewActionOriginalIndices,
      autoDecisionsByIndex,
      autoRejects,
      autoApplyOriginalIndices,
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
    const prepared = await this._prepareActionRequestsForReview(threadId, actionRequests)

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
      confirmPlanArgsByIndex: this._stashConfirmPlanArgs(actionRequests),
      finalizeArgsByIndex: this._stashFinalizeArgs(actionRequests),
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
    this._markAutoApplyReviews(reviews, prepared.reviewActionOriginalIndices, prepared.autoApplyOriginalIndices)
    await this._enrichFinalizeReviews(reviews, threadId)

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
    const prepared = await this._prepareActionRequestsForReview(threadId, actionRequests)

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
      confirmPlanArgsByIndex: this._stashConfirmPlanArgs(actionRequests),
      finalizeArgsByIndex: this._stashFinalizeArgs(actionRequests),
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
    this._markAutoApplyReviews(reviews, prepared.reviewActionOriginalIndices, prepared.autoApplyOriginalIndices)
    await this._enrichFinalizeReviews(reviews, threadId)

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
    const skillSources = this.strategies[domain].getSkillSources?.(this.aiRootPath, workspacePath) ?? []
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
        // Innermost: honor provider Retry-After on transient 429s and retry the SAME model before
        // a persistent limit degrades to the fallback model (fallback wraps this, so it runs after).
        createRateLimitRetryMiddleware(),
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
    if (this.checkpointerInstance) return
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize().finally(() => {
        this.initializationPromise = null
      })
    }
    await this.initializationPromise
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
      // creative 技能按执行途径分组（04.3 §3 挂载矩阵）
      path.join(this.aiRootPath, 'skills', 'creative', 'main'),
      path.join(this.aiRootPath, 'skills', 'creative', 'ideation'),
      path.join(this.aiRootPath, 'skills', 'creative', 'prose'),
      path.join(this.aiRootPath, 'skills', 'creative', 'review'),
      path.join(this.aiRootPath, 'skills', 'creative', 'delegated'),
      path.join(this.aiRootPath, 'skills', 'creative', 'reference'),
      // 声明式子 Agent 定义（A1 装配器扫描目标）
      path.join(this.aiRootPath, 'subagents'),
      path.join(this.aiRootPath, 'subagents', 'common'),
      path.join(this.aiRootPath, 'subagents', 'creative'),
      path.join(this.aiRootPath, 'empty-fs'),
    ]
    await Promise.all(dirs.map(dir => fs.promises.mkdir(dir, { recursive: true })))
    await this.syncBundledSkills()
    await this.syncBundledSubagents()
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

    // Phase 2 重组：内置技能目录纯 bundled 派生（writing-style 动态技能已退役，风格改为
    // styles/{slug}.md 工程对象）。每个顶层目录做「清空后镜像」，确保上一版遗留的旧分组
    // 子目录（creative/{planner,writer,consistency,common} 及旧 main 技法技能）不会残留在
    // 用户根被误挂载。项目级自定义技能在 {workspace}/.iwriter/skills，不在此根，不受影响。
    const entries = fs.readdirSync(this.bundledSkillsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourceDir = path.join(this.bundledSkillsPath, entry.name)
      const targetDir = path.join(targetRoot, entry.name)
      await fs.promises.rm(targetDir, { recursive: true, force: true })
      await fs.promises.mkdir(targetDir, { recursive: true })
      // dereference: true resolves any packaged symlinks inside scoped source dirs.
      fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
    }

    // 写入版本文件，下次启动（同版本）直接跳过
    await fs.promises.writeFile(versionFile, currentVersion, 'utf-8')
  }

  /**
   * 同步内置子 Agent 定义（A1 声明式装配的分发路径）。
   * 与技能同款「清空后镜像」：`builtin-subagents/{common,creative}/{name}/agent.md`
   * → `~/.iwriter/ai/subagents/`。子 Agent 定义不开放作者覆盖（不设 {workspace}/subagents/）。
   */
  private async syncBundledSubagents(): Promise<void> {
    if (!fs.existsSync(this.bundledSubagentsPath)) return
    const targetRoot = path.join(this.aiRootPath, 'subagents')
    const entries = fs.readdirSync(this.bundledSubagentsPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourceDir = path.join(this.bundledSubagentsPath, entry.name)
      const targetDir = path.join(targetRoot, entry.name)
      await fs.promises.rm(targetDir, { recursive: true, force: true })
      await fs.promises.mkdir(targetDir, { recursive: true })
      fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
    }
  }

  private _buildMemoryPaths(domain: AiAgentDomain): string[] {
    return buildMemorySources(this.aiRootPath, this.strategies[domain].getMemoryDir())
  }

  private async _assertWithinBudget(
    config: AiProviderConfig,
    domain: AiAgentDomain,
    mode: AiAgentMode,
    modelId: string,
    thinkingLevel: AiThinkingLevel,
    userContent: string,
    language: DetectedInputLanguage = 'en-US',
    threadId?: string,
  ): Promise<void> {
    const systemPrompt = this.strategies[domain].getSystemPrompt(mode, language)
    const userContentTokens = estimateTextTokens(userContent)
    const inputTokens = estimateTextTokens(systemPrompt) + userContentTokens
    const model = createChatModel(config, { modelId, thinkingLevel })
    const budgetInfo = getModelBudgetInfo((model as BaseChatModel & { profile?: ModelProfile }).profile)

    // New input alone must fit under the summarization trigger (nothing to compact yet if it doesn't).
    if (inputTokens > budgetInfo.triggerTokens) {
      throw new Error(
        `当前请求预计约 ${inputTokens} tokens，已超过摘要触发预算 ${budgetInfo.triggerTokens}。请先点击 Compact 压缩输入，或减少附件与上下文。`
      )
    }

    // Hard TPM-safety backstop: the profile-based summarization trigger can sit far above the org's
    // per-minute token budget, so the accumulated request (history + input) must also clear a hard
    // ceiling. Fail fast with an actionable hint rather than hitting an opaque 429/400 mid-run.
    // _getCurrentSessionTokens already includes the system prompt + tools + existing messages, so we
    // add ONLY the new user input here — never the system prompt again (it would double-count and
    // false-trip long sessions near the ceiling). The provider may override the global default.
    const ceiling = config.maxRequestTokens ?? HARD_REQUEST_CEILING_TOKENS
    const sessionTokens = await this._getCurrentSessionTokens(threadId, domain, mode)
    const projectedTokens = sessionTokens + userContentTokens
    if (projectedTokens > ceiling) {
      throw new Error(
        `本轮请求预计约 ${projectedTokens} tokens（历史 ${sessionTokens} + 新输入 ${userContentTokens}），已超过单次请求硬上限 ${ceiling}。请点击 Compact 压缩，或开启新会话继续。`
      )
    }
  }
}
