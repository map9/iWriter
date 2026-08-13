import type { ComputedRef, Ref } from 'vue'
import type {
  AiContextCompressionEvent,
  AiThread,
  AiToolCall,
  CreativeReviewItem,
  CreativeRoundResult,
  EditProposal,
  ThreadMessage,
  ThreadUsage,
  UsageTotals,
} from '@/ai/types'
import type {
  RunDoneEvent,
  RunErrorEvent,
  RunInterruptedEvent,
  StreamChunkEvent,
  DomainReviewItem,
} from '@/ai/ipc'
import { isHitlInterruptPayload } from '@/ai/hitl'
import { agentClient } from '@/ai/client/AgentClient'
import type { LiveSubTask, LiveTurn, ThreadRunState } from './run'

const KNOWN_TASK_VALIDATION_ERROR_PREFIXES = [
  'Error: Planner subagent returned an invalid or empty result.',
]

export const LIVE_SUBTASK_STATUS_PRIORITY: Record<LiveSubTask['status'], number> = {
  error: 6,
  cancelled: 5,
  awaiting_approval: 4,
  done: 3,
  running: 2,
  pending: 1,
}

export function mergeLiveSubTaskStatus(
  current: LiveSubTask['status'],
  next: LiveSubTask['status'],
): LiveSubTask['status'] {
  return LIVE_SUBTASK_STATUS_PRIORITY[next] >= LIVE_SUBTASK_STATUS_PRIORITY[current]
    ? next
    : current
}

export function isKnownTaskValidationError(result: unknown): boolean {
  return typeof result === 'string'
    && KNOWN_TASK_VALIDATION_ERROR_PREFIXES.some(prefix => result.startsWith(prefix))
}

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
  getThreadById: (threadId: string) => AiThread | null
  updateThread: (thread: AiThread) => void
  notifyError: (message: string) => void
  makeErrorMessage: (input: { turnId?: string | null; content: string }) => ThreadMessage
  upsertContextCompressionEvent: (event: AiContextCompressionEvent) => void
}

export interface RunDoneCompletion {
  completedSuccessfully: boolean
  checkpointRefreshed: boolean
  stillCurrent: boolean
}

function makeEmptyUsageTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
}

function makeEmptyThreadUsage(): ThreadUsage {
  return {
    main: makeEmptyUsageTotals(),
    subagents: makeEmptyUsageTotals(),
    latestMainInputTokens: 0,
  }
}

export function createRuntimeEvents(deps: RuntimeEventsDeps) {
  let currentRunHasError = false

  /** Per-thread cumulative token usage. Key = threadId. */
  const threadUsageMap = new Map<string, ThreadUsage>()
  /** De-dup messageIds so resume/retry doesn't double-count. Key = `${threadId}:${messageId}`. */
  const seenUsageIds = new Set<string>()

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
      status: update.status
        ? mergeLiveSubTaskStatus(existing.status, update.status)
        : existing.status,
      output: update.output ?? existing.output,
      errorText: update.errorText ?? existing.errorText,
    }
    liveTurn.subTasks = updated
    return true
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
          currentText: '',
          thinkingText: '',
          blocks: [],
          contextCompressionEvents: [],
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
      status: mergeLiveSubTaskStatus(existing.status, 'pending'),
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

    if (toolCall.isError || toolCall.status === 'failed' || isKnownTaskValidationError(toolCall.result)) {
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

  function upsertRootContextCompression(
    liveTurn: LiveTurn,
    event: AiContextCompressionEvent,
  ): void {
    const idx = liveTurn.blocks.findIndex(block =>
      block.type === 'context_compression' && block.event.id === event.id
    )
    if (idx >= 0) {
      const updated = [...liveTurn.blocks]
      const existing = liveTurn.blocks[idx]!
      updated[idx] = {
        type: 'context_compression',
        event: existing.type === 'context_compression'
          ? { ...existing.event, ...event }
          : event,
      }
      liveTurn.blocks = updated
      return
    }
    if (liveTurn.currentText) {
      liveTurn.blocks = [...liveTurn.blocks, { type: 'text', text: liveTurn.currentText }]
      liveTurn.currentText = ''
    }
    liveTurn.blocks = [...liveTurn.blocks, { type: 'context_compression', event }]
  }

  function upsertSubTaskContextCompression(
    subTask: LiveSubTask,
    event: AiContextCompressionEvent,
  ): LiveSubTask {
    const eventIndex = subTask.contextCompressionEvents.findIndex(item => item.id === event.id)
    const events = [...subTask.contextCompressionEvents]
    if (eventIndex >= 0) {
      events[eventIndex] = { ...events[eventIndex]!, ...event }
    } else {
      events.push(event)
    }

    const blockIndex = subTask.blocks.findIndex(block =>
      block.type === 'context_compression' && block.event.id === event.id
    )
    if (blockIndex >= 0) {
      const blocks = [...subTask.blocks]
      const existing = subTask.blocks[blockIndex]!
      blocks[blockIndex] = {
        type: 'context_compression',
        event: existing.type === 'context_compression'
          ? { ...existing.event, ...event }
          : event,
      }
      return { ...subTask, blocks, contextCompressionEvents: events }
    }

    const blocks = [...subTask.blocks]
    if (subTask.currentText) {
      blocks.push({ type: 'text', text: subTask.currentText })
    }
    blocks.push({ type: 'context_compression', event })
    return {
      ...subTask,
      blocks,
      currentText: '',
      contextCompressionEvents: events,
    }
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

  function _handleUsageChunk(chunk: Extract<StreamChunkEvent, { type: 'usage' }>): void {
    // De-dup by messageId (covers resume/retry cases where the same AIMessage re-streams)
    if (chunk.messageId) {
      const key = `${chunk.threadId}:${chunk.messageId}`
      if (seenUsageIds.has(key)) return
      seenUsageIds.add(key)
    }

    let acc = threadUsageMap.get(chunk.threadId)
    if (!acc) {
      acc = makeEmptyThreadUsage()
      threadUsageMap.set(chunk.threadId, acc)
    }

    // Sub-agent events carry subagentId; main-agent events do not
    const target: UsageTotals = chunk.subagentId ? acc.subagents : acc.main
    target.inputTokens += chunk.usage.inputTokens
    target.outputTokens += chunk.usage.outputTokens
    target.cacheReadTokens += chunk.usage.cacheReadTokens
    target.cacheCreationTokens += chunk.usage.cacheCreationTokens
    if (!chunk.subagentId) {
      acc.latestMainInputTokens = chunk.usage.inputTokens
    }

    // Push updated totals to the owning thread so switching away mid-run does not leave
    // the tooltip stale when the user returns.
    const thread = deps.getThreadById(chunk.threadId)
    if (thread) {
      deps.updateThread({
        ...thread,
        usage: {
          main: { ...acc.main },
          subagents: { ...acc.subagents },
          latestMainInputTokens: acc.latestMainInputTokens,
        },
      })
    }
  }

  function clearThreadUsage(threadId: string): void {
    threadUsageMap.delete(threadId)
    const prefix = `${threadId}:`
    for (const key of seenUsageIds) {
      if (key.startsWith(prefix)) seenUsageIds.delete(key)
    }
  }

  function clearAllUsage(): void {
    threadUsageMap.clear()
    seenUsageIds.clear()
  }

  function onStreamChunk(chunk: StreamChunkEvent) {
    // Once the run has errored (onRunError), drop any late chunks for it. A subagent whose
    // terminal promise dangles after a top-level failure (e.g. provider 429) can still emit
    // stray chunks; without this guard ensureLiveTurn would resurrect the cleared live turn and
    // leave the subagent/task card spinning forever (issue: 子代理出错后仍显示运行中).
    if (currentRunHasError) return

    // Handle usage events before ensureLiveTurn (avoids side effects; sub-agent usage would
    // be swallowed by the subagentName early-return below if not caught here first).
    if (chunk.type === 'usage') {
      _handleUsageChunk(chunk)
      return
    }

    if (chunk.type === 'context_compression') {
      const event: AiContextCompressionEvent = {
        id: chunk.eventId,
        threadId: chunk.threadId,
        turnId: chunk.turnId,
        subagentId: chunk.subagentId,
        subagentName: chunk.subagentName,
        anchorMessageId: chunk.anchorMessageId,
        anchorToolCallId: chunk.anchorToolCallId,
        status: chunk.status,
        startedAt: chunk.startedAt,
        timestamp: chunk.timestamp,
        summary: chunk.summary,
        filePath: chunk.filePath,
        compressedMessageCount: chunk.compressedMessageCount,
        error: chunk.error,
      }
      deps.upsertContextCompressionEvent(event)

      const liveTurn = deps.ensureLiveTurn({
        state: deps.threadRunState.value === 'interrupted' ? 'interrupted' : 'streaming',
      })
      if (liveTurn && chunk.threadId === liveTurn.threadId) {
        if (chunk.subagentId) {
          const idx = liveTurn.subTasks.findIndex(st => st.invocationId === chunk.subagentId)
          if (idx >= 0) {
            const subTask = liveTurn.subTasks[idx]!
            const updated = [...liveTurn.subTasks]
            updated[idx] = upsertSubTaskContextCompression(subTask, event)
            liveTurn.subTasks = updated
          }
        } else {
          upsertRootContextCompression(liveTurn, event)
        }
        deps.liveTurn.value = { ...liveTurn }
      }
      return
    }

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
        currentText: '',
        thinkingText: '',
        blocks: [],
        contextCompressionEvents: [],
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

    if (chunk.type === 'subagent_error') {
      if (updateSubTask(liveTurn, chunk.subagentId, {
        status: 'error',
        output: chunk.error,
        errorText: chunk.error,
      })) {
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
      const isValidationError = chunk.toolCall.name === 'task' && isKnownTaskValidationError(chunk.toolCall.result)
      const endedToolCall: AiToolCall = isValidationError
        ? {
            ...chunk.toolCall,
            status: 'failed',
            isError: true,
          }
        : chunk.toolCall
      liveTurn.blocks = liveTurn.blocks.map(block =>
        block.type === 'tool_call' && block.toolCall.id === chunk.toolCallId
          ? { type: 'tool_call', toolCall: { ...block.toolCall, status: endedToolCall.status, result: endedToolCall.result, isError: endedToolCall.isError } }
          : block
      )
      if (endedToolCall.name === 'task') {
        applyTaskToolEndToSubTask(liveTurn, endedToolCall)
      }
      liveTurn.toolName = null
      deps.liveTurn.value = { ...liveTurn }
      if (endedToolCall.isError && endedToolCall.name) {
        deps.notifyCreativeToolResult(endedToolCall.name, true, chunk.toolCallId)
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
      updated[idx] = { ...subTask, text: subTask.text + chunk.delta, currentText: subTask.currentText + chunk.delta }
      liveTurn.subTasks = updated
      return
    }

    if (chunk.type === 'tool_call_start' && chunk.toolCall) {
      const enriched: AiToolCall = { ...chunk.toolCall, kind: deps.inferToolKind(chunk.toolCall.name) }
      let flushed = subTask
      if (subTask.currentText) {
        flushed = { ...subTask, blocks: [...subTask.blocks, { type: 'text', text: subTask.currentText }], currentText: '' }
      }
      const updated = [...liveTurn.subTasks]
      updated[idx] = upsertSubTaskToolCall(flushed, enriched)
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

    // Transition liveTurn to interrupted state while preserving accumulated subTasks and blocks.
    // startLiveTurn would reset subTasks to [], causing the subagent panel to flash on resume.
    const existingLiveTurn = deps.liveTurn.value
    if (existingLiveTurn && existingLiveTurn.threadId === event.threadId) {
      deps.liveTurn.value = { ...existingLiveTurn, state: 'interrupted' }
    } else {
      deps.startLiveTurn({
        threadId: event.threadId,
        turnId: event.turnId ?? deps.currentTurnId.value,
        state: 'interrupted',
      })
    }

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
      deps.updateThread({ ...thread, messagesLoaded: false })

      agentClient.getThreadMessages(event.threadId)?.then(messages => {
          if (!messages?.length) return
          const current = deps.activeThread.value
          if (current && current.id !== event.threadId) return
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

          // Reconcile liveTurn tool statuses with checkpoint data so that sibling
          // root tool calls that were still in_progress when
          // the interrupt fired now reflect their settled state from the checkpoint.
          const liveTurn = deps.liveTurn.value
          if (!liveTurn || liveTurn.threadId !== event.threadId) return
          const checkpointToolCallMap = new Map<string, AiToolCall>()
          for (const msg of normalizedMessages) {
            if (msg.role === 'assistant') {
              for (const tc of msg.toolCalls ?? []) {
                if (tc.status === 'completed' || tc.status === 'failed' || tc.status === 'rejected') {
                  checkpointToolCallMap.set(tc.id, tc)
                }
              }
            }
          }
          if (!checkpointToolCallMap.size) return
          const syncBlock = (block: { type: 'tool_call'; toolCall: AiToolCall }): { type: 'tool_call'; toolCall: AiToolCall } => {
            const settled = checkpointToolCallMap.get(block.toolCall.id)
            if (!settled) return block
            return { type: 'tool_call', toolCall: { ...block.toolCall, status: settled.status, result: settled.result, isError: settled.isError } }
          }
          const updatedBlocks = liveTurn.blocks.map(b =>
            b.type === 'tool_call' ? syncBlock(b) : b
          )
          const updatedSubTasks = liveTurn.subTasks.map(st => ({
            ...st,
            blocks: st.blocks.map(b =>
              b.type === 'tool_call' ? syncBlock(b) : b
            ),
          }))
          deps.liveTurn.value = { ...liveTurn, blocks: updatedBlocks, subTasks: updatedSubTasks }
        })
        .catch(() => { /* ignore */ })
    }
  }

  async function onRunDone(
    event: RunDoneEvent,
    isCurrent: () => boolean = () => true,
  ): Promise<RunDoneCompletion> {
    const completedSuccessfully = !currentRunHasError
    let checkpointRefreshed = false
    if (isCurrent()) {
      // Finalize before checkpoint normalization so the just-completed Creative
      // round result can be attached to its assistant message. A later steer may
      // supersede renderer cleanup, but must not leave this completed batch stale.
      deps.finalizePendingCreativeApply()
    }

    try {
      const thread = deps.activeThread.value
      if (thread && thread.id === event.threadId && completedSuccessfully) {
        const messages = await agentClient.getThreadMessages(event.threadId)
        if (messages?.length && isCurrent()) {
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
            checkpointRefreshed = true
          }
        }
      }
    } catch {
      // Keep the completed live output already shown in the renderer. A later
      // thread selection can retry loading authoritative checkpoint messages.
    } finally {
      if (isCurrent()) {
        // Keep the run busy until the authoritative checkpoint refresh settles so
        // new input cannot overtake the automatic pending-command handoff.
        deps.threadRunState.value = 'idle'
        deps.clearLiveTurn()
        deps.clearRunPointers()
        deps.resetEditReviewState()
        deps.resetCreativeReviewState()
      }
    }

    return {
      completedSuccessfully,
      checkpointRefreshed,
      stillCurrent: isCurrent(),
    }
  }

  function onRunError(event: RunErrorEvent) {
    currentRunHasError = true
    // Defensively terminate any still-running subtask on the live turn before it is cleared, so a
    // final render can never show a spinning subagent after the run has failed.
    const erroringTurn = deps.liveTurn.value
    if (erroringTurn?.subTasks?.some(st => st.status === 'running' || st.status === 'pending')) {
      erroringTurn.subTasks = erroringTurn.subTasks.map(st =>
        st.status === 'running' || st.status === 'pending'
          ? { ...st, status: 'error', errorText: st.errorText || event.error }
          : st
      )
      deps.liveTurn.value = { ...erroringTurn }
    }
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
    clearThreadUsage,
    clearAllUsage,
    onStreamChunk,
    onRunInterrupted,
    onRunDone,
    onRunError,
  }
}
