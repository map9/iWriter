import { Extension } from '@tiptap/core'

import { iwPopupToolsPlugin, iwPopupToolsPluginKey } from './plugin'
import { iwLinkPopupTool } from './plugin/popup-tools/iw-link-popup-tool.ts'
import { iwMathPopupTool } from './plugin/popup-tools/iw-math-popup-tool.ts'
import type { iwPopupToolsOptions } from './types.ts'

export { iwLinkPopupTool, iwMathPopupTool }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iwPopupTools: {
      /**
       * Show PopupTools
       */
      showPopupTools: (show?: boolean) => ReturnType

      /**
       * Hide PopupTools
       */
      hidePopupTools: () => ReturnType

      /**
       * Toggle PopupTools
       */
      togglePopupTools: () => ReturnType
    }
  }
}

export const iwPopupTools = Extension.create<iwPopupToolsOptions>({
  name: 'iwPopupTools',

  addOptions() {
    return {
      visible: true,
      tools: [new iwLinkPopupTool(), new iwMathPopupTool()],
    }
  },

  addProseMirrorPlugins() {
    return [iwPopupToolsPlugin(this.editor, this.options)]
  },

  addStorage() {
    return {
      visibility: () => this.options.visible,
    }
  },

  onBeforeCreate() {
    this.storage.visibility = () => {
      return iwPopupToolsPluginKey.getState(this.editor.state)?.visible
    }
  },

  addCommands() {
    return {
      showPopupTools:
        (visibility = true) =>
        ({ dispatch, tr }) => {
          if (dispatch) {
            tr.setMeta('iwPopupToolsVisible', visibility)
          }

          return true
        },
      hidePopupTools:
        () =>
        ({ dispatch, tr }) => {
          if (dispatch) {
            tr.setMeta('iwPopupToolsVisible', false)
          }

          return true
        },
      togglePopupTools:
        () =>
        ({ dispatch, tr, state }) => {
          const visibility = !iwPopupToolsPluginKey.getState(state)?.visible

          if (dispatch) {
            tr.setMeta('iwPopupToolsVisible', visibility)
          }

          return true
        },
    }
  },
})

export default iwPopupTools
