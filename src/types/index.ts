// 通知类型枚举
export enum NotificationType {
  SUCCESS = 'success',
  INFORMATION = 'information', 
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// 通用通知接口
export interface Notification {
  type: NotificationType
  message: string
  details?: string
  context?: string
  timestamp: Date
  duration?: number  // 自定义显示时长，毫秒
}

// 上下文菜单项接口
export interface ContextMenuItem {
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  enabled?: boolean
  visible?: boolean
  checked?: boolean
  submenu?: ContextMenuItem[]
  accelerator?: string
  role?: string
}

// 支持的文档格式
export const TEXT_EXTENSIONS = ['md', 'markdown', 'txt', 'iwt'] as const
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'] as const
export const PDF_EXTENSIONS = ['pdf'] as const
export const CODE_EXTENSIONS = ['js', 'mjs', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'] as const
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] as const
export const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'] as const

// 文档类型枚举
export enum DocumentType {
  TEXT_EDITOR = 'text-editor',
  PDF_VIEWER = 'pdf-viewer',
  IMAGE_VIEWER = 'image-viewer',
  UNKNOWN = 'unknown'
}

// 文档元数据接口
export interface FileMetadata {
  size: number
  created: Date
  modified: Date
  wordCount?: number
  characterCount?: number
  tags?: string[]
}

// 文件标签页接口
export interface FileTab {
  id: string
  name: string
  path?: string
  content: string
  isDirty: boolean
  isActive: boolean
  documentType?: DocumentType
  metadata?: FileMetadata
  tocProvider?: import('@/types/toc').TocProvider
}

// 文件操作类型枚举
export enum FileOperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  RENAME = 'rename',
  MOVE = 'move',
  COPY = 'copy'
}

// 文件操作结果接口
export interface FileOperationResult {
  success: boolean
  conflictAction: 'keepBoth' | 'replace' | 'cancel'
  newPath: string
}

// 文件信息接口
export interface FileInfo {
  name: string
  isDirectory: boolean
  path: string
  size?: number
  created?: Date
  modified?: Date
  accessed?: Date
  changed?: Date
}

// 文件变化接口
export interface FileChange {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  timestamp: Date
}

// 搜索结果接口
/*
export interface SearchResult {
  file: FileTreeNode
  matches: SearchMatch[]
  totalMatches: number
}
*/

export interface SearchMatch {
  line: number
  column: number
  text: string
  context: string
}

// 搜索选项接口
export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  includeFilePattern?: string
  excludeFilePattern?: string
}

// 侧边栏模式枚举
export enum SidebarMode {
  START = 'start',
  EXPLORER = 'explorer',
  SEARCH = 'search',
  TAG = 'tag',
  TOC = 'toc'
}

// 应用配置接口
export interface AppConfig {
  autoSave: boolean
  autoSaveInterval: number
  fileSystemWatchEnabled: boolean
  fileSystemWatchInterval: number
  maxRecentFiles: number
}

// View UI 状态接口
export interface ViewState {
  leftSidebar?: boolean
  rightSidebar?: boolean
  statusbar?: boolean
  isFullscreen?: boolean
  theme?: 'light' | 'dark' | 'auto'
}

export interface UndoRedoState {
  undo: boolean
  redo: boolean
}

// 文字内容类型信息
export interface ContentState {
  type?: string | number
  canSink?: boolean
  canLift?: boolean
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
export interface WindowContentInfo {
  type: DocumentType
  hasFolderOpen?: boolean
  hasActiveDocument?: boolean
  hasSelection?: boolean
  view?: ViewState
  undoRedo?: UndoRedoState
  contentState?: ContentState
  formatting?: FormattingState
}

// Electron API 接口
export interface ElectronAPI {
  platform: string
    
  // 文件操作
  openFolder: () => Promise<string | null>
  openFile: () => Promise<string | null>
  saveFile: (content: string, filePath?: string) => Promise<string | null>
  readFile: (filePath: string) => Promise<string | null>
  readFileBinary: (filePath: string) => Promise<string | null>
  getFiles: (folderPath: string, onlyself?: boolean) => Promise<FileInfo[]>
  
  // 文件系统操作
  createFile: (folderPath: string, fileName: string) => Promise<string>
  createFolder: (parentPath: string, folderName: string) => Promise<string>
  deleteFile: (filePath: string) => Promise<boolean>
  renameFile: (oldPath: string, newName: string) => Promise<string>
  moveFile: (sourcePath: string, targetDir: string) => Promise<FileOperationResult>
  
  // 窗口控制
  close: () => void
  updateWindowTitle: (title: string) => Promise<{ success: boolean; error?: string }>
  
  // 菜单操作
  onMenuAction: (callback: (action: string) => void) => void
  removeMenuActionListener: () => void
  
  // 对话框
  showSaveDialog: (fileName: string) => Promise<'save' | 'dontSave' | 'cancel'>
  
  // 窗口状态
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => void
  
  // 设置
  setAutoSave: (enabled: boolean) => Promise<void>
  windowContentChange: (contentInfo: any) => Promise<void>
  
  // 文件监听
  startFileWatching: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
  stopFileWatching: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
  stopAllFileWatching: () => Promise<{ success: boolean; error?: string }>
  getFileWatchingStatus: () => Promise<{ watchedPaths: string[]; totalWatchers: number }>
  
  // 文件变化事件
  onFileChange: (callback: (change: FileChange) => void) => void
  onFileWatchError: (callback: (error: { message: string; path: string; timestamp: Date }) => void) => void
  removeFileChangeListeners: () => void
  
  // 原生上下文菜单
  showContextMenu: (menuItems: ContextMenuItem[], position: { x: number; y: number }) => Promise<string | null>
  
  // 在系统文件管理器中显示文件或文件夹
  revealInFolder: (path: string) => Promise<void>
  
  // 使用系统默认应用程序打开文件
  openWithShell: (path: string) => Promise<void>
}

// 标签接口
export interface Tag {
  name: string
  count: number
  files: string[]
}

// 目录项接口
export interface TocItem {
  id: string
  level: number
  text: string
  anchor: string
  line?: number
  isActive?: boolean
}

export {}