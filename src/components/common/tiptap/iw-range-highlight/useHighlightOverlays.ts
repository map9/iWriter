import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import type { EditorRangeHighlight } from './iwRangeHighlightExtension'

export interface InsetBox {
  left: number
  top: number
  right: number
  bottom: number
}

export interface OverlayBox {
  id: string
  className: string
  style: Record<string, string>
}

interface UseHighlightOverlaysParams {
  editor: () => Editor | null
  scrollContainer: () => HTMLElement | null
  show: () => boolean
  resolveHighlights: () => EditorRangeHighlight[]
  computeStyle: (editor: Editor, highlight: Pick<EditorRangeHighlight, 'from' | 'to'>) => Record<string, string>[]
}

export function useHighlightOverlays(params: UseHighlightOverlaysParams) {
  const { editor, scrollContainer, show, resolveHighlights, computeStyle } = params

  const overlays = ref<OverlayBox[]>([])
  let resizeObserver: ResizeObserver | null = null
  let editorDom: HTMLElement | null = null
  let boundWrapperElement: HTMLElement | null = null

  function refreshOverlays() {
    const currentEditor = editor()
    if (!currentEditor || currentEditor.isDestroyed || !show()) {
      overlays.value = []
      return
    }

    const nextOverlays: OverlayBox[] = []

    for (const highlight of resolveHighlights()) {
      const styles = computeStyle(currentEditor, highlight)

      styles.forEach((style, index) => {
        nextOverlays.push({
          id: `${highlight.className}:${highlight.id}:${index}`,
          className: highlight.className,
          style,
        })
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
    const currentEditor = editor()
    if (currentEditor && !currentEditor.isDestroyed) {
      currentEditor.off('update', refreshOverlays)
      currentEditor.off('selectionUpdate', refreshOverlays)
      currentEditor.off('transaction', refreshOverlays)
      currentEditor.off('destroy', cleanup)
    }

    if (boundWrapperElement) {
      boundWrapperElement.removeEventListener('scroll', handleScroll)
      boundWrapperElement = null
    }

    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }

    window.removeEventListener('resize', handleWindowResize)
    editorDom = null
  }

  watch(
    () => [show(), resolveHighlights(), editor()?.state.doc],
    refreshOverlays,
    { deep: true, immediate: true }
  )

  watch(
    () => editor(),
    () => {
      cleanup()

      const currentEditor = editor()
      if (currentEditor?.view) {
        editorDom = currentEditor.view.dom
        boundWrapperElement = scrollContainer() ?? null

        currentEditor.on('update', refreshOverlays)
        currentEditor.on('selectionUpdate', refreshOverlays)
        currentEditor.on('transaction', refreshOverlays)
        currentEditor.on('destroy', cleanup)

        boundWrapperElement?.addEventListener('scroll', handleScroll)
        window.addEventListener('resize', handleWindowResize)

        resizeObserver = new ResizeObserver(() => {
          refreshOverlays()
        })
        resizeObserver.observe(editorDom)
        if (boundWrapperElement && boundWrapperElement !== editorDom) {
          resizeObserver.observe(boundWrapperElement)
        }
      }

      refreshOverlays()
    },
    { immediate: true }
  )

  onMounted(refreshOverlays)
  onUnmounted(cleanup)

  return { overlays }
}
