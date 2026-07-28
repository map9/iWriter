import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const imageNodeView = readFileSync('src/components/common/tiptap/iwImageView.vue', 'utf8')
const mainApp = readFileSync('electron/App.ts', 'utf8')

test('local image nodes check file existence before mounting an img element', () => {
  assert.match(imageNodeView, /v-if="renderableImageSrc"/)
  assert.match(imageNodeView, /await window\.electronAPI\.pathExists\(src\)/)
  assert.match(imageNodeView, /if \(!exists\) \{\s*imageError\.value = true\s*return\s*\}/)
  assert.doesNotMatch(imageNodeView, /<img[^>]+:src="imageSrc"/)
})

test('path existence checks accept file URLs from image nodes', () => {
  assert.match(mainApp, /import \{ fileURLToPath \} from 'url'/)
  assert.match(mainApp, /filePath\.startsWith\('file:'\)\s*\?\s*fileURLToPath\(filePath\)/)
})
