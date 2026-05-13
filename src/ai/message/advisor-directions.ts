export type AdvisorDirectionType =
  | 'plot'
  | 'character'
  | 'structure'
  | 'scene'
  | 'theme'
  | 'voice'
  | 'general'

export interface AdvisorDirection {
  type: AdvisorDirectionType
  direction: string
  angle?: string
}

export type AdvisorDirectionTextPart =
  | { kind: 'prose'; text: string }
  | { kind: 'directions'; directions: AdvisorDirection[] }

const VALID_TYPES = new Set<AdvisorDirectionType>([
  'plot',
  'character',
  'structure',
  'scene',
  'theme',
  'voice',
  'general',
])

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDirection(value: unknown): AdvisorDirection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const direction = toText(item.direction)
  if (!direction) return null
  const type = toText(item.type) as AdvisorDirectionType
  return {
    type: VALID_TYPES.has(type) ? type : 'general',
    direction,
    angle: toText(item.angle) || undefined,
  }
}

function tryParseDirections(text: string): AdvisorDirection[] | null {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    const results = parsed
      .map(normalizeDirection)
      .filter((item): item is AdvisorDirection => !!item)
    return results.length ? results : null
  } catch {
    return null
  }
}

export function parseDirections(raw: string): AdvisorDirection[] | null {
  return tryParseDirections(raw) ?? tryParseDirections(repairJsonQuotes(raw))
}

import { splitTextWithFences, repairJsonQuotes } from './fenced-blocks'

export function splitTextWithDirections(text: string): AdvisorDirectionTextPart[] {
  const parts = splitTextWithFences(text, {
    'advisor-directions': parseDirections,
  })
  return parts.flatMap<AdvisorDirectionTextPart>((p) => {
    if (p.kind === 'prose') return p
    if (p.kind === 'pending') return []
    if ('data' in p) return { kind: 'directions', directions: p.data as AdvisorDirection[] }
    return []
  })
}
