import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  AiSubTaskProgress,
  AiToolCall,
  AiToolResult,
  MessageContentBlock,
  ThreadMessage,
} from '@/ai/types'
import { BLOCK_EDIT_TOOLS } from '@/ai/types'
import type { AiDisplayMessageEntry, AiDisplayThread } from '../ai'
import type { LiveTurn, ThreadRunState } from './runtimeState'

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
  entries: AiDisplayMessageEntry[],
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

export function createRuntimeDisplay(deps: {
  liveTurn: Ref<LiveTurn | null>
  threadRunState: Ref<ThreadRunState>
  persistedMessages: ComputedRef<ThreadMessage[]>
  isResumingReviewedEdits: Ref<boolean>
  normalizeMessageForDisplay: (message: ThreadMessage) => ThreadMessage
}) {
  const streamingPreviewMessage = computed<ThreadMessage | null>(() => {
    const liveTurn = deps.liveTurn.value
    if (!liveTurn) return null

    const contentBlocks: MessageContentBlock[] = []
    const toolCalls: AiToolCall[] = []
    let content = ''

    for (const block of liveTurn.blocks) {
      if (block.type === 'text' && block.text) {
        contentBlocks.push({ type: 'text', text: block.text })
        content += block.text
        continue
      }
      if (block.type === 'tool_call') {
        if (deps.isResumingReviewedEdits.value && block.toolCall.kind === 'edit') {
          continue
        }
        contentBlocks.push({ type: 'tool_call', toolCallId: block.toolCall.id })
        toolCalls.push(block.toolCall)
      }
    }

    if (liveTurn.currentText) {
      contentBlocks.push({ type: 'text', text: liveTurn.currentText })
      content += liveTurn.currentText
    }

    const subTasks: AiSubTaskProgress[] = liveTurn.subTasks.map(st => ({
      invocationId: st.invocationId,
      name: st.name,
      status: st.status,
      text: st.text,
      thinkingText: st.thinkingText,
      toolCalls: st.blocks
        .filter((b): b is { type: 'tool_call'; toolCall: AiToolCall } => b.type === 'tool_call')
        .map(b => b.toolCall),
    }))

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

  const displayThread = computed<AiDisplayThread>(() => {
    const persisted = deps.persistedMessages.value
    const entries: AiDisplayMessageEntry[] = []
    let pendingThinking: ThreadMessage[] = []

    for (let index = 0; index < persisted.length; index += 1) {
      const msg = persisted[index]!
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
          key: grouped.length > 1 ? `merged-tools:${msg.id}..${last.id}` : msg.id,
          message: merged,
        })
        continue
      }

      entries.push({ key: msg.id, message: msg })
    }

    if (pendingThinking.length > 0) {
      mergePendingThinkingBackward(entries, pendingThinking)
      pendingThinking = []
    }

    if (deps.threadRunState.value === 'streaming' && streamingPreviewMessage.value) {
      const preview = streamingPreviewMessage.value
      entries.push({
        key: `preview:${preview.id}:${preview.turnId ?? 'live'}`,
        message: preview,
        isPreview: true,
      })
    }

    return {
      persistedMessages: persisted,
      messages: entries,
    }
  })

  const displayMessages = computed<AiDisplayMessageEntry[]>(() => displayThread.value.messages)

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
    displayThread,
    displayMessages,
    persistedAssistantMessageIds,
    latestPersistedAssistantMessageId,
  }
}
