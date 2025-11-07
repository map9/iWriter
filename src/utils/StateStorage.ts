import type { EditSetting } from '@/types'
import { SidebarMode, DocumentType } from '@/types'

// Storage Keys
export const STORAGE_KEYS = {
  THEME: 'iwriter-theme',
  SEARCH_CONFIG: 'iwriter-search-in-files-config',
  UI_STATE: 'iwriter-ui-state',
  EDIT_SETTING: 'iwriter-edit-setting',
  WORKSPACE_STATE: 'iwriter-workspace-state'
} as const

// 类型定义
export interface UIState {
  isLeftSidebarVisible: boolean
  isRightSidebarVisible: boolean
  isStatusbarVisible: boolean
  leftSidebarMode: SidebarMode
  leftSidebarWidth: number
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
  leftSidebarMode: SidebarMode.START,
  leftSidebarWidth: 288
}

export const DEFAULT_EDIT_SETTING: EditSetting = {
  autoSave: true,
  lineEnding: 'LF',
  invisibleCharacters: true,
  firstLineIndent: true,
  smartPunctuation: true,
  showProofreadErrors: true,
  proofread: true
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  currentFolder: null,
  tabs: [],
  activeTabPath: null
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
   * 清除所有状态（用于重置）
   */
  static clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
  }
}
