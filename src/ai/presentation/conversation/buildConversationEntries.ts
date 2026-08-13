import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  AiSubTaskProgress,
  AiContextCompressionEvent,
  AiToolCall,
  AiToolResult,
  MessageContentBlock,
  ThreadMessage,
} from '@/ai/types'
import { BLOCK_EDIT_TOOLS } from '@/ai/types'
import type {
  ConversationEntry,
  ConversationMessageEntry,
  ConversationView,
} from './types'
import type { LiveTurn, ThreadRunState } from '../../store/modules/runtimeState'
import { mergeLiveSubTaskStatus } from '../../store/modules/runtimeEvents'

function hasAssistantText(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') return false
  if (message.content?.trim()) return true
  return (message.contentBlocks ?? []).some(block =>
    block.type === 'text' && !!block.text?.trim()
  )
}

function getNonTodoToolCalls(message: ThreadMessage): AiToolCall[] {
  return (message.toolCalls ?? []).filter(tc => tc.name !== 'write_todos')
}

function getReadToolCalls(message: ThreadMessage): AiToolCall[] {
  return getNonTodoToolCalls(message).filter(tc => !BLOCK_EDIT_TOOLS.has(tc.name))
}

function hasVisibleAssistantOutput(message: ThreadMessage): boolean {
  return hasAssistantText(message) || getNonTodoToolCalls(message).length > 0 || !!message.editRoundResult
}

function isThinkingOnlyMessage(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') return false
  if (!message.thinkingContent?.trim()) return false
  if (hasVisibleAssistantOutput(message)) return false
  return (message.toolCalls ?? []).every(tc => tc.name === 'write_todos')
}

function shouldSuppressAssistantMessage(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') return false
  if (hasVisibleAssistantOutput(message)) return false
  if (message.thinkingContent?.trim()) return false
  return true
}

function isSameTurn(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '') === (b ?? '')
}

function canHostThinking(message: ThreadMessage): boolean {
  return message.role === 'assistant' && (hasAssistantText(message) || !!message.editRoundResult)
}

function isReadToolOnlyMessage(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') return false
  if (hasAssistantText(message)) return false
  if (message.editRoundResult) return false
  const toolCalls = message.toolCalls ?? []
  if (!toolCalls.length) return false
  return getReadToolCalls(message).length === toolCalls.filter(tc => tc.name !== 'write_todos').length
}

function mergeContentBlocks(messages: ThreadMessage[]): MessageContentBlock[] | undefined {
  const blocks: MessageContentBlock[] = []
  for (const message of messages) {
    if (message.contentBlocks?.length) {
      blocks.push(...message.contentBlocks)
      continue
    }
    const text = message.content?.trim()
    if (text) blocks.push({ type: 'text', text })
    for (const toolCall of message.toolCalls ?? []) {
      if (toolCall.name === 'write_todos' || BLOCK_EDIT_TOOLS.has(toolCall.name)) continue
      blocks.push({ type: 'tool_call', toolCallId: toolCall.id })
    }
  }
  return blocks.length ? blocks : undefined
}

function mergeReadToolOnlyMessages(messages: ThreadMessage[]): ThreadMessage {
  const last = messages[messages.length - 1]!
  const toolCalls = messages.flatMap(message => getReadToolCalls(message))
  const toolResults = messages.flatMap(message => message.toolResults ?? [])
  const mergedToolResults: AiToolResult[] | undefined = toolResults.length ? toolResults : undefined
  const mergedThinking = messages
    .map(message => message.thinkingContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n---\n\n')

  return {
    ...last,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    toolResults: mergedToolResults,
    contentBlocks: mergeContentBlocks(messages),
    content: '',
    thinkingContent: mergedThinking || undefined,
  }
}

function mergeThinking(host: ThreadMessage, thinkingMessages: ThreadMessage[]): ThreadMessage {
  const mergedThinking = [
    ...thinkingMessages.map(m => m.thinkingContent?.trim() ?? ''),
    host.thinkingContent?.trim() ?? '',
  ].filter(Boolean).join('\n\n---\n\n')

  return {
    ...host,
    thinkingContent: mergedThinking || undefined,
  }
}

function mergePendingThinkingBackward(
  entries: ConversationMessageEntry[],
  pendingThinking: ThreadMessage[],
): boolean {
  if (!pendingThinking.length) return false

  const turnId = pendingThinking[0]?.turnId
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!entry) continue
    if (!isSameTurn(entry.message.turnId, turnId)) continue
    if (!canHostThinking(entry.message)) continue
    entries[i] = {
      ...entry,
      message: mergeThinking(entry.message, pendingThinking),
    }
    return true
  }

  return false
}

function preferLongerText(a: string, b: string): string {
  return b.length >= a.length ? b : a
}

function mergeToolCallsById(toolCalls: AiToolCall[]): AiToolCall[] {
  const order: string[] = []
  const byId = new Map<string, AiToolCall>()
  for (const toolCall of toolCalls) {
    if (!byId.has(toolCall.id)) order.push(toolCall.id)
    byId.set(toolCall.id, toolCall)
  }
  return order
    .map(id => byId.get(id))
    .filter((toolCall): toolCall is AiToolCall => !!toolCall)
}

function mergeSubTaskStatus(
  current: AiSubTaskProgress['status'],
  next: AiSubTaskProgress['status'],
): AiSubTaskProgress['status'] {
  return mergeLiveSubTaskStatus(current, next)
}

function mergeSubTaskProgress(
  current: AiSubTaskProgress,
  next: AiSubTaskProgress,
): AiSubTaskProgress {
  return {
    ...current,
    name: next.name || current.name,
    status: mergeSubTaskStatus(current.status, next.status),
    text: preferLongerText(current.text, next.text),
    thinkingText: preferLongerText(current.thinkingText, next.thinkingText),
    toolCalls: mergeToolCallsById([...current.toolCalls, ...next.toolCalls]),
    contentBlocks: next.contentBlocks ?? current.contentBlocks,
    contextCompressionEvents: mergeContextCompressionEvents(
      current.contextCompressionEvents ?? [],
      next.contextCompressionEvents ?? [],
    ),
    errorText: next.errorText || current.errorText,
  }
}

function mergeContextCompressionEvents(
  current: AiContextCompressionEvent[],
  next: AiContextCompressionEvent[],
): AiContextCompressionEvent[] {
  const order: string[] = []
  const byId = new Map<string, AiContextCompressionEvent>()
  for (const event of [...current, ...next]) {
    if (!byId.has(event.id)) order.push(event.id)
    byId.set(event.id, { ...byId.get(event.id), ...event })
  }
  return order
    .map(id => byId.get(id))
    .filter((event): event is AiContextCompressionEvent => !!event)
}

function subTaskStatusFromToolCall(toolCall: AiToolCall): AiSubTaskProgress['status'] {
  switch (toolCall.status) {
    case 'completed': return 'done'
    case 'failed': return 'error'
    case 'rejected': return 'cancelled'
    case 'in_progress': return 'running'
    default: return 'pending'
  }
}

function taskSubagentName(toolCall: AiToolCall): string {
  const name = toolCall.arguments['subagent_type']
  return typeof name === 'string' && name.trim() ? name : 'task'
}

function attachSubagentCompressionEvents(
  message: ThreadMessage,
  eventsByInvocation: Record<string, AiContextCompressionEvent[]>,
): ThreadMessage {
  if (!Object.keys(eventsByInvocation).length) return message

  const taskCalls = new Map(
    (message.toolCalls ?? [])
      .filter(toolCall => toolCall.name === 'task')
      .map(toolCall => [toolCall.id, toolCall]),
  )
  const subTasks = [...(message.subTasks ?? [])]

  for (const [invocationId, events] of Object.entries(eventsByInvocation)) {
    const existingIndex = subTasks.findIndex(subTask => subTask.invocationId === invocationId)
    const toolCall = taskCalls.get(invocationId)
    if (existingIndex < 0 && !toolCall) continue

    const synthetic: AiSubTaskProgress = {
      invocationId,
      name: events[0]?.subagentName || (toolCall ? taskSubagentName(toolCall) : 'task'),
      status: toolCall ? subTaskStatusFromToolCall(toolCall) : 'running',
      text: toolCall?.result ?? '',
      thinkingText: '',
      toolCalls: [],
      contextCompressionEvents: events,
      errorText: toolCall?.isError ? toolCall.result : undefined,
    }
    if (existingIndex >= 0) {
      subTasks[existingIndex] = mergeSubTaskProgress(subTasks[existingIndex]!, synthetic)
    } else {
      subTasks.push(synthetic)
    }
  }

  return subTasks.length ? { ...message, subTasks } : message
}

export function insertContextCompressionEvents(
  entries: ConversationMessageEntry[],
  events: AiContextCompressionEvent[],
): ConversationEntry[] {
  if (!events.length) return entries

  const embeddedEventIds = new Set(
    entries.flatMap(entry =>
      (entry.message.contentBlocks ?? [])
        .filter(block => block.type === 'context_compression')
        .map(block => block.event.id),
    ),
  )
  const inlineEventsByEntryIndex = new Map<
    number,
    Map<string, AiContextCompressionEvent[]>
  >()
  const eventsAfterEntryIndex = new Map<number, AiContextCompressionEvent[]>()
  const orderedEvents = events
    .filter(event => !embeddedEventIds.has(event.id))
    .sort((a, b) => a.startedAt - b.startedAt)
  const unmatchedEvents: AiContextCompressionEvent[] = []

  for (const event of orderedEvents) {
    let anchorIndex = -1
    if (event.anchorToolCallId) {
      anchorIndex = entries.findIndex(entry =>
        (entry.message.toolCalls ?? []).some(toolCall => toolCall.id === event.anchorToolCallId),
      )
      if (anchorIndex >= 0) {
        const anchorBlockExists = (entries[anchorIndex]!.message.contentBlocks ?? []).some(block =>
          block.type === 'tool_call' && block.toolCallId === event.anchorToolCallId
        )
        if (anchorBlockExists) {
          const eventsByToolCall = inlineEventsByEntryIndex.get(anchorIndex) ?? new Map()
          const grouped = eventsByToolCall.get(event.anchorToolCallId) ?? []
          grouped.push(event)
          eventsByToolCall.set(event.anchorToolCallId, grouped)
          inlineEventsByEntryIndex.set(anchorIndex, eventsByToolCall)
          continue
        }
      }
    }
    if (anchorIndex < 0 && event.anchorMessageId) {
      anchorIndex = entries.findIndex(entry => entry.message.id === event.anchorMessageId)
    }
    // Older/in-flight events may not carry an anchor. Keep them visible at the live tail instead of
    // guessing from turnId, which is shared by every compression in a long-running user turn.
    if (anchorIndex < 0) {
      unmatchedEvents.push(event)
      continue
    }
    const grouped = eventsAfterEntryIndex.get(anchorIndex) ?? []
    grouped.push(event)
    eventsAfterEntryIndex.set(anchorIndex, grouped)
  }

  const anchoredEntries = entries.map((entry, index) => {
    const eventsByToolCall = inlineEventsByEntryIndex.get(index)
    if (!eventsByToolCall) return entry

    const contentBlocks: MessageContentBlock[] = []
    for (const block of entry.message.contentBlocks ?? []) {
      contentBlocks.push(block)
      if (block.type !== 'tool_call') continue
      for (const event of eventsByToolCall.get(block.toolCallId) ?? []) {
        contentBlocks.push({ type: 'context_compression', event })
      }
    }
    return {
      ...entry,
      message: { ...entry.message, contentBlocks },
    }
  })

  const result: ConversationEntry[] = []
  anchoredEntries.forEach((entry, index) => {
    result.push(entry)
    for (const event of eventsAfterEntryIndex.get(index) ?? []) {
      result.push({
        kind: 'context-compressed',
        key: event.id,
        event,
      })
    }
  })
  for (const event of unmatchedEvents) {
    result.push({
      kind: 'context-compressed',
      key: event.id,
      event,
    })
  }
  return result
}

export function createConversationPresentation(deps: {
  liveTurn: Ref<LiveTurn | null>
  threadRunState: Ref<ThreadRunState>
  activeThreadId: Ref<string | null>
  persistedMessages: ComputedRef<ThreadMessage[]>
  contextCompressionEvents: ComputedRef<AiContextCompressionEvent[]>
  subagentCompressionEvents: ComputedRef<Record<string, AiContextCompressionEvent[]>>
  isResumingReviewedEdits: Ref<boolean>
  normalizeMessageForDisplay: (message: ThreadMessage) => ThreadMessage
}) {
  const streamingPreviewMessage = computed<ThreadMessage | null>(() => {
    const liveTurn = deps.liveTurn.value
    if (!liveTurn) return null

    const contentBlocks: MessageContentBlock[] = []
    const toolCallOrder: string[] = []
    const toolCallsById = new Map<string, AiToolCall>()
    const contentBlockToolCallIds = new Set<string>()
    let content = ''

    for (const block of liveTurn.blocks) {
      if (block.type === 'text' && block.text) {
        contentBlocks.push({ type: 'text', text: block.text })
        content += block.text
        continue
      }
      if (block.type === 'context_compression') {
        contentBlocks.push({ type: 'context_compression', event: block.event })
        continue
      }
      if (block.type === 'tool_call') {
        if (deps.isResumingReviewedEdits.value && block.toolCall.kind === 'edit') {
          continue
        }
        if (!toolCallsById.has(block.toolCall.id)) {
          toolCallOrder.push(block.toolCall.id)
        }
        toolCallsById.set(block.toolCall.id, block.toolCall)
        if (!contentBlockToolCallIds.has(block.toolCall.id)) {
          contentBlocks.push({ type: 'tool_call', toolCallId: block.toolCall.id })
          contentBlockToolCallIds.add(block.toolCall.id)
        }
      }
    }

    if (liveTurn.currentText) {
      contentBlocks.push({ type: 'text', text: liveTurn.currentText })
      content += liveTurn.currentText
    }

    const toolCalls = toolCallOrder
      .map(id => toolCallsById.get(id))
      .filter((toolCall): toolCall is AiToolCall => !!toolCall)

    const subTaskOrder: string[] = []
    const subTasksById = new Map<string, AiSubTaskProgress>()
    for (const st of liveTurn.subTasks) {
      const orderedBlocks: MessageContentBlock[] = st.blocks.map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text }
        if (b.type === 'context_compression') {
          return { type: 'context_compression', event: b.event }
        }
        return { type: 'tool_call', toolCallId: b.toolCall.id }
      })
      if (st.currentText) {
        orderedBlocks.push({ type: 'text', text: st.currentText })
      }
      const subTask: AiSubTaskProgress = {
        invocationId: st.invocationId,
        name: st.name,
        status: st.status,
        text: st.text,
        thinkingText: st.thinkingText,
        errorText: st.errorText,
        toolCalls: mergeToolCallsById(
          st.blocks
            .filter((b): b is { type: 'tool_call'; toolCall: AiToolCall } => b.type === 'tool_call')
            .map(b => b.toolCall),
        ),
        contentBlocks: orderedBlocks.length ? orderedBlocks : undefined,
        contextCompressionEvents: st.contextCompressionEvents.length
          ? st.contextCompressionEvents
          : undefined,
      }
      const existing = subTasksById.get(st.invocationId)
      if (existing) {
        subTasksById.set(st.invocationId, mergeSubTaskProgress(existing, subTask))
      } else {
        subTaskOrder.push(st.invocationId)
        subTasksById.set(st.invocationId, subTask)
      }
    }
    const subTasks = subTaskOrder
      .map(id => subTasksById.get(id))
      .filter((subTask): subTask is AiSubTaskProgress => !!subTask)

    if (!contentBlocks.length && !liveTurn.thinkingText && !subTasks.length) return null

    return deps.normalizeMessageForDisplay({
      id: 'streaming-preview',
      role: 'assistant',
      turnId: liveTurn.turnId ?? undefined,
      content,
      timestamp: Date.now(),
      thinkingContent: liveTurn.thinkingText || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      contentBlocks: contentBlocks.length ? contentBlocks : undefined,
      subTasks: subTasks.length ? subTasks : undefined,
    })
  })

  const conversation = computed<ConversationView>(() => {
    const persisted = deps.persistedMessages.value
    const liveTurn = deps.liveTurn.value

    // The preview is decoupled from threadRunState: it renders for the active thread's live turn in
    // BOTH streaming and interrupted states. Gating on 'streaming' alone made the current assistant /
    // subagent bubble vanish during the async checkpoint fetch at an interrupt (and stay vanished if
    // aiGetThreadMessages failed). It is only shown for the active thread — a background thread's live
    // turn must never leak into the thread currently on screen. At run-done liveTurn is cleared, so
    // streamingPreviewMessage becomes null and the persisted messages are the single source again.
    const sameThread = !!liveTurn && liveTurn.threadId === deps.activeThreadId.value

    // Current-turn boundary = everything after the last user message.
    let lastUserIndex = -1
    for (let i = persisted.length - 1; i >= 0; i--) {
      if (persisted[i]!.role === 'user') { lastUserIndex = i; break }
    }
    // Has the checkpoint fetch already landed the current turn into persisted? persisted is NOT
    // updated mid-stream — only onRunInterrupted / onRunDone fetch it (runtimeEvents), so a message
    // after the last user message means the interrupt snapshot has arrived.
    const persistedHasCurrentTurn = lastUserIndex < persisted.length - 1
    const interrupted = deps.threadRunState.value === 'interrupted'

    // Preview vs persisted authority:
    // - streaming/resuming: the live turn is AHEAD of persisted (persisted isn't updated mid-stream,
    //   and after a resume it's a stale interrupt snapshot) → preview is authoritative; show it and
    //   drop the persisted copy of the current turn to avoid a double render.
    // - interrupted, checkpoint fetch still pending: persisted lacks the current turn → keep the
    //   preview so the assistant/subagent bubble doesn't vanish during the async gap.
    // - interrupted, checkpoint landed: PERSISTED is authoritative and complete — it carries the
    //   inline review card (review_ready host message) and every settled bubble — so hide the preview
    //   and render persisted. Dropping persisted here instead would drop the review-hosting message,
    //   and the fallback review surface defers to it, so the review vanishes and the flow appears
    //   stuck (the 178f19b regression). See DomainReviewSurface.showFallbackCreativeReview.
    const preview = (sameThread && !(interrupted && persistedHasCurrentTurn))
      ? streamingPreviewMessage.value
      : null

    // Dedup: while a live preview is the authoritative render (streaming/resuming, or the interrupt
    // async gap), drop the persisted copy of the current turn so it does not render twice. Prefer the
    // live turn's turnId; checkpoint messages are not reliably turnId-tagged, so fall back to
    // "everything after the last user message". When preview is null (interrupted + persisted landed),
    // nothing is dropped and persisted renders in full.
    const liveTurnId = liveTurn?.turnId ?? undefined
    const isCurrentTurnMessage = (msg: ThreadMessage, index: number): boolean => {
      if (!preview) return false
      if (liveTurnId && msg.turnId === liveTurnId) return true
      return lastUserIndex >= 0 && index > lastUserIndex
    }

    const entries: ConversationMessageEntry[] = []
    let pendingThinking: ThreadMessage[] = []

    for (let index = 0; index < persisted.length; index += 1) {
      const msg = persisted[index]!
      if (isCurrentTurnMessage(msg, index)) {
        continue
      }
      if (isThinkingOnlyMessage(msg)) {
        pendingThinking.push(msg)
        continue
      }

      if (shouldSuppressAssistantMessage(msg)) {
        continue
      }

      const pendingTurnId = pendingThinking[0]?.turnId
      if (
        pendingThinking.length > 0
        && msg.role === 'assistant'
        && isSameTurn(msg.turnId, pendingTurnId)
        && canHostThinking(msg)
      ) {
        entries.push({
          kind: 'message',
          key: `merged:${pendingThinking[0]!.id}..${msg.id}`,
          message: mergeThinking(msg, pendingThinking),
        })
        pendingThinking = []
        continue
      }

      if (pendingThinking.length > 0) {
        mergePendingThinkingBackward(entries, pendingThinking)
        pendingThinking = []
      }

      if (isReadToolOnlyMessage(msg)) {
        const grouped: ThreadMessage[] = [msg]
        let lookahead = index + 1
        while (lookahead < persisted.length) {
          const next = persisted[lookahead]!
          if (shouldSuppressAssistantMessage(next)) {
            lookahead += 1
            continue
          }
          if (!isReadToolOnlyMessage(next)) break
          if (!isSameTurn(next.turnId, msg.turnId)) break
          grouped.push(next)
          lookahead += 1
        }
        index = lookahead - 1

        const merged = grouped.length > 1 ? mergeReadToolOnlyMessages(grouped) : msg
        const last = grouped[grouped.length - 1]!
        entries.push({
          kind: 'message',
          key: grouped.length > 1 ? `merged-tools:${msg.id}..${last.id}` : msg.id,
          message: merged,
        })
        continue
      }

      entries.push({ kind: 'message', key: msg.id, message: msg })
    }

    if (pendingThinking.length > 0) {
      mergePendingThinkingBackward(entries, pendingThinking)
      pendingThinking = []
    }

    if (preview) {
      entries.push({
        kind: 'message',
        key: `preview:${preview.id}:${preview.turnId ?? 'live'}`,
        message: preview,
        isPreview: true,
      })
    }

    const adornedEntries = entries.map(entry => ({
      ...entry,
      message: attachSubagentCompressionEvents(
        entry.message,
        deps.subagentCompressionEvents.value,
      ),
    }))

    return {
      persistedMessages: persisted,
      entries: insertContextCompressionEvents(adornedEntries, deps.contextCompressionEvents.value),
    }
  })

  const conversationEntries = computed<ConversationEntry[]>(() => conversation.value.entries)

  const persistedAssistantMessageIds = computed<string[]>(() =>
    deps.persistedMessages.value
      .filter(message => message.role === 'assistant')
      .map(message => message.id)
  )

  const latestPersistedAssistantMessageId = computed<string | null>(() => {
    const ids = persistedAssistantMessageIds.value
    return ids.length ? ids[ids.length - 1]! : null
  })

  return {
    streamingPreviewMessage,
    conversation,
    conversationEntries,
    persistedAssistantMessageIds,
    latestPersistedAssistantMessageId,
  }
}
