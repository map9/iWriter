export const SUPPORTED_CODE_FORMAT_LANGUAGES = {
  javascript: 'babel',
  js: 'babel',
  jsx: 'babel',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  xml: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'css',
  json: 'json',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
  vue: 'vue',
  angular: 'angular',
  graphql: 'graphql',
} as const

export type SupportedCodeFormatLanguage = keyof typeof SUPPORTED_CODE_FORMAT_LANGUAGES
export type PrettierParser = typeof SUPPORTED_CODE_FORMAT_LANGUAGES[SupportedCodeFormatLanguage]

export interface CodeFormatResult {
  success: boolean
  formattedCode?: string
  error?: string
}

export function isSupportedCodeFormatLanguage(
  language: string | null | undefined,
): language is SupportedCodeFormatLanguage {
  if (!language) return false
  return language.toLowerCase() in SUPPORTED_CODE_FORMAT_LANGUAGES
}

export function getPrettierParserForLanguage(
  language: SupportedCodeFormatLanguage,
): PrettierParser {
  return SUPPORTED_CODE_FORMAT_LANGUAGES[language]
}
