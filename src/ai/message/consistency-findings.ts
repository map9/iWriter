export type ConsistencyFindingLayer =
  | 'pov'
  | 'character'
  | 'logic'
  | 'voice'
  | 'pacing'
  | 'continuity'
  | 'common_sense'
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
  | { kind: 'pending'; name: string }

const VALID_LAYERS = new Set<ConsistencyFindingLayer>([
  'pov',
  'character',
  'logic',
  'voice',
  'pacing',
  'continuity',
  'common_sense',
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

function tryParseFindings(text: string): ConsistencyFinding[] | null {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    const results = parsed
      .map(normalizeFinding)
      .filter((item): item is ConsistencyFinding => !!item)
    return results.length ? results : null
  } catch {
    return null
  }
}

export function parseFindings(raw: string): ConsistencyFinding[] | null {
  return tryParseFindings(raw) ?? tryParseFindings(repairJsonQuotes(raw))
}

import { splitTextWithFences, repairJsonQuotes } from './fenced-blocks'

export function splitTextWithFindings(text: string): ConsistencyFindingTextPart[] {
  const parts = splitTextWithFences(text, {
    'consistency-findings': parseFindings,
  }, { placeholderForOpenFence: true })
  return parts.flatMap<ConsistencyFindingTextPart>((p) => {
    if (p.kind === 'prose') return p
    if (p.kind === 'pending') return p
    if ('data' in p) return { kind: 'findings', findings: p.data as ConsistencyFinding[] }
    return []
  })
}
