import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tableViewSource = readFileSync('src/components/common/tiptap/iwTableView.vue', 'utf8')
const extensionSource = readFileSync('src/utils/editorExtensions.ts', 'utf8')

test('table node view keeps table chrome outside the tbody content DOM', () => {
  assert.match(
    tableViewSource,
    /<table\s+ref="tableRef">\s*<colgroup\s+ref="colgroupRef"><\/colgroup>\s*<node-view-content\s+as="tbody"\s*\/>\s*<\/table>/s,
  )
  assert.doesNotMatch(tableViewSource, /<node-view-content\s+as="table"/)
  assert.match(extensionSource, /VueNodeViewRenderer\(iwTableView,\s*\{\s*contentDOMElementTag:\s*'tbody',?\s*\}\)/s)
})

test('table node view does not mutate the ProseMirror content DOM with table chrome', () => {
  assert.doesNotMatch(tableViewSource, /insertBefore\(colgroup/)
  assert.doesNotMatch(tableViewSource, /querySelector<HTMLTableElement>\('table\[data-node-view-content\]'\)/)
})
