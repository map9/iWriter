import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let markdownThemesPromise
let mermaidThemePromise
let moduleSequence = 0

async function loadMarkdownThemes() {
  if (!markdownThemesPromise) {
    markdownThemesPromise = (async () => {
      const result = await build({
        entryPoints: ['src/components/print/markdownThemes.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return markdownThemesPromise
}

async function loadMermaidTheme() {
  if (!mermaidThemePromise) {
    mermaidThemePromise = (async () => {
      const result = await build({
        entryPoints: ['src/components/common/tiptap/utils/mermaidTheme.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return mermaidThemePromise
}

async function loadMermaidRenderer(mockMermaid) {
  globalThis.__iwMermaidTestMock = mockMermaid
  const result = await build({
    entryPoints: ['src/components/common/tiptap/utils/mermaidRenderer.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [{
      name: 'mock-mermaid',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^mermaid$/ }, () => ({ path: 'mermaid', namespace: 'mock-mermaid' }))
        buildApi.onLoad({ filter: /.*/, namespace: 'mock-mermaid' }, () => ({
          contents: 'export default globalThis.__iwMermaidTestMock',
          loader: 'js',
        }))
      },
    }],
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${++moduleSequence}`)
}

async function loadMermaidPrintRenderer(renderMock) {
  globalThis.__iwMermaidPrintRenderMock = renderMock
  const result = await build({
    entryPoints: ['src/components/print/mermaidPrintRenderer.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [{
      name: 'mock-mermaid-renderer',
      setup(buildApi) {
        buildApi.onResolve(
          { filter: /^@\/components\/common\/tiptap\/utils\/mermaidRenderer$/ },
          () => ({ path: 'mermaid-renderer', namespace: 'mock-mermaid-renderer' }),
        )
        buildApi.onLoad({ filter: /.*/, namespace: 'mock-mermaid-renderer' }, () => ({
          contents: `
            export const renderMermaid = (...args) =>
              globalThis.__iwMermaidPrintRenderMock(...args)
          `,
          loader: 'js',
        }))
      },
    }],
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${++moduleSequence}`)
}

async function withDom(html, callback) {
  const dom = new JSDOM(html, { pretendToBeVisual: true })
  const previous = {
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    DOMParser: globalThis.DOMParser,
  }
  try {
    globalThis.document = dom.window.document
    globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
    globalThis.DOMParser = dom.window.DOMParser
    return await callback(dom.window)
  } finally {
    if (previous.document === undefined) delete globalThis.document
    else globalThis.document = previous.document
    if (previous.getComputedStyle === undefined) delete globalThis.getComputedStyle
    else globalThis.getComputedStyle = previous.getComputedStyle
    if (previous.DOMParser === undefined) delete globalThis.DOMParser
    else globalThis.DOMParser = previous.DOMParser
    dom.window.close()
  }
}

const palette = (colorScheme = 'light', primaryColor = '#f6f8fa') => ({
  colorScheme,
  variables: {
    background: '#ffffff',
    primaryColor,
    primaryTextColor: '#1f2328',
    primaryBorderColor: '#d1d9e0',
    secondaryColor: '#ddf4ff',
    tertiaryColor: '#dafbe1',
    lineColor: '#59636e',
    textColor: '#1f2328',
  },
})

describe('Markdown Mermaid themes', () => {
  it('defines screen and print Mermaid palettes for every built-in Markdown theme', async () => {
    const { builtInMarkdownThemes } = await loadMarkdownThemes()

    for (const theme of builtInMarkdownThemes) {
      assert.ok(theme.screen.mermaid, `${theme.id} is missing a screen Mermaid palette`)
      assert.ok(theme.print.mermaid, `${theme.id} is missing a print Mermaid palette`)
    }
  })

  it('keeps the System screen palette dynamic while print stays paper-oriented', async () => {
    const { getMarkdownThemeById } = await loadMarkdownThemes()
    const systemTheme = getMarkdownThemeById('system')

    assert.equal(systemTheme.screen.mermaid.colorScheme, 'dynamic')
    assert.equal(systemTheme.screen.mermaid.variables.background, 'var(--color-base-100)')
    assert.equal(systemTheme.screen.mermaid.variables.primaryColor, 'var(--color-primary)')
    assert.equal(systemTheme.print.mermaid.colorScheme, 'light')
    assert.equal(systemTheme.print.mermaid.variables.background, '#ffffff')
  })

  it('uses the Markdown theme mode rather than the App theme mode', async () => {
    const { getMarkdownThemeById } = await loadMarkdownThemes()

    assert.equal(getMarkdownThemeById('github').screen.mermaid.colorScheme, 'light')
    assert.equal(getMarkdownThemeById('github-dark').screen.mermaid.colorScheme, 'dark')
    assert.equal(getMarkdownThemeById('prose').screen.mermaid.colorScheme, 'light')
    assert.equal(getMarkdownThemeById('novel').screen.mermaid.colorScheme, 'light')
  })

  it('normalizes custom screen and print Mermaid palettes independently', async () => {
    const { buildMarkdownThemeFromRaw } = await loadMarkdownThemes()
    const theme = buildMarkdownThemeFromRaw({
      id: 'midnight-paper',
      folderPath: '/themes/midnight-paper',
      screenCss: '.tiptap.markdown-theme-midnight-paper {}',
      printCss: 'body {}',
      errors: [],
      manifest: {
        name: 'Midnight Paper',
        mermaid: {
          screen: {
            colorScheme: 'dark',
            variables: {
              background: '#10151d',
              primaryColor: '#243447',
              primaryTextColor: '#f1f5f9',
              primaryBorderColor: '#64748b',
              secondaryColor: '#312e81',
              tertiaryColor: '#164e63',
              lineColor: '#94a3b8',
              textColor: '#f1f5f9',
            },
          },
          print: {
            colorScheme: 'light',
            variables: {
              background: '#ffffff',
              primaryColor: '#f8fafc',
              primaryTextColor: '#111827',
              primaryBorderColor: '#94a3b8',
              secondaryColor: '#e0e7ff',
              tertiaryColor: '#ecfeff',
              lineColor: '#475569',
              textColor: '#111827',
            },
          },
        },
      },
    })

    assert.equal(theme.screen.mermaid.colorScheme, 'dark')
    assert.equal(theme.screen.mermaid.variables.background, '#10151d')
    assert.equal(theme.print.mermaid.colorScheme, 'light')
    assert.equal(theme.print.mermaid.variables.primaryColor, '#f8fafc')
  })

  it('gives legacy custom themes a complete neutral Mermaid fallback', async () => {
    const { buildMarkdownThemeFromRaw } = await loadMarkdownThemes()
    const theme = buildMarkdownThemeFromRaw({
      id: 'legacy-theme',
      folderPath: '/themes/legacy-theme',
      screenCss: '.tiptap.markdown-theme-legacy-theme {}',
      printCss: '',
      errors: [],
      manifest: { name: 'Legacy Theme' },
    })

    assert.equal(theme.screen.mermaid.colorScheme, 'light')
    assert.equal(theme.screen.mermaid.variables.background, '#ffffff')
    assert.equal(theme.print.mermaid.variables.textColor, '#1f2328')
  })

  it('keeps custom print Mermaid colors independent from the ambient App mode', async () => {
    const { buildMarkdownThemeFromRaw } = await loadMarkdownThemes()
    const theme = buildMarkdownThemeFromRaw({
      id: 'dynamic-print-theme',
      folderPath: '/themes/dynamic-print-theme',
      screenCss: '',
      printCss: '',
      errors: [],
      manifest: {
        name: 'Dynamic Print Theme',
        mermaid: {
          print: {
            colorScheme: 'dynamic',
            variables: { background: '#10151d' },
          },
        },
      },
    })

    assert.equal(theme.print.mermaid.colorScheme, 'light')
    assert.equal(theme.print.mermaid.variables.background, '#10151d')
  })

  it('rejects print palette variables that depend on an unavailable CSS scope', async () => {
    const { buildMarkdownThemeFromRaw } = await loadMarkdownThemes()
    const theme = buildMarkdownThemeFromRaw({
      id: 'scoped-print-theme',
      folderPath: '/themes/scoped-print-theme',
      screenCss: '',
      printCss: ':root { --diagram-primary: #123456; }',
      errors: [],
      manifest: {
        name: 'Scoped Print Theme',
        mermaid: {
          screen: { variables: { primaryColor: 'var(--diagram-primary)' } },
          print: {
            variables: {
              primaryColor: 'var(--diagram-primary)',
              secondaryColor: 'color-mix(in srgb, currentColor 50%, #ffffff)',
              tertiaryColor: 'light-dark(#ffffff, #000000)',
              lineColor: 'CanvasText',
            },
          },
        },
      },
    })

    assert.equal(theme.screen.mermaid.variables.primaryColor, 'var(--diagram-primary)')
    assert.equal(theme.print.mermaid.variables.primaryColor, '#f6f8fa')
    assert.equal(theme.print.mermaid.variables.secondaryColor, '#ddf4ff')
    assert.equal(theme.print.mermaid.variables.tertiaryColor, '#dafbe1')
    assert.equal(theme.print.mermaid.variables.lineColor, '#59636e')
  })

  it('selects the effective print palette independently from the screen and App modes', async () => {
    const { getEffectivePrintThemeId, getMarkdownThemeById } = await loadMarkdownThemes()
    const assignment = {
      screenThemeId: 'github-dark',
      printThemeId: 'github',
      printUsesScreenTheme: false,
    }

    const independentId = getEffectivePrintThemeId(assignment)
    assert.equal(independentId, 'github')
    assert.equal(getMarkdownThemeById(independentId).print.mermaid.colorScheme, 'light')

    assignment.printUsesScreenTheme = true
    const linkedId = getEffectivePrintThemeId(assignment)
    assert.equal(linkedId, 'github-dark')
    assert.equal(getMarkdownThemeById(linkedId).print.mermaid.colorScheme, 'dark')
  })
})

describe('Mermaid theme configuration', () => {
  it('resolves a dynamic Markdown palette using the current Markdown color scheme', async () => {
    const { buildMermaidThemeConfig } = await loadMermaidTheme()
    const theme = palette('dynamic')
    theme.variables.background = 'var(--color-base-100)'
    theme.variables.primaryColor = 'var(--color-primary)'

    const result = buildMermaidThemeConfig(theme, {
      dynamicColorScheme: 'dark',
      resolveColor: value => ({
        'var(--color-base-100)': '#111827',
        'var(--color-primary)': '#7c3aed',
      })[value] ?? value,
    })

    assert.equal(result.config.theme, 'base')
    assert.equal(result.config.darkMode, true)
    assert.equal(result.config.themeVariables.darkMode, true)
    assert.equal(result.config.themeVariables.background, '#111827')
    assert.equal(result.config.themeVariables.primaryColor, '#7c3aed')
  })

  it('does not let ambient App mode override a fixed Markdown theme mode', async () => {
    const { buildMermaidThemeConfig } = await loadMermaidTheme()
    const result = buildMermaidThemeConfig(palette('dark'), {
      dynamicColorScheme: 'light',
      resolveColor: value => value,
    })

    assert.equal(result.config.darkMode, true)
    assert.equal(result.config.themeVariables.darkMode, true)
  })

  it('changes the Mermaid initialization key when resolved Markdown colors change', async () => {
    const { buildMermaidThemeConfig } = await loadMermaidTheme()
    const first = buildMermaidThemeConfig(palette('light', '#f6f8fa'), {
      dynamicColorScheme: 'light',
      resolveColor: value => value,
    })
    const second = buildMermaidThemeConfig(palette('light', '#eef2ff'), {
      dynamicColorScheme: 'light',
      resolveColor: value => value,
    })

    assert.notEqual(first.cacheKey, second.cacheKey)
  })
})

describe('Mermaid renderer integration', () => {
  it('resolves a palette CSS variable inside the active Markdown theme scope', async () => {
    await withDom(`
      <!doctype html><html><body>
        <style>.markdown-theme-custom { --diagram-primary: #123456; }</style>
        <div class="markdown-theme-custom" id="scope"></div>
      </body></html>
    `, async () => {
      const renderer = await loadMermaidRenderer({ initialize() {}, async render() { return { svg: '' } } })
      const scope = document.querySelector('#scope')

      assert.equal(renderer.resolveMermaidCssColor('var(--diagram-primary)', scope), '#123456')
      assert.throws(
        () => renderer.resolveMermaidCssColor('var(--missing-color)', scope),
        /Unable to resolve Mermaid color variable --missing-color/,
      )
    })
  })

  it('serializes initialization and rendering when editor and print palettes overlap', async () => {
    await withDom('<!doctype html><html><body></body></html>', async () => {
      const events = []
      let releaseFirst
      const renderer = await loadMermaidRenderer({
        initialize(config) {
          events.push(`init:${config.darkMode ? 'dark' : 'light'}`)
        },
        render(_id, code) {
          events.push(`start:${code}`)
          if (code === 'first') {
            return new Promise(resolve => {
              releaseFirst = () => {
                events.push('end:first')
                resolve({ svg: '<svg>first</svg>' })
              }
            })
          }
          events.push(`end:${code}`)
          return Promise.resolve({ svg: `<svg>${code}</svg>` })
        },
      })

      const first = renderer.renderMermaid('first', palette('light'))
      await Promise.resolve()
      await Promise.resolve()
      const second = renderer.renderMermaid('second', palette('dark'))
      await Promise.resolve()

      assert.deepEqual(events, ['init:light', 'start:first'])
      releaseFirst()
      await Promise.all([first, second])
      assert.deepEqual(events, [
        'init:light',
        'start:first',
        'end:first',
        'init:dark',
        'start:second',
        'end:second',
      ])
    })
  })

  it('passes the effective Markdown print palette into every print render', async () => {
    await withDom('<!doctype html><html><body></body></html>', async () => {
      const calls = []
      const printRenderer = await loadMermaidPrintRenderer(async (code, theme) => {
        calls.push({ code, theme })
        return { svg: '<svg data-print-theme="dark"></svg>' }
      })
      const printTheme = palette('dark', '#151b23')
      const html = '<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>'

      const rendered = await printRenderer.renderMermaidInHtml(html, printTheme)

      assert.equal(calls.length, 1)
      assert.equal(calls[0].code, 'graph TD; A-->B')
      assert.equal(calls[0].theme, printTheme)
      assert.match(rendered, /data-print-theme="dark"/)
    })
  })
})
