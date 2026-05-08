export type ConsistencyFindingLayer =
  | 'pov'
  | 'character'
  | 'logic'
  | 'voice'
  | 'pacing'
  | 'continuity'
  | 'other'

export type ConsistencyFindingSeverity = 'info' | 'minor' | 'major'

export interface ConsistencyFinding {
  layer: ConsistencyFindingLayer
  severity: ConsistencyFindingSeverity
  locationRef: string
  description: string
  suggestion: string
}

export type ConsistencyFindingTextPart =
  | { kind: 'prose'; text: string }
  | { kind: 'findings'; findings: ConsistencyFinding[] }

const VALID_LAYERS = new Set<ConsistencyFindingLayer>([
  'pov',
  'character',
  'logic',
  'voice',
  'pacing',
  'continuity',
  'other',
])

const VALID_SEVERITIES = new Set<ConsistencyFindingSeverity>(['info', 'minor', 'major'])

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFinding(value: unknown): ConsistencyFinding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const layer = toText(item.layer) as ConsistencyFindingLayer
  const severity = toText(item.severity) as ConsistencyFindingSeverity
  const description = toText(item.description)
  const suggestion = toText(item.suggestion)
  if (!description && !suggestion) return null
  return {
    layer: VALID_LAYERS.has(layer) ? layer : 'other',
    severity: VALID_SEVERITIES.has(severity) ? severity : 'info',
    locationRef: toText(item.locationRef),
    description,
    suggestion,
  }
}

function parseFindings(raw: string): ConsistencyFinding[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map(normalizeFinding).filter((item): item is ConsistencyFinding => !!item)
  } catch {
    return null
  }
}

export function splitTextWithFindings(text: string): ConsistencyFindingTextPart[] {
  const parts: ConsistencyFindingTextPart[] = []
  const fence = /```consistency-findings\s*([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index)
    if (before.trim()) parts.push({ kind: 'prose', text: before })
    const findings = parseFindings(match[1] ?? '')
    if (!findings) {
      parts.push({ kind: 'prose', text: match[0] })
    } else if (findings.length) {
      parts.push({ kind: 'findings', findings })
    }
    lastIndex = match.index + match[0].length
  }

  const after = text.slice(lastIndex)
  if (after.trim()) parts.push({ kind: 'prose', text: after })
  return parts.length ? parts : [{ kind: 'prose', text }]
}
