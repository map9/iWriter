import { createHash } from 'node:crypto'
import type { AiProviderConfig } from '../../../shared/ai/contracts'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  )
}

export function createProviderConfigRevision(config: AiProviderConfig): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(config)))
    .digest('hex')
}
