import { AIMessage, isAIMessage, isToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'

export function createOrphanToolCallStripperMiddleware() {
  return createMiddleware({
    name: 'OrphanToolCallStripper',
    wrapModelCall: async (request, handler) => {
      const responded = new Set<string>()
      for (const m of request.messages) {
        if (isToolMessage(m) && m.tool_call_id) responded.add(m.tool_call_id)
      }
      const cleaned = request.messages.map((m) => {
        if (!isAIMessage(m) || !m.tool_calls?.length) return m
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
