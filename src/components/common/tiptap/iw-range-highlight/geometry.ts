export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface PointLike {
  left: number
  top: number
}

export interface VerticalRectLike {
  top: number
  height: number
}

export interface ScrollOffset {
  left: number
  top: number
}

export interface BoxInset {
  left: number
  top: number
  right: number
  bottom: number
}

export function calculateCenteredScrollTop(options: {
  currentScrollTop: number
  viewportTop: number
  viewportHeight: number
  scrollHeight: number
  targetTop: number
  targetBottom: number
}): number {
  const targetCenter = (options.targetTop + options.targetBottom) / 2
  const requested = options.currentScrollTop
    + targetCenter
    - options.viewportTop
    - options.viewportHeight / 2
  const maximum = Math.max(0, options.scrollHeight - options.viewportHeight)

  return Math.min(maximum, Math.max(0, requested))
}

export function getRangeVerticalBounds(
  rects: ArrayLike<{ top: number; bottom: number }>,
): VerticalRectLike | null {
  let top = Infinity
  let bottom = -Infinity

  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index]
    if (!rect || rect.bottom <= rect.top) continue
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }

  return Number.isFinite(top) && Number.isFinite(bottom)
    ? { top, height: bottom - top }
    : null
}

export function toBlockOverlayBox(
  horizontalRect: RectLike,
  verticalRect: VerticalRectLike,
  wrapperRect: PointLike,
  scrollOffset: ScrollOffset,
  inset: BoxInset,
): RectLike {
  return {
    left: horizontalRect.left - wrapperRect.left + scrollOffset.left + inset.left,
    top: verticalRect.top - wrapperRect.top + scrollOffset.top + inset.top,
    width: horizontalRect.width - inset.left - inset.right,
    height: verticalRect.height - inset.top - inset.bottom,
  }
}
