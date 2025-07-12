// 文档格式枚举
export enum DocumentFormat {
  MARKDOWN = 'md',
  IWRITER = 'iwt',
  TEXT = 'txt',
  PDF = 'pdf',
  IMAGE = 'image'
}

// 文档类型枚举
export enum DocumentType {
  TEXT_EDITOR = 'text-editor',
  PDF_VIEWER = 'pdf-viewer',
  IMAGE_VIEWER = 'image-viewer',
  UNKNOWN = 'unknown'
}

// 支持的图片格式
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'] as const
export const PDF_EXTENSIONS = ['pdf'] as const
export const TEXT_EXTENSIONS = ['md', 'markdown', 'txt', 'iwt'] as const

// 文档元数据接口
export interface DocumentMetadata {
  createdAt: Date
  modifiedAt: Date
  size: number
  wordCount?: number
  characterCount?: number
  tags?: string[]
}

// 文档接口
export interface Document {
  id: string
  title: string
  content: string
  format: DocumentFormat
  path?: string
  metadata: DocumentMetadata
  isDirty: boolean
}

// 文件标签页接口
export interface FileTab {
  id: string
  name: string
  path?: string
  content: string
  isDirty: boolean
  isActive: boolean
  format?: DocumentFormat
  documentType?: DocumentType
  metadata?: DocumentMetadata
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

// UI 状态接口
export interface UIState {
  showLeftSidebar: boolean
  showRightSidebar: boolean
  showStatusbar: boolean
  leftSidebarMode: SidebarMode
  leftSidebarWidth: number
  isFullscreen: boolean
  theme: 'light' | 'dark' | 'auto'
}

// 应用配置接口
export interface AppConfig {
  autoSave: boolean
  autoSaveInterval: number
  fileSystemWatchEnabled: boolean
  fileSystemWatchInterval: number
  maxRecentFiles: number
  defaultDocumentFormat: DocumentFormat
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

// 错误类型枚举
export enum ErrorType {
  FILE_SYSTEM = 'FILE_SYSTEM',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  UNKNOWN = 'UNKNOWN'
}

// 错误严重程度枚举
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 通知类型枚举
export enum NotificationType {
  SUCCESS = 'success',
  INFORMATION = 'information', 
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// 通知严重程度枚举 (映射到 ErrorSeverity 以保持兼容性)
export enum NotificationSeverity {
  SUCCESS = 'success',
  INFO = 'low',           // 映射到 low
  WARNING = 'low',        // 警告映射到 low
  ERROR = 'medium',       // 错误映射到 medium  
  CRITICAL = 'critical'   // 严重映射到 critical
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

// 应用错误接口 (保持向后兼容)
export interface AppError {
  type: ErrorType
  severity: ErrorSeverity
  message: string
  details?: string
  code?: string
  context?: string
  timestamp: Date
  stack?: string
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
}

// 窗口内容信息接口
export interface WindowContentInfo {
  type: ComponentType
  hasActiveDocument?: boolean
  hasFolderOpen?: boolean
  hasSelection?: boolean
  formatting?: FormattingState
}

// 组件类型枚举
export enum ComponentType {
  TIPTAP_EDITOR = 'tiptap-editor',
  IMAGE_EDITOR = 'image-editor',
  EXPLORER = 'explorer'
}

// 格式化状态接口
export interface FormattingState {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  inlineCode: boolean
  heading?: number
}

// AI 聊天消息接口
export interface ChatMessage {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  isTyping?: boolean
}

// AI 模型接口
export interface AIModel {
  id: string
  name: string
  version: string
  description?: string
  isAvailable: boolean
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

// 文件监听器接口
export interface FileWatcher {
  path: string
  isWatching: boolean
  lastCheck: Date
  onChange: (changes: FileChange[]) => void
  onError: (error: AppError) => void
}

// 文件变化接口
export interface FileChange {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  timestamp: Date
}

// 文档编辑器基础接口
export interface DocumentEditor {
  readonly id: string
  readonly type: DocumentType
  readonly element: HTMLElement | null
  
  // 基础操作
  mount(container: HTMLElement): void
  unmount(): void
  focus(): void
  destroy(): void
  
  // 内容操作
  getContent(): string | ArrayBuffer | null
  setContent(content: string | ArrayBuffer): void
  isEmpty(): boolean
  
  // 状态管理
  isDirty(): boolean
  markClean(): void
  markDirty(): void
  
  // 事件处理
  onContentChange?(callback: (content: string | ArrayBuffer) => void): void
  onStateChange?(callback: (state: any) => void): void
  
  // 编辑器实例（用于工具栏访问）
  editor?: any
}

// 文本编辑器接口（继承基础编辑器）
export interface TextEditor extends DocumentEditor {
  readonly type: DocumentType.TEXT_EDITOR
  
  // 文本特有操作
  getSelectedText(): string
  replaceSelection(text: string): void
  
  // 格式化操作
  toggleBold?(): void
  toggleItalic?(): void
  toggleUnderline?(): void
  insertHeading?(level: number): void
  insertList?(type: 'bullet' | 'ordered'): void
  
  // 查找替换
  find?(query: string): void
  replace?(query: string, replacement: string): void
}

// PDF 查看器接口
export interface PDFViewer extends DocumentEditor {
  readonly type: DocumentType.PDF_VIEWER
  
  // PDF 特有操作
  getCurrentPage(): number
  getTotalPages(): number
  goToPage(page: number): void
  zoomIn(): void
  zoomOut(): void
  setZoom(scale: number): void
  getZoom(): number
}

// 图片查看器接口
export interface ImageViewer extends DocumentEditor {
  readonly type: DocumentType.IMAGE_VIEWER
  
  // 图片特有操作
  getImageDimensions(): { width: number; height: number }
  zoomIn(): void
  zoomOut(): void
  zoomToFit(): void
  setZoom(scale: number): void
  getZoom(): number
  rotate(degrees: number): void
}

// 文档编辑器工厂接口
export interface DocumentEditorFactory {
  createEditor(type: DocumentType, options?: any): DocumentEditor
  canHandle(type: DocumentType): boolean
  getSupportedTypes(): DocumentType[]
}

// 文档类型检测器接口
export interface DocumentTypeDetector {
  detectFromPath(filePath: string): DocumentType
  detectFromExtension(extension: string): DocumentType
  detectFromMimeType(mimeType: string): DocumentType
  getSupportedExtensions(): string[]
}

// 菜单动作上下文接口
export interface MenuActionContext {
  documentType: DocumentType
  editor?: DocumentEditor
  hasSelection?: boolean
  canUndo?: boolean
  canRedo?: boolean
  formatting?: FormattingState
}

// 文档页面状态接口
export interface DocumentPageState {
  activeTabId: string | null
  editors: Map<string, DocumentEditor>
  loadingTabs: Set<string>
  errorTabs: Map<string, string>
}

export {}