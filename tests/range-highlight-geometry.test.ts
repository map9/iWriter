import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateCenteredScrollTop,
  getRangeVerticalBounds,
  toBlockOverlayBox,
} from '../src/components/common/tiptap/iw-range-highlight/geometry.ts'

test('centers a match using its visual rectangle and clamps to the scroll range', () => {
  assert.equal(calculateCenteredScrollTop({
    currentScrollTop: 100,
    viewportTop: 20,
    viewportHeight: 400,
    scrollHeight: 1000,
    targetTop: 520,
    targetBottom: 540,
  }), 410)

  assert.equal(calculateCenteredScrollTop({
    currentScrollTop: 0,
    viewportTop: 20,
    viewportHeight: 400,
    scrollHeight: 1000,
    targetTop: 25,
    targetBottom: 35,
  }), 0)
})

test('uses the matched visual lines instead of the containing code block or table cell', () => {
  assert.deepEqual(getRangeVerticalBounds([
    { top: 240, bottom: 258 },
    { top: 240, bottom: 258 },
    { top: 264, bottom: 282 },
  ]), {
    top: 240,
    height: 42,
  })
})

test('keeps editor-view horizontal bounds while using block vertical bounds and all insets', () => {
  assert.deepEqual(toBlockOverlayBox(
    { left: 100, top: 120, width: 600, height: 500 },
    { left: 130, top: 250, width: 320, height: 80 },
    { left: 50, top: 100 },
    { left: 10, top: 200 },
    { left: 8, top: -8, right: 8, bottom: -8 },
  ), {
    left: 68,
    top: 342,
    width: 584,
    height: 96,
  })
})
