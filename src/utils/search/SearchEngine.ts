/**
 * 搜索引擎 - 提供纯文本搜索和替换功能
 * 可被文档内搜索和跨文件搜索复用
 */

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface SearchMatch {
  index: number      // 在文本中的起始位置
  length: number     // 匹配长度
  text: string       // 匹配的文本
}

export class SearchEngine {
  /**
   * 在文本中搜索所有匹配项
   * @param text - 要搜索的文本
   * @param searchTerm - 搜索词
   * @param options - 搜索选项
   * @returns 匹配结果数组
   */
  static findAll(
    text: string,
    searchTerm: string,
    options: SearchOptions
  ): SearchMatch[] {
    if (!searchTerm || !text) return []

    try {
      const pattern = this.buildSearchPattern(searchTerm, options)
      const matches: SearchMatch[] = []
      let match: RegExpExecArray | null

      // 防止无限循环
      let iterationCount = 0
      const maxIterations = 10000

      while ((match = pattern.exec(text)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          text: match[0]
        })

        // 防止零宽度匹配导致无限循环
        if (match[0].length === 0) {
          pattern.lastIndex++
        }

        iterationCount++
        if (iterationCount > maxIterations) {
          console.warn('Search iteration limit reached')
          break
        }
      }

      return matches
    } catch (error) {
      console.error('Search error:', error)
      return []
    }
  }

  /**
   * 构建搜索正则表达式
   */
  static buildSearchPattern(
    searchTerm: string,
    options: SearchOptions
  ): RegExp {
    let pattern = searchTerm

    // 如果不是正则模式，转义特殊字符
    if (!options.regex) {
      pattern = this.escapeRegExp(pattern)
    }

    // 全词匹配
    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`
    }

    const flags = options.caseSensitive ? 'gu' : 'gui'

    try {
      return new RegExp(pattern, flags)
    } catch (error) {
      // 如果正则表达式无效，返回一个永远不匹配的正则
      console.error('Invalid regex pattern:', error)
      return /(?!)/g // 永远不匹配的正则表达式
    }
  }

  /**
   * 转义正则表达式特殊字符
   */
  private static escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * 执行全部替换操作
   * @returns 替换后的文本
   */
  static replaceAll(
    text: string,
    searchTerm: string,
    replaceTerm: string,
    options: SearchOptions
  ): string {
    if (!searchTerm || !text) return text

    try {
      const pattern = this.buildSearchPattern(searchTerm, options)
      return text.replace(pattern, replaceTerm)
    } catch (error) {
      console.error('Replace error:', error)
      return text
    }
  }

  /**
   * 替换指定匹配项
   */
  static replaceMatch(
    text: string,
    match: SearchMatch,
    replaceTerm: string
  ): string {
    return (
      text.substring(0, match.index) +
      replaceTerm +
      text.substring(match.index + match.length)
    )
  }

  /**
   * 验证正则表达式是否有效
   */
  static isValidRegex(pattern: string): boolean {
    try {
      new RegExp(pattern)
      return true
    } catch {
      return false
    }
  }
}
