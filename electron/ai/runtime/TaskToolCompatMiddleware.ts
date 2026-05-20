/**
 * TaskToolCompatMiddleware
 *
 * 处理 deepagents `task` 工具的两类兼容性问题：
 *
 * 1. `prompt → description` 归一化（wrapToolCall :68-85）
 *    deepagents 的 task 工具 schema 仅声明 `description` + `subagent_type` 两个参数
 *    （node_modules/deepagents/dist/index.js:2306-2309），但部分模型（DeepSeek、
 *    早期 GPT-4o）会幻觉出 `prompt` 字段。这里把 prompt 内容并入 description，
 *    避免子代理因参数名错位收到空 brief。
 *
 * 2. Planner 子代理输出 schema 校验（wrapToolCall :92-101）
 *    虽然 buildPlannerSubAgent 已声明 `responseFormat: PlannerResponseSchema`，
 *    但 deepagents `createTaskTool` 在常规工具调用路径（即 config.toolCall?.id 存在）
 *    只通过 returnCommandWithStateUpdate 返回 messages，**不会**把 structuredResponse
 *    JSON-stringify 后回灌给父代理（参见 node_modules/deepagents/dist/index.js:2274-2302）。
 *    因此 langchain `responseFormat` 仅在「直接调用 subagent.invoke」的边路生效，
 *    `task` 工具下完全不生效。本中间件的 JSON.parse + Zod safeParse 是
 *    实际唯一拦截 planner 非法输出的关卡，不能删除。
 */
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
