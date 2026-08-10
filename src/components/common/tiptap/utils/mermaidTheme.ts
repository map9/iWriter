import type { MarkdownMermaidTheme, MarkdownMermaidVariables } from '@/types'

export type ResolvedMermaidColorScheme = 'light' | 'dark'

export interface BuildMermaidThemeConfigOptions {
  dynamicColorScheme: ResolvedMermaidColorScheme
  resolveColor: (value: string) => string
}

export interface ResolvedMermaidConfig {
  theme: 'base'
  darkMode: boolean
  themeVariables: Record<string, string | boolean> & { darkMode: boolean }
}

export interface BuiltMermaidThemeConfig {
  config: ResolvedMermaidConfig
  cacheKey: string
}

export function buildMermaidThemeConfig(
  theme: MarkdownMermaidTheme,
  options: BuildMermaidThemeConfigOptions,
): BuiltMermaidThemeConfig {
  const colorScheme = theme.colorScheme === 'dynamic'
    ? options.dynamicColorScheme
    : theme.colorScheme
  const variables = Object.fromEntries(
    Object.entries(theme.variables).map(([key, value]) => [key, options.resolveColor(value)]),
  ) as MarkdownMermaidVariables
  const darkMode = colorScheme === 'dark'
  const themeVariables = { ...variables, darkMode }
  const cacheKey = JSON.stringify({
    colorScheme,
    variables: Object.fromEntries(Object.entries(variables).sort(([left], [right]) => left.localeCompare(right))),
  })

  return {
    config: {
      theme: 'base',
      darkMode,
      themeVariables,
    },
    cacheKey,
  }
}
