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
 *    `task` 工具下完全不生效。本中间件的 JSON block extraction + Zod safeParse 是
 *    实际唯一拦截 planner 非法输出的关卡，不能删除。
 */
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'
import { PlannerResponseSchema } from '../domain/creative/subAgents/planner'

export const PLANNER_INVALID_RESULT_PREFIX = 'Error: Planner subagent returned an invalid or empty result.'

interface PlannerValidationResult {
  valid: boolean
  reason?: 'empty' | 'json_parse_failed' | 'schema_failed' | 'empty_required_fields'
  hasJsonBlock: boolean
  jsonSourceLength: number
  parseError?: string
  schemaIssues?: Array<{ path: string, message: string }>
}

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

function extractJsonSource(content: string): { source: string, hasJsonBlock: boolean } {
  const matches = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  const lastMatch = matches.at(-1)
  if (lastMatch) {
    return { source: (lastMatch[1] ?? '').trim(), hasJsonBlock: true }
  }
  return { source: content.trim(), hasJsonBlock: false }
}

function validatePlannerResult(content: string): PlannerValidationResult {
  if (!content.trim()) {
    return {
      valid: false,
      reason: 'empty',
      hasJsonBlock: false,
      jsonSourceLength: 0,
    }
  }

  const { source, hasJsonBlock } = extractJsonSource(content)
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (err) {
    return {
      valid: false,
      reason: 'json_parse_failed',
      hasJsonBlock,
      jsonSourceLength: source.length,
      parseError: err instanceof Error ? err.message : String(err),
    }
  }

  const result = PlannerResponseSchema.safeParse(parsed)
  if (!result.success) {
    return {
      valid: false,
      reason: 'schema_failed',
      hasJsonBlock,
      jsonSourceLength: source.length,
      schemaIssues: result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }
  if (!result.data.plan.trim() || !result.data.rationale.trim()) {
    return {
      valid: false,
      reason: 'empty_required_fields',
      hasJsonBlock,
      jsonSourceLength: source.length,
    }
  }
  return {
    valid: true,
    hasJsonBlock,
    jsonSourceLength: source.length,
  }
}

function isHumanMessage(message: unknown): boolean {
  if (message instanceof HumanMessage) return true
  // Plain-object form produced by LangGraph checkpointer deserialization
  return asRecord(message).type === 'human'
}

function countPriorPlannerValidationFailures(messages: unknown): number {
  if (!Array.isArray(messages)) return 0
  // Scope to the current user turn: only count planner failures that occurred after
  // the most recent HumanMessage. Without this guard, a failure from a previous
  // turn would make the very first planner call of the next turn look like a retry,
  // skipping the one allowed planner retry and jumping straight to general-purpose fallback.
  let scanFrom = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanMessage(messages[i])) {
      scanFrom = i + 1
      break
    }
  }
  return messages.slice(scanFrom).filter(message => {
    if (message instanceof ToolMessage) {
      return messageContentToText(message.content).startsWith(PLANNER_INVALID_RESULT_PREFIX)
    }
    return messageContentToText(asRecord(message).content).startsWith(PLANNER_INVALID_RESULT_PREFIX)
  }).length
}

function buildPlannerError(toolCallId: string | undefined, priorFailures: number): ToolMessage {
  const guidance = priorFailures > 0
    ? [
        'Planner retry also failed validation.',
        'Use task with subagent_type="general-purpose" to produce the same plan/rationale/alternatives/logicAudit structure, then call confirm_writing_plan from that result.',
        'Do not create the plan in the main agent yourself.',
      ]
    : [
        'Retry task with subagent_type="planner" and put the complete planner brief in description.',
        'The planner response must contain exactly one final ```json code block with keys plan, rationale, alternatives, and logicAudit.',
        'alternatives must be an array of strings only; do not use objects with direction/tradeoff keys.',
        'logicAudit must use motivationTraces[].action, motivationTraces[].activatedDesireOrFear, commonSenseFlags[].dimension, commonSenseFlags[].issue, and commonSenseFlags[].correction.',
        'commonSenseFlags[].dimension MUST be exactly one of "physical", "social", or "psychological"; do not translate these enum values.',
        'Do not call confirm_writing_plan from this result.',
      ]

  return new ToolMessage({
    name: 'task',
    tool_call_id: toolCallId ?? '',
    content: [
      PLANNER_INVALID_RESULT_PREFIX,
      ...guidance,
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
      const validation = validatePlannerResult(content)
      if (validation.valid) {
        return result
      }

      const priorFailures = countPriorPlannerValidationFailures(request.state.messages)
      return buildPlannerError(request.toolCall.id, priorFailures)
    },
  })
}
