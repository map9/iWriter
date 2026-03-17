/**
 * iwBlockHighlightExtension — highlights the block targeted by the active edit proposal.
 *
 * Uses Decoration.node() to add a CSS class to the target block without changing
 * the editor selection or cursor position.
 *
 * Usage:
 *   highlightBlock(editor, nodeId)   // highlight a block by its UniqueID
 *   highlightBlock(editor, null)     // clear the highlight
 */

import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findNodeById } from './BlockEditApplier'

const pluginKey = new PluginKey<PluginState>('blockHighlight')

interface PluginState {
  nodeId: string | null
  decorations: DecorationSet
}

export const IwBlockHighlightExtension = Extension.create({
  name: 'blockHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: pluginKey,

        state: {
          init(): PluginState {
            return { nodeId: null, decorations: DecorationSet.empty }
          },

          apply(tr, prev): PluginState {
            const meta = tr.getMeta(pluginKey) as { nodeId: string | null } | undefined

            if (!meta) {
              // No highlight change — remap existing decoration positions
              return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) }
            }

            if (!meta.nodeId) {
              return { nodeId: null, decorations: DecorationSet.empty }
            }

            const found = findNodeById(tr.doc, meta.nodeId)
            if (!found) {
              return { nodeId: meta.nodeId, decorations: DecorationSet.empty }
            }

            const deco = Decoration.node(found.from, found.to, {
              class: 'block-highlight-proposal',
            })
            return {
              nodeId: meta.nodeId,
              decorations: DecorationSet.create(tr.doc, [deco]),
            }
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)!.decorations
          },
        },
      }),
    ]
  },
})

/**
 * Highlight a block by its TipTap UniqueID, or clear the highlight when nodeId is null.
 */
export function highlightBlock(editor: Editor, nodeId: string | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(pluginKey, { nodeId }))
}
