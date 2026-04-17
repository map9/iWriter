export type DaisyThemeId = 'light' | 'dark' | 'cupcake' | 'sunset' | 'caramellatte' | 'abyss' | 'dracula'
export type ThemeId = 'system' | DaisyThemeId
export type ResolvedThemeId = 'light' | 'dark'

export interface ThemeOption {
  id: ThemeId
  name: string
  isSystem?: boolean
  scheme?: ResolvedThemeId
}

export interface ResolvedThemeSelection {
  selectedThemeId: ThemeId
  resolvedThemeId: ResolvedThemeId
  appliedThemeId: string
}

export const availableThemes: ThemeOption[] = [
  {
    id: 'system',
    name: 'Follow System',
    isSystem: true,
  },
  {
    id: 'light',
    name: 'Light',
    scheme: 'light',
  },
  {
    id: 'dark',
    name: 'Dark',
    scheme: 'dark',
  },
  {
    id: 'cupcake',
    name: 'Cupcake',
    scheme: 'light',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    scheme: 'dark',
  },
  {
    id: 'caramellatte',
    name: 'Caramel Latte',
    scheme: 'light',
  },
  {
    id: 'abyss',
    name: 'Abyss',
    scheme: 'dark',
  },
  {
    id: 'dracula',
    name: 'Dracula',
    scheme: 'dark',
  },
]

export function getThemeById(id: string): ThemeOption | undefined {
  return availableThemes.find((theme) => theme.id === id)
}

export function isThemeId(id: string): id is ThemeId {
  return availableThemes.some((theme) => theme.id === id)
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveThemeSelection(themeId: string, prefersDark: boolean): ResolvedThemeSelection {
  const selectedThemeId: ThemeId = isThemeId(themeId) ? themeId : 'system'
  const selectedTheme = getThemeById(selectedThemeId)
  const resolvedThemeId: ResolvedThemeId = selectedThemeId === 'system'
    ? (prefersDark ? 'dark' : 'light')
    : (selectedTheme?.scheme ?? 'light')

  return {
    selectedThemeId,
    resolvedThemeId,
    appliedThemeId: selectedThemeId === 'system' ? resolvedThemeId : selectedThemeId,
  }
}

export function applyThemeSelection(themeId: string, prefersDark: boolean): ResolvedThemeSelection {
  const selection = resolveThemeSelection(themeId, prefersDark)
  const root = document.documentElement

  root.dataset.theme = selection.appliedThemeId
  root.dataset.selectedTheme = selection.selectedThemeId
  root.dataset.resolvedTheme = selection.resolvedThemeId
  root.style.colorScheme = selection.resolvedThemeId

  return selection
}

export function getThemePreviewThemeId(themeId: string, prefersDark: boolean): string {
  return resolveThemeSelection(themeId, prefersDark).appliedThemeId
}

export function getCustomThemes(): ThemeOption[] {
  return availableThemes.filter((theme) => !theme.isSystem && theme.id !== 'light' && theme.id !== 'dark')
}
