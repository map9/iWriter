import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let chatAreaModulePromise
let agentPanelModulePromise

async function compileVueComponent(file, options = {}) {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const source = readFileSync(file, 'utf8')
  const descriptor = parse(source, { filename: file }).descriptor
  const compiled = compileScript(descriptor, {
    id: options.id,
    inlineTemplate: true,
  })
  const result = await build({
    stdin: {
      contents: `${compiled.content}\nexport { reactive, createApp, nextTick } from 'vue'`,
      resolveDir: resolve(file, '..'),
      sourcefile: `${options.id}.compiled.ts`,
      loader: 'ts',
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    plugins: [options.plugin],
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

async function loadChatAreaModule() {
  if (!chatAreaModulePromise) {
    chatAreaModulePromise = compileVueComponent(
      resolve('src/ai/components/agent-panel/AgentChatArea.vue'),
      {
        id: 'agent-chat-scroll-test',
        plugin: {
          name: 'stub-agent-chat-area-dependencies',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/ai\/state\/aiStore$/ }, () => ({
              path: 'ai-store',
              namespace: 'agent-chat-area-stub',
            }))
            buildApi.onResolve({ filter: /^vue-i18n$/ }, () => ({
              path: 'vue-i18n',
              namespace: 'agent-chat-area-stub',
            }))
            buildApi.onResolve({ filter: /\.vue$/ }, args => ({
              path: args.path,
              namespace: 'agent-chat-area-vue-stub',
            }))
            buildApi.onLoad({ filter: /^ai-store$/, namespace: 'agent-chat-area-stub' }, () => ({
              contents: 'export function useAiStore() { return globalThis.__iwriterAgentChatStore }',
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /^vue-i18n$/, namespace: 'agent-chat-area-stub' }, () => ({
              contents: 'export function useI18n() { return { t: key => key } }',
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /.*/, namespace: 'agent-chat-area-vue-stub' }, () => ({
              contents: `import { h } from 'vue'; export default { setup() { return () => h('div') } }`,
              loader: 'js',
              resolveDir: process.cwd(),
            }))
          },
        },
      },
    )
  }
  return chatAreaModulePromise
}

async function loadAgentPanelModule() {
  if (!agentPanelModulePromise) {
    agentPanelModulePromise = compileVueComponent(
      resolve('src/ai/components/shell/AgentPanel.vue'),
      {
        id: 'agent-panel-scroll-button-test',
        plugin: {
          name: 'stub-agent-panel-dependencies',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/ai\/state\/aiStore$/ }, () => ({
              path: 'ai-store',
              namespace: 'agent-panel-stub',
            }))
            buildApi.onResolve({ filter: /^@\/stores\/app$/ }, () => ({
              path: 'app-store',
              namespace: 'agent-panel-stub',
            }))
            buildApi.onResolve({ filter: /^vue-i18n$/ }, () => ({
              path: 'vue-i18n',
              namespace: 'agent-panel-stub',
            }))
            buildApi.onResolve({ filter: /^@tabler\/icons-vue$/ }, () => ({
              path: 'tabler-icons',
              namespace: 'agent-panel-stub',
            }))
            buildApi.onResolve({ filter: /\.vue$/ }, args => ({
              path: args.path,
              namespace: 'agent-panel-vue-stub',
            }))
            buildApi.onLoad({ filter: /^ai-store$/, namespace: 'agent-panel-stub' }, () => ({
              contents: 'export function useAiStore() { return globalThis.__iwriterAgentPanelStore }',
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /^app-store$/, namespace: 'agent-panel-stub' }, () => ({
              contents: 'export function useAppStore() { return { openPreferences() {} } }',
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /^vue-i18n$/, namespace: 'agent-panel-stub' }, () => ({
              contents: 'export function useI18n() { return { t: key => key } }',
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /^tabler-icons$/, namespace: 'agent-panel-stub' }, () => ({
              contents: `import { h } from 'vue'; export const IconArrowDown = { setup() { return () => h('span') } }`,
              loader: 'js',
              resolveDir: process.cwd(),
            }))
            buildApi.onLoad({ filter: /.*/, namespace: 'agent-panel-vue-stub' }, args => ({
              contents: args.path.endsWith('AgentChatArea.vue')
                ? `
                  import { h } from 'vue'
                  export default {
                    emits: ['follow-state-change'],
                    setup(_, { emit, expose }) {
                      expose({
                        scrollToLatest() {
                          globalThis.__iwriterScrollToLatestCalls += 1
                        },
                      })
                      return () => h('button', {
                        class: 'detach-chat-trigger',
                        onClick: () => emit('follow-state-change', 'detached'),
                      }, 'detach')
                    },
                  }
                `
                : `import { h } from 'vue'; export default { setup() { return () => h('div') } }`,
              loader: 'js',
              resolveDir: process.cwd(),
            }))
          },
        },
      },
    )
  }
  return agentPanelModulePromise
}

function installDom(dom, extras = {}) {
  const values = {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    sessionStorage: dom.window.sessionStorage,
    requestAnimationFrame: callback => {
      callback()
      return 1
    },
    ...extras,
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

function createChatStore(module) {
  return module.reactive({
    activeThreadId: 'thread-1',
    conversationEntries: [],
    isActiveThreadDraft: false,
    isInterrupted: false,
    isStreaming: true,
    isSwitchingThread: false,
    liveTurnStartedAt: Date.now(),
    liveTurnState: 'streaming',
    streamingBlocks: [],
    streamingCurrentText: '',
    streamingPreviewMessage: null,
    streamingText: '',
    streamingThinkingText: '',
    streamingToolName: null,
  })
}

class ResizeObserverStub {
  constructor(callback) {
    this.callback = callback
  }

  observe(element) {
    const height = element.classList.contains('bottom-0') ? 64 : 48
    this.callback([{ contentRect: { height } }])
  }

  disconnect() {}
}

describe('agent chat streaming scroll behavior', () => {
  it('resets a selected draft to the top and clears the detached follow state', async () => {
    const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
    const followStates = []
    const restoreDom = installDom(dom)
    let app
    try {
      const module = await loadChatAreaModule()
      const store = createChatStore(module)
      globalThis.__iwriterAgentChatStore = store
      app = module.createApp(module.default, {
        onFollowStateChange: state => followStates.push(state),
      })
      app.mount(dom.window.document.querySelector('#app'))
      await module.nextTick()

      const scroller = dom.window.document.querySelector('#app')?.firstElementChild
      assert.ok(scroller)
      Object.defineProperties(scroller, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, value: 300, writable: true },
      })

      scroller.dispatchEvent(new dom.window.Event('scroll'))
      assert.equal(followStates.at(-1), 'detached')

      store.isActiveThreadDraft = true
      store.activeThreadId = 'thread-draft'
      await module.nextTick()
      await module.nextTick()

      assert.equal(scroller.scrollTop, 0)
      assert.equal(followStates.at(-1), 'following')
    } finally {
      app?.unmount()
      delete globalThis.__iwriterAgentChatStore
      dom.window.close()
      restoreDom()
    }
  })

  it('resumes following five seconds after a shallow user scroll', async () => {
    const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
    const timers = []
    const restoreDom = installDom(dom, {
      setTimeout: (callback, delay) => {
        const timer = { callback, delay, cleared: false }
        timers.push(timer)
        return timer
      },
      clearTimeout: timer => {
        timer.cleared = true
      },
    })
    let app
    try {
      const module = await loadChatAreaModule()
      globalThis.__iwriterAgentChatStore = createChatStore(module)
      app = module.createApp(module.default)
      app.mount(dom.window.document.querySelector('#app'))
      await module.nextTick()

      const scroller = dom.window.document.querySelector('#app')?.firstElementChild
      assert.ok(scroller)
      Object.defineProperties(scroller, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, value: 500, writable: true },
      })

      scroller.dispatchEvent(new dom.window.Event('scroll'))

      assert.equal(timers.length, 1)
      assert.equal(timers[0].delay, 5000)
      timers[0].callback()
      assert.equal(scroller.scrollTop, 1000)
    } finally {
      app?.unmount()
      delete globalThis.__iwriterAgentChatStore
      dom.window.close()
      restoreDom()
    }
  })

  it('never schedules an automatic return after the user scrolls beyond 200px', async () => {
    const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
    const timers = []
    const restoreDom = installDom(dom, {
      setTimeout: (callback, delay) => {
        const timer = { callback, delay, cleared: false }
        timers.push(timer)
        return timer
      },
      clearTimeout: timer => {
        timer.cleared = true
      },
    })
    let app
    try {
      const module = await loadChatAreaModule()
      globalThis.__iwriterAgentChatStore = createChatStore(module)
      app = module.createApp(module.default)
      app.mount(dom.window.document.querySelector('#app'))
      await module.nextTick()

      const scroller = dom.window.document.querySelector('#app')?.firstElementChild
      assert.ok(scroller)
      Object.defineProperties(scroller, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, value: 300, writable: true },
      })

      scroller.dispatchEvent(new dom.window.Event('scroll'))

      assert.equal(timers.length, 0)
      globalThis.__iwriterAgentChatStore.streamingText = 'new output'
      await module.nextTick()
      await module.nextTick()
      assert.equal(scroller.scrollTop, 300)
    } finally {
      app?.unmount()
      delete globalThis.__iwriterAgentChatStore
      dom.window.close()
      restoreDom()
    }
  })
})

describe('scroll-to-latest affordance', () => {
  it('sits above the input and bottom overlay and restores following when clicked', async () => {
    const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
    const restoreDom = installDom(dom, { ResizeObserver: ResizeObserverStub })
    let app
    try {
      const module = await loadAgentPanelModule()
      globalThis.__iwriterScrollToLatestCalls = 0
      globalThis.__iwriterAgentPanelStore = module.reactive({
        activeThread: { id: 'thread-1', messages: [], title: 'Thread' },
        activeThreadId: 'thread-1',
        isActiveThreadDraft: false,
        isInterrupted: false,
        isStreaming: true,
        liveTurnThreadId: 'thread-1',
        pendingCommands: [],
        streamingPreviewMessage: {
          taskPlan: { items: [{ id: 'step-1', status: 'in_progress', text: 'Working' }] },
        },
      })
      app = module.createApp(module.default)
      app.mount(dom.window.document.querySelector('#app'))
      await module.nextTick()

      dom.window.document.querySelector('.detach-chat-trigger')
        ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await module.nextTick()

      const button = dom.window.document.querySelector(
        'button[aria-label="agentPanel.chatArea.scrollToLatest"]',
      )
      assert.ok(button)
      assert.equal(button.style.bottom, '122px')

      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      assert.equal(globalThis.__iwriterScrollToLatestCalls, 1)
    } finally {
      app?.unmount()
      delete globalThis.__iwriterAgentPanelStore
      delete globalThis.__iwriterScrollToLatestCalls
      dom.window.close()
      restoreDom()
    }
  })

  it('stays hidden for a draft thread even when the chat reports detached scrolling', async () => {
    const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
    const restoreDom = installDom(dom, { ResizeObserver: ResizeObserverStub })
    let app
    try {
      const module = await loadAgentPanelModule()
      globalThis.__iwriterScrollToLatestCalls = 0
      globalThis.__iwriterAgentPanelStore = module.reactive({
        activeThread: { id: 'thread-draft', messages: [], title: 'New conversation' },
        activeThreadId: 'thread-draft',
        isActiveThreadDraft: true,
        isInterrupted: false,
        isStreaming: false,
        liveTurnThreadId: null,
        pendingCommands: [],
        streamingPreviewMessage: null,
      })
      app = module.createApp(module.default)
      app.mount(dom.window.document.querySelector('#app'))
      await module.nextTick()

      dom.window.document.querySelector('.detach-chat-trigger')
        ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await module.nextTick()

      assert.equal(
        dom.window.document.querySelector('button[aria-label="agentPanel.chatArea.scrollToLatest"]'),
        null,
      )
    } finally {
      app?.unmount()
      delete globalThis.__iwriterAgentPanelStore
      delete globalThis.__iwriterScrollToLatestCalls
      dom.window.close()
      restoreDom()
    }
  })
})
