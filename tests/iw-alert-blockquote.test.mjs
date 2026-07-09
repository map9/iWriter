import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            import { generateHTML, generateJSON } from '@tiptap/core'
            import Document from '@tiptap/extension-document'
            import Paragraph from '@tiptap/extension-paragraph'
            import Text from '@tiptap/extension-text'
            import { iwAlertBlockquote } from './src/components/common/tiptap/iw-alert-blockquote/iwAlertBlockquote.ts'

            const extensions = [Document, Paragraph, Text, iwAlertBlockquote]

            export function parseAlertHtml(html) {
              return generateJSON(html, extensions)
            }

            export function renderAlertJson(json) {
              return generateHTML(json, extensions)
            }
          `,
          resolveDir: process.cwd(),
          sourcefile: 'iw-alert-blockquote-test-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        alias: {
          '@': process.cwd() + '/src',
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
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  try {
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    return await callback()
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
    if (previousDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = previousDocument
    }
    dom.window.close()
  }
}

describe('iwAlertBlockquote', () => {
  it('parses typed alert blockquote attributes', async () => {
    await withDom(async () => {
      const { parseAlertHtml } = await loadModule()

      const json = parseAlertHtml('<blockquote class="markdown-alert markdown-alert-comment" data-alert-type="COMMENT"><p>text</p></blockquote>')

      assert.equal(json.content[0].attrs.alertType, 'COMMENT')
    })
  })

  it('renders typed alert attributes and classes', async () => {
    await withDom(async () => {
      const { renderAlertJson } = await loadModule()

      const html = renderAlertJson({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: { alertType: 'BEAT' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'text' }] }],
          },
        ],
      })

      assert.equal(html, '<blockquote data-alert-type="BEAT" class="markdown-alert markdown-alert-beat"><p>text</p></blockquote>')
    })
  })
})
