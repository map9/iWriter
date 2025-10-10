import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { SearchReplaceOptions, SearchReplaceStorage } from '../types'
import { findMatchesInDocument } from '../engine/SearchReplace'

export const searchReplacePluginKey = new PluginKey('iwSearchReplace')

/**
 * 创建搜索替换插件
 */
export function createSearchReplacePlugin(
  editor: Editor,
  options: SearchReplaceOptions,
  storage: SearchReplaceStorage
) {
  return new Plugin({
    key: searchReplacePluginKey,

    state: {
      init() {
        return DecorationSet.empty
      },

      apply(tr, oldDecorationSet) {
        // 如果文档未改变且没有搜索更新，保持原装饰器
        if (!tr.docChanged && !tr.getMeta(searchReplacePluginKey)) {
          return oldDecorationSet.map(tr.mapping, tr.doc)
        }

        // 如果搜索框未打开或没有搜索词，清除装饰器
        if (!storage.isOpen || !storage.searchTerm) {
          storage.matches = []
          storage.currentMatchIndex = -1
          return DecorationSet.empty
        }

        // 如果文档更新或者搜索条件变更，执行搜索
        if (
          tr.docChanged ||
          storage.searchTerm !== storage.lastSearchTerm ||
          !storage.lastOptions ||
          storage.options.caseSensitive !== storage.lastOptions.caseSensitive ||
          storage.options.regex !== storage.lastOptions.regex ||
          storage.options.wholeWord !== storage.lastOptions.wholeWord ||
          storage.searchInSelection !== storage.lastSearchInSelection ||
          (storage.searchInSelection && !storage.lastSelectionRange) ||
          (
            storage.searchInSelection && storage.selectionRange && 
            (
              storage.selectionRange?.from !== storage.lastSelectionRange?.from || 
              storage.selectionRange?.to !== storage.lastSelectionRange?.to
            )) 
        ) {
          const matches = findMatchesInDocument(
            tr.doc,
            storage.searchTerm,
            storage.options,
            storage.searchInSelection ? storage.selectionRange ?? undefined : undefined
          )
          storage.lastSearchTerm = storage.searchTerm
          storage.lastOptions = storage.options
          storage.lastSearchInSelection = storage.searchInSelection
          if (storage.searchInSelection) {
            storage.lastSelectionRange = storage.selectionRange
          } else {
            storage.lastSelectionRange = null
          }

          console.debug({function: 'apply', matches})

          // 限制匹配数量
          storage.matches = matches.slice(0, options.maxMatches)
        }

        // 如果没有匹配，重置当前索引
        if (storage.matches.length === 0) {
          storage.currentMatchIndex = -1
          return DecorationSet.empty
        }

        // 确保当前索引有效
        if (storage.currentMatchIndex >= storage.matches.length) {
          storage.currentMatchIndex = 0
        } else if (storage.currentMatchIndex < 0) {
          storage.currentMatchIndex = 0
        }

        // 创建装饰器
        const decorations = storage.matches.map((match, index) => {
          const className =
            index === storage.currentMatchIndex
              ? options.currentMatchClass
              : options.otherMatchClass

          return Decoration.inline(match.from, match.to, {
            class: className
          })
        })

        return DecorationSet.create(tr.doc, decorations)
      }
    },

    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

/**
 * 触发搜索更新
 */
export function updateSearch(editor: Editor) {
  const tr = editor.state.tr
  tr.setMeta(searchReplacePluginKey, { forceUpdate: true })
  editor.view.dispatch(tr)
}
