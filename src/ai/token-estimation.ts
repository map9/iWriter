export function estimateTextTokens(text: string): number {
  const normalized = text.trim()
  if (!normalized) return 0

  // A lightweight heuristic that behaves reasonably for both CJK-heavy and Latin-heavy text.
  const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length
  const asciiChars = normalized.length - cjkChars
  const estimated = Math.ceil(cjkChars * 1.15 + asciiChars / 4)
  return Math.max(1, estimated)
}
