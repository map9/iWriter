import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'

export type RangeHighlightVariant = 'block' | 'inline'

export interface EditorRangeHighlight extends Range {
  id: string
  className: string
}

export interface RangeHighlightInput extends Range {
  id: string
}

export interface RangeHighlightStorage {
  block: EditorRangeHighlight[]
  inline: EditorRangeHighlight[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iwRangeHighlight: {
      setRangeHighlights: (highlights: RangeHighlightInput[] | null, className: string, variant?: RangeHighlightVariant) => ReturnType
      addRangeHighlights: (highlights: RangeHighlightInput | RangeHighlightInput[], className: string, variant?: RangeHighlightVariant) => ReturnType
      removeRangeHighlights: (ids: string | string[], className: string, variant?: RangeHighlightVariant) => ReturnType
    }
  }

  interface Storage {
    iwRangeHighlight: RangeHighlightStorage
  }
}

type MetaPayload =
  | { action: 'set'; highlights: EditorRangeHighlight[]; className: string; variant: RangeHighlightVariant }
  | { action: 'add'; highlights: EditorRangeHighlight[]; className: string; variant: RangeHighlightVariant }
  | { action: 'remove'; ids: string[]; className: string; variant: RangeHighlightVariant }

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

function normalizeHighlights(
  highlights: RangeHighlightInput[] | null | undefined,
  className: string
): EditorRangeHighlight[] {
  if (!highlights?.length) return []

  return highlights
    .filter((highlight): highlight is RangeHighlightInput => !!highlight && highlight.from < highlight.to)
    .map(highlight => ({
      id: highlight.id,
      className,
      from: highlight.from,
      to: highlight.to,
    }))
}

function mapHighlights(highlights: EditorRangeHighlight[], tr: Transaction) {
  if (!tr.docChanged) return highlights

  return highlights
    .map(highlight => ({
      ...highlight,
      from: tr.mapping.map(highlight.from),
      to: tr.mapping.map(highlight.to),
    }))
    .filter(highlight => highlight.from < highlight.to)
}

function applyAction(list: EditorRangeHighlight[], meta: MetaPayload): EditorRangeHighlight[] {
  switch (meta.action) {
    case 'set':
      return [
        ...list.filter(h => h.className !== meta.className),
        ...meta.highlights,
      ]
    case 'add': {
      const additionsById = new Map(meta.highlights.map(h => [h.id, h]))
      return [
        ...list.filter(h => h.className !== meta.className || !additionsById.has(h.id)),
        ...meta.highlights,
      ]
    }
    case 'remove': {
      const removeIds = new Set(meta.ids)
      return list.filter(h => h.className !== meta.className || !removeIds.has(h.id))
    }
  }
}

const pluginKey = new PluginKey<RangeHighlightStorage>('iwRangeHighlight')

export const iwRangeHighlightExtension = Extension.create({
  name: 'iwRangeHighlight',

  addStorage(): RangeHighlightStorage {
    return {
      block: [],
      inline: [],
    }
  },

  addCommands() {
    return {
      setRangeHighlights:
        (highlights, className, variant = 'block') =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(pluginKey, {
              action: 'set',
              highlights: normalizeHighlights(highlights, className),
              className,
              variant,
            } satisfies MetaPayload))
          }
          return true
        },

      addRangeHighlights:
        (highlights, className, variant = 'block') =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(pluginKey, {
              action: 'add',
              highlights: normalizeHighlights(toArray(highlights), className),
              className,
              variant,
            } satisfies MetaPayload))
          }
          return true
        },

      removeRangeHighlights:
        (ids, className, variant = 'block') =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(pluginKey, {
              action: 'remove',
              ids: toArray(ids),
              className,
              variant,
            } satisfies MetaPayload))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage

    return [
      new Plugin<RangeHighlightStorage>({
        key: pluginKey,
        state: {
          init: () => ({ block: storage.block, inline: storage.inline }),
          apply: (tr, current) => {
            let block = mapHighlights(current.block, tr)
            let inline = mapHighlights(current.inline, tr)

            const meta = tr.getMeta(pluginKey) as MetaPayload | undefined
            if (meta) {
              if (meta.variant === 'inline') {
                inline = applyAction(inline, meta)
              } else {
                block = applyAction(block, meta)
              }
            }

            storage.block = block
            storage.inline = inline
            return { block, inline }
          },
        },
      }),
    ]
  },
})

export function setRangeHighlights(
  editor: Editor,
  highlights: RangeHighlightInput[] | null,
  className: string,
  variant: RangeHighlightVariant = 'block'
): void {
  editor.commands.setRangeHighlights(highlights, className, variant)
}

export function removeRangeHighlights(
  editor: Editor,
  ids: string | string[],
  className: string,
  variant: RangeHighlightVariant = 'block'
): void {
  editor.commands.removeRangeHighlights(ids, className, variant)
}
