/**
 * TaskToolCompatMiddleware
 *
 * 处理 deepagents `task` 工具的两类兼容性问题：
 *
 * 1. `prompt → description` 归一化（wrapToolCall）
 *    deepagents 的 task 工具 schema 仅声明 `description` + `subagent_type` 两个参数，
 *    但部分模型（DeepSeek、早期 GPT-4o）会幻觉出 `prompt` 字段。这里把 prompt 内容
 *    并入 description，避免子代理因参数名错位收到空 brief。
 *
 * 2. Planner 子代理输出三层防护（wrapToolCall）
 *
 *    背景：buildPlannerSubAgent 启用了 responseFormat: PlannerResponseSchema。
 *    deepseek-reasoner 的 profile 声明 structuredOutput:true，langchain 因此走
 *    ProviderStrategy（native），直接用 JSON.parse 解析 model 最终文本输出，
 *    不强制 tool_choice:"any"（无 tool_choice 冲突）。当 ProviderStrategy.parse
 *    成功时，deepagents 的 returnCommandWithStateUpdate 把 structuredResponse
 *    JSON-stringify 后作为 ToolMessage content 回传——此时内容已是干净 JSON，
 *    Zod safeParse 直接通过。
 *
 *    三层防护：
 *    Layer 1 — Zod 校验（primary）：验证 ProviderStrategy 产出（或 model 直接输出）的 JSON。
 *    Layer 2 — 宽容归一化（B 层）：Zod 失败时尝试修复常见形状偏差：
 *              中文枚举别名（物理→physical 等）、alternatives 对象拍平为字符串、
 *              键名别名（coreDesire→activatedDesireOrFear、category→dimension 等）。
 *              归一化后再次 Zod 校验；通过则返回含规范 JSON 的合成 ToolMessage。
 *    Layer 3 — 精准错误回灌（C 层）：归一化仍无法修复时，把真实错误原因
 *              （reason/parseError/schemaIssues）写入错误消息，
 *              引导模型定向自纠（而非盲目补充 brief）。
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

// ---------------------------------------------------------------------------
// Layer 2 — Normalization (B layer)
// Fixes common shape deviations before Zod validation so that
// "almost correct" planner output survives without a retry round-trip.
// ---------------------------------------------------------------------------

/** Map of Chinese (and alternate English) dimension synonyms → canonical value */
const DIMENSION_ALIASES: Record<string, 'physical' | 'social' | 'psychological'> = {
  '物理': 'physical',
  'physics': 'physical',
  'physical': 'physical',
  '社会': 'social',
  'society': 'social',
  'social': 'social',
  '心理': 'psychological',
  'psychology': 'psychological',
  'psychological': 'psychological',
  'mental': 'psychological',
  '精神': 'psychological',
}

function normalizeDimension(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '')
  const lower = value.toLowerCase()
  for (const [alias, canonical] of Object.entries(DIMENSION_ALIASES)) {
    if (lower === alias.toLowerCase() || lower.includes(alias.toLowerCase())) return canonical
  }
  return value
}

function normalizeAlternative(alt: unknown): string {
  if (typeof alt === 'string') return alt
  if (alt && typeof alt === 'object' && !Array.isArray(alt)) {
    const a = alt as Record<string, unknown>
    // {direction, tradeoff} or {direction, rationale} or {name, description} etc.
    const parts = [a.direction, a.tradeoff, a.rationale, a.description, a.text]
      .filter(p => typeof p === 'string' && (p as string).trim())
    return parts.join(': ')
  }
  return String(alt ?? '')
}

function normalizeRecord(obj: Record<string, unknown>): void {
  // alternatives: array of strings only
  if (Array.isArray(obj.alternatives)) {
    obj.alternatives = obj.alternatives.map(normalizeAlternative)
  }

  // logicAudit sub-fields
  const audit = obj.logicAudit
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return
  const a = audit as Record<string, unknown>

  // commonSenseFlags
  if (Array.isArray(a.commonSenseFlags)) {
    a.commonSenseFlags = a.commonSenseFlags.map(flag => {
      if (!flag || typeof flag !== 'object' || Array.isArray(flag)) return flag
      const f = { ...(flag as Record<string, unknown>) }
      // dimension: normalize or fill from alias key "category"
      if (typeof f.dimension === 'string') {
        f.dimension = normalizeDimension(f.dimension)
      } else if (typeof f.category === 'string') {
        f.dimension = normalizeDimension(f.category)
        delete f.category
      }
      // issue: fill from alias key "flag"
      if (!f.issue && f.flag) { f.issue = f.flag; delete f.flag }
      // correction: fill from alias key "severity" or "fix"
      if (!f.correction && f.severity) { f.correction = f.severity; delete f.severity }
      if (!f.correction && f.fix) { f.correction = f.fix; delete f.fix }
      return f
    })
  }

  // motivationTraces
  if (Array.isArray(a.motivationTraces)) {
    a.motivationTraces = a.motivationTraces.map(trace => {
      if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return trace
      const t = { ...(trace as Record<string, unknown>) }
      // activatedDesireOrFear: fill from coreDesire / coreFear aliases
      if (!t.activatedDesireOrFear) {
        const parts = [t.coreDesire, t.coreFear, t.desire, t.fear]
          .filter(p => typeof p === 'string' && (p as string).trim())
        if (parts.length) {
          t.activatedDesireOrFear = (parts as string[]).join(' / ')
          delete t.coreDesire; delete t.coreFear; delete t.desire; delete t.fear
        }
      }
      return t
    })
  }
}

/**
 * Attempt to normalize planner JSON content.
 * Returns a normalized JSON string if parsing succeeds, or null if content is unparseable.
 * The normalized string always contains bare JSON (no fences).
 */
function normalizePlannerJson(content: string): string | null {
  const { source } = extractJsonSource(content)
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  normalizeRecord(obj)
  try {
    return JSON.stringify(obj)
  } catch {
    return null
  }
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

function buildPlannerError(
  toolCallId: string | undefined,
  priorFailures: number,
  validation?: PlannerValidationResult,
): ToolMessage {
  // Build a specific diagnosis from validation details (C layer — directed feedback).
  const specificErrors: string[] = []
  if (validation) {
    switch (validation.reason) {
      case 'empty':
        specificErrors.push('The response was empty.')
        break
      case 'json_parse_failed':
        specificErrors.push(
          validation.hasJsonBlock
            ? `JSON inside the code fence failed to parse: ${validation.parseError ?? 'unknown parse error'}.`
            : `Response is not valid JSON: ${validation.parseError ?? 'unknown parse error'}.`,
        )
        break
      case 'schema_failed':
        if (validation.schemaIssues?.length) {
          const details = validation.schemaIssues
            .slice(0, 5)
            .map(i => (i.path ? `"${i.path}": ${i.message}` : i.message))
            .join('; ')
          specificErrors.push(`Schema validation failed — ${details}.`)
        } else {
          specificErrors.push('Schema validation failed.')
        }
        break
      case 'empty_required_fields':
        specificErrors.push('Required fields "plan" and/or "rationale" are empty strings.')
        break
    }
  }

  // The brief is NOT the problem — the output format/field names are.
  const guidance = priorFailures > 0
    ? [
        'Planner retry also failed validation.',
        'Use task with subagent_type="general-purpose" to produce the same plan/rationale/alternatives/logicAudit structure, then call confirm_writing_plan from that result.',
        'The logicAudit must be included — do NOT omit it.',
        'Do not create the plan in the main agent yourself.',
      ]
    : [
        'Retry task with subagent_type="planner" with the same brief.',
        'The problem is the OUTPUT FORMAT, not the brief content — do not expand or rewrite the brief.',
        'The planner must output a bare JSON object only: no prose, no markdown fences.',
        'Required keys: plan (string), rationale (string), alternatives (array of strings, not objects), logicAudit (object).',
        'logicAudit must use motivationTraces[].action, motivationTraces[].activatedDesireOrFear, commonSenseFlags[].dimension, commonSenseFlags[].issue, and commonSenseFlags[].correction.',
        'commonSenseFlags[].dimension must be exactly one of "physical", "social", or "psychological" (English, not translated).',
        'Do not call confirm_writing_plan from this result.',
      ]

  return new ToolMessage({
    name: 'task',
    tool_call_id: toolCallId ?? '',
    content: [
      PLANNER_INVALID_RESULT_PREFIX,
      ...specificErrors,
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

      // Layer D: when general-purpose is used as a planner fallback (after prior planner
      // failures in the current turn), also run normalization so the parent agent receives
      // schema-compliant JSON for confirm_writing_plan. If the general-purpose output
      // fails validation even after normalization, pass it through unchanged so the
      // agent can still attempt confirm_writing_plan with what it has.
      if (args.subagent_type !== 'planner') {
        const priorPlannerFailures = countPriorPlannerValidationFailures(request.state.messages)
        if (args.subagent_type === 'general-purpose' && priorPlannerFailures > 0) {
          const gpContent = extractToolContent(result)
          const gpNormalized = normalizePlannerJson(gpContent)
          if (gpNormalized !== null) {
            const gpValidation = validatePlannerResult(gpNormalized)
            if (gpValidation.valid) {
              return new ToolMessage({
                name: 'task',
                tool_call_id: request.toolCall.id ?? '',
                content: gpNormalized,
              })
            }
          }
        }
        return result
      }

      const content = extractToolContent(result)
      const validation = validatePlannerResult(content)

      // Layer 1: primary validation — passes when responseFormat/ProviderStrategy produced
      // clean JSON, or when the model followed the bare-JSON system prompt instruction.
      if (validation.valid) {
        return result
      }

      // Layer 2: normalization — attempt to repair common shape deviations (B layer).
      // Handles Chinese dimension aliases, object-type alternatives, key renames, etc.
      // Returns a synthetic ToolMessage with normalized JSON to avoid losing the plan.
      const normalizedJson = normalizePlannerJson(content)
      if (normalizedJson !== null) {
        const normalizedValidation = validatePlannerResult(normalizedJson)
        if (normalizedValidation.valid) {
          return new ToolMessage({
            name: 'task',
            tool_call_id: request.toolCall.id ?? '',
            content: normalizedJson,
          })
        }
      }

      // Layer 3: precise error feedback — tell the model exactly what is wrong (C layer).
      const priorFailures = countPriorPlannerValidationFailures(request.state.messages)
      return buildPlannerError(request.toolCall.id, priorFailures, validation)
    },
  })
}
