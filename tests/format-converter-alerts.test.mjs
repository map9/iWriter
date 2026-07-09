import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { resolve } from 'node:path'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/import-export/formatConverter.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        alias: {
          '@': resolve('src'),
        },
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return modulePromise
}

async function withDom(callback) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousDocument = globalThis.document
  try {
    globalThis.document = dom.window.document
    return await callback()
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    dom.window.close()
  }
}

describe('formatConverter alert integration', () => {
  it('converts GFM alert Markdown into typed blockquote HTML', async () => {
    await withDom(async () => {
      const { convertContentFrom } = await loadModule()

      const converted = await convertContentFrom('> [!COMMENT] 这一段需要补一个人物动机。', 'md')

      assert.match(converted.content, /data-alert-type="COMMENT"/)
      assert.match(converted.content, /markdown-alert-comment/)
      assert.doesNotMatch(converted.content, /\[!COMMENT\]/)
    })
  })

  it('serializes typed alert blockquote HTML as GFM alert Markdown', async () => {
    const { htmlToMarkdown } = await loadModule()

    assert.equal(
      htmlToMarkdown('<blockquote class="markdown-alert markdown-alert-comment" data-alert-type="COMMENT"><p>这一段需要补一个人物动机。</p></blockquote>'),
      '> [!COMMENT]\n> 这一段需要补一个人物动机。',
    )
  })
})
