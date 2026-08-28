import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const componentPath = resolve('src/ai/components/agent-panel/chat-area/AgentModeSwitch.vue')
const emptyStatePath = resolve('src/ai/components/agent-panel/chat-area/AgentEmptyState.vue')
let moduleCounter = 0

async function loadComponent() {
  assert.ok(existsSync(componentPath), 'AgentModeSwitch component must exist')

  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const source = readFileSync(componentPath, 'utf8')
  const descriptor = parse(source, { filename: componentPath }).descriptor
  const compiled = compileScript(descriptor, {
    id: 'agent-mode-switch-test',
    inlineTemplate: true,
  })
  const result = await build({
    stdin: {
      contents: `${compiled.content}\nexport { createApp, h, nextTick, reactive } from 'vue'`,
      resolveDir: resolve(componentPath, '..'),
      sourcefile: 'AgentModeSwitch.compiled.ts',
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
      name: 'stub-agent-mode-switch-icons',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@tabler\/icons-vue$/ }, () => ({
          path: 'tabler-icons',
          namespace: 'agent-mode-switch-test',
        }))
        buildApi.onLoad({ filter: /^tabler-icons$/, namespace: 'agent-mode-switch-test' }, () => ({
          contents: `
            import { h } from 'vue'
            export const IconAlertTriangle = {
              setup() {
                return () => h('svg', { 'data-warning-icon': '' })
              },
            }
          `,
          loader: 'js',
          resolveDir: process.cwd(),
        }))
      },
    }],
  })
  const code = `${result.outputFiles[0].text}\n// module-${moduleCounter++}`
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

async function withMountedSwitch({ mode = 'edit', options }, run) {
  const dom = new JSDOM('<div id="app"></div>')
  const globalKeys = [
    'window',
    'document',
    'Element',
    'Node',
    'SVGElement',
    'HTMLElement',
    'Event',
    'MouseEvent',
  ]
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
    const module = await loadComponent()
    const state = module.reactive({ mode })
    const changes = []
    app = module.createApp({
      setup() {
        return () => module.h(module.default, {
          label: '切换创作搭子',
          modelValue: state.mode,
          options,
          'onUpdate:modelValue': value => {
            changes.push(value)
            state.mode = value
          },
        })
      },
    })
    app.mount(dom.window.document.querySelector('#app'))
    await run({ dom, state, changes, nextTick: module.nextTick })
  } finally {
    app?.unmount()
    dom.window.close()
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

async function loadEmptyStateComponent() {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const result = await build({
    stdin: {
      contents: `
        import Component from ${JSON.stringify(emptyStatePath)}
        export default Component
        export { createApp, nextTick, reactive } from 'vue'
      `,
      resolveDir: process.cwd(),
      sourcefile: 'AgentEmptyState.test-entry.ts',
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
    plugins: [
      {
        name: 'stub-agent-empty-state-boundaries',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@\/ai\/state\/aiStore$/ }, () => ({
            path: 'ai-store',
            namespace: 'agent-empty-state-test',
          }))
          buildApi.onResolve({ filter: /^@\/stores\/app$/ }, () => ({
            path: 'app-store',
            namespace: 'agent-empty-state-test',
          }))
          buildApi.onResolve({ filter: /^vue-i18n$/ }, () => ({
            path: 'vue-i18n',
            namespace: 'agent-empty-state-test',
          }))
          buildApi.onResolve({ filter: /^@tabler\/icons-vue$/ }, () => ({
            path: 'tabler-icons',
            namespace: 'agent-empty-state-test',
          }))
          buildApi.onLoad({ filter: /^ai-store$/, namespace: 'agent-empty-state-test' }, () => ({
            contents: 'export function useAiStore() { return globalThis.__iwriterAgentModeStore }',
            loader: 'js',
          }))
          buildApi.onLoad({ filter: /^app-store$/, namespace: 'agent-empty-state-test' }, () => ({
            contents: 'export function useAppStore() { return globalThis.__iwriterAgentModeAppStore }',
            loader: 'js',
          }))
          buildApi.onLoad({ filter: /^vue-i18n$/, namespace: 'agent-empty-state-test' }, () => ({
            contents: `
              export function useI18n() {
                return { t: key => globalThis.__iwriterAgentModeTranslations[key] ?? key }
              }
            `,
            loader: 'js',
          }))
          buildApi.onLoad({ filter: /^tabler-icons$/, namespace: 'agent-empty-state-test' }, () => ({
            contents: `
              import { h } from 'vue'
              const icon = name => ({ setup() { return () => h('svg', { 'data-icon': name }) } })
              export const IconAlertTriangle = icon('warning')
              export const IconBrain = icon('brain')
            `,
            loader: 'js',
            resolveDir: process.cwd(),
          }))
        },
      },
      {
        name: 'compile-agent-empty-state-vue-files',
        setup(buildApi) {
          buildApi.onResolve({ filter: /\.vue$/ }, args => ({
            path: args.path.startsWith('/') ? args.path : resolve(args.resolveDir, args.path),
            namespace: 'agent-empty-state-vue',
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'agent-empty-state-vue' }, async args => {
            const source = readFileSync(args.path, 'utf8')
            const descriptor = parse(source, { filename: args.path }).descriptor
            const compiled = compileScript(descriptor, {
              id: `agent-empty-state-${moduleCounter}`,
              inlineTemplate: true,
            })
            return {
              contents: compiled.content,
              loader: 'ts',
              resolveDir: resolve(args.path, '..'),
            }
          })
        },
      },
    ],
  })
  const code = `${result.outputFiles[0].text}\n// empty-state-module-${moduleCounter++}`
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

async function withMountedEmptyState({ currentFolder = '/workspace', draft = true }, run) {
  const dom = new JSDOM('<div id="app"></div>')
  const globalKeys = [
    'window',
    'document',
    'Element',
    'Node',
    'SVGElement',
    'HTMLElement',
    'Event',
    'MouseEvent',
    '__iwriterAgentModeStore',
    '__iwriterAgentModeAppStore',
    '__iwriterAgentModeTranslations',
  ]
  const previousGlobals = new Map(
    globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )

  for (const key of globalKeys.slice(0, 8)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    })
  }

  let app
  try {
    const module = await loadEmptyStateComponent()
    const activeThread = module.reactive({ mode: 'edit' })
    const store = module.reactive({
      displayMessages: [],
      liveTurnState: null,
      isSwitchingThread: false,
      isActiveThreadDraft: draft,
      activeThread,
      settings: { defaultMode: 'edit' },
      setCurrentMode(mode) {
        activeThread.mode = mode
      },
    })
    const appStore = module.reactive({ activeTab: null, currentFolder })
    const translations = {
      'agentPanel.modePicker.switchMode': '切换创作搭子',
      'agentPanel.modePicker.options.edit': '日常写作搭子',
      'agentPanel.modePicker.options.editDesc': '原日常写作说明',
      'agentPanel.modePicker.options.creative': '小说创作搭子',
      'agentPanel.modePicker.options.creativeDesc': '原小说创作说明',
      'agentPanel.modePicker.options.creativeDisabledHint': '需打开工程空间',
      'agentPanel.emptyState.promptEdit': '我能帮你写点什么？',
      'agentPanel.emptyState.promptCreative': '今天，想讲一个怎样的故事？',
    }
    Object.defineProperty(globalThis, '__iwriterAgentModeStore', {
      configurable: true,
      writable: true,
      value: store,
    })
    Object.defineProperty(globalThis, '__iwriterAgentModeAppStore', {
      configurable: true,
      writable: true,
      value: appStore,
    })
    Object.defineProperty(globalThis, '__iwriterAgentModeTranslations', {
      configurable: true,
      writable: true,
      value: translations,
    })

    app = module.createApp(module.default)
    app.mount(dom.window.document.querySelector('#app'))
    await run({ dom, store, nextTick: module.nextTick })
  } finally {
    app?.unmount()
    dom.window.close()
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

const enabledOptions = [
  { value: 'edit', label: '日常写作搭子' },
  { value: 'creative', label: '小说创作搭子' },
]

describe('AgentModeSwitch', () => {
  it('emits an enabled selection and keeps exactly one radio selected', async () => {
    await withMountedSwitch({ options: enabledOptions }, async ({ dom, state, changes, nextTick }) => {
      const radioGroup = dom.window.document.querySelector('[role="radiogroup"]')
      assert.equal(radioGroup.getAttribute('aria-label'), '切换创作搭子')
      const radios = [...dom.window.document.querySelectorAll('[role="radio"]')]
      assert.equal(radios.length, 2)
      assert.deepEqual(radios.map(radio => radio.getAttribute('aria-checked')), ['true', 'false'])

      radios[1].click()
      await nextTick()

      assert.deepEqual(changes, ['creative'])
      assert.equal(state.mode, 'creative')
      assert.deepEqual(radios.map(radio => radio.getAttribute('aria-checked')), ['false', 'true'])
    })
  })

  it('keeps a disabled option inactive and shows its warning inside the radio', async () => {
    await withMountedSwitch({
      options: [
        enabledOptions[0],
        {
          ...enabledOptions[1],
          disabled: true,
          disabledHint: '需打开工程空间',
        },
      ],
    }, async ({ dom, state, changes, nextTick }) => {
      const creativeRadio = dom.window.document.querySelectorAll('[role="radio"]')[1]
      assert.equal(creativeRadio.disabled, true)
      assert.match(creativeRadio.textContent, /需打开工程空间/)
      assert.ok(creativeRadio.querySelector('[data-warning-icon]'))
      assert.ok(creativeRadio.querySelector('.text-warning'))

      creativeRadio.click()
      await nextTick()

      assert.deepEqual(changes, [])
      assert.equal(state.mode, 'edit')
      assert.equal(creativeRadio.getAttribute('aria-checked'), 'false')
    })
  })

  it('keeps the selected indicator when the selected option becomes unavailable', async () => {
    await withMountedSwitch({
      mode: 'creative',
      options: [
        enabledOptions[0],
        {
          ...enabledOptions[1],
          disabled: true,
          disabledHint: '需打开工程空间',
        },
      ],
    }, async ({ dom }) => {
      const creativeRadio = dom.window.document.querySelectorAll('[role="radio"]')[1]
      assert.equal(creativeRadio.getAttribute('aria-checked'), 'true')
      assert.ok(creativeRadio.classList.contains('bg-base-100'))
    })
  })
})

describe('AgentEmptyState mode selection', () => {
  it('switches a draft thread and updates its heading without a mode description or icon', async () => {
    await withMountedEmptyState({}, async ({ dom, store, nextTick }) => {
      const radios = [...dom.window.document.querySelectorAll('[role="radio"]')]
      assert.equal(radios.length, 2)
      assert.equal(dom.window.document.querySelector('h2')?.textContent.trim(), '我能帮你写点什么？')
      assert.doesNotMatch(dom.window.document.body.textContent, /原日常写作说明/)
      assert.equal(dom.window.document.querySelector('[data-icon="brain"]'), null)

      radios[1].click()
      await nextTick()

      assert.equal(store.activeThread.mode, 'creative')
      assert.equal(dom.window.document.querySelector('h2')?.textContent.trim(), '今天，想讲一个怎样的故事？')
      assert.doesNotMatch(dom.window.document.body.textContent, /原小说创作说明/)
    })
  })

  it('centers short content while allowing tall content to start at the top', async () => {
    await withMountedEmptyState({}, async ({ dom }) => {
      const emptyState = dom.window.document.querySelector('#app > div')
      const content = emptyState?.firstElementChild

      assert.ok(emptyState?.classList.contains('min-h-full'))
      assert.equal(emptyState?.classList.contains('h-full'), false)
      assert.ok(content?.classList.contains('my-auto'))
    })
  })

  it('passes the workspace requirement into the disabled creative radio', async () => {
    await withMountedEmptyState({ currentFolder: null }, async ({ dom, store, nextTick }) => {
      const radios = dom.window.document.querySelectorAll('[role="radio"]')
      assert.equal(radios.length, 2)
      const creativeRadio = radios[1]
      assert.equal(creativeRadio.disabled, true)
      assert.match(creativeRadio.textContent, /需打开工程空间/)
      assert.ok(creativeRadio.querySelector('.text-warning'))

      creativeRadio.click()
      await nextTick()

      assert.equal(store.activeThread.mode, 'edit')
    })
  })

  it('does not expose the mode switch after the draft thread locks', async () => {
    await withMountedEmptyState({ draft: false }, async ({ dom }) => {
      assert.equal(dom.window.document.querySelector('[role="radiogroup"]'), null)
      assert.equal(dom.window.document.querySelector('h2')?.textContent.trim(), '我能帮你写点什么？')
    })
  })
})
