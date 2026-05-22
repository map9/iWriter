function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function looksLikeHitlRequest(value: unknown): boolean {
  const record = asRecord(value)
  if (!record) return false
  return Array.isArray(record.actionRequests) && Array.isArray(record.reviewConfigs)
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed || !/^[\[{]/.test(trimmed)) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

export function isHitlInterruptPayload(value: unknown): boolean {
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value)
    return parsed ? isHitlInterruptPayload(parsed) : false
  }

  if (Array.isArray(value)) {
    return value.some(item => isHitlInterruptPayload(item))
  }

  const record = asRecord(value)
  if (!record) return false
  if (looksLikeHitlRequest(record)) return true
  if (looksLikeHitlRequest(record.value)) return true

  if (typeof record.content === 'string') {
    return isHitlInterruptPayload(record.content)
  }

  return false
}
