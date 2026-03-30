import type { AiThread, AiToolCall, ThreadMessage } from '@/ai/types'
import { normalizeLegacyProfile, resolveAgentDomain } from '@/ai/types'

/**
 * Create a new thread with the given provider and model.
 * messages starts as an empty array (local-only, not yet in checkpointer).
 */
export function createThread(
  providerConfigId: string,
  modelId: string,
  profile: AiThread['profile']
): AiThread {
  const normalizedProfile = normalizeLegacyProfile(profile)
  const now = Date.now()
  return {
    id: `thread-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    messagesLoaded: false,
    providerConfigId,
    modelId,
    domain: resolveAgentDomain(normalizedProfile),
    profile: normalizedProfile,
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
 * Append a message to a thread for immediate local display.
 * The checkpointer is the authoritative message store; this is a UI-only update.
 * Returns a new thread object (immutable update).
 */
export function appendMessage(thread: AiThread, message: ThreadMessage): AiThread {
  const messages = [...(thread.messages ?? []), message]

  // Auto-title from first user message
  const title =
    thread.title === '新对话' && message.role === 'user'
      ? generateTitle(message.content)
      : thread.title

  return { ...thread, messages, title, updatedAt: Date.now() }
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
    return { id: tc.id, name: tc.name, arguments: args, kind: 'other', title: tc.name, status: 'pending' }
  })
}
