import { ToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'

export const RESPOND_MARKER = '__IWRITER_RESPOND__\n'

function isToolMsg(m: unknown): m is ToolMessage {
  // instanceof may fail after checkpoint replay when package instances diverge.
  // Duck-type fallback: _getType() is the BaseMessage internal discriminant.
  if (m instanceof ToolMessage) return true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (m as any)?._getType === 'function' && (m as any)._getType() === 'tool'
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => {
    if (typeof part === 'string') return part
    if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
      return (part as { text: string }).text
    }
    return ''
  }).join('')
}

export function createHumanRespondMessageMiddleware() {
  return createMiddleware({
    name: 'HumanRespondMessage',
    wrapModelCall: async (request, handler) => {
      const rewritten = request.messages.map((m) => {
        if (!isToolMsg(m)) return m
        const text = extractText(m.content)
        if (!text.startsWith(RESPOND_MARKER)) return m
        // Strip marker and omit status:'error' so the LLM reads this as guidance, not a failure.
        return new ToolMessage({
          id: m.id,
          tool_call_id: m.tool_call_id,
          name: m.name,
          content: text.slice(RESPOND_MARKER.length),
        })
      })
      return handler({ ...request, messages: rewritten })
    },
  })
}
