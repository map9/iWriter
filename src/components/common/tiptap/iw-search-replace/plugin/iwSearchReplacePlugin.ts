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
        return {
          // 两种独立的装饰器集（移除了 selectionDecorations）
          matchDecorations: DecorationSet.empty,
          externalDecorations: DecorationSet.empty,

          // 用于判断是否需要更新的快照值
          lastSearchTerm: null as string | null,
          lastCaseSensitive: false,
          lastWholeWord: false,
          lastRegex: false,
          lastSearchInSelection: false,
          lastSelectionFrom: null as number | null,
          lastSelectionTo: null as number | null,
          lastExternalFrom: null as number | null,
          lastExternalTo: null as number | null,

          // 返回合并后的装饰器供 props.decorations 使用
          _combined: DecorationSet.empty
        }
      },

      apply(tr, oldState) {
        let {
          matchDecorations,
          externalDecorations
        } = oldState

        // ========== 1. 搜索匹配装饰器 ==========
        const matchConditionsChanged =
          storage.searchTerm !== oldState.lastSearchTerm ||
          storage.options.caseSensitive !== oldState.lastCaseSensitive ||
          storage.options.wholeWord !== oldState.lastWholeWord ||
          storage.options.regex !== oldState.lastRegex ||
          storage.searchInSelection !== oldState.lastSearchInSelection ||
          storage.selectionRange?.from !== oldState.lastSelectionFrom ||
          storage.selectionRange?.to !== oldState.lastSelectionTo

        if (!storage.isOpen || !storage.searchTerm) {
          // 清空搜索结果
          matchDecorations = DecorationSet.empty
          storage.matches = []
          storage.currentMatchIndex = -1
        } else if (tr.docChanged || tr.getMeta(searchReplacePluginKey) || matchConditionsChanged) {
          // 重新搜索并创建装饰器
          const matches = findMatchesInDocument(
            tr.doc,
            storage.searchTerm,
            storage.options,
            storage.searchInSelection ? storage.selectionRange ?? undefined : undefined
          )
          storage.matches = matches.slice(0, options.maxMatches)

          const decorations = storage.matches.map((match, index) =>
            Decoration.inline(match.from, match.to, {
              class: index === storage.currentMatchIndex
                ? options.currentMatchClass
                : options.otherMatchClass
            })
          )
          matchDecorations = DecorationSet.create(tr.doc, decorations)
        } else {
          // 只映射位置
          matchDecorations = matchDecorations.map(tr.mapping, tr.doc)
        }

        // 确保当前索引有效
        if (storage.currentMatchIndex >= storage.matches.length) {
          storage.currentMatchIndex = 0
        } else if (storage.currentMatchIndex < 0) {
          storage.currentMatchIndex = 0
        }

        // ========== 2. 外部匹配装饰器 ==========
        const externalMatchChanged =
          storage.externalMatch?.from !== oldState.lastExternalFrom ||
          storage.externalMatch?.to !== oldState.lastExternalTo

        if (!storage.externalMatch) {
          // 清除外部高亮
          externalDecorations = DecorationSet.empty
        } else if (externalMatchChanged) {
          // 创建外部匹配装饰器
          const decoration = Decoration.inline(
            storage.externalMatch.from,
            storage.externalMatch.to,
            { class: options.currentMatchClass }
          )
          externalDecorations = DecorationSet.create(tr.doc, [decoration])
        } else if (tr.docChanged) {
          // 只映射位置
          externalDecorations = externalDecorations.map(tr.mapping, tr.doc)
        }

        // ========== 合并装饰器 ==========
        // 使用 find() 获取装饰器数组，按优先级合并
        let combined = matchDecorations

        // 添加外部匹配装饰器（优先级最高，最后添加）
        const externalDecs = externalDecorations.find()
        if (externalDecs.length > 0) {
          combined = combined.add(tr.doc, externalDecs)
        }

        // ========== 更新状态快照 ==========
        return {
          matchDecorations,
          externalDecorations,
          lastSearchTerm: storage.searchTerm,
          lastCaseSensitive: storage.options.caseSensitive,
          lastWholeWord: storage.options.wholeWord,
          lastRegex: storage.options.regex,
          lastSearchInSelection: storage.searchInSelection,
          lastSelectionFrom: storage.selectionRange?.from ?? null,
          lastSelectionTo: storage.selectionRange?.to ?? null,
          lastExternalFrom: storage.externalMatch?.from ?? null,
          lastExternalTo: storage.externalMatch?.to ?? null,
          // 返回合并后的装饰器供 props.decorations 使用
          _combined: combined
        }
      }
    },

    props: {
      decorations(state) {
        const pluginState = this.getState(state)
        return pluginState?._combined || DecorationSet.empty
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