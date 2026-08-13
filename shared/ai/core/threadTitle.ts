/** Thread-title rules shared by renderer and main process. */
const GENERATED_THREAD_TITLE_MAX_CHARS = 30

export function generateThreadTitle(firstUserMessage: string): string {
  const text = firstUserMessage.trim().replace(/\s+/g, ' ')
  if (!text) return '新对话'

  return text.length <= GENERATED_THREAD_TITLE_MAX_CHARS
    ? text
    : `${text.slice(0, GENERATED_THREAD_TITLE_MAX_CHARS - 3)}...`
}
