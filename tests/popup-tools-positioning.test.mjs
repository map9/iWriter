import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const pluginSource = readFileSync('src/components/common/tiptap/iw-popup-tools/plugin/iwPopupToolsPlugin.ts', 'utf8')
const positionSource = readFileSync('src/components/common/tiptap/iw-popup-tools/plugin/utils/position-panel.ts', 'utf8')

describe('Popup Tools positioning', () => {
  it('binds the scroll listener after the editor is attached to its scroll container', () => {
    assert.match(pluginSource, /function bindScrollContainer\(\): void/)
    assert.match(pluginSource, /scrollContainer\?\.removeEventListener\('scroll', handleScrollOrResize, \{ capture: true \}\)/)
    assert.match(pluginSource, /scrollContainer\?\.addEventListener\('scroll', handleScrollOrResize, \{ capture: true, passive: true \}\)/)
    assert.match(pluginSource, /update\(view: EditorView\) \{\s*bindScrollContainer\(\)\s*scheduleReposition\(view\)/)
  })

  it('hides an out-of-view popup and coalesces scroll positioning into animation frames', () => {
    assert.match(positionSource, /const isAnchorVisible = anchorBottom >= bounds\.top && anchorTop <= bounds\.bottom/)
    assert.match(positionSource, /panelEl\.style\.visibility = 'hidden'/)
    assert.match(positionSource, /panelEl\.style\.visibility = ''/)
    assert.match(pluginSource, /function handleScrollOrResize\(\): void \{\s*scheduleReposition\(initView\)/)
  })
})
