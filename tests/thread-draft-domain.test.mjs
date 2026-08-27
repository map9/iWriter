import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

async function loadModule() {
  const result = await build({
    entryPoints: ['src/ai/thread/threadPresentation.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

describe('draft thread domain presentation', () => {
  it('keeps domain selectable only for a local thread with no active run', async () => {
    const { isThreadDraft } = await loadModule()

    assert.equal(isThreadDraft({ localOnly: true, active: false, interrupted: false }), true)
    assert.equal(isThreadDraft({ localOnly: false, active: false, interrupted: false }), false)
    assert.equal(isThreadDraft({ localOnly: true, active: true, interrupted: false }), false)
    assert.equal(isThreadDraft({ localOnly: true, active: false, interrupted: true }), false)
  })

  it('composes a domain label without mutating the original title', async () => {
    const { formatThreadHeaderTitle } = await loadModule()
    const originalTitle = '雨夜人物设定'

    assert.equal(formatThreadHeaderTitle('创意写作', originalTitle), '创意写作 | 雨夜人物设定')
    assert.equal(originalTitle, '雨夜人物设定')
  })
})
