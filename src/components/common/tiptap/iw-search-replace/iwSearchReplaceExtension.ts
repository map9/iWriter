import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { DecorationSet } from '@tiptap/pm/view'
import type { SearchReplaceOptions, SearchReplaceStorage } from './types'
import { createSearchReplacePlugin, updateSearch } from './plugin/iwSearchReplacePlugin'
import { goToSelection } from './utils/gotoSelection'
import { getActualSelectionRange } from '../utils/selectionUtils'
import { setRangeHighlights, removeRangeHighlights } from '../iw-range-highlight'
import {
  SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS,
  SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID,
  resolveSearchBlockHighlightRange,
} from './externalMatchHighlight'

const SEARCH_RESULT_HIGHLIGHT_CLASS = 'iw-search-result'
const SEARCH_CURRENT_RESULT_HIGHLIGHT_CLASS = 'iw-search-result-current'

const SEARCH_SELECTION_HIGHLIGHT_ID = 'search-replace-selection-id'
const SEARCH_SELECTION_HIGHLIGHT_CLASS = 'iw-range-highlight-search-selection'

function syncCurrentSearchResultHighlight(editor: Editor, storage: SearchReplaceStorage) {
  const currentMatch = storage.currentMatchIndex >= 0
    ? storage.matches[storage.currentMatchIndex]
    : null
  const match = resolveSearchBlockHighlightRange({
    isOpen: storage.isOpen,
    externalMatch: storage.externalMatch,
    currentMatch: currentMatch ?? null,
  })

  if (!match) {
    removeRangeHighlights(
      editor,
      SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID,
      SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS
    )
    return
  }

  setRangeHighlights(editor, [{
    id: SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID,
    from: match.from,
    to: match.to,
  }], SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS)
}

// 声明命令类型和存储类型
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iwSearchReplace: {
      /**
       * 打开搜索框
       */
      openSearch: () => ReturnType
      /**
       * 打开搜索和替换框
       */
      openReplace: () => ReturnType
      /**
       * 关闭搜索框
       */
      closeSearch: () => ReturnType
      /**
       * 切换搜索框显示
       */
      toggleSearch: () => ReturnType
      /**
       * 设置搜索词
       */
      setSearchTerm: (term: string) => ReturnType
      /**
       * 设置替换词
       */
      setReplaceTerm: (term: string) => ReturnType
      /**
       * 查找下一个
       */
      findNext: () => ReturnType
      /**
       * 查找上一个
       */
      findPrevious: () => ReturnType
      /**
       * 替换当前匹配
       */
      replaceNext: () => ReturnType
      /**
       * 替换所有匹配
       */
      replaceAll: () => ReturnType
      /**
       * 切换大小写敏感
       */
      toggleCaseSensitive: () => ReturnType
      /**
       * 切换全词匹配
       */
      toggleWholeWord: () => ReturnType
      /**
       * 切换正则表达式
       */
      toggleRegex: () => ReturnType
      /**
       * 切换选区内搜索
       */
      toggleSearchInSelection: () => ReturnType
    }
  }

  interface Storage {
    iwSearchReplace: SearchReplaceStorage
  }
}

export const iwSearchReplaceExtension = Extension.create<
  SearchReplaceOptions,
  SearchReplaceStorage
>({
  name: 'iwSearchReplace',

  addOptions() {
    return {
      maxMatches: 500,
      debounceTime: 300,
      currentMatchClass: SEARCH_CURRENT_RESULT_HIGHLIGHT_CLASS,
      otherMatchClass: SEARCH_RESULT_HIGHLIGHT_CLASS
    }
  },

  addStorage() {
    return {
      isOpen: false,
      externalMatch: null, // 外部传入的匹配位置
      mode: 'search',
      searchTerm: '',
      replaceTerm: '',
      selectionRange: null,
      searchInSelection: false,
      options: {
        caseSensitive: false,
        wholeWord: false,
        regex: false
      },
      lastSearchTerm: null,
      lastSelectionRange: null,
      lastSearchInSelection: false,
      lastOptions: null,
      matches: [],
      currentMatchIndex: -1,
      decorationSet: DecorationSet.empty,
      debounceTimer: null,
    }
  },

  addCommands() {
    return {
      openSearch:
        () =>
        ({ editor }) => {
          this.storage.isOpen = true
          this.storage.mode = 'search'

          // 如果有选中文本，自动作为搜索词（仅单行文本有效）
          const { from, to } = editor.state.selection
          if (from !== to) {
            const selectedText = editor.state.doc.textBetween(from, to, '\n')
            // 只有不包含换行符且长度合理的文本才作为搜索词
            if (selectedText && !selectedText.includes('\n') && selectedText.length < 100) {
              this.storage.searchTerm = selectedText
            }
          }

          updateSearch(editor)
          syncCurrentSearchResultHighlight(editor, this.storage)
          return true
        },

      openReplace:
        () =>
        ({ editor }) => {
          this.storage.isOpen = true
          this.storage.mode = 'replace'

          // 如果有选中文本，自动作为搜索词（仅单行文本有效）
          const { from, to } = editor.state.selection
          if (from !== to) {
            const selectedText = editor.state.doc.textBetween(from, to, '\n')
            // 只有不包含换行符且长度合理的文本才作为搜索词
            if (selectedText && !selectedText.includes('\n') && selectedText.length < 100) {
              this.storage.searchTerm = selectedText
            }
          }

          updateSearch(editor)
          syncCurrentSearchResultHighlight(editor, this.storage)
          return true
        },

      closeSearch:
        () =>
        ({ editor }) => {
          this.storage.isOpen = false
          this.storage.matches = []
          this.storage.currentMatchIndex = -1
          this.storage.searchInSelection = false
          this.storage.selectionRange = null
          removeRangeHighlights(editor, SEARCH_SELECTION_HIGHLIGHT_ID, SEARCH_SELECTION_HIGHLIGHT_CLASS)
          removeRangeHighlights(editor, SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID, SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS)
          updateSearch(editor)
          return true
        },

      toggleSearch:
        () =>
        ({ commands }) => {
          if (this.storage.isOpen) {
            return commands.closeSearch()
          } else {
            return commands.openSearch()
          }
        },

      setSearchTerm:
        (term: string) =>
        ({ editor }) => {
          this.storage.searchTerm = term

          // 清除防抖定时器
          if (this.storage.debounceTimer) {
            clearTimeout(this.storage.debounceTimer)
          }

          // 防抖搜索
          this.storage.debounceTimer = setTimeout(() => {
            updateSearch(editor)
            syncCurrentSearchResultHighlight(editor, this.storage)
          }, this.options.debounceTime)

          return true
        },

      setReplaceTerm:
        (term: string) =>
        () => {
          this.storage.replaceTerm = term
          return true
        },

      findNext:
        () =>
        ({ editor }) => {
          if (this.storage.matches.length === 0) return false

          this.storage.currentMatchIndex =
            (this.storage.currentMatchIndex + 1) % this.storage.matches.length

          const match = this.storage.matches[this.storage.currentMatchIndex]
          if (match) {
            updateSearch(editor)
            syncCurrentSearchResultHighlight(editor, this.storage)
            goToSelection(editor, match)
          } else {
            removeRangeHighlights(editor, SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID, SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS)
          }

          return true
        },

      findPrevious:
        () =>
        ({ editor }) => {
          if (this.storage.matches.length === 0) return false

          this.storage.currentMatchIndex =
            this.storage.currentMatchIndex <= 0
              ? this.storage.matches.length - 1
              : this.storage.currentMatchIndex - 1

          const match = this.storage.matches[this.storage.currentMatchIndex]
          if (match) {
            updateSearch(editor)
            syncCurrentSearchResultHighlight(editor, this.storage)
            goToSelection(editor, match)
          } else {
            removeRangeHighlights(editor, SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID, SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS)
          }

          return true
        },

      replaceNext:
        () =>
        ({ editor, tr, dispatch }) => {
          if (this.storage.matches.length === 0) return false

          const match = this.storage.matches[this.storage.currentMatchIndex]
          if (!match) return false

          // 执行替换
          if (dispatch) dispatch(tr.insertText(this.storage.replaceTerm, match.from, match.to))
          
          requestAnimationFrame(() => {
            if (this.storage.matches.length > 0) {
              editor.commands.findNext()
            }
          })
          return true
        },

      replaceAll:
        () =>
        ({ tr, dispatch }) => {
          if (this.storage.matches.length === 0) return false

          // 从后往前替换，避免位置偏移
          const matches = [...this.storage.matches].reverse()

          matches.forEach(match => {
            tr.insertText(this.storage.replaceTerm, match.from, match.to)
          })

          if (dispatch) dispatch(tr)
          return true
        },

      toggleCaseSensitive:
        () =>
        ({ editor }) => {
          this.storage.options.caseSensitive = !this.storage.options.caseSensitive
          updateSearch(editor)
          syncCurrentSearchResultHighlight(editor, this.storage)
          return true
        },

      toggleWholeWord:
        () =>
        ({ editor }) => {
          this.storage.options.wholeWord = !this.storage.options.wholeWord
          updateSearch(editor)
          syncCurrentSearchResultHighlight(editor, this.storage)
          return true
        },

      toggleRegex:
        () =>
        ({ editor }) => {
          this.storage.options.regex = !this.storage.options.regex
          updateSearch(editor)
          syncCurrentSearchResultHighlight(editor, this.storage)
          return true
        },

      toggleSearchInSelection:
        () =>
        ({ editor }) => {
          const selection = editor.state.selection

          if (this.storage.searchInSelection) {
            // 取消选区搜索
            this.storage.searchInSelection = false
            this.storage.selectionRange = null
            removeRangeHighlights(editor, SEARCH_SELECTION_HIGHLIGHT_ID, SEARCH_SELECTION_HIGHLIGHT_CLASS)
          } else {
            // 启用选区搜索
            if (!selection.empty) {
              this.storage.searchInSelection = true
              // 使用 getActualSelectionRange 正确处理 CellSelection
              this.storage.selectionRange = getActualSelectionRange(selection)
              editor.commands.addRangeHighlights({
                id: SEARCH_SELECTION_HIGHLIGHT_ID,
                ...this.storage.selectionRange,
              }, SEARCH_SELECTION_HIGHLIGHT_CLASS)
            } else {
              // 如果当前没有选区，不执行操作
              return false
            }
          }

          updateSearch(editor)
          syncCurrentSearchResultHighlight(editor, this.storage)
          return true
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        this.editor.commands.openSearch()
        return true
      },
      'Mod-Alt-f': () => {
        this.editor.commands.openReplace()
        return true
      },
      'Escape': () => {
        if (this.storage.isOpen) {
          this.editor.commands.closeSearch()
          return true
        }
        return false
      }
    }
  },

  addProseMirrorPlugins() {
    return [createSearchReplacePlugin(this.editor, this.options, this.storage)]
  },

  onTransaction({ transaction }) {
    if (transaction.docChanged && this.storage.isOpen) {
      syncCurrentSearchResultHighlight(this.editor, this.storage)
    }
  },

  onDestroy() {
    // 清理定时器
    if (this.storage.debounceTimer) {
      clearTimeout(this.storage.debounceTimer)
    }
  }
})
