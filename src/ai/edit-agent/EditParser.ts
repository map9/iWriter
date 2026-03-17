/**
 * EditParser — accumulates tool call argument fragments from streaming chunks
 * and resolves complete edit_document calls into structured EditProposals.
 *
 * Used by AgentRunner during streaming to track in-progress tool calls and
 * fire callbacks when a complete tool invocation is ready.
 */
import type { EditProposal } from '@/types/ai'
import type { AgentChunk } from '../providers/types'

export interface PendingToolCall {
  id: string
  name: string
  index: number
  argumentsRaw: string
}

export class EditParser {
  // In-progress tool calls keyed by index
  private pending = new Map<number, PendingToolCall>()

  /**
   * Feed a streaming chunk. Returns a resolved tool call if one completes
   * (i.e. when a 'done' chunk signals stop_reason 'tool_calls').
   * The caller must explicitly call resolvePending() on 'done' to get all calls.
   */
  feed(chunk: AgentChunk): void {
    if (chunk.type === 'tool_call_start') {
      this.pending.set(chunk.index, {
        id: chunk.id,
        name: chunk.name,
        index: chunk.index,
        argumentsRaw: '',
      })
    } else if (chunk.type === 'tool_call_delta') {
      const tc = this.pending.get(chunk.index)
      if (tc) {
        tc.argumentsRaw += chunk.argumentsDelta
      }
    }
  }

  /** Get all completed pending tool calls and clear the buffer. */
  resolvePending(): PendingToolCall[] {
    const calls = Array.from(this.pending.values())
    this.pending.clear()
    return calls
  }

  /** Check whether any tool calls are pending. */
  hasPending(): boolean {
    return this.pending.size > 0
  }

  reset(): void {
    this.pending.clear()
  }
}

// ── EditProposal Factory ──────────────────────────────────────────────────

/**
 * Parse a completed edit_document tool call into an EditProposal.
 * Returns null if the arguments are malformed.
 */
export function parseEditProposal(
  toolCallId: string,
  argumentsRaw: string
): EditProposal | null {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argumentsRaw)
  } catch {
    return null
  }

  const oldText = args.old_text
  const newText = args.new_text
  const description = args.description ?? 'AI edit proposal'

  if (typeof oldText !== 'string' || typeof newText !== 'string') return null

  return {
    id: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    toolCallId,
    oldText,
    newText,
    description: String(description),
    status: 'pending',
  }
}
