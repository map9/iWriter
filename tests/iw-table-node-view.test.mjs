import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tableViewSource = readFileSync('src/components/common/tiptap/iwTableView.vue', 'utf8')
const extensionSource = readFileSync('src/utils/editorExtensions.ts', 'utf8')

test('table node view uses a table host and tbody content DOM', () => {
  assert.match(tableViewSource, /<node-view-content\s+as="table"/)
  assert.match(extensionSource, /VueNodeViewRenderer\(iwTableView,\s*\{\s*contentDOMElementTag:\s*'tbody',?\s*\}\)/s)
})

test('table node view inserts its colgroup before the tbody content DOM', () => {
  assert.match(tableViewSource, /tableRef\.value\.insertBefore\(colgroup, tableRef\.value\.firstChild\)/)
})
