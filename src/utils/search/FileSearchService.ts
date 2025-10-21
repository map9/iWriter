/**
 * 文件搜索服务 - 提供跨文件搜索功能
 */

import type { FileSearchResult, SearchInFolderOptions } from '@/types/search'

export class FileSearchService {
  /**
   * 在文件夹中搜索
   * @param options 搜索选项
   * @returns 搜索结果数组
   */
  static async searchInFolder(
    options: SearchInFolderOptions
  ): Promise<FileSearchResult[]> {
    if (!window.electronAPI?.searchInFiles) {
      console.error('searchInFiles API not available')
      return []
    }

    try {
      const results = await window.electronAPI.searchInFiles(options)
      return results as FileSearchResult[]
    } catch (error) {
      console.error('Error searching in files:', error)
      throw error
    }
  }

  /**
   * 构建搜索结果的摘要信息
   */
  static getSummary(results: FileSearchResult[]): {
    totalFiles: number
    totalMatches: number
  } {
    return {
      totalFiles: results.length,
      totalMatches: results.reduce((sum, file) => sum + file.totalMatches, 0)
    }
  }

  /**
   * 高亮匹配文本
   * @param text 原始文本
   * @param searchTerm 搜索词
   * @param caseSensitive 是否大小写敏感
   * @returns 包含高亮标记的 HTML 字符串
   */
  static highlightMatches(
    text: string,
    searchTerm: string,
    caseSensitive: boolean = false
  ): string {
    if (!searchTerm) return text

    try {
      // 转义特殊字符
      const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const flags = caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(escapedTerm, flags)

      return text.replace(regex, (match) => `<mark>${match}</mark>`)
    } catch (error) {
      console.error('Error highlighting matches:', error)
      return text
    }
  }
}
