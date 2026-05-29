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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import type { EditorRangeHighlight } from './iwRangeHighlightExtension'

interface Props {
  editor: Editor | null
  scrollContainer?: HTMLElement | null
  highlights?: EditorRangeHighlight[] | null
  show?: boolean
  insetTop?: number
  insetBottom?: number
  insetLeft?: number
  insetRight?: number
}

interface OverlayBox {
  id: string
  className: string
  style: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  scrollContainer: null,
  highlights: null,
  show: true,
  insetTop: 0,
  insetBottom: 0,
  insetLeft: 0,
  insetRight: 0,
})

const overlays = ref<OverlayBox[]>([])
let resizeObserver: ResizeObserver | null = null
let editorDom: HTMLElement | null = null
let wrapperElement: HTMLElement | null = null

function getHighlights(): EditorRangeHighlight[] {
  if (!props.show) return []
  if (props.highlights) return props.highlights

  const storageHighlights = props.editor?.storage?.iwRangeHighlight?.highlights
  return Array.isArray(storageHighlights) ? storageHighlights : []
}

function calculateHighlightStyle(
  editor: Editor,
  highlight: Pick<EditorRangeHighlight, 'from' | 'to'>
): Record<string, string> | null {
  try {
    if (!editor.view || editor.isDestroyed) {
      return null
    }

    const { from, to } = highlight
    if (from >= to) return null

    const wrapperElement = props.scrollContainer
    if (!wrapperElement) {
      return null
    }

    const wrapperRect = wrapperElement.getBoundingClientRect()
    const scrollTop = wrapperElement.scrollTop
    const scrollLeft = wrapperElement.scrollLeft

    const fromDOM = editor.view.domAtPos(from)
    const toDOM = editor.view.domAtPos(to)

    const domRange = document.createRange()
    domRange.setStart(fromDOM.node, fromDOM.offset)
    domRange.setEnd(toDOM.node, toDOM.offset)

    const rects = domRange.getClientRects()
    if (rects.length === 0) {
      return null
    }

    let minTop = Infinity
    let maxBottom = -Infinity

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i]
      if (!rect) continue
      minTop = Math.min(minTop, rect.top)
      maxBottom = Math.max(maxBottom, rect.bottom)
    }

    const editorRect = editor.view.dom.getBoundingClientRect()
    const margin = 4

    return {
      left: `${editorRect.left - wrapperRect.left + scrollLeft + props.insetLeft}px`,
      top: `${minTop - wrapperRect.top + scrollTop - margin + props.insetTop}px`,
      width: `${editorRect.width - props.insetLeft - props.insetRight}px`,
      height: `${maxBottom - minTop + margin * 2 - props.insetTop - props.insetBottom}px`,
    }
  } catch (error) {
    console.warn('Failed to calculate range highlight overlay:', error)
    return null
  }
}

function refreshOverlays() {
  const editor = props.editor
  if (!editor || editor.isDestroyed || !props.show) {
    overlays.value = []
    return
  }

  const nextOverlays: OverlayBox[] = []

  for (const highlight of getHighlights()) {
    const style = calculateHighlightStyle(editor, highlight)
    if (!style) continue

    nextOverlays.push({
      id: `${highlight.className}:${highlight.id}`,
      className: highlight.className,
      style,
    })
  }

  overlays.value = nextOverlays
}

function handleScroll() {
  refreshOverlays()
}

function handleWindowResize() {
  refreshOverlays()
}

function cleanup() {
  if (props.editor && !props.editor.isDestroyed) {
    props.editor.off('update', refreshOverlays)
    props.editor.off('selectionUpdate', refreshOverlays)
    props.editor.off('transaction', refreshOverlays)
    props.editor.off('destroy', cleanup)
  }

  if (wrapperElement) {
    wrapperElement.removeEventListener('scroll', handleScroll)
    wrapperElement = null
  }

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  window.removeEventListener('resize', handleWindowResize)

  editorDom = null
}

watch(
  () => [props.show, props.highlights, props.editor?.state.doc],
  refreshOverlays,
  { deep: true, immediate: true }
)

const editorIdentity = computed(() => props.editor)
watch(editorIdentity, () => {
  cleanup()

  if (props.editor?.view) {
    editorDom = props.editor.view.dom
    wrapperElement = props.scrollContainer ?? null
    props.editor.on('update', refreshOverlays)
    props.editor.on('selectionUpdate', refreshOverlays)
    props.editor.on('transaction', refreshOverlays)
    props.editor.on('destroy', cleanup)

    wrapperElement?.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleWindowResize)

    resizeObserver = new ResizeObserver(() => {
      refreshOverlays()
    })
    resizeObserver.observe(editorDom)
    if (wrapperElement && wrapperElement !== editorDom) {
      resizeObserver.observe(wrapperElement)
    }
  }

  refreshOverlays()
}, { immediate: true })

onMounted(refreshOverlays)
onUnmounted(cleanup)
</script>
