import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  AiToolCall,
  MessageContentBlock,
  ThreadMessage,
} from '@/ai/types'
import type { AiDisplayMessageEntry, AiDisplayThread } from '../ai'
import type { LiveTurn, ThreadRunState } from './runtimeState'

function isThinkingOnlyMessage(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') return false
  if (!message.thinkingContent?.trim()) return false
  if (message.content?.trim()) return false

  const toolCallsById = new Map((message.toolCalls ?? []).map(tc => [tc.id, tc]))
  for (const tc of toolCallsById.values()) {
    if (tc.name !== 'write_todos') return false
  }
  for (const block of message.contentBlocks ?? []) {
    if (block.type === 'text' && block.text?.trim()) return false
    if (block.type === 'tool_call') {
      const tc = block.toolCallId ? toolCallsById.get(block.toolCallId) : undefined
      if (!tc || tc.name !== 'write_todos') return false
    }
    if (block.type === 'agent_event' && (block.text?.trim() || block.agentName)) return false
  }
  return true
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

    if (!contentBlocks.length && !liveTurn.thinkingText) return null

    return deps.normalizeMessageForDisplay({
      id: 'streaming-preview',
      role: 'assistant',
      turnId: liveTurn.turnId ?? undefined,
      content,
      timestamp: Date.now(),
      thinkingContent: liveTurn.thinkingText || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      contentBlocks: contentBlocks.length ? contentBlocks : undefined,
    })
  })

  const displayThread = computed<AiDisplayThread>(() => {
    const persisted = deps.persistedMessages.value
    const entries: AiDisplayMessageEntry[] = []

    let pendingThinking: ThreadMessage[] = []

    for (const msg of persisted) {
      if (isThinkingOnlyMessage(msg)) {
        pendingThinking.push(msg)
        continue
      }

      if (pendingThinking.length > 0) {
        const mergedThinking = [
          ...pendingThinking.map(m => m.thinkingContent?.trim() ?? ''),
          msg.thinkingContent?.trim() ?? '',
        ].filter(Boolean).join('\n\n---\n\n')
        const first = pendingThinking[0]!
        const host: ThreadMessage = { ...msg, thinkingContent: mergedThinking }
        entries.push({ key: `merged:${first.id}..${msg.id}`, message: host })
        pendingThinking = []
      } else {
        entries.push({ key: msg.id, message: msg })
      }
    }

    if (pendingThinking.length > 0) {
      const first = pendingThinking[0]!
      const last = pendingThinking[pendingThinking.length - 1]!
      const host: ThreadMessage = {
        ...first,
        thinkingContent: pendingThinking
          .map(m => m.thinkingContent?.trim() ?? '')
          .filter(Boolean)
          .join('\n---\n'),
      }
      entries.push({
        key: first.id === last.id ? first.id : `merged:${first.id}..${last.id}`,
        message: host,
      })
    }


    if (deps.threadRunState.value === 'streaming' && streamingPreviewMessage.value) {
      entries.push({
        key: `preview:${streamingPreviewMessage.value.id}:${streamingPreviewMessage.value.turnId ?? 'live'}`,
        message: streamingPreviewMessage.value,
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
