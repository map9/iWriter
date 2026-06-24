/**
 * Some models send the deepagents task brief as `prompt`, while the task tool
 * schema accepts `description`. Normalize that one compatibility mismatch here.
 */
import { createMiddleware } from 'langchain'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function createTaskToolCompatMiddleware() {
  return createMiddleware({
    name: 'TaskToolCompatMiddleware',
    wrapToolCall: async (request, handler) => {
      if (request.toolCall.name !== 'task') {
        return handler(request)
      }

      const args = asRecord(request.toolCall.args)
      const description = typeof args.description === 'string' ? args.description : ''
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (!prompt) {
        return handler(request)
      }

      const argsWithoutPrompt = { ...args }
      delete argsWithoutPrompt.prompt
      const mergedDescription = description.includes(prompt)
        ? description
        : `${description}${description.trim() ? '\n\n' : ''}${prompt}`

      return handler({
        ...request,
        toolCall: {
          ...request.toolCall,
          args: {
            ...argsWithoutPrompt,
            description: mergedDescription,
          },
        },
      })
    },
  })
}
