import type { ComputedRef, Ref } from 'vue'
import type {
  AiThread,
  AiToolCall,
  CreativeReviewItem,
  CreativeRoundResult,
  EditProposal,
  ThreadMessage,
} from '@/ai/types'
import type {
  RunDoneEvent,
  RunErrorEvent,
  RunInterruptedEvent,
  StreamChunkEvent,
  DomainReviewItem,
} from '@/ai/ipc'
import type { LiveSubTask, LiveTurn, ThreadRunState } from './runtimeState'

interface RuntimeEventsDeps {
  activeThread: ComputedRef<AiThread | null>
  threadRunState: Ref<ThreadRunState>
  liveTurn: Ref<LiveTurn | null>
  currentThreadId: Ref<string | null>
  currentTurnId: Ref<string | null>
  clearRunPointers: () => void
  startLiveTurn: (params: {
    threadId: string
    turnId: string | null
    state: 'streaming' | 'interrupted' | 'resuming'
    startedAt?: number
  }) => void
  ensureLiveTurn: (params?: {
    threadId?: string | null
    turnId?: string | null
    state?: 'streaming' | 'interrupted' | 'resuming'
    startedAt?: number
  }) => LiveTurn | null
  clearLiveTurn: () => void
  handleEditInterrupt: (params: {
    threadId: string
    turnId: string | null
    proposals: EditProposal[]
  }) => void
  handleCreativeInterrupt: (params: {
    threadId: string
    turnId: string | null
    reviews: CreativeReviewItem[]
  }) => void
  resetEditReviewState: () => void
  resetCreativeReviewState: () => void
  notifyCreativeToolResult: (toolName: string, isError: boolean, toolCallId?: string) => void
  finalizePendingCreativeApply: () => void
  inferToolKind: (toolName: string) => AiToolCall['kind']
  normalizeMessagesForDisplay: (messages: ThreadMessage[]) => ThreadMessage[]
  normalizeMessageForDisplay: (message: ThreadMessage) => ThreadMessage
  getCompletedRoundResult: (threadId: string | null | undefined, turnId: string | null | undefined) => ThreadMessage['editRoundResult'] | null
  getCompletedCreativeRoundResult: (threadId: string | null | undefined, turnId: string | null | undefined) => CreativeRoundResult | null
  appendMessage: (thread: AiThread, message: ThreadMessage) => AiThread
  updateThread: (thread: AiThread) => void
  notifyError: (message: string) => void
  makeErrorMessage: (input: { turnId?: string | null; content: string }) => ThreadMessage
}

export function createRuntimeEvents(deps: RuntimeEventsDeps) {
  let currentRunHasError = false

  function resetRunErrorFlag() {
    currentRunHasError = false
  }

  function updateSubTaskStatus(
    liveTurn: LiveTurn,
    id: string | undefined,
    status: LiveSubTask['status'],
    output?: unknown,
  ): boolean {
    if (!id) return false
    const idx = liveTurn.subTasks.findIndex(st => st.invocationId === id)
    if (idx < 0) return false
    const updated = [...liveTurn.subTasks]
    updated[idx] = { ...liveTurn.subTasks[idx]!, status, output }
    liveTurn.subTasks = updated
    return true
  }

  function onStreamChunk(chunk: StreamChunkEvent) {
    const liveTurn = deps.ensureLiveTurn({
      state: deps.threadRunState.value === 'interrupted' ? 'interrupted' : 'streaming',
    })
    if (!liveTurn) return
    if (chunk.threadId !== liveTurn.threadId) return

    if (chunk.type === 'subagent_start') {
      const invocationId = chunk.subagentId
      if (!invocationId) return
      const subTask: LiveSubTask = {
        invocationId,
        name: chunk.subagentName,
        taskInput: chunk.taskInput,
        text: '',
        thinkingText: '',
        blocks: [],
        status: 'running',
      }
      liveTurn.subTasks = [...liveTurn.subTasks, subTask]
      deps.liveTurn.value = { ...liveTurn }
      return
    }

    if (chunk.type === 'subagent_end') {
      if (updateSubTaskStatus(liveTurn, chunk.subagentId, 'done', chunk.output)) {
        deps.liveTurn.value = { ...liveTurn }
      }
      return
    }

    if (chunk.subagentName) {
      if (chunk.subagentId) {
        _applySubagentChunk(liveTurn, chunk as StreamChunkEvent & { subagentName: string }, chunk.subagentId)
        deps.liveTurn.value = { ...liveTurn }
      }
      return
    }

    if (chunk.type === 'text' && chunk.delta) {
      liveTurn.text += chunk.delta
      liveTurn.currentText += chunk.delta
      deps.liveTurn.value = { ...liveTurn }
      return
    }

    if (chunk.type === 'thinking' && chunk.delta) {
      liveTurn.thinkingText += chunk.delta
      deps.liveTurn.value = { ...liveTurn }
      return
    }

    if (chunk.type === 'tool_call_start' && chunk.toolCall) {
      if (liveTurn.currentText) {
        liveTurn.blocks = [...liveTurn.blocks, { type: 'text', text: liveTurn.currentText }]
        liveTurn.currentText = ''
      }
      const enriched: AiToolCall = {
        ...chunk.toolCall,
        kind: deps.inferToolKind(chunk.toolCall.name),
      }
      liveTurn.blocks = [...liveTurn.blocks, { type: 'tool_call', toolCall: enriched }]
      liveTurn.toolName = chunk.toolName ?? null
      deps.liveTurn.value = { ...liveTurn }
      return
    }

    if (chunk.type === 'tool_call_end' && chunk.toolCallId && chunk.toolCall) {
      liveTurn.blocks = liveTurn.blocks.map(block =>
        block.type === 'tool_call' && block.toolCall.id === chunk.toolCallId
          ? { type: 'tool_call', toolCall: { ...block.toolCall, status: chunk.toolCall!.status, result: chunk.toolCall!.result, isError: chunk.toolCall!.isError } }
          : block
      )
      if (chunk.toolCall.name === 'task') {
        updateSubTaskStatus(liveTurn, chunk.toolCallId, chunk.toolCall.isError ? 'error' : 'done', chunk.toolCall.result)
      }
      liveTurn.toolName = null
      deps.liveTurn.value = { ...liveTurn }
      if (chunk.toolCall?.isError && chunk.toolCall.name) {
        deps.notifyCreativeToolResult(chunk.toolCall.name, true, chunk.toolCallId)
      }
    }
  }

  function _applySubagentChunk(liveTurn: LiveTurn, chunk: StreamChunkEvent & { subagentName: string }, invocationId: string): void {
    const idx = liveTurn.subTasks.findIndex(st => st.invocationId === invocationId)
    if (idx < 0) return
    const subTask = liveTurn.subTasks[idx]!

    if (chunk.type === 'thinking' && chunk.delta) {
      const updated = [...liveTurn.subTasks]
      updated[idx] = { ...subTask, thinkingText: subTask.thinkingText + chunk.delta }
      liveTurn.subTasks = updated
      return
    }

    if (chunk.type === 'text' && chunk.delta) {
      const updated = [...liveTurn.subTasks]
      updated[idx] = { ...subTask, text: subTask.text + chunk.delta }
      liveTurn.subTasks = updated
      return
    }

    if (chunk.type === 'tool_call_start' && chunk.toolCall) {
      const enriched: AiToolCall = { ...chunk.toolCall, kind: deps.inferToolKind(chunk.toolCall.name) }
      const updated = [...liveTurn.subTasks]
      updated[idx] = { ...subTask, blocks: [...subTask.blocks, { type: 'tool_call', toolCall: enriched }] }
      liveTurn.subTasks = updated
      return
    }

    if (chunk.type === 'tool_call_end' && chunk.toolCallId && chunk.toolCall) {
      const updatedBlocks = subTask.blocks.map(b =>
        b.type === 'tool_call' && b.toolCall.id === chunk.toolCallId
          ? { type: 'tool_call' as const, toolCall: { ...b.toolCall, status: chunk.toolCall!.status, result: chunk.toolCall!.result, isError: chunk.toolCall!.isError } }
          : b
      )
      const updated = [...liveTurn.subTasks]
      updated[idx] = { ...subTask, blocks: updatedBlocks }
      liveTurn.subTasks = updated
    }
  }

  function onRunInterrupted(event: RunInterruptedEvent) {
    deps.threadRunState.value = 'interrupted'

    deps.startLiveTurn({
      threadId: event.threadId,
      turnId: event.turnId ?? deps.currentTurnId.value,
      state: 'interrupted',
      startedAt: deps.liveTurn.value?.turnId === (event.turnId ?? deps.currentTurnId.value)
        ? deps.liveTurn.value.startedAt
        : undefined,
    })

    const editProposals = event.reviews
      .filter((r): r is Extract<DomainReviewItem, { kind: 'edit' }> => r.kind === 'edit')
      .map(r => r.payload)
    const creativeReviews = event.reviews
      .filter((r): r is Extract<DomainReviewItem, { kind: 'creative' }> => r.kind === 'creative')
      .map(r => r.payload)

    if (creativeReviews.length) {
      deps.handleCreativeInterrupt({
        threadId: event.threadId,
        turnId: event.turnId ?? deps.currentTurnId.value,
        reviews: creativeReviews,
      })
    } else {
      deps.handleEditInterrupt({
        threadId: event.threadId,
        turnId: event.turnId ?? deps.currentTurnId.value,
        proposals: editProposals,
      })
    }

    const thread = deps.activeThread.value
    if (thread && thread.id === event.threadId) {
      let updated = thread
      if (event.partialMessage) {
        const alreadyPresent = (updated.messages ?? []).some(message => message.id === event.partialMessage!.id)
        if (!alreadyPresent) {
          updated = deps.appendMessage(updated, deps.normalizeMessageForDisplay(event.partialMessage))
        }
      }
      deps.updateThread({ ...updated, messagesLoaded: false })

      window.electronAPI.aiGetThreadMessages?.(event.threadId)
        .then(messages => {
          if (!messages?.length) return
          const current = deps.activeThread.value
          if (current && current.id !== event.threadId) return
          if (messages.length < (current?.messages?.length ?? 0)) return
          const normalizedMessages = deps.normalizeMessagesForDisplay(messages)
          if (event.turnId) {
            for (let i = normalizedMessages.length - 1; i >= 0; i--) {
              const message = normalizedMessages[i]
              if (message?.role === 'assistant') {
                normalizedMessages[i] = { ...message, turnId: message.turnId ?? event.turnId }
                break
              }
            }
          }
          deps.updateThread({ ...current!, messages: normalizedMessages, messagesLoaded: true })
        })
        .catch(() => { /* ignore */ })
    }
  }

  function onRunDone(event: RunDoneEvent) {
    deps.finalizePendingCreativeApply()
    deps.threadRunState.value = 'idle'
    deps.clearLiveTurn()
    deps.clearRunPointers()
    deps.resetEditReviewState()
    deps.resetCreativeReviewState()

    const thread = deps.activeThread.value
    if (thread && thread.id === event.threadId && !currentRunHasError) {
      window.electronAPI.aiGetThreadMessages?.(event.threadId)
        .then(messages => {
          if (!messages?.length) return
          const current = deps.activeThread.value
          if (current && current.id === event.threadId) {
            const normalizedMessages = deps.normalizeMessagesForDisplay(messages)
            if (event.turnId) {
              let attached = false
              for (let i = normalizedMessages.length - 1; i >= 0; i--) {
                const message = normalizedMessages[i]
                if (message?.role === 'assistant' && (message.turnId === event.turnId || (!message.turnId && !attached))) {
                  const turnId = message.turnId ?? event.turnId
                  const editRoundResult = deps.getCompletedRoundResult(event.threadId, turnId)
                  const creativeRoundResult = deps.getCompletedCreativeRoundResult(event.threadId, turnId)
                  normalizedMessages[i] = {
                    ...message,
                    turnId,
                    editRoundResult: editRoundResult ?? message.editRoundResult,
                    creativeRoundResult: creativeRoundResult ?? message.creativeRoundResult,
                  }
                  attached = true
                  if (message.turnId === event.turnId) break
                }
              }
            }
            deps.updateThread({ ...current, messages: normalizedMessages, messagesLoaded: true })
          }
        })
        .catch(() => { /* ignore */ })
    }
  }

  function onRunError(event: RunErrorEvent) {
    currentRunHasError = true
    deps.threadRunState.value = 'idle'
    deps.clearLiveTurn()
    deps.clearRunPointers()
    deps.resetEditReviewState()
    deps.resetCreativeReviewState()

    deps.notifyError(`AI 错误: ${event.error}`)

    const thread = deps.activeThread.value
    if (thread && thread.id === event.threadId) {
      deps.updateThread(
        deps.appendMessage(
          { ...thread, hasError: true },
          deps.makeErrorMessage({ turnId: event.turnId, content: event.error })
        )
      )
    }
  }

  return {
    resetRunErrorFlag,
    onStreamChunk,
    onRunInterrupted,
    onRunDone,
    onRunError,
  }
}
