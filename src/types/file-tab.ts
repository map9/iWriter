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

// 文件标签页接口
export interface FileTab {
  id: string
  name: string
  path?: string
  documentType?: import('@/types/document-type').DocumentType;
  pendingImport?: {
    markdown: string
    sourcePath?: string
  }
  metadata?: FileMetadata
  isActive: boolean
  isDirty: boolean
  editorInstance?: unknown
  savedCheckPoint?: number
  tocProvider?: import('@/types/toc').TocProvider
  fileStats?: import('@/types/file-stats').FileStats
  editState?: import('@/types/edit-setting').EditSetting
  fileReadonly?: boolean
  editReadonly?: boolean
  lastSavedHash?: string
  diskState?: DocumentDiskState
}
