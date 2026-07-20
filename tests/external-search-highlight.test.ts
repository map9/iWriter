import assert from 'node:assert/strict'
import test from 'node:test'
import type { Editor } from '@tiptap/core'
import {
  clearExternalSearchBlockHighlight,
  resolveSearchBlockHighlightRange,
  setExternalSearchBlockHighlight,
} from '../src/components/common/tiptap/iw-search-replace/externalMatchHighlight.ts'

test('keeps the external range when the internal search panel is closed', () => {
  assert.deepEqual(resolveSearchBlockHighlightRange({
    isOpen: false,
    externalMatch: { from: 42, to: 48 },
    currentMatch: null,
  }), { from: 42, to: 48 })
})

test('uses the internal current match while the internal search panel is open', () => {
  assert.deepEqual(resolveSearchBlockHighlightRange({
    isOpen: true,
    externalMatch: { from: 42, to: 48 },
    currentMatch: { from: 80, to: 86 },
  }), { from: 80, to: 86 })
})

test('sidebar search match synchronizes the block highlight range', () => {
  const calls: unknown[][] = []
  const editor = {
    commands: {
      setRangeHighlights: (...args: unknown[]) => {
        calls.push(args)
        return true
      },
    },
  } as unknown as Editor

  setExternalSearchBlockHighlight(editor, { from: 42, to: 48 })

  assert.deepEqual(calls, [[
    [{ id: 'search-replace-current-result-id', from: 42, to: 48 }],
    'iw-range-highlight-search-current',
  ]])
})

test('clearing sidebar search also removes its block highlight', () => {
  const calls: unknown[][] = []
  const editor = {
    commands: {
      removeRangeHighlights: (...args: unknown[]) => {
        calls.push(args)
        return true
      },
    },
  } as unknown as Editor

  clearExternalSearchBlockHighlight(editor)

  assert.deepEqual(calls, [[
    'search-replace-current-result-id',
    'iw-range-highlight-search-current',
  ]])
})
