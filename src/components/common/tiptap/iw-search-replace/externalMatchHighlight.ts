import type { Editor, Range } from '@tiptap/core'

export const SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID = 'search-replace-current-result-id'
export const SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS = 'iw-range-highlight-search-current'

export function resolveSearchBlockHighlightRange(options: {
  isOpen: boolean
  externalMatch: Range | null
  currentMatch: Range | null
}): Range | null {
  return options.isOpen ? options.currentMatch : options.externalMatch
}

export function setExternalSearchBlockHighlight(editor: Editor, range: Range): void {
  editor.commands.setRangeHighlights([{
    id: SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID,
    from: range.from,
    to: range.to,
  }], SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS)
}

export function clearExternalSearchBlockHighlight(editor: Editor): void {
  editor.commands.removeRangeHighlights(
    SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_ID,
    SEARCH_CURRENT_RESULT_RANGE_HIGHLIGHT_CLASS,
  )
}
