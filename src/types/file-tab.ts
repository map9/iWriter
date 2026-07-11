// 文档元数据接口
export interface FileMetadata {
  size: number
  created: Date
  modified: Date
  wordCount?: number
  characterCount?: number
  tags?: string[]
}

export type DocumentDiskState = 'normal' | 'external-modified' | 'deleted'

/**
 * 参数型 tab 的载荷（非文件型 tab 携带的规格，如 diff）。
 * 由具体 tab 类型扩展。
 */
export type TabParams = { kind: 'diff'; diff: import('@/types/git').DiffSpec }

/**
 * 文档编辑态（L3）：仅可编辑编辑器（markdown）填充；viewer/diff/welcome 恒为 undefined。
 * 见 design/tab view refactor/TAB_VIEW_REFACTOR.md §3.2。
 */
export interface MarkdownDocState {
  /** TipTap Editor 实例 */
  editorInstance?: unknown
  /** undoDepth 基准，用于 dirty 判断 */
  savedCheckPoint?: number
  /** per-tab 编辑设置（行尾/首行缩进/校对等） */
  editState?: import('@/types/edit-setting').EditSetting
  /** 字数/光标/选区统计 */
  fileStats?: import('@/types/file-stats').FileStats
}

// 文件标签页接口
export interface FileTab {
  // —— L1 通用 ——
  id: string
  name: string
  path?: string
  documentType?: import('@/types/document-type').DocumentType;
  /** 参数型 tab 载荷（diff 等；仿 pendingImport） */
  params?: TabParams
  pendingImport?: {
    markdown: string
    sourcePath?: string
  }
  metadata?: FileMetadata
  isActive: boolean
  isDirty: boolean
  // —— L2 文件态（有 path 时）——
  lastSavedHash?: string
  diskState?: DocumentDiskState
  fileReadonly?: boolean
  editReadonly?: boolean
  // —— 跨层共享（markdown + pdf）——
  tocProvider?: import('@/types/toc').TocProvider
  // —— L3 文档编辑态（收敛，仅 markdown 填充）——
  docState?: MarkdownDocState
}

/**
 * updateTabState 的入参：允许平铺传入 FileTab 顶层字段与 docState 内字段；
 * updateTabState 会把 docState 内字段（editState/editorInstance/savedCheckPoint/fileStats）
 * 路由进 tab.docState，故调用方无需感知嵌套。
 */
export type TabStateUpdate = Partial<Omit<FileTab, 'docState'>> & Partial<MarkdownDocState>
