import type { EditorView } from '@tiptap/pm/view'

/**
 * Positions a fixed popup panel below (or above) the editor range [from, to].
 * The panel must already have `position: fixed` in CSS.
 * Coordinates are viewport-relative (fixed positioning space).
 */
export function positionPopupPanel(
  view: EditorView,
  from: number,
  to: number,
  panelEl: HTMLElement
): void {
  try {
    const startCoords = view.coordsAtPos(from)
    const endCoords = view.coordsAtPos(Math.max(from, to - 1))

    const anchorLeft = startCoords.left
    const anchorTop = Math.min(startCoords.top, endCoords.top)
    const anchorBottom = Math.max(startCoords.bottom, endCoords.bottom)

    // Panel dimensions — use cached size; fallback when not yet visible
    const panelRect = panelEl.getBoundingClientRect()
    const panelWidth = panelRect.width > 0 ? panelRect.width : 320
    const panelHeight = panelRect.height > 0 ? panelRect.height : 40

    // Bounds: prefer the scroll container, fall back to viewport
    const container = view.dom.closest('.editor-content-wrapper')
    const bounds: DOMRect = container
      ? container.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight)

    // Default: place below the anchor with the same visual offset as before
    let left = anchorLeft - 10
    let top = anchorBottom + 5

    // Table detection: clamp to tableWrapper right edge when panel would overflow
    const { node } = view.domAtPos(from)
    const domNode = node instanceof Element ? node : (node as ChildNode).parentElement
    const tableWrapper = domNode?.closest?.('.tableWrapper')
    if (tableWrapper) {
      const tableRect = tableWrapper.getBoundingClientRect()
      if (left + panelWidth > tableRect.right) {
        left = tableRect.right - panelWidth
      }
    }

    // Clamp horizontally within the bounds container
    left = Math.max(bounds.left + 4, Math.min(left, bounds.right - panelWidth - 4))

    // Vertical flip: show above the anchor when there is not enough space below
    if (top + panelHeight > bounds.bottom - 4) {
      top = anchorTop - panelHeight - 5
    }
    // Clamp vertically
    top = Math.max(bounds.top + 4, top)

    panelEl.style.left = `${Math.round(left)}px`
    panelEl.style.top = `${Math.round(top)}px`
  } catch {
    // Silently ignore positioning errors (e.g. editor destroyed mid-update)
  }
}
