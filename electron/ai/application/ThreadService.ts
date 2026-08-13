import type { AiSettings, AiThread, SendMessageRequest, ThreadMessage } from '@shared/ai/contracts'
import { detectInputLanguage, type DetectedInputLanguage } from '../../../shared/ai/core/detectInputLanguage'
import { generateThreadTitle } from '../../../shared/ai/core/threadTitle'
import { metaToAiThread, type ThreadListQuery, type ThreadMeta } from '../thread/ThreadListQuery'
import { resolveThreadRuntime, type ResolvedThreadRuntime } from '../runtime/ThreadRuntimeResolver'
import type { ThreadRuntimeStore } from '../runtime/ThreadRuntimeStore'
import { convertLcMessages } from '../ipc/MessageAdapter'
import type { CheckpointerInstance } from '../checkpoint/CheckpointerFactory'

type CheckpointReader = Pick<CheckpointerInstance['checkpointer'], 'get'>

interface ThreadRunnerPort {
  cancel(threadId: string): Promise<void>
  deleteThread(threadId: string): void
  clear(): void
}

interface ThreadResourcePort {
  deleteThread(threadId: string): void
  clear(): void
}

interface WritingSessionPort {
  clearThread(threadId: string): void
  clearAll(): void
}

interface CheckpointerAdminPort {
  deleteThread(threadId: string): void
  clearAll(): void
}

export interface ThreadServiceDependencies {
  getCheckpointer(): CheckpointReader | null
  getThreadListQuery(): ThreadListQuery | null
  runtimeStore: ThreadRuntimeStore
  agentRunner: ThreadRunnerPort
  agentCache: ThreadResourcePort
  writingSessions: WritingSessionPort
  getCheckpointerAdmin(): CheckpointerAdminPort | null
  clearFallbackNotifications(threadId: string, turnId?: string | null): void
  clearAllFallbackNotifications(): void
}

export interface PreparedThreadTurn {
  threadId: string
  turnId: string
  isNewThread: boolean
  runtime: ResolvedThreadRuntime
  language: DetectedInputLanguage
}

export interface ThreadMessagesResult {
  messages: ThreadMessage[]
  rawMessages: unknown[]
}

export class ThreadService {
  constructor(private readonly dependencies: ThreadServiceDependencies) {}

  listThreads(): AiThread[] {
    return (this.dependencies.getThreadListQuery()?.loadMetas() ?? []).map(metaToAiThread)
  }

  async readMessages(threadId: string): Promise<ThreadMessagesResult> {
    try {
      const checkpointer = this.dependencies.getCheckpointer()
      if (!checkpointer) return { messages: [], rawMessages: [] }
      const tuple = await checkpointer.get({
        configurable: { thread_id: threadId },
      })
      if (!tuple) return { messages: [], rawMessages: [] }

      const rawMessages = (
        tuple as { channel_values?: { messages?: unknown[] } }
      ).channel_values?.messages ?? []
      return {
        messages: convertLcMessages(rawMessages),
        rawMessages,
      }
    } catch (error) {
      console.error('[AgentEngine] getThreadMessages error:', error)
      return { messages: [], rawMessages: [] }
    }
  }

  getMeta(threadId: string): ThreadMeta | null {
    return this.dependencies.getThreadListQuery()?.getMeta(threadId) ?? null
  }

  touchThread(threadId: string, hasError?: boolean): void {
    this.dependencies.getThreadListQuery()?.updateMeta(threadId, {
      updatedAt: Date.now(),
      ...(hasError === undefined ? {} : { hasError }),
    })
  }

  async cancel(threadId: string): Promise<void> {
    await this.dependencies.agentRunner.cancel(threadId)
    this.dependencies.runtimeStore.clearInterrupted(threadId)
    this.dependencies.clearFallbackNotifications(
      threadId,
      this.dependencies.runtimeStore.getCurrentTurnId(threadId),
    )
    this.dependencies.runtimeStore.clearCurrentTurnId(threadId)
  }

  deleteThread(threadId: string): void {
    this.dependencies.getThreadListQuery()?.deleteMeta(threadId)
    this.dependencies.runtimeStore.deleteThread(threadId)
    this.dependencies.agentRunner.deleteThread(threadId)
    this.dependencies.clearFallbackNotifications(threadId)
    this.dependencies.agentCache.deleteThread(threadId)
    this.dependencies.writingSessions.clearThread(threadId)
    this.dependencies.getCheckpointerAdmin()?.deleteThread(threadId)
  }

  clearThreads(): void {
    this.dependencies.getThreadListQuery()?.clearMetas()
    this.dependencies.runtimeStore.clear()
    this.dependencies.agentRunner.clear()
    this.dependencies.clearAllFallbackNotifications()
    this.dependencies.agentCache.clear()
    this.dependencies.writingSessions.clearAll()
    this.dependencies.getCheckpointerAdmin()?.clearAll()
  }

  prepareTurn(settings: AiSettings, request: SendMessageRequest): PreparedThreadTurn {
    const threadListQuery = this.dependencies.getThreadListQuery()
    if (!threadListQuery) throw new Error('[ThreadService] Thread persistence is not initialized.')
    const threadId = request.threadId
      ?? `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const existingMeta = request.threadId
      ? threadListQuery.getMeta(request.threadId)
      : null
    const runtime = resolveThreadRuntime(settings, request, existingMeta)
    const turnId = request.turnId ?? `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const metadata = {
      domain: runtime.domain,
      mode: runtime.mode,
      modelId: runtime.modelId,
      providerConfigId: runtime.providerConfig.id,
      thinkingLevel: runtime.thinkingLevel,
    }
    const isNewThread = !existingMeta
    if (isNewThread) {
      threadListQuery.createMeta({ id: threadId, ...metadata })
      threadListQuery.setTitle(threadId, generateThreadTitle(request.userText))
    } else {
      threadListQuery.updateMeta(threadId, metadata)
    }

    const language = detectInputLanguage([request.userText], request.uiLocale)
    this.dependencies.runtimeStore.setContext(threadId, {
      workspacePath: request.workspacePath,
      language,
    })
    this.dependencies.runtimeStore.setCurrentTurnId(threadId, turnId)

    if (this.dependencies.runtimeStore.getInterrupted(threadId)) {
      console.warn('[AgentEngine] sendMessage: clearing stale interrupted state for threadId:', threadId)
      this.dependencies.runtimeStore.clearInterrupted(threadId)
    }

    return {
      threadId,
      turnId,
      isNewThread,
      runtime,
      language,
    }
  }
}
