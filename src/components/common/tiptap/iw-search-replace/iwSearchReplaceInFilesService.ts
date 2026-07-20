/**
 * TipTap 统一搜索服务
 * 使用 TipTap/ProseMirror 引擎进行跨文件搜索和替换
 *
 * Document access (open tab vs disk) is delegated to DocumentLoader.
 */

import { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { findMatchesInDocument } from './engine/SearchReplace'
import { goToSelection } from './utils/gotoSelection'
import { updateSearch } from './plugin/iwSearchReplacePlugin'
import { buildSearchSnippet } from './searchSnippet'
import {
  clearExternalSearchBlockHighlight,
  setExternalSearchBlockHighlight,
} from './externalMatchHighlight'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import { TEXT_EXTENSIONS, type FileTab } from '@/types'
import { pathUtils } from '@/utils/pathUtils'
import { loadDocument, isLoadError } from '@/services/document/DocumentLoader'
import type { SearchOptions, SearchReplaceInFilesSearchResult, SearchReplaceInFilesMatch } from './types'
import {
  collectWorkspaceTextFiles,
  parseWorkspaceIgnoreRules,
  shouldIncludeWorkspaceEntry,
  toWorkspaceRelativePath,
  toWorkspaceEntry,
} from '@/services/workspace/filtering'

const { detectFromPath } = useDocumentTypeDetector()

export class iwSearchReplaceInFilesService {
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
    onProgress?: (current: number, total: number) => void,
    workspaceRoot?: string,
    ignoreRulesText?: string
  ): Promise<SearchReplaceInFilesSearchResult[]> {
    if (!window.electronAPI) throw new Error('Electron API not available')
    if (!searchTerm) return []

    // 1. 获取所有可搜索文件
    const allFiles = await this.getSearchableFiles(
      folderPath,
      workspaceRoot ?? folderPath,
      ignoreRulesText,
      includePattern,
      excludePattern
    )

    if (allFiles.length === 0) return []

    const results: SearchReplaceInFilesSearchResult[] = []
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
            workspaceRoot ?? folderPath,
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
    workspaceRoot: string,
    searchTerm: string,
    options: SearchOptions,
    maxMatches: number = 10000,
    openTabs?: FileTab[]
  ): Promise<SearchReplaceInFilesSearchResult | null> {
    return this.searchInSingleFile(
      filePath,
      folderPath,
      workspaceRoot,
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
    workspaceRoot: string,
    searchTerm: string,
    options: SearchOptions,
    maxMatches: number,
    openTabs?: FileTab[]
  ): Promise<SearchReplaceInFilesSearchResult | null> {
    try {
      const loaded = await loadDocument(filePath, openTabs, [])
      if (isLoadError(loaded)) return null

      const { doc, lineEnding } = loaded

      const matches = findMatchesInDocument(doc, searchTerm, options)

      if (matches.length === 0) {
        loaded.release()
        return null
      }

      const limitedMatches = matches.slice(0, maxMatches)
      const matchesWithContext = limitedMatches.map(match => ({
        position: { from: match.from, to: match.to },
        text: doc.textBetween(match.from, match.to),
        contextHtml: this.extractContextHtml(doc, match.from, match.to)
      }))

      loaded.release()

      return {
        filePath,
        fileName: pathUtils.basename(filePath),
        relativePath: toWorkspaceRelativePath(workspaceRoot, filePath),
        documentType: detectFromPath(filePath),
        matches: matchesWithContext,
        totalMatches: matchesWithContext.length,
        _lineEnding: lineEnding,
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

    // 4. 按视觉宽度分配上下文，再在窗口边缘附近微调语义边界
    const snippet = buildSearchSnippet({
      before: paragraphText.substring(0, relativeFrom),
      match: paragraphText.substring(relativeFrom, relativeTo),
      after: paragraphText.substring(relativeTo),
    }, {
      totalWidth: 40
    })

    const prefix = snippet.prefixEllipsis ? '…' : ''
    const suffix = snippet.suffixEllipsis ? '…' : ''

    return `${prefix}${this.escapeHtml(snippet.before)}<mark>${this.escapeHtml(snippet.match)}</mark>${this.escapeHtml(snippet.after)}${suffix}`
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
    workspaceRoot: string,
    ignoreRulesText?: string,

    _includePattern?: string,

    _excludePattern?: string
  ): Promise<string[]> {
    const entries = await collectWorkspaceTextFiles({
      workspaceRoot,
      directoryPath: folderPath,
      ignoreRulesText,
      includePattern: _includePattern,
      excludePattern: _excludePattern,
    })

    return entries.map(entry => entry.path)
  }

  static shouldSearchPath(
    fileInfo: { path: string; name: string; isDirectory: boolean; isWritable?: boolean; isHidden?: boolean },
    workspaceRoot: string,
    ignoreRulesText?: string,
    includePattern?: string,
    excludePattern?: string
  ): boolean {
    const ext = pathUtils.extension(fileInfo.path)
    if (!fileInfo.isDirectory && ext && !(TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
      return false
    }

    const matcher = parseWorkspaceIgnoreRules(ignoreRulesText)
    const entry = toWorkspaceEntry(workspaceRoot, fileInfo)
    return shouldIncludeWorkspaceEntry(entry, matcher, includePattern, excludePattern)
  }

  /**
   * 跳转到匹配项（从 SearchPanel 触发）
   */
  static jumpToMatch(
    editor: Editor,
    match: SearchReplaceInFilesMatch,
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

    setExternalSearchBlockHighlight(editor, match.position)

    // 2. 触发搜索更新（生成装饰器，只高亮外部传入的 match）
    updateSearch(editor)

    // 3. 滚动到位置
    setTimeout(() => {
      goToSelection(editor, match.position)
    }, 100)
  }

  /**
   * 清除高亮模式（由 SearchPanel 调用）
   */
  static clearHighlightMode(editor: Editor): void {
    editor.storage.iwSearchReplace.externalMatch = null
    editor.storage.iwSearchReplace.searchTerm = ''
    clearExternalSearchBlockHighlight(editor)
    updateSearch(editor)
  }

  /**
   * 跨文件批量替换（后台静默执行）
   */
  static async replaceInWorkspace(
    results: SearchReplaceInFilesSearchResult[],

    _searchTerm: string,
    replaceTerm: string,

    _options: SearchOptions,
    openTabs?: FileTab[]
  ): Promise<{
    success: boolean
    filesModified: number
    totalReplacements: number
    errors?: Array<{ file: string; error: string }>
  }> {
    let filesModified = 0
    let totalReplacements = 0
    const errors: Array<{ file: string; error: string }> = []

    for (const fileResult of results) {
      try {
        // Prefer the live editor when the file is open so that (1) match positions
        // remain valid and (2) the live editor gets updated — preventing the file
        // watcher from triggering a re-search that finds the same matches again.
        const loaded = await loadDocument(fileResult.filePath, openTabs, [])
        if (isLoadError(loaded)) throw new Error(loaded.error)

        // Execute replacements from back to front to keep positions valid.
        const sortedMatches = [...fileResult.matches].sort(
          (a, b) => b.position.from - a.position.from
        )

        for (const match of sortedMatches) {
          loaded.editor.commands.insertContentAt(
            { from: match.position.from, to: match.position.to },
            replaceTerm
          )
          totalReplacements++
        }

        const newContent = loaded.serialize()
        loaded.release()

        if (!newContent) throw new Error('Failed to convert content back')

        await window.electronAPI.saveFile(newContent, fileResult.filePath)
        filesModified++

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
