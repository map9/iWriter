<template>
  <div
    v-for="overlay in overlays"
    :key="overlay.id"
    class="range-highlight-overlay"
    :class="overlay.className"
    :style="overlay.style"
  />
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { EditorRangeHighlight } from './iwRangeHighlightExtension'
import { useHighlightOverlays, type InsetBox } from './useHighlightOverlays'
import { getRangeVerticalBounds, toBlockOverlayBox } from './geometry'

interface Props {
  editor: Editor | null
  scrollContainer?: HTMLElement | null
  highlights?: EditorRangeHighlight[] | null
  show?: boolean
  inset?: InsetBox
}

const props = withDefaults(defineProps<Props>(), {
  scrollContainer: null,
  highlights: null,
  show: true,
  inset: () => ({ left: 8, top: -8, right: 8, bottom: -8 }),
})

function resolveHighlights(): EditorRangeHighlight[] {
  if (!props.show) return []
  const pool: EditorRangeHighlight[] = props.editor?.storage?.iwRangeHighlight?.block ?? []
  return [...(props.highlights ?? []), ...pool]
}

function computeStyle(
  editor: Editor,
  highlight: Pick<EditorRangeHighlight, 'from' | 'to'>
): Record<string, string>[] {
  try {
    if (!editor.view || editor.isDestroyed) return []

    const { from, to } = highlight
    if (from >= to) return []

    const wrapperElement = props.scrollContainer
    if (!wrapperElement) return []

    const wrapperRect = wrapperElement.getBoundingClientRect()
    const scrollTop = wrapperElement.scrollTop
    const scrollLeft = wrapperElement.scrollLeft

    const fromDOM = editor.view.domAtPos(from)
    const toDOM = editor.view.domAtPos(to)

    const domRange = document.createRange()
    domRange.setStart(fromDOM.node, fromDOM.offset)
    domRange.setEnd(toDOM.node, toDOM.offset)

    const rects = domRange.getClientRects()
    if (rects.length === 0) return []

    const inset = props.inset

    const verticalRect = getRangeVerticalBounds(rects)
    const editorRect = editor.view.dom.getBoundingClientRect()
    if (editorRect.width === 0 || !verticalRect) return []

    const box = toBlockOverlayBox(
      editorRect,
      verticalRect,
      wrapperRect,
      { left: scrollLeft, top: scrollTop },
      inset,
    )

    return [{
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }]
  } catch (error) {
    console.warn('Failed to calculate block range highlight overlay:', error)
    return []
  }
}

const { overlays } = useHighlightOverlays({
  editor: () => props.editor,
  scrollContainer: () => props.scrollContainer ?? null,
  show: () => props.show,
  resolveHighlights,
  computeStyle,
})
</script>
