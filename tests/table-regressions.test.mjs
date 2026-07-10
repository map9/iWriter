import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tableOperations = readFileSync('src/components/common/tiptap/utils/TableOperations.ts', 'utf8')
const tableView = readFileSync('src/components/common/tiptap/iwTableView.vue', 'utf8')
const previewSource = readFileSync('src/components/print/buildPreviewDoc.ts', 'utf8')

test('table copy resolves the selected table and shares the Markdown conversion path', () => {
  assert.match(tableOperations, /editor\.view\.nodeDOM\(table\.pos\)/)
  assert.doesNotMatch(tableOperations, /editor\.view\.dom\.querySelector\('table'\)/)
  assert.match(tableOperations, /htmlToMarkdown\(htmlContent\)/)
  assert.match(tableView, /await copyTableUtil\(props\.editor\)/)
})

test('table row and column moves use the span-aware ProseMirror commands', () => {
  assert.match(tableOperations, /moveTableColumn\(/)
  assert.match(tableOperations, /moveTableRow\(/)
  assert.doesNotMatch(tableOperations, /function reorderRowCells/)
})

test('print repeats only a complete header row', () => {
  assert.match(previewSource, /firstRow\.cells/)
  assert.match(previewSource, /every\.call\(cells, function \(cell\) \{ return cell\.tagName === 'TH'; \}\)/)
  assert.doesNotMatch(previewSource, /firstRow\.querySelector\('th'\)/)
})
