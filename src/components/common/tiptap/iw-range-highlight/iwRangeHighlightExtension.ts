import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'

const pluginKey = new PluginKey<EditorRangeHighlight[]>('iwRangeHighlight')

export interface EditorRangeHighlight extends Range {
  id: string
  className: string
}

export interface RangeHighlightInput extends Range {
  id: string
}

export interface RangeHighlightStorage {
  highlights: EditorRangeHighlight[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iwRangeHighlight: {
      setRangeHighlights: (highlights: RangeHighlightInput[] | null, className: string) => ReturnType
      addRangeHighlights: (highlights: RangeHighlightInput | RangeHighlightInput[], className: string) => ReturnType
      removeRangeHighlights: (ids: string | string[], className: string) => ReturnType
    }
  }

  interface Storage {
    iwRangeHighlight: RangeHighlightStorage
  }
}

type MetaPayload =
  | { action: 'set'; highlights: EditorRangeHighlight[]; className: string }
  | { action: 'add'; highlights: EditorRangeHighlight[]; className: string }
  | { action: 'remove'; ids: string[]; className: string }

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

export const iwRangeHighlightExtension = Extension.create({
  name: 'iwRangeHighlight',

  addStorage(): RangeHighlightStorage {
    return {
      highlights: [],
    }
  },

  addCommands() {
    return {
      setRangeHighlights:
        (highlights, className) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(pluginKey, {
              action: 'set',
              highlights: normalizeHighlights(highlights, className),
              className,
            } satisfies MetaPayload))
          }
          return true
        },

      addRangeHighlights:
        (highlights, className) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(pluginKey, {
              action: 'add',
              highlights: normalizeHighlights(toArray(highlights), className),
              className,
            } satisfies MetaPayload))
          }
          return true
        },

      removeRangeHighlights:
        (ids, className) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(pluginKey, {
              action: 'remove',
              ids: toArray(ids),
              className,
            } satisfies MetaPayload))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage

    return [
      new Plugin<EditorRangeHighlight[]>({
        key: pluginKey,
        state: {
          init: () => storage.highlights,
          apply: (tr, currentHighlights) => {
            let nextHighlights = mapHighlights(currentHighlights, tr)
            const meta = tr.getMeta(pluginKey) as MetaPayload | undefined

            if (meta) {
              switch (meta.action) {
                case 'set':
                  nextHighlights = [
                    ...nextHighlights.filter(highlight => highlight.className !== meta.className),
                    ...meta.highlights,
                  ]
                  break
                case 'add': {
                  const additionsById = new Map(meta.highlights.map(highlight => [highlight.id, highlight]))
                  nextHighlights = [
                    ...nextHighlights.filter(highlight =>
                      highlight.className !== meta.className || !additionsById.has(highlight.id)
                    ),
                    ...meta.highlights,
                  ]
                  break
                }
                case 'remove': {
                  const removeIds = new Set(meta.ids)
                  nextHighlights = nextHighlights.filter(highlight =>
                    highlight.className !== meta.className || !removeIds.has(highlight.id)
                  )
                  break
                }
              }
            }

            storage.highlights = nextHighlights
            return nextHighlights
          },
        },
      }),
    ]
  },
})

export function setRangeHighlights(
  editor: Editor,
  highlights: RangeHighlightInput[] | null,
  className: string
): void {
  editor.commands.setRangeHighlights(highlights, className)
}

export function removeRangeHighlights(
  editor: Editor,
  ids: string | string[],
  className: string
): void {
  editor.commands.removeRangeHighlights(ids, className)
}
