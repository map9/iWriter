import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const appSource = readFileSync('electron/App.ts', 'utf8')

test('get-files skips entries that disappear after readdir', () => {
  const handlerStart = appSource.indexOf("ipcMain.handle('get-files'")
  const handlerEnd = appSource.indexOf("ipcMain.handle('reveal-in-folder'", handlerStart)
  assert.notEqual(handlerStart, -1)
  assert.notEqual(handlerEnd, -1)

  const handler = appSource.slice(handlerStart, handlerEnd)
  assert.match(handler, /try \{\s*stats = fs\.statSync\(filePath\)/)
  assert.match(handler, /if \(nodeError\.code === 'ENOENT'\) return null/)
  assert.match(handler, /\.filter\(\(file\): file is NonNullable<typeof file> => file !== null\)/)
})
