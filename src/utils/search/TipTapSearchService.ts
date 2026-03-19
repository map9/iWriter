/**
 * TipTap 统一搜索服务
 * 使用 TipTap/ProseMirror 引擎进行跨文件搜索和替换
 */

import { Editor, generateJSON } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { findMatchesInDocument } from '@/components/common/tiptap/iw-search-replace/engine/SearchReplace'
import { goToSelection } from '@/components/common/tiptap/iw-search-replace/utils/gotoSelection'
import { updateSearch } from '@/components/common/tiptap/iw-search-replace/plugin/iwSearchReplacePlugin'
import { convertContentFrom, convertContentTo } from '@/import-export'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import { TEXT_EXTENSIONS, type FileTab } from '@/types'
import { pathUtils } from '@/utils/pathUtils'
import { createBaseExtensions } from '@/utils/editorExtensions'

const { detectFromPath } = useDocumentTypeDetector()

export interface TipTapSearchMatch {
  position: { from: number; to: number }
  text: string
  contextHtml: string
}

export interface TipTapSearchResult {
  filePath: string
  fileName: string
  relativePath: string
  documentType: string
  matches: TipTapSearchMatch[]
  totalMatches: number
  // 内部缓存（用于替换）
  _proseMirrorDoc?: ProseMirrorNode
  _fileContent?: string
  _lineEnding?: 'LF' | 'CRLF'
}

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export class TipTapSearchService {
  /**
   * 单例搜索引擎（用于获取 extensions 和 schema）
   */
  private static searchEngine: Editor | null = null

  /**
   * 获取或创建搜索引擎实例
   */
  private static getSearchEngine(): Editor {
    if (!this.searchEngine) {
      this.searchEngine = new Editor({
        content: '',
        extensions: createBaseExtensions()
      })
    }
    return this.searchEngine
  }

  /**
   * 销毁搜索引擎（可选，用于释放资源）
   */
  static destroySearchEngine(): void {
    if (this.searchEngine) {
      this.searchEngine.destroy()
      this.searchEngine = null
    }
  }

  /**
   * 跨文件搜索（workspace-wide）
   * 在渲染进程执行，使用 TipTap 引擎
   */
  static async searchInWorkspace(
    folderPath: string,
    searchTerm: string,
    options: SearchOptions,
    includePattern?: string,
    excludePattern?: string,
    maxResults: number = 10000,
    openTabs?: FileTab[],
    onProgress?: (current: number, total: number) => void
  ): Promise<TipTapSearchResult[]> {
    if (!window.electronAPI) throw new Error('Electron API not available')
    if (!searchTerm) return []

    // 1. 获取所有可搜索文件
    const allFiles = await this.getSearchableFiles(
      folderPath,
      includePattern,
      excludePattern
    )

    if (allFiles.length === 0) return []

    const results: TipTapSearchResult[] = []
    let totalMatchesCount = 0

    // 2. 分批处理文件（每批 20 个，避免内存峰值）
    const BATCH_SIZE = 20
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      if (totalMatchesCount >= maxResults) break

      const batch = allFiles.slice(i, i + BATCH_SIZE)

      // 3. 并行处理批次内的文件
      const batchResults = await Promise.all(
        batch.map(filePath =>
          this.searchInSingleFile(
            filePath,
            folderPath,
            searchTerm,
            options,
            maxResults - totalMatchesCount,
            openTabs
          )
        )
      )

      // 4. 收集结果
      for (const result of batchResults) {
        if (result && result.totalMatches > 0) {
          results.push(result)
          totalMatchesCount += result.totalMatches
        }
      }

      // 5. 报告进度
      onProgress?.(Math.min(i + BATCH_SIZE, allFiles.length), allFiles.length)

      // 6. 让出控制权（避免阻塞 UI）
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    return results
  }

  /**
   * 单个文件搜索（公开接口，供差分更新使用）
   */
  static async searchInSingleFilePublic(
    filePath: string,
    folderPath: string,
    searchTerm: string,
    options: SearchOptions,
    maxMatches: number = 10000,
    openTabs?: FileTab[]
  ): Promise<TipTapSearchResult | null> {
    return this.searchInSingleFile(
      filePath,
      folderPath,
      searchTerm,
      options,
      maxMatches,
      openTabs
    )
  }

  /**
   * 单个文件搜索（核心逻辑）
   */
  private static async searchInSingleFile(
    filePath: string,
    folderPath: string,
    searchTerm: string,
    options: SearchOptions,
    maxMatches: number,
    openTabs?: FileTab[]
  ): Promise<TipTapSearchResult | null> {
    try {
      let doc: ProseMirrorNode
      let content: string
      let lineEnding: 'LF' | 'CRLF' = 'LF'

      // 优先使用打开的编辑器内容
      const openTab = openTabs?.find(tab => tab.path === filePath)
      if (openTab?.editorInstance) {
        const editor = openTab.editorInstance as Editor
        doc = editor.state.doc
        content = editor.getText()
        lineEnding = openTab.editState?.lineEnding || 'LF'
      } else {
        // 从磁盘读取（原有逻辑）
        const fileContent = await window.electronAPI.readFile(filePath)
        if (!fileContent) return null
        content = fileContent

        const extension = pathUtils.extension(filePath)
        const converted = await convertContentFrom(content, extension)
        if (!converted) return null

        // 获取搜索引擎的 extensions
        const extensions = this.getSearchEngine().extensionManager.extensions

        // 生成 ProseMirror JSON，然后创建 Doc
        const json = generateJSON(converted.content, extensions)
        doc = this.getSearchEngine().schema.nodeFromJSON(json)
        lineEnding = converted.lineEnding
      }

      // 使用 TipTap 引擎搜索
      const matches = findMatchesInDocument(doc, searchTerm, options)

      if (matches.length === 0) return null

      // 限制匹配数量
      const limitedMatches = matches.slice(0, maxMatches)

      // 提取上下文
      const matchesWithContext = limitedMatches.map(match => ({
        position: { from: match.from, to: match.to },
        text: doc.textBetween(match.from, match.to),
        contextHtml: this.extractContextHtml(doc, match.from, match.to)
      }))

      return {
        filePath,
        fileName: pathUtils.basename(filePath),
        relativePath: filePath.startsWith(folderPath)
          ? filePath.slice(folderPath.length).replace(/^\//, '')
          : filePath,
        documentType: detectFromPath(filePath),
        matches: matchesWithContext,
        totalMatches: matchesWithContext.length,
        // 缓存用于后续替换
        _proseMirrorDoc: doc,
        _fileContent: content,
        _lineEnding: lineEnding
      }
    } catch (error) {
      console.error(`Error searching in file ${filePath}:`, error)
      return null
    }
  }

  /**
   * 提取匹配上下文 HTML
   * 基于段落（paragraph）提取，保持语义完整性
   */
  private static extractContextHtml(
    doc: ProseMirrorNode,
    from: number,
    to: number
  ): string {
    const MAX_CONTEXT_LENGTH = 20 // 单侧最大上下文长度

    // 1. 找到包含匹配的段落节点
    const matchingParagraph = this.findContainingParagraph(doc, from, to)

    if (!matchingParagraph) {
      // 降级：如果找不到段落，使用原始简单提取
      const matchText = doc.textBetween(from, to)
      return `<mark>${this.escapeHtml(matchText)}</mark>`
    }

    const { node: paragraphNode, pos: paragraphStart } = matchingParagraph

    // 2. 提取段落的完整文本
    const paragraphText = paragraphNode.textContent

    // 3. 计算匹配在段落中的相对位置
    const relativeFrom = from - paragraphStart - 1 // -1 因为节点起始位置
    const relativeTo = to - paragraphStart - 1

    // 4. 提取段落内的前后上下文
    const beforeText = paragraphText.substring(0, relativeFrom)
    const matchText = paragraphText.substring(relativeFrom, relativeTo)
    const afterText = paragraphText.substring(relativeTo)

    // 5. 智能截取上下文（如果段落太长）
    let beforeContext = beforeText
    let afterContext = afterText
    let needPrefixEllipsis = false
    let needSuffixEllipsis = false

    // 截取前置上下文
    if (beforeContext.length > MAX_CONTEXT_LENGTH) {
      // 从理想位置开始找语义边界
      const idealStart = beforeContext.length - MAX_CONTEXT_LENGTH
      const searchText = beforeContext.substring(idealStart)
      //const searchText = beforeContext

      const boundaryIndex = this.findSemanticBoundary(searchText, true)
      if (boundaryIndex !== -1) {
        beforeContext = searchText.substring(boundaryIndex + 1)
      } else {
        beforeContext = searchText
      }
      needPrefixEllipsis = true
    }

    // 截取后置上下文
    if (afterContext.length > MAX_CONTEXT_LENGTH) {
      const searchText = afterContext.substring(0, MAX_CONTEXT_LENGTH)
      //const searchText = afterContext

      const boundaryIndex = this.findSemanticBoundary(searchText, false)
      if (boundaryIndex !== -1) {
        afterContext = searchText.substring(0, boundaryIndex + 1)
      } else {
        afterContext = searchText
      }
      needSuffixEllipsis = true
    }

    // 6. 组装最终 HTML
    const prefix = needPrefixEllipsis ? '...' : ''
    const suffix = needSuffixEllipsis ? '...' : ''

    return `${prefix} ${this.escapeHtml(beforeContext.trimStart())}<mark>${this.escapeHtml(matchText)}</mark>${this.escapeHtml(afterContext.trimEnd())} ${suffix}`
  }

  /**
   * 查找包含指定位置范围的段落节点
   */
  private static findContainingParagraph(
    doc: ProseMirrorNode,
    from: number,
    to: number
  ): { node: ProseMirrorNode; pos: number } | null {
    let result: { node: ProseMirrorNode; pos: number } | null = null

    doc.descendants((node, pos) => {
      const nodeStart = pos
      const nodeEnd = pos + node.nodeSize

      // 检查是否是段落类型的节点，且包含匹配范围
      if (
        (node.type.name === 'paragraph' || node.type.name === 'heading') &&
        nodeStart <= from &&
        nodeEnd >= to
      ) {
        result = { node, pos }
        return false // 找到后停止遍历
      }

      return true // 继续遍历
    })

    return result
  }

  /**
   * 在文本中查找语义边界
   * @param text 要搜索的文本
   * @param fromEnd 是否从末尾开始查找（用于前置上下文）
   * @returns 边界字符的索引，-1 表示未找到
   */
  private static findSemanticBoundary(text: string, fromEnd: boolean): number {
    const BOUNDARY_CHARS = new Set([
      // 英文标点
      '.', ',', ';', ':', '!', '?',
      '(', ')', '[', ']', '{', '}',
      '"', "'", '`',
      // 中文标点（Unicode）
      '\u3002', '\uFF0C', '\uFF1B', '\uFF1A', '\uFF01', '\uFF1F',
      '\u3001', '\u300A', '\u300B', '\u201C', '\u201D', '\u2018', '\u2019',
      '\uFF08', '\uFF09', '\u3010', '\u3011', '\u300E', '\u300F',
      // 空白字符
      '\t', '\n', '\r'
    ])

    let blankIndex = -1
    if (fromEnd) {
      // 从后往前查找
      for (let i = text.length - 1; i >= 0; i--) {
        const char = text[i]
        if (char) {
          if (BOUNDARY_CHARS.has(char)) return i
          else if (char === ' ' || char === '\u3000') {
            blankIndex = i
          }
        }
      }
    } else {
      // 从前往后查找
      for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (char) {
          if (BOUNDARY_CHARS.has(char)) return i
          else if (char === ' ' || char === '\u3000') {
            blankIndex = i
          }
        }
      }
    }

    if (blankIndex !== -1) return blankIndex
    return -1
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * 获取可搜索的文件列表（递归遍历所有子目录）
   */
  private static async getSearchableFiles(
    folderPath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _includePattern?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _excludePattern?: string
  ): Promise<string[]> {
    return this.getSearchableFilesRecursive(folderPath, _includePattern, _excludePattern, [])
  }

  /**
   * 递归获取目录下所有可搜索的文本文件
   * 参考 app.ts 中的 traverseFileTree 实现
   */
  private static async getSearchableFilesRecursive(
    dirPath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _includePattern?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _excludePattern?: string,
    result: string[] = []
  ): Promise<string[]> {
    if (!window.electronAPI) return result

    try {
      const files = await window.electronAPI.getFiles(dirPath)
      if (!files || !Array.isArray(files)) return result

      // 使用 Promise.all 并行处理所有文件和子目录
      await Promise.all(
        files.map(async (file) => {
          if (file.isDirectory) {
            // 递归处理子目录
            await this.getSearchableFilesRecursive(
              file.path,
              _includePattern,
              _excludePattern,
              result
            )
          } else {
            // 过滤文本文件
            const ext = pathUtils.extension(file.path)
            if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
              // TODO: 应用 include/exclude 模式过滤
              result.push(file.path)
            }
          }
        })
      )

      return result
    } catch (error) {
      console.error(`Error traversing directory ${dirPath}:`, error)
      return result
    }
  }

  /**
   * 跳转到匹配项（从 SearchPanel 触发）
   */
  static jumpToMatch(
    editor: Editor,
    match: TipTapSearchMatch,
    searchTerm: string,
    options?: SearchOptions
  ): void {
    // 1. 设置外部高亮模式（只高亮这一个匹配，不进行内部搜索）
    editor.storage.iwSearchReplace.searchTerm = searchTerm
    editor.storage.iwSearchReplace.isOpen = false
    editor.storage.iwSearchReplace.externalMatch = {
      from: match.position.from,
      to: match.position.to
    }
    editor.storage.iwSearchReplace.options = {
      caseSensitive: options?.caseSensitive || false,
      wholeWord: options?.wholeWord || false,
      regex: options?.regex || false
    }

    // 2. 触发搜索更新（生成装饰器，只高亮外部传入的 match）
    updateSearch(editor)

    // 3. 滚动到位置
    setTimeout(() => {
      goToSelection(editor, match.position)

      // 4. 临时高亮动画（额外的视觉反馈）
      this.highlightTemporarily(editor, match.position)
    }, 100)
  }

  /**
   * 清除高亮模式（由 SearchPanel 调用）
   */
  static clearHighlightMode(editor: Editor): void {
    editor.storage.iwSearchReplace.externalMatch = null
    editor.storage.iwSearchReplace.searchTerm = ''
    updateSearch(editor)
  }

  /**
   * 临时高亮动画
   */
  private static highlightTemporarily(
    editor: Editor,
    range: { from: number; to: number }
  ): void {
    try {
      const { node } = editor.view.domAtPos(range.from)
      const element = node instanceof HTMLElement ? node : (node.parentElement || null)

      if (element) {
        element.classList.add('search-result-flash')
        setTimeout(() => {
          element.classList.remove('search-result-flash')
        }, 2000)
      }
    } catch (error) {
      console.error('Error highlighting temporarily:', error)
    }
  }

  /**
   * 跨文件批量替换（后台静默执行）
   */
  static async replaceInWorkspace(
    results: TipTapSearchResult[],
     
    _searchTerm: string,
    replaceTerm: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: SearchOptions
  ): Promise<{
    success: boolean
    filesModified: number
    totalReplacements: number
    errors?: Array<{ file: string; error: string }>
  }> {
    let filesModified = 0
    let totalReplacements = 0
    const errors: Array<{ file: string; error: string }> = []

    // 获取搜索引擎的 extensions
    const extensions = this.getSearchEngine().extensionManager.extensions

    for (const fileResult of results) {
      try {
        // 1. 获取或重建 ProseMirror Doc
        let doc = fileResult._proseMirrorDoc

        if (!doc) {
          const content = await window.electronAPI.readFile(fileResult.filePath)
          if (!content) throw new Error('Failed to read file')

          const extension = pathUtils.extension(fileResult.filePath)
          const converted = await convertContentFrom(content, extension)
          if (!converted) throw new Error('Failed to convert file')

          const json = generateJSON(converted.content, extensions)
          doc = this.getSearchEngine().schema.nodeFromJSON(json)
        }

        if (!doc) throw new Error('Document not available')

        // 2. 执行替换（从后往前，避免位置偏移）
        const sortedMatches = [...fileResult.matches].sort(
          (a, b) => b.position.from - a.position.from
        )

        // 创建临时编辑器执行替换
        const tempEditor = new Editor({
          content: doc.toJSON(),
          extensions
        })

        for (const match of sortedMatches) {
          tempEditor.commands.insertContentAt(
            { from: match.position.from, to: match.position.to },
            replaceTerm
          )
          totalReplacements++
        }

        // 3. 转换回原始格式
        const extension = pathUtils.extension(fileResult.filePath)
        const newContent = convertContentTo(
          tempEditor,
          extension,
          fileResult._lineEnding
        )

        tempEditor.destroy()

        if (!newContent) throw new Error('Failed to convert content back')

        // 4. 写回文件
        await window.electronAPI.saveFile(fileResult.filePath, newContent)
        filesModified ++

      } catch (error) {
        errors.push({
          file: fileResult.filePath,
          error: String(error)
        })
      }
    }

    return {
      success: errors.length === 0,
      filesModified,
      totalReplacements,
      errors: errors.length > 0 ? errors : undefined
    }
  }
}
