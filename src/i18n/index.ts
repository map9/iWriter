import { createI18n } from 'vue-i18n'
import enUS from './messages/en-US'
import zhCN from './messages/zh-CN'

export const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const
export type AppLocale = typeof SUPPORTED_LOCALES[number]

const localeMessages = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const

function normalizeLocale(raw: string | null | undefined): AppLocale | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower === 'zh-cn' || lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN'
  if (lower === 'en-us' || lower === 'en' || lower.startsWith('en-')) return 'en-US'
  return null
}

export function detectPreferredLocale(fallback: AppLocale = 'en-US'): AppLocale {
  if (typeof navigator === 'undefined') return fallback
  for (const candidate of navigator.languages) {
    const normalized = normalizeLocale(candidate)
    if (normalized) return normalized
  }
  return normalizeLocale(navigator.language) ?? fallback
}

export function resolveLocale(input: string | null | undefined): AppLocale {
  return normalizeLocale(input) ?? 'en-US'
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages: localeMessages,
})

export function setAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}
