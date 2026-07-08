import { AIMessage, isAIMessage, isToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'

// Duck-typed message discriminants. `instanceof` / `isInstance` can silently return false after a
// checkpoint replay when package instances diverge (the same footgun HumanRespondMessageMiddleware
// guards against). This middleware is the last-line orphan guard before a model call, so it must
// recognize replayed messages reliably — a missed AIMessage here re-surfaces as an OpenAI 400
// "No tool output found for function call ...".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAiMsg(m: any): m is AIMessage {
  if (isAIMessage(m)) return true
  return typeof m?._getType === 'function' && m._getType() === 'ai'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isToolMsg(m: any): boolean {
  if (isToolMessage(m)) return true
  return typeof m?._getType === 'function' && m._getType() === 'tool'
}

export function createOrphanToolCallStripperMiddleware() {
  return createMiddleware({
    name: 'OrphanToolCallStripper',
    wrapModelCall: async (request, handler) => {
      const responded = new Set<string>()
      for (const m of request.messages) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const id = (m as any)?.tool_call_id
        if (isToolMsg(m) && id) responded.add(id)
      }
      const cleaned = request.messages.map((m) => {
        if (!isAiMsg(m) || !m.tool_calls?.length) return m
        const kept = m.tool_calls.filter((tc) => !tc.id || responded.has(tc.id))
        if (kept.length === m.tool_calls.length) return m
        return new AIMessage({
          ...m,
          content: m.content,
          tool_calls: kept,
          additional_kwargs: {
            ...m.additional_kwargs,
            tool_calls: kept.length ? m.additional_kwargs?.tool_calls : undefined,
          },
        })
      })
      return handler({ ...request, messages: cleaned })
    },
  })
}
