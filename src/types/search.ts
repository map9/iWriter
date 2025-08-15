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
