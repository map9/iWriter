export type FencedBlockPart<T> =
  | { kind: 'prose'; text: string }
  | { kind: string; data: T }

export type FenceParser<T> = (raw: string) => T | null

export type FenceMap<T extends Record<string, unknown>> = {
  [K in keyof T]: FenceParser<T[K]>
}

export function splitTextWithFences<T extends Record<string, unknown>>(
  text: string,
  fenceMap: FenceMap<T>,
): FencedBlockPart<T[keyof T]>[] {
  const fenceNames = Object.keys(fenceMap)
  if (!fenceNames.length) return [{ kind: 'prose', text }]

  const escapedNames = fenceNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp('```(' + escapedNames.join('|') + ')\\s*([\\s\\S]*?)```', 'g')

  const parts: FencedBlockPart<T[keyof T]>[] = []
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
      parts.push({ kind: fenceName as string, data: data as T[keyof T] })
    }

    lastIndex = match.index + match[0].length
  }

  const after = text.slice(lastIndex)
  if (after.trim()) parts.push({ kind: 'prose', text: after })
  return parts.length ? parts : [{ kind: 'prose', text }]
}
