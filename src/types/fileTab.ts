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
  isDirty: boolean
  isActive: boolean
  documentType?: DocumentType
  metadata?: FileMetadata
  tocProvider?: import('@/types/toc').TocProvider
  editorStats?: import('@/types/editorStats').EditorStats
  editorInstance?: any
}
