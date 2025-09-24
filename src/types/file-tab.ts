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
  documentType?: import('@/types/document-type').DocumentType;
  metadata?: FileMetadata
  tocProvider?: import('@/types/toc').TocProvider
  editorStats?: import('@/types/editor-stats').EditorStats
  lineEnding?: 'LF' | 'CRLF'
  firstLineIndent?: boolean
  smartPunctuation?: boolean
  editorInstance?: any
  savedCheckPoint?: number
}
