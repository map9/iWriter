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

// 跨文件搜索相关类型定义

/**
 * 文件中的搜索匹配项
 */
export interface SearchMatchInFile {
  line: number           // 行号（从 1 开始）
  column: number         // 列号（从 0 开始，匹配在原始行中的起始位置）
  text: string           // 匹配的原始文本
  contextHtml: string    // 包含高亮的 HTML 片段，格式: "...前文<mark>匹配</mark>后文..."
}

/**
 * 文件搜索结果
 */
export interface FileSearchResult {
  filePath: string                 // 文件完整路径
  fileName: string                 // 文件名
  relativePath: string             // 相对于搜索根目录的路径
  matches: SearchMatchInFile[]     // 匹配项列表
  totalMatches: number             // 总匹配数
}

/**
 * 跨文件搜索选项
 */
export interface SearchInFolderOptions {
  folderPath: string               // 搜索的根目录
  searchTerm: string               // 搜索词
  options: SearchOptions           // 搜索选项
  includePattern?: string          // 包含文件模式（glob）
  excludePattern?: string          // 排除文件模式（glob）
  maxResults?: number              // 最大结果数限制
  searchInOpenEditorsOnly?: boolean // 仅在打开的编辑器中搜索
}

/**
 * 替换结果
 */
export interface ReplaceResult {
  success: boolean                 // 是否成功
  filesModified: number            // 修改的文件数
  totalReplacements: number        // 总替换数
  errors?: Array<{                 // 错误列表
    file: string
    error: string
  }>
}
