import type { SearchOptions } from '@/utils/search/SearchEngine'
import type { DecorationSet } from '@tiptap/pm/view'
import type { Range } from '@tiptap/core'

/**
 * 搜索替换扩展选项
 */
export interface SearchReplaceOptions {
  /**
   * 最大匹配数限制（防止性能问题）
   */
  maxMatches: number

  /**
   * 搜索防抖时间（毫秒）
   */
  debounceTime: number

  /**
   * 当前匹配的 CSS 类名
   */
  currentMatchClass: string

  /**
   * 其他匹配的 CSS 类名
   */
  otherMatchClass: string
}

/**
 * 搜索替换扩展存储状态
 */
export interface SearchReplaceStorage {
  /**
   * 搜索框是否打开
   */
  isOpen: boolean

  /**
   * 当前模式
   */
  mode: 'search' | 'replace'

  /**
   * 搜索词
   */
  searchTerm: string

  /**
   * 替换词
   */
  replaceTerm: string

  /**
   * 搜索选项
   */
  options: SearchOptions

  /**
   * 上一个搜索词
   */
  lastSearchTerm: string | null

  /**
   * 上一个搜索选项
   */
  lastOptions: SearchOptions | null

  /**
   * 匹配结果
   */
  matches: Range[]

  /**
   * 当前匹配索引
   */
  currentMatchIndex: number

  /**
   * 装饰器集合
   */
  decorationSet: DecorationSet

  /**
   * 防抖定时器
   */
  debounceTimer: ReturnType<typeof setTimeout> | null

  /**
   * 是否在选区内搜索
   */
  searchInSelection: boolean

  /**
   * 原始选区范围
   */
  selectionRange: Range | null
}
