import type { EditSetting, ExportSettings, MarkdownEditorPageMode, MarkdownPrintPreferences } from '@/types'
import { SidebarMode, DocumentType } from '@/types'
import { DEFAULT_WORKSPACE_IGNORE_RULES } from '@/services/workspace/filtering'
import { DEFAULT_MARKDOWN_PRINT_PREFERENCES } from '@/components/print/markdownThemes'

// Storage Keys
export const STORAGE_KEYS = {
  LOCALE: 'iwriter-locale',
  THEME: 'iwriter-theme',
  AUTO_SAVE: 'iwriter-auto-save',
  SEARCH_CONFIG: 'iwriter-search-in-files-config',
  UI_STATE: 'iwriter-ui-state',
  EDIT_SETTING: 'iwriter-edit-setting',
  EXPORT_SETTING: 'iwriter-export-setting',
  MARKDOWN_PRINT_SETTING: 'iwriter-markdown-print-setting',
  WORKSPACE_STATE: 'iwriter-workspace-state',
  AI_SETTINGS: 'iwriter-ai-settings',
  AI_THREADS: 'iwriter-ai-threads',
  SEARCH_REPLACE_SEARCH_HISTORY: 'iwriter-search-replace-search-history',
  SEARCH_REPLACE_REPLACE_HISTORY: 'iwriter-search-replace-replace-history',
  SIDEBAR_SEARCH_HISTORY: 'iwriter-sidebar-search-history',
  SIDEBAR_REPLACE_HISTORY: 'iwriter-sidebar-replace-history',
} as const

// 类型定义
export interface UIState {
  isLeftSidebarVisible: boolean
  isRightSidebarVisible: boolean
  isStatusbarVisible: boolean
  isFocusMode: boolean
  isTypewriterMode: boolean
  markdownEditorPageMode: MarkdownEditorPageMode
  // clean mode is deliberately not persisted; it is treated as a temporary
  // distraction-free overlay state instead of a restored workspace preference.
  leftSidebarMode: SidebarMode
  leftSidebarWidth: number
  rightSidebarWidth: number
}

export interface WorkspaceState {
  currentFolder: string | null
  tabs: Array<{
    path: string  // 只保存有路径的 tab
    documentType?: DocumentType
  }>
  activeTabPath: string | null  // 使用路径而不是 ID
}

// 默认值
export const DEFAULT_UI_STATE: UIState = {
  isLeftSidebarVisible: true,
  isRightSidebarVisible: false,
  isStatusbarVisible: true,
  isFocusMode: false,
  isTypewriterMode: false,
  markdownEditorPageMode: 'fixed-768',
  leftSidebarMode: SidebarMode.START,
  leftSidebarWidth: 288,
  rightSidebarWidth: 320
}

export const DEFAULT_EDIT_SETTING: EditSetting = {
  lineEnding: 'LF',
  invisibleCharacters: true,
  firstLineIndent: true,
  smartPunctuation: true,
  showProofreadErrors: false,
  proofread: false,
  proofreadEngineType: 'languagetool',
  proofreadLanguage: 'en-US',
  proofreadApiUrl: 'https://api.languagetool.org/v2/check',
  proofreadApiKey: '',
  workspaceIgnoreRules: DEFAULT_WORKSPACE_IGNORE_RULES,
  useGitignoreAsWorkspaceIgnore: true,
  codeBlockLanguageScope: 'common',
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  currentFolder: null,
  tabs: [],
  activeTabPath: null
}

export const DEFAULT_EXPORT_SETTING: ExportSettings = {
  common: {
    defaultFolderMode: 'prompt',
    customFolderPath: '',
    pandocPathMode: 'auto',
    pandocPath: '',
    afterExportActions: {
      reveal: false,
      open: false,
    },
  },
  formats: {
    html: { customArgs: '', cssPath: '' },
    docx: { customArgs: '', referenceDocPath: '' },
    odt: { customArgs: '', templatePath: '' },
    rtf: { customArgs: '' },
    epub: { customArgs: '', cssPath: '', tocDepth: 3 },
    latex: { customArgs: '' },
    mediawiki: { customArgs: '' },
    rst: { customArgs: '' },
    textile: { customArgs: '' },
    opml: { customArgs: '' },
  },
}

export const DEFAULT_MARKDOWN_PRINT_SETTING: MarkdownPrintPreferences = DEFAULT_MARKDOWN_PRINT_PREFERENCES
export const AUTO_SAVE_MIN_INTERVAL_SECONDS = 30
export const AUTO_SAVE_MAX_INTERVAL_SECONDS = 600
export const AUTO_SAVE_INTERVAL_STEP_SECONDS = 30
export const DEFAULT_AUTO_SAVE_INTERVAL_SECONDS = 30

export interface AutoSaveSettings {
  enabled: boolean
  intervalSeconds: number
}

export const DEFAULT_AUTO_SAVE_SETTINGS: AutoSaveSettings = {
  enabled: false,
  intervalSeconds: DEFAULT_AUTO_SAVE_INTERVAL_SECONDS,
}

export function normalizeAutoSaveIntervalSeconds(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_SAVE_INTERVAL_SECONDS

  const clamped = Math.min(
    AUTO_SAVE_MAX_INTERVAL_SECONDS,
    Math.max(AUTO_SAVE_MIN_INTERVAL_SECONDS, Math.round(value!)),
  )

  return Math.round(clamped / AUTO_SAVE_INTERVAL_STEP_SECONDS) * AUTO_SAVE_INTERVAL_STEP_SECONDS
}

/**
 * 统一的状态存储工具类
 */
export class StateStorage {
  /**
   * 保存 UI 状态
   */
  static saveUIState(state: Partial<UIState>): void {
    try {
      const current = this.loadUIState()
      const merged = { ...current, ...state }
      localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(merged))
    } catch (error) {
      console.error('Failed to save UI state:', error)
    }
  }

  /**
   * 加载 UI 状态
   */
  static loadUIState(): UIState {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.UI_STATE)
      if (saved) {
        return { ...DEFAULT_UI_STATE, ...JSON.parse(saved) }
      }
    } catch (error) {
      console.error('Failed to load UI state:', error)
    }
    return DEFAULT_UI_STATE
  }

  /**
   * 保存编辑设置
   */
  static saveEditSetting(setting: Partial<EditSetting>): void {
    try {
      const current = this.loadEditSetting()
      const merged = { ...current, ...setting }
      localStorage.setItem(STORAGE_KEYS.EDIT_SETTING, JSON.stringify(merged))
    } catch (error) {
      console.error('Failed to save edit setting:', error)
    }
  }

  /**
   * 加载编辑设置
   */
  static loadEditSetting(): EditSetting {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EDIT_SETTING)
      if (saved) {
        return { ...DEFAULT_EDIT_SETTING, ...JSON.parse(saved) }
      }
    } catch (error) {
      console.error('Failed to load edit setting:', error)
    }
    return DEFAULT_EDIT_SETTING
  }

  static saveExportSetting(setting: Partial<ExportSettings>): void {
    try {
      const current = this.loadExportSetting()
      const merged: ExportSettings = {
        ...current,
        ...setting,
        common: {
          ...current.common,
          ...(setting.common ?? {}),
        },
        formats: {
          ...current.formats,
          ...(setting.formats ?? {}),
        },
      }
      localStorage.setItem(STORAGE_KEYS.EXPORT_SETTING, JSON.stringify(merged))
    } catch (error) {
      console.error('Failed to save export setting:', error)
    }
  }

  static loadExportSetting(): ExportSettings {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EXPORT_SETTING)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...DEFAULT_EXPORT_SETTING,
          ...parsed,
          common: {
            ...DEFAULT_EXPORT_SETTING.common,
            ...(parsed.common ?? {}),
          },
          formats: {
            ...DEFAULT_EXPORT_SETTING.formats,
            ...(parsed.formats ?? {}),
          },
        }
      }
    } catch (error) {
      console.error('Failed to load export setting:', error)
    }
    return DEFAULT_EXPORT_SETTING
  }

  static saveMarkdownPrintSetting(setting: MarkdownPrintPreferences): void {
    try {
      // Overwrite, not merge: `setting` is the canonical full state from the
      // store, already produced by `deriveMarkdownPrintOverrides`. Merging
      // would resurrect overrides the user just removed.
      // `setting` may be a Vue reactive proxy; JSON round-trip strips the
      // proxy wrapper so the data is safe to persist.
      const payload: MarkdownPrintPreferences = JSON.parse(JSON.stringify({
        themeAssignment: setting.themeAssignment,
        printOverrides: setting.printOverrides ?? {},
      }))
      localStorage.setItem(STORAGE_KEYS.MARKDOWN_PRINT_SETTING, JSON.stringify(payload))
    } catch (error) {
      console.error('Failed to save markdown print setting:', error)
    }
  }

  static loadMarkdownPrintSetting(): MarkdownPrintPreferences {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MARKDOWN_PRINT_SETTING)
      if (saved) {
        const parsed = JSON.parse(saved)
        const legacyOverrides = 'printOverrides' in parsed
          ? {}
          : {
            pageSetup: parsed.pageSetup ?? {},
            pagination: parsed.pagination ?? {},
            headerFooter: parsed.headerFooter ?? {},
            runningTitle: parsed.runningTitle ?? {},
          }
        return {
          ...DEFAULT_MARKDOWN_PRINT_SETTING,
          ...parsed,
          themeAssignment: {
            ...DEFAULT_MARKDOWN_PRINT_SETTING.themeAssignment,
            ...(parsed.themeAssignment ?? {}),
          },
          printOverrides: {
            ...DEFAULT_MARKDOWN_PRINT_SETTING.printOverrides,
            ...legacyOverrides,
            ...(parsed.printOverrides ?? {}),
            pageSetup: {
              ...(legacyOverrides.pageSetup ?? {}),
              ...(parsed.printOverrides?.pageSetup ?? {}),
            },
            pagination: {
              ...(legacyOverrides.pagination ?? {}),
              ...(parsed.printOverrides?.pagination ?? {}),
              keepWithNext: {
                ...(legacyOverrides.pagination?.keepWithNext ?? {}),
                ...(parsed.printOverrides?.pagination?.keepWithNext ?? {}),
              },
              avoidBreakInside: {
                ...(legacyOverrides.pagination?.avoidBreakInside ?? {}),
                ...(parsed.printOverrides?.pagination?.avoidBreakInside ?? {}),
              },
            },
            headerFooter: {
              ...(legacyOverrides.headerFooter ?? {}),
              ...(parsed.printOverrides?.headerFooter ?? {}),
              slots: {
                ...(legacyOverrides.headerFooter?.slots ?? {}),
                ...(parsed.printOverrides?.headerFooter?.slots ?? {}),
              },
              firstPageSlots: {
                ...(legacyOverrides.headerFooter?.firstPageSlots ?? {}),
                ...(parsed.printOverrides?.headerFooter?.firstPageSlots ?? {}),
              },
              leftPageSlots: {
                ...(legacyOverrides.headerFooter?.leftPageSlots ?? {}),
                ...(parsed.printOverrides?.headerFooter?.leftPageSlots ?? {}),
              },
              rightPageSlots: {
                ...(legacyOverrides.headerFooter?.rightPageSlots ?? {}),
                ...(parsed.printOverrides?.headerFooter?.rightPageSlots ?? {}),
              },
            },
            runningTitle: {
              ...(legacyOverrides.runningTitle ?? {}),
              ...(parsed.printOverrides?.runningTitle ?? {}),
            },
          },
        }
      }
    } catch (error) {
      console.error('Failed to load markdown print setting:', error)
    }
    return DEFAULT_MARKDOWN_PRINT_SETTING
  }

  /**
   * 保存工作区状态
   */
  static saveWorkspaceState(state: Partial<WorkspaceState>): void {
    try {
      const current = this.loadWorkspaceState()
      const merged = { ...current, ...state }
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_STATE, JSON.stringify(merged))
    } catch (error) {
      console.error('Failed to save workspace state:', error)
    }
  }

  /**
   * 加载工作区状态
   */
  static loadWorkspaceState(): WorkspaceState {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WORKSPACE_STATE)
      if (saved) {
        return { ...DEFAULT_WORKSPACE_STATE, ...JSON.parse(saved) }
      }
    } catch (error) {
      console.error('Failed to load workspace state:', error)
    }
    return DEFAULT_WORKSPACE_STATE
  }

  /**
   * 保存主题
   */
  static saveTheme(themeId: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, themeId)
    } catch (error) {
      console.error('Failed to save theme:', error)
    }
  }

  /**
   * 加载主题
   */
  static loadTheme(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.THEME) || 'system'
    } catch (error) {
      console.error('Failed to load theme:', error)
      return 'system'
    }
  }

  /**
   * 保存语言设置
   */
  static saveLocale(locale: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LOCALE, locale)
    } catch (error) {
      console.error('Failed to save locale:', error)
    }
  }

  /**
   * 加载语言设置
   */
  static loadLocale(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.LOCALE)
    } catch (error) {
      console.error('Failed to load locale:', error)
      return null
    }
  }

  /**
   * 保存自动保存设置
   */
  static saveAutoSave(settings: AutoSaveSettings): void {
    try {
      localStorage.setItem(
        STORAGE_KEYS.AUTO_SAVE,
        JSON.stringify({
          enabled: settings.enabled,
          intervalSeconds: normalizeAutoSaveIntervalSeconds(settings.intervalSeconds),
        } satisfies AutoSaveSettings),
      )
    } catch (error) {
      console.error('Failed to save auto-save state:', error)
    }
  }

  /**
   * 加载自动保存设置
   */
  static loadAutoSave(): AutoSaveSettings {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTO_SAVE)
      if (saved !== null) {
        const parsed = JSON.parse(saved) as boolean | Partial<AutoSaveSettings>
        if (typeof parsed === 'boolean') {
          return {
            enabled: parsed,
            intervalSeconds: DEFAULT_AUTO_SAVE_INTERVAL_SECONDS,
          }
        }

        return {
          enabled: parsed.enabled ?? DEFAULT_AUTO_SAVE_SETTINGS.enabled,
          intervalSeconds: normalizeAutoSaveIntervalSeconds(parsed.intervalSeconds),
        }
      }
    } catch (error) {
      console.error('Failed to load auto-save state:', error)
    }
    return { ...DEFAULT_AUTO_SAVE_SETTINGS }
  }

  /**
   * 保存搜索历史
   */
  static saveSearchHistory(key: string, history: string[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(history))
    } catch (error) {
      console.error('Failed to save search history:', error)
    }
  }

  /**
   * 加载搜索历史
   */
  static loadSearchHistory(key: string): string[] {
    try {
      const saved = localStorage.getItem(key)
      if (saved) return JSON.parse(saved)
    } catch (error) {
      console.error('Failed to load search history:', error)
    }
    return []
  }

  /**
   * 清除所有状态（用于重置）
   */
  static clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
  }
}
