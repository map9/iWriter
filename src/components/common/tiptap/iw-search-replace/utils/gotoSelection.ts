import type { Editor } from '@tiptap/core'
import { calculateCenteredScrollTop } from '../../iw-range-highlight/geometry'

function createRangeRect(editor: Editor, range: { from: number; to: number }): DOMRect | null {
  const fromDOM = editor.view.domAtPos(range.from)
  const toDOM = editor.view.domAtPos(range.to)
  const domRange = document.createRange()
  domRange.setStart(fromDOM.node, fromDOM.offset)
  domRange.setEnd(toDOM.node, toDOM.offset)

  const rect = domRange.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0 ? rect : null
}

function revealInNestedScrollContainer(
  editor: Editor,
  range: { from: number; to: number },
  targetNode: Node,
  editorScroller: HTMLElement,
): void {
  let element = targetNode.nodeType === 1
    ? targetNode as HTMLElement
    : targetNode.parentElement

  while (element && element !== editorScroller) {
    const targetRect = createRangeRect(editor, range)
    if (!targetRect) return

    if (element.scrollWidth > element.clientWidth) {
      const elementRect = element.getBoundingClientRect()
      const targetCenter = (targetRect.left + targetRect.right) / 2
      const desiredLeft = element.scrollLeft + targetCenter - elementRect.left - element.clientWidth / 2
      element.scrollLeft = Math.max(0, Math.min(
        element.scrollWidth - element.clientWidth,
        desiredLeft,
      ))
    }

    if (element.scrollHeight > element.clientHeight) {
      const elementRect = element.getBoundingClientRect()
      element.scrollTop = calculateCenteredScrollTop({
        currentScrollTop: element.scrollTop,
        viewportTop: elementRect.top,
        viewportHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        targetTop: targetRect.top,
        targetBottom: targetRect.bottom,
      })
    }

    element = element.parentElement
  }
}

export const goToSelection = (editor: Editor, range: {from: number, to: number}) => {
  if (!editor || !range) return

  editor.commands.setTextSelection(range)

  const editorScroller = editor.view.dom.closest('.editor-content-wrapper') as HTMLElement | null
  if (!editorScroller) return

  const fromDOM = editor.view.domAtPos(range.from)
  revealInNestedScrollContainer(editor, range, fromDOM.node, editorScroller)

  const targetRect = createRangeRect(editor, range)
  if (!targetRect) return

  const viewportRect = editorScroller.getBoundingClientRect()
  const top = calculateCenteredScrollTop({
    currentScrollTop: editorScroller.scrollTop,
    viewportTop: viewportRect.top,
    viewportHeight: editorScroller.clientHeight,
    scrollHeight: editorScroller.scrollHeight,
    targetTop: targetRect.top,
    targetBottom: targetRect.bottom,
  })

  editorScroller.scrollTo({ top, behavior: 'smooth' })
}
