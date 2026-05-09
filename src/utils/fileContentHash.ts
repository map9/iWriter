export function computeFileContentHash(content: string): string {
  let hash = 2166136261

  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}
