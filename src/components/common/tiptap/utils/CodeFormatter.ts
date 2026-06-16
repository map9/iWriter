import {
  SUPPORTED_CODE_FORMAT_LANGUAGES,
  isSupportedCodeFormatLanguage,
  type CodeFormatResult,
  type SupportedCodeFormatLanguage,
} from '@/types/code-format'
import { notify } from '@/utils/notifications'

export const SUPPORTED_LANGUAGES = SUPPORTED_CODE_FORMAT_LANGUAGES
export type SupportedLanguage = SupportedCodeFormatLanguage
export type FormatResult = CodeFormatResult

export function isLanguageSupported(language: string | null | undefined): language is SupportedLanguage {
  return isSupportedCodeFormatLanguage(language)
}

export async function formatCode(
  code: string,
  language: string | null | undefined,
): Promise<FormatResult> {
  if (!window.electronAPI?.formatCode) {
    return {
      success: false,
      error: 'Electron code formatting API is not available',
    }
  }

  const result = await window.electronAPI.formatCode(code, language)
  if (!result.success) {
    const where = result.loc ? `Line ${result.loc.line}, Col ${result.loc.column}: ` : ''
    notify.error(`${where}${result.error || 'Unknown error'}`, 'Format failed')
  }
  return result
}

export async function formatCodeSync(
  code: string,
  language: string | null | undefined,
): Promise<FormatResult> {
  return formatCode(code, language)
}

export function getSupportedLanguagesList(): SupportedLanguage[] {
  return Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[]
}

export function getLanguageDisplayName(language: SupportedLanguage): string {
  const displayNames: Record<SupportedLanguage, string> = {
    javascript: 'JavaScript',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    html: 'HTML',
    xml: 'XML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    less: 'Less',
    json: 'JSON',
    json5: 'JSON5',
    yaml: 'YAML',
    yml: 'YAML',
    markdown: 'Markdown',
    md: 'Markdown',
    vue: 'Vue',
    angular: 'Angular',
    graphql: 'GraphQL',
  }

  return displayNames[language] || language.toUpperCase()
}
