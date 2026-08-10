import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'

describe('ToolCallCard layout', () => {
  it('keeps a running card header at the normal collapsed-card height', async () => {
    const dom = new JSDOM('<div id="app"></div>')
    const globalKeys = ['window', 'document', 'Element', 'Node', 'SVGElement']
    const previousGlobals = new Map(
      globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    )

    for (const key of globalKeys) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: dom.window[key],
      })
    }

    let app
    try {
      const Vue = await import('vue')
      const { parse } = await import('@vue/compiler-sfc')
      const { compile } = await import('@vue/compiler-dom')
      const source = readFileSync(
        'src/components/ai/agent-panel/chat-area/views/ToolCallCard.vue',
        'utf8',
      )
      const descriptor = parse(source).descriptor
      assert.ok(descriptor.template?.content)
      const renderCode = compile(descriptor.template.content, {
        mode: 'function',
        prefixIdentifiers: true,
      }).code
      const render = new Function('Vue', renderCode)(Vue)
      const component = {
        render,
        setup() {
          return {
            containerClass: '',
            groupContainerClass: '',
            groupDividerClass: '',
            toggleExpanded: () => {},
            isSpinning: true,
            completedKindIcon: null,
            statusIcon: '•',
            actionLabel: '网络搜索',
            inputLine: '"1992 湖南高考 录取分数线"',
            targetPath: '',
            targetLabel: '"1992 湖南高考 录取分数线"',
            openTargetFile: () => {},
            contextSummaryLine: '',
            showExpandableDetail: false,
            expanded: false,
            t: key => key,
            showDetail: false,
            detailBorderClass: '',
          }
        },
      }

      app = Vue.createApp(component)
      const iconStub = { render: () => Vue.h('span') }
      for (const name of ['IconLoader2', 'IconChevronDown', 'IconChevronUp']) {
        app.component(name, iconStub)
      }
      app.component('MarkdownContentView', iconStub)
      app.mount(dom.window.document.querySelector('#app'))

      const card = dom.window.document.querySelector('#app')?.firstElementChild
      const header = card?.firstElementChild
      assert.ok(header)
      assert.ok(
        header.classList.contains('min-h-7'),
        'expected running ToolCallCard headers to keep the normal 28px minimum height',
      )
    } finally {
      app?.unmount()
      dom.window.close()
      for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  })
})
