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
import { isHitlInterruptPayload } from '@/ai/hitl'
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
  handleFilesystemInterrupt: (params: {
    threadId: string
    turnId: string | null
    reviews: DomainReviewItem[]
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

  function updateSubTask(
    liveTurn: LiveTurn,
    id: string | undefined,
    update: Partial<Pick<LiveSubTask, 'status' | 'output' | 'errorText'>>,
  ): boolean {
    if (!id) return false
    const idx = liveTurn.subTasks.findIndex(st => st.invocationId === id)
    if (idx < 0) return false
    const existing = liveTurn.subTasks[idx]!
    const updated = [...liveTurn.subTasks]
    updated[idx] = {
      ...existing,
      ...update,
      output: update.output ?? existing.output,
      errorText: update.errorText ?? existing.errorText,
    }
    liveTurn.subTasks = updated
    return true
  }

  function isTerminalSubTaskStatus(status: LiveSubTask['status']): boolean {
    return status === 'done' || status === 'error' || status === 'cancelled'
  }

  function taskSubagentName(toolCall: AiToolCall): string {
    const type = toolCall.arguments['subagent_type']
    return typeof type === 'string' && type.trim() ? type : 'task'
  }

  function ensureSubTaskForTaskTool(liveTurn: LiveTurn, toolCall: AiToolCall): void {
    if (toolCall.name !== 'task') return
    const idx = liveTurn.subTasks.findIndex(st => st.invocationId === toolCall.id)
    const name = taskSubagentName(toolCall)
    if (idx < 0) {
      liveTurn.subTasks = [
        ...liveTurn.subTasks,
        {
          invocationId: toolCall.id,
          name,
          taskInput: toolCall.arguments,
          text: '',
          thinkingText: '',
          blocks: [],
          status: 'pending',
        },
      ]
      return
    }

    const existing = liveTurn.subTasks[idx]!
    const updated = [...liveTurn.subTasks]
    updated[idx] = {
      ...existing,
      name: existing.name || name,
      taskInput: existing.taskInput ?? toolCall.arguments,
      status: existing.status === 'awaiting_approval' ? 'running' : existing.status,
    }
    liveTurn.subTasks = updated
  }

  function applySubTaskDoneFromSubagentEnd(
    liveTurn: LiveTurn,
    id: string | undefined,
    output?: unknown,
  ): boolean {
    if (!id) return false
    const subTask = liveTurn.subTasks.find(st => st.invocationId === id)
    if (!subTask) return false
    if (subTask.status === 'awaiting_approval' || isTerminalSubTaskStatus(subTask.status)) {
      return updateSubTask(liveTurn, id, { output })
    }
    return updateSubTask(liveTurn, id, { status: 'done', output })
  }

  function applyTaskToolEndToSubTask(liveTurn: LiveTurn, toolCall: AiToolCall): void {
    if (toolCall.name !== 'task') return

    if (isHitlInterruptPayload(toolCall.result)) {
      updateSubTask(liveTurn, toolCall.id, {
        status: 'awaiting_approval',
        output: toolCall.result,
      })
      return
    }

    if (toolCall.status === 'rejected') {
      updateSubTask(liveTurn, toolCall.id, {
        status: 'cancelled',
        output: toolCall.result,
        errorText: toolCall.result,
      })
      return
    }

    if (toolCall.isError || toolCall.status === 'failed') {
      updateSubTask(liveTurn, toolCall.id, {
        status: 'error',
        output: toolCall.result,
        errorText: toolCall.result,
      })
      return
    }

    updateSubTask(liveTurn, toolCall.id, {
      status: 'done',
      output: toolCall.result,
      errorText: '',
    })
  }

  function isSettledToolCall(toolCall: AiToolCall): boolean {
    return toolCall.status === 'completed' || toolCall.status === 'failed' || toolCall.status === 'rejected'
  }

  function mergeToolCallStart(existing: AiToolCall, incoming: AiToolCall): AiToolCall {
    if (!isSettledToolCall(existing) || isSettledToolCall(incoming)) {
      return incoming
    }
    return {
      ...incoming,
      status: existing.status,
      result: existing.result,
      isError: existing.isError,
    }
  }

  function hasRootToolCall(liveTurn: LiveTurn, toolCallId: string): boolean {
    return liveTurn.blocks.some(block =>
      block.type === 'tool_call' && block.toolCall.id === toolCallId
    )
  }

  function upsertRootToolCall(liveTurn: LiveTurn, toolCall: AiToolCall): void {
    const idx = liveTurn.blocks.findIndex(block =>
      block.type === 'tool_call' && block.toolCall.id === toolCall.id
    )
    if (idx >= 0) {
      const updated = [...liveTurn.blocks]
      const existing = liveTurn.blocks[idx]!
      updated[idx] = {
        type: 'tool_call',
        toolCall: existing.type === 'tool_call'
          ? mergeToolCallStart(existing.toolCall, toolCall)
          : toolCall,
      }
      liveTurn.blocks = updated
      return
    }
    liveTurn.blocks = [...liveTurn.blocks, { type: 'tool_call', toolCall }]
  }

  function upsertSubTask(liveTurn: LiveTurn, subTask: LiveSubTask): void {
    const idx = liveTurn.subTasks.findIndex(st => st.invocationId === subTask.invocationId)
    if (idx < 0) {
      liveTurn.subTasks = [...liveTurn.subTasks, subTask]
      return
    }

    const existing = liveTurn.subTasks[idx]!
    const updated = [...liveTurn.subTasks]
    updated[idx] = {
      ...existing,
      name: subTask.name,
      taskInput: subTask.taskInput,
    }
    liveTurn.subTasks = updated
  }

  function upsertSubTaskToolCall(subTask: LiveSubTask, toolCall: AiToolCall): LiveSubTask {
    const idx = subTask.blocks.findIndex(block =>
      block.type === 'tool_call' && block.toolCall.id === toolCall.id
    )
    if (idx >= 0) {
      const updatedBlocks = [...subTask.blocks]
      const existing = subTask.blocks[idx]!
      updatedBlocks[idx] = {
        type: 'tool_call',
        toolCall: existing.type === 'tool_call'
          ? mergeToolCallStart(existing.toolCall, toolCall)
          : toolCall,
      }
      return { ...subTask, blocks: updatedBlocks }
    }
    return {
      ...subTask,
      blocks: [...subTask.blocks, { type: 'tool_call', toolCall }],
    }
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
      upsertSubTask(liveTurn, subTask)
      updateSubTask(liveTurn, invocationId, { status: 'running', errorText: '' })
      deps.liveTurn.value = { ...liveTurn }
      return
    }

    if (chunk.type === 'subagent_end') {
      if (applySubTaskDoneFromSubagentEnd(liveTurn, chunk.subagentId, chunk.output)) {
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
      const enriched: AiToolCall = {
        ...chunk.toolCall,
        kind: deps.inferToolKind(chunk.toolCall.name),
      }
      ensureSubTaskForTaskTool(liveTurn, enriched)
      if (!hasRootToolCall(liveTurn, enriched.id) && liveTurn.currentText) {
        liveTurn.blocks = [...liveTurn.blocks, { type: 'text', text: liveTurn.currentText }]
        liveTurn.currentText = ''
      }
      upsertRootToolCall(liveTurn, enriched)
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
        applyTaskToolEndToSubTask(liveTurn, chunk.toolCall)
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
      updated[idx] = upsertSubTaskToolCall(subTask, enriched)
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
    const filesystemReviews = event.reviews
      .filter((r): r is Extract<DomainReviewItem, { kind: 'filesystem' }> => r.kind === 'filesystem')
      .map(r => r.payload)

    if (filesystemReviews.length) {
      deps.handleFilesystemInterrupt({
        threadId: event.threadId,
        turnId: event.turnId ?? deps.currentTurnId.value,
        reviews: event.reviews,
      })
    } else if (creativeReviews.length) {
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
