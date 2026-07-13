import type { EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { iwPopupToolsOptions, PopupToolsPluginState } from '../types.js'
import { positionPopupPanel } from './utils/position-panel.js'

export const iwPopupToolsPluginKey = new PluginKey<PopupToolsPluginState>('iwPopupTools')

export const iwPopupToolsPlugin = (editor: Editor, options: iwPopupToolsOptions) => {
  return new Plugin({
    key: iwPopupToolsPluginKey,

    state: {
      init(): PopupToolsPluginState {
        return {
          visible: options.visible,
          shouldShowToolbar: false,
          feature: null,
          popupTool: null,
        }
      },
      
      apply(tr, prev, oldState, newState): PopupToolsPluginState {
        if (tr.getMeta('iwPopupToolsVisible') !== undefined) prev.visible = true

        // 计算当前光标所处 link
        let cur = null
        let currentTool = null
        for (const tool of options.tools) {
          currentTool = tool
          cur = tool.getEditableFeature(newState, newState.selection.$from.pos)
          if (cur) break
          currentTool.editMode = false
        }
        if (!cur || !currentTool) {
          return { visible: prev.visible, shouldShowToolbar: false, feature: null, popupTool: null }
        }

        // 处理退出编辑的meta
        if (
          tr.getMeta('exitPopupTool') ||
          (
            currentTool.getEditableFeatureType(newState) === 'mark' &&
            !newState.selection.empty &&
            !((newState.selection.from === cur.from) && (newState.selection.to === cur.to))
          )
        ) {
            currentTool.editMode = false
            return { visible: prev.visible, shouldShowToolbar: false, feature: null, popupTool: null }
        }

        // 1) 是否“进入”新的 edtableMark（ 从无到有，或者从一个 feature 跳到另一个 feature ）
        const prevLink = prev.feature
        const enteringNewLink0 = (!prevLink && !!cur)
        const enteringNewLink1 = (prevLink && cur && (prevLink.from !== cur.from || prevLink.to !== cur.to))

        // 2) 是否“离开” edtableMark（从有到无）
        const leavingLink = !!prevLink && !cur

        // 基于之前的 shouldShowToolbar 做增量更新，避免被焦点变化误关
        let shouldShow = prev.shouldShowToolbar
        if (enteringNewLink0 || enteringNewLink1) shouldShow = true        
        // 新建对象，强制设施editMode时，保持不变
        if (enteringNewLink1) currentTool.editMode = false

        if (leavingLink) {
          shouldShow = false
          currentTool.editMode = false
        }

        // 其余情况（仍在同一个 edtableMark 内移动、DOM 聚焦变化等） => 保持现状
        return {
          visible: prev.visible, 
          shouldShowToolbar: shouldShow,
          feature: cur,
          popupTool: currentTool,
        }
      }
    },

    view(initView: EditorView) {
      let rafId: number | null = null
      let scrollContainer: HTMLElement | null = null

      function bindScrollContainer(): void {
        const nextScrollContainer = initView.dom.closest('.editor-content-wrapper') as HTMLElement | null
        if (nextScrollContainer === scrollContainer) return

        scrollContainer?.removeEventListener('scroll', handleScrollOrResize, { capture: true })
        scrollContainer = nextScrollContainer
        scrollContainer?.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true })
      }

      function reposition(view: EditorView): void {
        const state = iwPopupToolsPluginKey.getState(view.state)
        if (!state?.visible || !state.shouldShowToolbar || !state.feature || !state.popupTool) return
        const panel = state.popupTool.editWidget?.panel
        if (!panel) return
        positionPopupPanel(view, state.feature.from, state.feature.to, panel)
      }

      function scheduleReposition(view: EditorView): void {
        if (rafId !== null) return
        rafId = requestAnimationFrame(() => {
          rafId = null
          reposition(view)
        })
      }

      function handleScrollOrResize(): void {
        scheduleReposition(initView)
      }

      bindScrollContainer()
      window.addEventListener('resize', handleScrollOrResize, { passive: true })

      return {
        update(view: EditorView) {
          bindScrollContainer()
          scheduleReposition(view)
        },
        destroy() {
          if (rafId !== null) cancelAnimationFrame(rafId)
          scrollContainer?.removeEventListener('scroll', handleScrollOrResize, { capture: true })
          window.removeEventListener('resize', handleScrollOrResize)
        },
      }
    },

    props: {
      decorations: (state: EditorState): DecorationSet | null => {
        const pluginState = iwPopupToolsPluginKey.getState(state) as PopupToolsPluginState
        if (
          !pluginState.visible ||
          !pluginState.shouldShowToolbar ||
          !pluginState.feature
        ) {
          return null
        }
        
        return pluginState.popupTool?.createDecoration(pluginState.feature, state, editor) || null
      },
      
      handleDOMEvents: {
        mousedown: (view, event) => {
          const pluginState = iwPopupToolsPluginKey.getState(view.state)
          
          // 只在编辑模式下处理
          if (!pluginState?.popupTool?.editMode) {
            return false
          }
          
          const target = event.target as Element
          // 检查点击是否在popup工具外部
          if (!target.closest('.toolbar-wrapper')) {
            // 强制退出编辑模式
            const tr = view.state.tr.setMeta('exitPopupTool', true)
            view.dispatch(tr)
            return false // 让编辑器正常处理点击
          }
          
          return false
        }
      }
    },

  })
}

export default iwPopupToolsPlugin
