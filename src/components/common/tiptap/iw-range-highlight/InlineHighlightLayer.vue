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
  inset: () => ({ left: -2, top: -2, right: -2, bottom: -2 }),
})

function resolveHighlights(): EditorRangeHighlight[] {
  if (!props.show) return []
  const pool: EditorRangeHighlight[] = props.editor?.storage?.iwRangeHighlight?.inline ?? []
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

    // Detect inline atom nodes (e.g. inline math) vs marks (e.g. link).
    // nodeDOM() returns an Element for atom nodes, null for text/mark positions.
    // For atom nodes, use that element directly — the same one the CSS :hover
    // background paints — and suppress vertical inset expansion so the overlay
    // matches the hover rect exactly.
    const atomDOM = editor.view.nodeDOM(from)
    const isAtomNode = atomDOM !== null && atomDOM.nodeType === Node.ELEMENT_NODE

    let rects: DOMRectList | DOMRect[]
    if (isAtomNode) {
      rects = (atomDOM as Element).getClientRects()
    } else {
      const fromDOM = editor.view.domAtPos(from)
      const toDOM = editor.view.domAtPos(to)
      const domRange = document.createRange()
      domRange.setStart(fromDOM.node, fromDOM.offset)
      domRange.setEnd(toDOM.node, toDOM.offset)
      rects = domRange.getClientRects()
    }

    if (rects.length === 0) return []

    const inset = props.inset
    const lineRects: DOMRect[] = []

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i]
      if (!rect || rect.width === 0 || rect.height === 0) continue

      const existingLine = lineRects.find(line =>
        Math.abs(line.top - rect.top) < 2 || (rect.top < line.bottom && rect.bottom > line.top)
      )

      if (!existingLine) {
        lineRects.push(new DOMRect(rect.left, rect.top, rect.width, rect.height))
        continue
      }

      const left = Math.min(existingLine.left, rect.left)
      const top = Math.min(existingLine.top, rect.top)
      const right = Math.max(existingLine.right, rect.right)
      const bottom = Math.max(existingLine.bottom, rect.bottom)
      existingLine.x = left
      existingLine.y = top
      existingLine.width = right - left
      existingLine.height = bottom - top
    }

    return lineRects.map(rect => ({
      left: `${rect.left - wrapperRect.left + scrollLeft + inset.left}px`,
      top: `${rect.top - wrapperRect.top + scrollTop + inset.top}px`,
      width: `${rect.width - inset.left - inset.right}px`,
      height: `${rect.height - inset.top - inset.bottom}px`,
    }))
  } catch (error) {
    console.warn('Failed to calculate inline range highlight overlay:', error)
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
