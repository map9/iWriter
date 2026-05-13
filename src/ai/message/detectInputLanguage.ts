export type DetectedInputLanguage = 'zh-CN' | 'en-US' | 'ja-JP' | 'other'

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const KANA_RE = /[\u3040-\u30ff]/g
const LATIN_RE = /[A-Za-z]/g

function normalizeFallbackLocale(locale?: string | null): DetectedInputLanguage {
  const lower = locale?.toLowerCase() ?? ''
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN'
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja-JP'
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US'
  return 'en-US'
}

export function detectInputLanguage(
  texts: Array<string | null | undefined>,
  fallbackLocale?: string | null,
): DetectedInputLanguage {
  const sample = texts
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .slice(-6)
    .join('\n')
  if (!sample.trim()) return normalizeFallbackLocale(fallbackLocale)

  const cjk = sample.match(CJK_RE)?.length ?? 0
  const kana = sample.match(KANA_RE)?.length ?? 0
  const latin = sample.match(LATIN_RE)?.length ?? 0
  const signal = cjk + kana + latin
  if (signal <= 0) return normalizeFallbackLocale(fallbackLocale)

  if (kana / signal >= 0.12) return 'ja-JP'
  if (cjk / signal >= 0.3) return 'zh-CN'
  if (latin / signal >= 0.5) return 'en-US'
  return normalizeFallbackLocale(fallbackLocale)
}

export function languageInstructionName(language: DetectedInputLanguage): string {
  switch (language) {
    case 'zh-CN': return 'Chinese'
    case 'ja-JP': return 'Japanese'
    case 'en-US': return 'English'
    default: return 'the author language'
  }
}

export function buildOutputLanguagePrompt(language: DetectedInputLanguage): string {
  const languageName = languageInstructionName(language)
  return `
## Output language

The author writes in ${languageName}. Respond in ${languageName}, including narrative prose, plan text, rationale, logicAudit fields, and consistency-findings description and suggestion. Tool names and JSON keys remain English. Do not switch languages mid-response.
`.trim()
}
