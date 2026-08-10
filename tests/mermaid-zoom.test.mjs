import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let codeBlockModulePromise

async function loadCodeBlockModule() {
  if (!codeBlockModulePromise) {
    const file = resolve('src/components/common/tiptap/iwCodeBlockView.vue')
    const { parse, compileScript, compileStyleAsync } = await import('@vue/compiler-sfc')
    const source = readFileSync(file, 'utf8')
    const descriptor = parse(source, { filename: file }).descriptor
    const compiled = compileScript(descriptor, {
      id: 'mermaid-zoom-test',
      inlineTemplate: true,
    })
    const compiledStyles = await Promise.all(descriptor.styles.map(style => compileStyleAsync({
      filename: file,
      id: 'data-v-mermaid-zoom-test',
      preprocessLang: style.lang,
      scoped: style.scoped,
      source: style.content,
    })))
    const styleErrors = compiledStyles.flatMap(style => style.errors)
    if (styleErrors.length > 0) throw new Error(styleErrors.join('\n'))
    const componentCss = compiledStyles.map(style => style.code).join('\n')
    const result = await build({
      stdin: {
        contents: `${compiled.content}\nexport const componentCss = ${JSON.stringify(componentCss)}\nexport { createApp, nextTick, reactive } from 'vue'`,
        resolveDir: resolve(file, '..'),
        sourcefile: 'mermaid-zoom-test.compiled.ts',
        loader: 'ts',
      },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      define: {
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
      plugins: [{
        name: 'stub-mermaid-code-block-dependencies',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@tiptap\/vue-3$/ }, () => ({
            path: 'tiptap-vue',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /^@tabler\/icons-vue$/ }, () => ({
            path: 'tabler-icons',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /utils\/CodeFormatter$/ }, () => ({
            path: 'code-formatter',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /utils\/mermaidRenderer$/ }, () => ({
            path: 'mermaid-renderer',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /^@\/utils\/notifications$/ }, () => ({
            path: 'notifications',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /^@\/stores\/app$/ }, () => ({
            path: 'app-store',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /^@\/components\/print\/markdownThemes$/ }, () => ({
            path: 'markdown-themes',
            namespace: 'mermaid-zoom-stub',
          }))
          buildApi.onResolve({ filter: /^lowlight$/ }, () => ({
            path: 'lowlight',
            namespace: 'mermaid-zoom-stub',
          }))

          buildApi.onLoad({ filter: /^tiptap-vue$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            resolveDir: process.cwd(),
            contents: `
              import { defineComponent, h } from 'vue'
              export const nodeViewProps = {
                editor: { type: Object, required: true },
                node: { type: Object, required: true },
                decorations: { type: Object, required: true },
                selected: { type: Boolean, required: true },
                extension: { type: Object, required: true },
                getPos: { type: Function, required: true },
                updateAttributes: { type: Function, required: true },
                deleteNode: { type: Function, required: true },
                view: { type: Object, required: true },
                innerDecorations: { type: Object, required: true },
                HTMLAttributes: { type: Object, required: true },
              }
              export const NodeViewWrapper = defineComponent({
                inheritAttrs: false,
                setup(_, { attrs, slots }) {
                  return () => h('div', attrs, slots.default?.())
                },
              })
              export const NodeViewContent = defineComponent({
                setup() {
                  return () => h('code')
                },
              })
            `,
          }))
          buildApi.onLoad({ filter: /^tabler-icons$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            resolveDir: process.cwd(),
            contents: `
              import { defineComponent, h } from 'vue'
              const icon = defineComponent({ setup() { return () => h('span') } })
              export const IconTrash = icon
              export const IconCode = icon
              export const IconCopy = icon
              export const IconEdit = icon
              export const IconCheck = icon
              export const IconLayoutColumns = icon
              export const IconLayoutRows = icon
              export const IconZoomIn = icon
              export const IconZoomOut = icon
              export const IconZoomReset = icon
            `,
          }))
          buildApi.onLoad({ filter: /^code-formatter$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            contents: `
              export async function formatCode() { return { success: false } }
              export function isLanguageSupported() { return false }
            `,
          }))
          buildApi.onLoad({ filter: /^mermaid-renderer$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            contents: `
              export async function renderMermaid() {
                return { svg: globalThis.__iwriterMermaidSvg }
              }
            `,
          }))
          buildApi.onLoad({ filter: /^notifications$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            contents: `export const notify = { error() {} }`,
          }))
          buildApi.onLoad({ filter: /^app-store$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            contents: `export function useAppStore() { return globalThis.__iwriterMermaidAppStore }`,
          }))
          buildApi.onLoad({ filter: /^markdown-themes$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            contents: `
              const theme = { id: 'system', screen: { mermaid: {} } }
              export function getAllMarkdownThemes() { return [theme] }
              export function getMarkdownThemeById() { return theme }
            `,
          }))
          buildApi.onLoad({ filter: /^lowlight$/, namespace: 'mermaid-zoom-stub' }, () => ({
            loader: 'js',
            contents: `
              export const common = {}
              export function createLowlight() { return { listLanguages() { return [] } } }
            `,
          }))
        },
      }],
    })
    const code = result.outputFiles[0].text
    codeBlockModulePromise = import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  }
  return codeBlockModulePromise
}

class ResizeObserverStub {
  static instances = new Set()

  constructor(callback) {
    this.callback = callback
    this.elements = new Set()
    ResizeObserverStub.instances.add(this)
  }

  observe(element) {
    this.elements.add(element)
  }

  unobserve(element) {
    this.elements.delete(element)
  }

  disconnect() {
    this.elements.clear()
    ResizeObserverStub.instances.delete(this)
  }

  static trigger(element) {
    for (const observer of ResizeObserverStub.instances) {
      if (observer.elements.has(element)) {
        observer.callback([{ target: element, contentRect: element.getBoundingClientRect() }])
      }
    }
  }
}

function installDom(dom) {
  ResizeObserverStub.instances.clear()
  const values = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    WheelEvent: dom.window.WheelEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    ResizeObserver: ResizeObserverStub,
    requestAnimationFrame: callback => {
      callback()
      return 1
    },
    cancelAnimationFrame() {},
  }
  const previous = new Map(
    Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

function createNodeViewProps(module) {
  const node = module.reactive({
    attrs: { language: 'mermaid' },
    textContent: 'graph TD; A-->B',
  })
  const transaction = {
    setNodeAttribute() { return this },
    setMeta() { return this },
  }
  return {
    node,
    props: {
      editor: { state: { tr: transaction }, view: { dispatch() {} } },
      node,
      decorations: [],
      selected: true,
      extension: { options: { lowlight: { listLanguages: () => ['mermaid'] } } },
      getPos: () => 0,
      updateAttributes() {},
      deleteNode() {},
      view: {},
      innerDecorations: {},
      HTMLAttributes: {},
    },
  }
}

async function settle(module) {
  await Promise.resolve()
  await module.nextTick()
  await Promise.resolve()
  await module.nextTick()
}

function setContainerWidth(container, width) {
  container.style.padding = '12px 16px'
  Object.defineProperty(container, 'clientWidth', {
    configurable: true,
    value: width,
  })
  container.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: 384,
    width,
    height: 384,
    toJSON() {},
  })
  ResizeObserverStub.trigger(container)
}

function setContainerScrollMetrics(container, {
  clientHeight = 384,
  scrollHeight = 800,
  scrollLeft = 120,
  scrollTop = 80,
  scrollWidth = 1200,
} = {}) {
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollLeft: { configurable: true, value: scrollLeft, writable: true },
    scrollTop: { configurable: true, value: scrollTop, writable: true },
    scrollWidth: { configurable: true, value: scrollWidth },
  })
  ResizeObserverStub.trigger(container)
}

async function mountDiagram({ intrinsicWidth = 800, intrinsicHeight = 400, containerWidth = 832 } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
  const restoreDom = installDom(dom)
  codeBlockModulePromise = null
  globalThis.__iwriterMermaidSvg = `
    <svg viewBox="0 0 ${intrinsicWidth} ${intrinsicHeight}" width="100%" style="max-width: ${intrinsicWidth}px;">
      <g></g>
    </svg>
  `
  globalThis.__iwriterMermaidAppStore = {
    globalMarkdownPrintSetting: { themeAssignment: { screenThemeId: 'system' } },
    globalEditSetting: { codeBlockLanguageScope: 'common' },
    currentThemeId: 'light',
    systemPrefersDark: false,
  }

  let app
  try {
    const module = await loadCodeBlockModule()
    module.default.__scopeId = 'data-v-mermaid-zoom-test'
    const style = dom.window.document.createElement('style')
    style.textContent = module.componentCss
    dom.window.document.head.appendChild(style)
    const { node, props } = createNodeViewProps(module)
    app = module.createApp(module.default, props)
    app.mount(dom.window.document.querySelector('#app'))
    await settle(module)

    const container = dom.window.document.querySelector('.mermaid-container')
    assert.ok(container)
    const root = dom.window.document.querySelector('.toolbar-wrapper')
    assert.ok(root)
    setContainerWidth(container, containerWidth)
    await settle(module)

    return {
      app,
      container,
      dom,
      module,
      node,
      root,
      restore() {
        app?.unmount()
        delete globalThis.__iwriterMermaidSvg
        delete globalThis.__iwriterMermaidAppStore
        dom.window.close()
        restoreDom()
      },
    }
  } catch (error) {
    app?.unmount()
    delete globalThis.__iwriterMermaidSvg
    delete globalThis.__iwriterMermaidAppStore
    dom.window.close()
    restoreDom()
    throw error
  }
}

function button(root, title) {
  const result = root.querySelector(`button[title="${title}"]`)
  assert.ok(result, `missing ${title} button`)
  return result
}

function renderedWidth(root) {
  const wrapper = root.querySelector('.mermaid-svg-wrapper')
  assert.ok(wrapper)
  return wrapper.style.width
}

describe('Mermaid chart zoom', { concurrency: false }, () => {
  it('continues growing after an equally wide diagram reaches the viewport width', async () => {
    const fixture = await mountDiagram()
    try {
      assert.equal(renderedWidth(fixture.container), '800px')

      button(fixture.root, 'Zoom In').click()
      await settle(fixture.module)

      assert.equal(renderedWidth(fixture.container), '960px')
    } finally {
      fixture.restore()
    }
  })

  it('clamps relative zoom to one quarter and four times the fit width scale', async () => {
    const fixture = await mountDiagram({ containerWidth: 432 })
    try {
      assert.equal(renderedWidth(fixture.container), '400px')

      for (let index = 0; index < 20; index += 1) {
        button(fixture.root, 'Zoom In').click()
      }
      await settle(fixture.module)
      assert.equal(renderedWidth(fixture.container), '1600px')

      for (let index = 0; index < 40; index += 1) {
        button(fixture.root, 'Zoom Out').click()
      }
      await settle(fixture.module)
      assert.equal(renderedWidth(fixture.container), '100px')

      button(fixture.root, 'Reset Zoom').click()
      await settle(fixture.module)
      assert.equal(renderedWidth(fixture.container), '400px')
    } finally {
      fixture.restore()
    }
  })

  it('uses ordinary wheel input only while the chart viewport has focus', async () => {
    const fixture = await mountDiagram()
    try {
      const unfocusedWheel = new fixture.dom.window.WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -100,
      })
      fixture.container.dispatchEvent(unfocusedWheel)
      await settle(fixture.module)
      assert.equal(unfocusedWheel.defaultPrevented, false)
      assert.equal(renderedWidth(fixture.container), '800px')

      fixture.container.click()
      assert.equal(fixture.dom.window.document.activeElement, fixture.container)
      const focusedWheel = new fixture.dom.window.WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -100,
      })
      fixture.container.dispatchEvent(focusedWheel)
      await settle(fixture.module)

      assert.equal(focusedWheel.defaultPrevented, true)
      assert.equal(renderedWidth(fixture.container), '864px')
    } finally {
      fixture.restore()
    }
  })

  it('scales small trackpad wheel deltas proportionally', async () => {
    const fixture = await mountDiagram()
    try {
      fixture.container.click()
      const wheel = new fixture.dom.window.WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -10,
      })
      fixture.container.dispatchEvent(wheel)
      await settle(fixture.module)

      const width = Number.parseFloat(renderedWidth(fixture.container))
      assert.ok(width > 806 && width < 807, `expected a fine-grained width, got ${width}px`)
    } finally {
      fixture.restore()
    }
  })

  it('drags an overflowing chart in both axes until the mouse is released', async () => {
    const fixture = await mountDiagram()
    try {
      setContainerScrollMetrics(fixture.container)
      await settle(fixture.module)
      assert.equal(fixture.container.classList.contains('is-pannable'), true)

      const chart = fixture.container.querySelector('.mermaid-svg-wrapper')
      assert.ok(chart)
      const mouseDown = new fixture.dom.window.MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 300,
        clientY: 200,
      })
      chart.dispatchEvent(mouseDown)
      await settle(fixture.module)

      assert.equal(mouseDown.defaultPrevented, true)
      assert.equal(fixture.container.classList.contains('is-dragging'), true)

      fixture.dom.window.dispatchEvent(new fixture.dom.window.MouseEvent('mousemove', {
        clientX: 260,
        clientY: 170,
      }))
      assert.equal(fixture.container.scrollLeft, 160)
      assert.equal(fixture.container.scrollTop, 110)

      fixture.dom.window.dispatchEvent(new fixture.dom.window.MouseEvent('mouseup'))
      await settle(fixture.module)
      assert.equal(fixture.container.classList.contains('is-dragging'), false)

      fixture.dom.window.dispatchEvent(new fixture.dom.window.MouseEvent('mousemove', {
        clientX: 220,
        clientY: 140,
      }))
      assert.equal(fixture.container.scrollLeft, 160)
      assert.equal(fixture.container.scrollTop, 110)
    } finally {
      fixture.restore()
    }
  })

  it('leaves ordinary chart clicks alone when there is no overflow to pan', async () => {
    const fixture = await mountDiagram()
    try {
      setContainerScrollMetrics(fixture.container, {
        scrollHeight: 384,
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 832,
      })
      await settle(fixture.module)
      assert.equal(fixture.container.classList.contains('is-pannable'), false)

      const chart = fixture.container.querySelector('.mermaid-svg-wrapper')
      assert.ok(chart)
      const mouseDown = new fixture.dom.window.MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 300,
        clientY: 200,
      })
      chart.dispatchEvent(mouseDown)
      await settle(fixture.module)

      assert.equal(mouseDown.defaultPrevented, false)
      assert.equal(fixture.container.classList.contains('is-dragging'), false)

      fixture.dom.window.dispatchEvent(new fixture.dom.window.MouseEvent('mousemove', {
        clientX: 260,
        clientY: 170,
      }))
      assert.equal(fixture.container.scrollLeft, 0)
      assert.equal(fixture.container.scrollTop, 0)
    } finally {
      fixture.restore()
    }
  })

  it('keeps the scroll origin at the chart left edge while the inner viewport centers small charts', async () => {
    const fixture = await mountDiagram()
    try {
      setContainerScrollMetrics(fixture.container)
      await settle(fixture.module)

      const containerStyle = fixture.dom.window.getComputedStyle(fixture.container)
      assert.equal(containerStyle.justifyContent, 'flex-start')
      assert.equal(containerStyle.alignItems, 'flex-start')

      const viewport = fixture.container.querySelector('.mermaid-viewport')
      assert.ok(viewport)
      const viewportStyle = fixture.dom.window.getComputedStyle(viewport)
      assert.equal(viewportStyle.justifyContent, 'center')
      assert.equal(viewportStyle.alignItems, 'center')
    } finally {
      fixture.restore()
    }
  })

  it('recomputes fit scale after the chart viewport width changes', async () => {
    const fixture = await mountDiagram()
    try {
      button(fixture.root, 'Zoom In').click()
      await settle(fixture.module)
      assert.equal(renderedWidth(fixture.container), '960px')

      setContainerWidth(fixture.container, 432)
      await settle(fixture.module)

      assert.equal(renderedWidth(fixture.container), '480px')
    } finally {
      fixture.restore()
    }
  })
})
