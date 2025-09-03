import type { EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import type { iwPopupToolsOptions, PluginState } from '../types.js'

export const iwPopupToolsPluginKey = new PluginKey<PluginState>('iwPopupTools')

export const iwPopupToolsPlugin = (editor: Editor, options: iwPopupToolsOptions) => {
  return new Plugin({
    key: iwPopupToolsPluginKey,

    state: {
      init(): PluginState {
        return {
          visible: options.visible,
          shouldShowToolbar: false,
          editableMark: null,
          popupTool: null,
        }
      },
      
      apply(tr, prev, oldState, newState): PluginState {
        if (tr.getMeta('iwPopupToolsVisible') !== undefined) prev.visible = true

        // 计算当前光标所处 link
        let cur = null
        let currentTool = null
        for (const tool of options.tools) {
          currentTool = tool
          cur = tool.getEditableMark(newState, newState.selection.$from.pos)
          if (cur) break
        }
        if (!cur || !currentTool) {
          return { visible: prev.visible, shouldShowToolbar: false, editableMark: null, popupTool: null }
        }

        /*
        console.log('iwPopupToolsPlugins apply in', {
          visible: prev.visible,
          shouldShowToolbar: prev.shouldShowToolbar,
          editMode: currentTool.editMode,
          editableMark: prev.editableMark, 
          exitPopupTool: tr.getMeta('exitPopupTool'),
        })
        */
        
        // 处理退出编辑的meta
        if (
          tr.getMeta('exitPopupTool') ||
          !newState.selection.empty
        ) {
            currentTool.editMode = false
            return { visible: prev.visible, shouldShowToolbar: false, editableMark: cur, popupTool: null }
        }

        // 1) 是否“进入”新的 edtableMark（从无到有，或者从一个 edtableMark 跳到另一个 edtableMark）
        const prevLink = prev.editableMark
        const enteringNewLink =
          (!prevLink && !!cur) ||
          (prevLink && cur && (prevLink.from !== cur.from || prevLink.to !== cur.to))

        // 2) 是否“离开” edtableMark（从有到无）
        const leavingLink = !!prevLink && !cur

        // 基于之前的 shouldShowToolbar 做增量更新，避免被焦点变化误关
        let shouldShow = prev.shouldShowToolbar
        if (enteringNewLink) {
          shouldShow = true
          currentTool.editMode = false
        }
        if (leavingLink) {
          shouldShow = false
          currentTool.editMode = false
        }

        // 其余情况（仍在同一个 edtableMark 内移动、DOM 聚焦变化等） => 保持现状
        return {
          visible: prev.visible, 
          shouldShowToolbar: shouldShow,
          editableMark: cur,
          popupTool: currentTool,
        }
      }
    },

    props: {
      decorations: (state: EditorState): DecorationSet | null => {
        const pluginState = iwPopupToolsPluginKey.getState(state) as PluginState
        /*
        console.log('iwPopupToolsPlugins decorations', {
          visible: pluginState.visible,
          shouldShowToolbar: pluginState.shouldShowToolbar,
          editMode: pluginState.popupTool?.editMode,
          editableMark: pluginState.editableMark, 
          exitPopupTool: state.tr.getMeta('exitPopupTool'),
        })
        */
        if (
          !pluginState.visible ||
          !pluginState.shouldShowToolbar ||
          !pluginState.editableMark
        ) {
          return null
        }
        
        return pluginState.popupTool?.createDecoration(pluginState.editableMark, state, editor) || null
      },
    },

  })
}

export default iwPopupToolsPlugin
