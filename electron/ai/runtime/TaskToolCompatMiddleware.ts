import { ToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'
import { PlannerResponseSchema } from '../domain/creative/subAgents/planner'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  return content
    .map(part => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      return typeof record.text === 'string' ? record.text : ''
    })
    .join('')
}

function extractToolContent(result: unknown): string {
  if (result instanceof ToolMessage) return messageContentToText(result.content)

  const record = asRecord(result)
  const update = asRecord(record.update)
  const messages = Array.isArray(update.messages) ? update.messages : []
  const firstMessage = messages[0]
  if (firstMessage instanceof ToolMessage) return messageContentToText(firstMessage.content)
  return messageContentToText(asRecord(firstMessage).content)
}

function isValidPlannerResult(content: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return false
  }

  const result = PlannerResponseSchema.safeParse(parsed)
  if (!result.success) return false
  return result.data.plan.trim().length > 0 && result.data.rationale.trim().length > 0
}

function buildPlannerError(toolCallId: string | undefined): ToolMessage {
  return new ToolMessage({
    name: 'task',
    tool_call_id: toolCallId ?? '',
    content: [
      'Error: Planner subagent returned an invalid or empty result.',
      'Retry task with subagent_type="planner" and put the complete planner brief in description.',
      'Do not call confirm_writing_plan from this result.',
    ].join(' '),
  })
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
      const mergedDescription = prompt && !description.includes(prompt)
        ? `${description}${description.trim() ? '\n\n' : ''}${prompt}`
        : description
      const argsWithoutPrompt = { ...args }
      delete argsWithoutPrompt.prompt

      const toolCall = prompt
        ? {
            ...request.toolCall,
            args: {
              ...argsWithoutPrompt,
              description: mergedDescription,
            },
          }
        : request.toolCall

      const result = await handler({
        ...request,
        toolCall,
      })

      if (args.subagent_type !== 'planner') {
        return result
      }

      const content = extractToolContent(result)
      if (isValidPlannerResult(content)) {
        return result
      }

      return buildPlannerError(request.toolCall.id)
    },
  })
}
