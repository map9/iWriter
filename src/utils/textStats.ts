export function countWords(text: string): number {
  if (!text.trim()) return 0
  const words = text.trim().match(/\b[a-zA-Z0-9\u4e00-\u9fff]+\b/g)
  return words ? words.length : 0
}

export function countWordDelta(previous: string, next: string): number {
  return countWords(next) - countWords(previous)
}
