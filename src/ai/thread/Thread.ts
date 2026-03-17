import type { AiThread, AiToolCall, ThreadMessage } from '@/types/ai'
import type { LMMessage } from '../providers/types'

// Maximum messages per thread kept in storage
const MAX_MESSAGES_PER_THREAD = 200

/**
 * Create a new thread with the given provider and model.
 */
export function createThread(
  providerConfigId: string,
  modelId: string,
  profile: AiThread['profile']
): AiThread {
  const now = Date.now()
  return {
    id: `thread-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    providerConfigId,
    modelId,
    profile,
  }
}

/**
 * Create a new ThreadMessage.
 */
export function createMessage(
  role: ThreadMessage['role'],
  content: string,
  extras?: Partial<Pick<ThreadMessage, 'toolCalls' | 'toolResults' | 'editProposals' | 'usage'>>
): ThreadMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
    ...extras,
  }
}

/**
 * Auto-generate a thread title from the first user message (max 40 chars).
 */
export function generateTitle(firstUserMessage: string): string {
  const text = firstUserMessage.trim().replace(/\s+/g, ' ')
  return text.length <= 40 ? text : `${text.slice(0, 37)}...`
}

/**
 * Append a message to a thread, enforcing the message cap.
 * Returns a new thread object (immutable update).
 */
export function appendMessage(thread: AiThread, message: ThreadMessage): AiThread {
  const messages = [...thread.messages, message].slice(-MAX_MESSAGES_PER_THREAD)

  // Auto-title from first user message
  const title =
    thread.title === '新对话' && message.role === 'user'
      ? generateTitle(message.content)
      : thread.title

  return { ...thread, messages, title, updatedAt: Date.now() }
}

/**
 * Convert stored ThreadMessages to the LMMessage format expected by provider drivers.
 *
 * Tool calls and tool results are interleaved as required by the OpenAI/Anthropic API:
 *   assistant message (with tool_calls) → tool result messages (one per call)
 */
export function threadToLMMessages(
  thread: AiThread,
  systemPrompt: string
): LMMessage[] {
  const result: LMMessage[] = [{ role: 'system', content: systemPrompt }]

  for (const msg of thread.messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content })
      continue
    }

    // Assistant message
    const assistantMsg: LMMessage = {
      role: 'assistant',
      content: msg.content,
    }

    // Attach tool calls if present
    if (msg.toolCalls?.length) {
      assistantMsg.toolCalls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }))
    }

    result.push(assistantMsg)

    // Append tool results as separate 'tool' role messages
    if (msg.toolResults?.length) {
      for (const tr of msg.toolResults) {
        result.push({
          role: 'tool',
          content: tr.content,
          toolCallId: tr.toolCallId,
        })
      }
    }
  }

  return result
}

/**
 * Estimate the token count of an LMMessage array (rough heuristic: chars / 3.5).
 * Used for context window trimming.
 */
export function estimateTokens(messages: LMMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  return Math.ceil(totalChars / 3.5)
}

/**
 * Trim older messages from a message array to stay within a token budget.
 * Always preserves the system message (index 0) and the most recent messages.
 */
export function trimToTokenBudget(
  messages: LMMessage[],
  maxTokens: number
): LMMessage[] {
  if (estimateTokens(messages) <= maxTokens) return messages

  // Keep system + trim from the oldest non-system messages
  const [system, ...rest] = messages
  while (rest.length > 1 && estimateTokens([system!, ...rest]) > maxTokens) {
    rest.shift()
  }
  return [system!, ...rest]
}

/**
 * Build accumulated tool calls from streaming chunks.
 * Used by AgentRunner to assemble partial tool call deltas.
 */
export interface AccumulatedToolCall {
  id: string
  name: string
  argumentsRaw: string
}

export function resolveToolCalls(
  accumulated: Map<number, AccumulatedToolCall>
): AiToolCall[] {
  return Array.from(accumulated.values()).map(tc => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.argumentsRaw)
    } catch {
      args = { _raw: tc.argumentsRaw }
    }
    return { id: tc.id, name: tc.name, arguments: args }
  })
}
