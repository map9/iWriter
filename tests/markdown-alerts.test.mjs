import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/utils/markdownAlerts.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
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

describe('markdown alert helpers', () => {
  it('normalizes GitHub and iWriter alert types and rejects invalid markers', async () => {
    const { normalizeAlertType, alertTypeToClass, getAlertDisplayLabel } = await loadModule()

    assert.equal(normalizeAlertType('note'), 'NOTE')
    assert.equal(normalizeAlertType('beat'), 'BEAT')
    assert.equal(normalizeAlertType('comment'), 'COMMENT')
    assert.equal(normalizeAlertType('question_1'), null)
    assert.equal(normalizeAlertType('123'), null)
    assert.equal(normalizeAlertType(''), null)

    assert.equal(alertTypeToClass('COMMENT'), 'markdown-alert-comment')
    assert.equal(getAlertDisplayLabel('IMPORTANT'), 'Important')
    assert.equal(getAlertDisplayLabel('QUESTION_1'), 'Alert')
  })

  it('converts top-level GFM alert blockquotes to typed alert HTML', async () => {
    await withDom(async () => {
      const { transformAlertBlockquotesInHtml } = await loadModule()

      const html = [
        '<blockquote>',
        '<p>[!COMMENT] 这一段需要补一个人物动机。</p>',
        '</blockquote>',
      ].join('')

      assert.equal(
        transformAlertBlockquotesInHtml(html),
        '<blockquote class="markdown-alert markdown-alert-comment" data-alert-type="COMMENT"><p>这一段需要补一个人物动机。</p></blockquote>',
      )
    })
  })

  it('leaves unsupported alert markers as ordinary blockquotes', async () => {
    await withDom(async () => {
      const { transformAlertBlockquotesInHtml } = await loadModule()

      const html = [
        '<blockquote>',
        '<p>[!IDEA] 这只是普通引用内容。</p>',
        '</blockquote>',
      ].join('')

      assert.equal(transformAlertBlockquotesInHtml(html), html)
    })
  })

  it('does not promote nested markers inside an alert to nested alerts', async () => {
    await withDom(async () => {
      const { transformAlertBlockquotesInHtml } = await loadModule()

      const html = [
        '<blockquote>',
        '<p>[!COMMENT]</p>',
        '<p>这里需要确认角色动机。</p>',
        '<blockquote><p>[!NOTE] 原文中的一句普通引用。</p></blockquote>',
        '</blockquote>',
      ].join('')

      assert.equal(
        transformAlertBlockquotesInHtml(html),
        '<blockquote class="markdown-alert markdown-alert-comment" data-alert-type="COMMENT"><p>这里需要确认角色动机。</p><blockquote><p>[!NOTE] 原文中的一句普通引用。</p></blockquote></blockquote>',
      )
    })
  })

  it('serializes typed alert HTML back to GFM alert Markdown', async () => {
    const TurndownService = (await import('turndown')).default
    const { configureAlertTurndown } = await loadModule()
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
    configureAlertTurndown(turndown)

    const markdown = turndown.turndown(
      '<blockquote class="markdown-alert markdown-alert-beat" data-alert-type="BEAT"><p>[场景-1-节拍-1] 核心点</p></blockquote>',
    )

    assert.equal(markdown, '> [!BEAT]\n> [场景-1-节拍-1] 核心点')
  })
})
