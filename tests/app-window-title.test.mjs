import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)

  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') depth -= 1
    if (depth === 0) return source.slice(start, i + 1)
  }

  assert.fail(`Could not extract ${name}`)
}

describe('app window title updates', () => {
  it('refreshes the window title after a renamed document updates an open tab name', () => {
    const source = readFileSync('src/stores/app.ts', 'utf8')
    const renameFileOrFolder = extractFunction(source, 'renameFileOrFolder')
    const openTabUpdateIndex = renameFileOrFolder.indexOf('openTab.name = pathUtils.basename(newPath)')
    const titleUpdateIndex = renameFileOrFolder.indexOf('updateWindowTitle()', openTabUpdateIndex)

    assert.notEqual(openTabUpdateIndex, -1, 'rename should update the open tab name')
    assert.notEqual(titleUpdateIndex, -1, 'renaming an open tab should refresh the window title')
  })
})
