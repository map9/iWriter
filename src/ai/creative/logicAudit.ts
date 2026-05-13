import { z } from 'zod'

export const MotivationTraceSchema = z.object({
  character: z.string(),
  action: z.string(),
  activatedDesireOrFear: z.string(),
  falseBelief: z.string(),
  derivation: z.string(),
})

export const CausalBeatSchema = z.object({
  beat: z.string(),
  priorState: z.string(),
  trigger: z.string(),
  characterInterpretation: z.string(),
  decision: z.string(),
  consequence: z.string(),
})

export const CommonSenseFlagSchema = z.object({
  dimension: z.enum(['physical', 'social', 'psychological']),
  issue: z.string(),
  correction: z.string(),
})

export const LogicAuditSchema = z.object({
  motivationTraces: z.array(MotivationTraceSchema).max(5),
  causalChain: z.array(CausalBeatSchema).max(8),
  commonSenseFlags: z.array(CommonSenseFlagSchema).max(5),
})

export type MotivationTrace = z.infer<typeof MotivationTraceSchema>
export type CausalBeat = z.infer<typeof CausalBeatSchema>
export type CommonSenseFlag = z.infer<typeof CommonSenseFlagSchema>
export type LogicAudit = z.infer<typeof LogicAuditSchema>

export function parseLogicAudit(value: unknown): LogicAudit | undefined {
  const parsed = LogicAuditSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
