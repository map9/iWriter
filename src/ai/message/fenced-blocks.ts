export type FencedBlockPart<T, K extends string = string> =
  | { kind: 'prose'; text: string }
  | { kind: 'pending'; name: string }
  | { kind: K; data: T }

/**
 * Repairs unescaped ASCII double-quotes inside JSON string values.
 * LLMs frequently emit text like `"angle": "text with "quoted" word"` which
 * fails JSON.parse. This heuristic scans character-by-character and escapes
 * any `"` that is inside a string but not followed by a structural JSON token
 * (`:`, `,`, `}`, `]`, or end-of-input).
 */
export function repairJsonQuotes(raw: string): string {
  let result = ''
  let inString = false
  let i = 0
  while (i < raw.length) {
    const c = raw[i]
    if (!inString) {
      result += c
      if (c === '"') inString = true
      i++
      continue
    }
    if (c === '\\') {
      result += c
      if (i + 1 < raw.length) { result += raw[i + 1]; i += 2 } else i++
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t')) j++
      const next = raw[j]
      if (!next || next === ':' || next === ',' || next === '}' || next === ']' || next === '\n' || next === '\r') {
        result += c
        inString = false
      } else {
        result += '\\"'
      }
      i++
      continue
    }
    result += c
    i++
  }
  return result
}

export type FenceParser<T> = (raw: string) => T | null

export type FenceMap<T extends Record<string, unknown>> = {
  [K in keyof T]: FenceParser<T[K]>
}

export function splitTextWithFences<T extends Record<string, unknown>>(
  text: string,
  fenceMap: FenceMap<T>,
  options?: { placeholderForOpenFence?: boolean },
): FencedBlockPart<T[keyof T], Extract<keyof T, string>>[] {
  const fenceNames = Object.keys(fenceMap)
  if (!fenceNames.length) return [{ kind: 'prose', text }]

  const escapedNames = fenceNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp('```(' + escapedNames.join('|') + ')\\s*([\\s\\S]*?)```', 'g')

  const parts: FencedBlockPart<T[keyof T], Extract<keyof T, string>>[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index)
    if (before.trim()) parts.push({ kind: 'prose', text: before })

    const fenceName = match[1] as keyof T
    const raw = match[2] ?? ''
    const parser = fenceMap[fenceName]
    const data = parser(raw)

    if (data === null) {
      parts.push({ kind: 'prose', text: match[0] })
    } else {
      parts.push({ kind: fenceName as Extract<keyof T, string>, data: data as T[keyof T] })
    }

    lastIndex = match.index + match[0].length
  }

  const after = text.slice(lastIndex)
  if (after.trim()) {
    const openFence = options?.placeholderForOpenFence
      ? new RegExp('```(' + escapedNames.join('|') + ')\\s*[\\s\\S]*$').exec(after)
      : null
    if (openFence?.index !== undefined) {
      const beforeOpenFence = after.slice(0, openFence.index)
      if (beforeOpenFence.trim()) parts.push({ kind: 'prose', text: beforeOpenFence })
      parts.push({ kind: 'pending', name: openFence[1] ?? '' })
    } else {
      parts.push({ kind: 'prose', text: after })
    }
  }
  return parts.length ? parts : [{ kind: 'prose', text }]
}
