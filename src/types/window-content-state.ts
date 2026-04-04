// 应用配置接口
export interface AppConfig {
  autoSave: boolean
  autoSaveInterval: number
  fileSystemWatchEnabled: boolean
  fileSystemWatchInterval: number
  maxRecentFiles: number
}

// 侧边栏模式枚举
export enum SidebarMode {
  START = 'start',
  EXPLORER = 'explorer',
  SEARCH = 'search',
  TAG = 'tag',
  TOC = 'toc'
}

// View UI 状态接口
export interface ViewState {
  leftSidebar?: boolean
  rightSidebar?: boolean
  statusbar?: boolean
  cleanMode?: boolean
  isFullscreen?: boolean
  theme?: string // 支持任意主题ID
  themeType?: 'light' | 'dark' | 'system' // 主题类型
}

export interface UndoRedoState {
  undo: boolean
  redo: boolean
}

export interface ParagraphStateListData {
  canSink: boolean
  canLift: boolean
}

export interface ParagraphStateTaskListData {
  canSink: boolean
  canLift: boolean
  checked: boolean
}

export interface ParagraphStateTableData {
  hasHeaderRow: boolean
  hasHeaderColumn: boolean
  canMoveLeft: boolean
  canMoveAbove: boolean
  canMoveRight: boolean
  canMoveBelow: boolean
}

// 文字内容类型信息
export interface ParagraphState {
  type?: string | number
  data?: ParagraphStateListData | ParagraphStateTaskListData | ParagraphStateTableData
}

// 文字内容格式化状态接口
export interface FormattingState {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  textAlign: string
  script: 'superscript' | 'subscript' | 'none',
  highlight: boolean,
  inlineCode: boolean
}

// 窗口内容信息接口
export interface WindowContentState {
  autoSave?: boolean
  hasFolderOpen?: boolean
  hasActiveDocument?: boolean
  type?: import('@/types/document-type').DocumentType
  hasSelection?: boolean
  undoRedo?: UndoRedoState
  edit?: import('@/types/edit-setting').EditSetting
  content?: ParagraphState
  formatting?: FormattingState
  view?: ViewState
}
