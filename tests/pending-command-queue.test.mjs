import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let queueModulePromise
let chatSendModulePromise
let runtimeEventsModulePromise
let agentPanelModulePromise

async function loadQueueModule() {
  if (!queueModulePromise) {
    queueModulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `export * from './src/ai/store/modules/pendingCommands.ts'`,
          resolveDir: process.cwd(),
          sourcefile: 'pending-command-queue-test-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return queueModulePromise
}

async function loadChatSendModule() {
  if (!chatSendModulePromise) {
    chatSendModulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { reactive, ref, nextTick } from 'vue'
            export { useChatSend } from './src/components/ai/agent-panel/composables/useChatSend.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'pending-command-chat-send-test-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        alias: {
          '@': resolve('src'),
        },
        plugins: [{
          name: 'stub-ai-store',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/ai\/store\/ai$/ }, () => ({
              path: 'ai-store',
              namespace: 'test-stub',
            }))
            buildApi.onLoad({ filter: /.*/, namespace: 'test-stub' }, () => ({
              contents: 'export function useAiStore() { return globalThis.__iwriterPendingCommandStore }',
              loader: 'js',
            }))
          },
        }],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return chatSendModulePromise
}

async function loadRuntimeEventsModule() {
  if (!runtimeEventsModulePromise) {
    runtimeEventsModulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { computed, ref } from 'vue'
            export { createRuntimeEvents } from './src/ai/store/modules/runtimeEvents.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'pending-command-runtime-events-test-entry.ts',
        },
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
  return runtimeEventsModulePromise
}

async function loadAgentPanelModule() {
  if (!agentPanelModulePromise) {
    agentPanelModulePromise = (async () => {
      const { parse, compileScript } = await import('@vue/compiler-sfc')
      const source = readFileSync('src/components/ai/AgentPanel.vue', 'utf8')
      const descriptor = parse(source, { filename: 'AgentPanel.vue' }).descriptor
      const compiled = compileScript(descriptor, {
        id: 'pending-command-agent-panel-test',
        inlineTemplate: true,
      })
      const result = await build({
        stdin: {
          contents: `${compiled.content}\nexport { reactive, createApp, nextTick } from 'vue'`,
          resolveDir: resolve('src/components/ai'),
          sourcefile: 'AgentPanel.compiled.ts',
          loader: 'ts',
        },
        bundle: true,
        platform: 'browser',
        format: 'esm',
        write: false,
        plugins: [{
          name: 'stub-agent-panel-dependencies',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/ai\/store\/ai$/ }, () => ({
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
            buildApi.onLoad({ filter: /.*/, namespace: 'agent-panel-vue-stub' }, args => ({
              contents: args.path.endsWith('PendingCommandList.vue')
                ? `import { h } from 'vue'; export default { setup() { return () => h('div', { class: 'pending-command-list' }) } }`
                : `import { h } from 'vue'; export default { setup() { return () => h('div') } }`,
              loader: 'js',
              resolveDir: process.cwd(),
            }))
          },
        }],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return agentPanelModulePromise
}

describe('pending command queue', () => {
  it('isolates commands by thread and merges one thread in submission order', async () => {
    const { createPendingCommandQueue } = await loadQueueModule()
    let id = 0
    const queue = createPendingCommandQueue({
      createId: () => `command-${++id}`,
      now: () => id,
    })

    queue.enqueue('thread-1', 'first', {
      filePaths: ['/a.md', '/image.png'],
      directories: ['/notes'],
    })
    queue.enqueue('thread-2', 'other thread')
    queue.enqueue('thread-1', 'second', {
      filePaths: ['/a.md', '/b.md', '/image.png'],
      directories: ['/drafts'],
    })

    assert.deepEqual(queue.getCommands('thread-1').map(command => command.text), ['first', 'second'])
    assert.deepEqual(queue.getCommands('thread-2').map(command => command.text), ['other thread'])
    assert.deepEqual(queue.createBatch('thread-1'), {
      ids: ['command-1', 'command-3'],
      text: 'first\n\nsecond',
      sendContext: {
        filePaths: ['/a.md', '/image.png', '/b.md'],
        directories: ['/notes', '/drafts'],
      },
    })
  })

  it('removes only a dispatched snapshot and leaves later commands queued', async () => {
    const { createPendingCommandQueue } = await loadQueueModule()
    let id = 0
    const queue = createPendingCommandQueue({ createId: () => `command-${++id}` })
    const first = queue.enqueue('thread-1', 'first')
    queue.enqueue('thread-1', 'second')
    const batch = queue.createBatch('thread-1')

    queue.enqueue('thread-1', 'arrived while sending')
    queue.removeByIds('thread-1', batch.ids)

    assert.deepEqual(queue.getCommands('thread-1').map(command => command.text), ['arrived while sending'])
    assert.equal(queue.remove('thread-1', first.id), null)
  })

  it('supports inline edits without moving an item', async () => {
    const { createPendingCommandQueue } = await loadQueueModule()
    let id = 0
    const queue = createPendingCommandQueue({ createId: () => `command-${++id}` })
    const first = queue.enqueue('thread-1', 'first')
    queue.enqueue('thread-1', 'second')

    assert.equal(queue.update('thread-1', first.id, 'updated first'), true)
    assert.deepEqual(queue.getCommands('thread-1').map(command => command.text), ['updated first', 'second'])
    assert.equal(queue.update('thread-1', first.id, '   '), false)
  })
})

describe('pending command submission', () => {
  async function createHarness({ isStreaming, isInterrupted }) {
    const module = await loadChatSendModule()
    const queued = []
    const sent = []
    const store = module.reactive({
      activeThread: { id: 'thread-1', domain: 'editing', mode: 'edit', updatedAt: 1 },
      settings: { defaultMode: 'edit' },
      effectiveProviderConfig: { id: 'provider-1', defaultModelId: 'model-1' },
      displayMessages: [],
      isStreaming,
      isInterrupted,
      liveTurnThreadId: 'thread-1',
      draftInput: 'queued instruction',
      setDraftInput(value) { this.draftInput = value },
      queuePendingCommand(text, sendContext) {
        queued.push({ text, sendContext })
        return true
      },
      async sendMessage(text, sendContext) {
        sent.push({ text, sendContext })
        return true
      },
    })
    const previousStore = globalThis.__iwriterPendingCommandStore
    const previousWindow = globalThis.window
    globalThis.__iwriterPendingCommandStore = store
    globalThis.window = {
      electronAPI: {
        async aiGetSessionContextStats() {
          return {
            visible: true,
            currentTokens: 10,
            triggerTokens: 100,
            requestBudgetTokens: 120,
          }
        },
      },
    }
    const contextFiles = module.ref([
      { path: '/notes.md', kind: 'file' },
      { path: '/image.png', kind: 'file' },
      { path: '/references', kind: 'directory' },
    ])
    const state = module.useChatSend(contextFiles)
    await module.nextTick()

    return {
      state,
      store,
      queued,
      sent,
      contextFiles,
      restore() {
        globalThis.__iwriterPendingCommandStore = previousStore
        globalThis.window = previousWindow
      },
    }
  }

  for (const runState of [
    { label: 'streaming', isStreaming: true, isInterrupted: false },
    { label: 'waiting for approval', isStreaming: false, isInterrupted: true },
  ]) {
    it(`queues and clears the composer while ${runState.label}`, async () => {
      const harness = await createHarness(runState)
      try {
        await harness.state.sendMessage()
        assert.equal(harness.queued.length, 1)
        assert.equal(harness.sent.length, 0)
        assert.deepEqual(harness.queued[0], {
          text: 'queued instruction',
          sendContext: {
            filePaths: ['/notes.md', '/image.png'],
            directories: ['/references'],
          },
        })
        assert.equal(harness.store.draftInput, '')
        assert.deepEqual(harness.contextFiles.value, [])
      } finally {
        harness.restore()
      }
    })
  }

  it('sends normally while the thread is idle', async () => {
    const harness = await createHarness({ isStreaming: false, isInterrupted: false })
    try {
      await harness.state.sendMessage()
      assert.equal(harness.queued.length, 0)
      assert.equal(harness.sent.length, 1)
    } finally {
      harness.restore()
    }
  })
})

describe('normal run completion handoff', () => {
  it('does not settle until checkpoint messages have been refreshed', async () => {
    const module = await loadRuntimeEventsModule()
    const checkpoint = Promise.withResolvers()
    const thread = module.ref({ id: 'thread-1', messages: [], messagesLoaded: false })
    const threadRunState = module.ref('streaming')
    let creativeFinalized = false
    const previousWindow = globalThis.window
    globalThis.window = {
      electronAPI: {
        aiGetThreadMessages: () => checkpoint.promise,
      },
    }

    try {
      const runtimeEvents = module.createRuntimeEvents({
        activeThread: module.computed(() => thread.value),
        threadRunState,
        liveTurn: module.ref(null),
        finalizePendingCreativeApply() { creativeFinalized = true },
        clearLiveTurn() {},
        clearRunPointers() {},
        resetEditReviewState() {},
        resetCreativeReviewState() {},
        normalizeMessagesForDisplay: messages => messages,
        getCompletedRoundResult: () => null,
        getCompletedCreativeRoundResult: () => creativeFinalized ? { summary: 'creative result' } : null,
        updateThread(updated) { thread.value = updated },
      })

      const completion = runtimeEvents.onRunDone({ threadId: 'thread-1', turnId: 'turn-1' })
      assert.equal(typeof completion?.then, 'function')
      let settled = false
      completion.then(() => { settled = true })
      await new Promise(resolvePromise => setImmediate(resolvePromise))
      assert.equal(settled, false)
      assert.equal(threadRunState.value, 'streaming')

      checkpoint.resolve([{ id: 'assistant-1', role: 'assistant', content: 'done' }])
      assert.deepEqual(await completion, {
        completedSuccessfully: true,
        checkpointRefreshed: true,
        stillCurrent: true,
      })
      assert.equal(thread.value.messagesLoaded, true)
      assert.deepEqual(thread.value.messages[0].creativeRoundResult, { summary: 'creative result' })
      assert.equal(threadRunState.value, 'idle')
    } finally {
      globalThis.window = previousWindow
    }
  })

  it('wires automatic dispatch only after a successful done event', () => {
    const storeSource = readFileSync('src/ai/store/ai.ts', 'utf8')
    assert.match(
      storeSource,
      /const completion = await runtimeEvents\.onRunDone\([\s\S]*if \(completion\.completedSuccessfully && completion\.checkpointRefreshed && completion\.stillCurrent\)[\s\S]*dispatchPendingCommands\(event\.threadId\)/,
    )
    assert.doesNotMatch(storeSource, /onRunInterrupted[\s\S]{0,200}dispatchPendingCommands/)
    assert.doesNotMatch(storeSource, /onRunError[\s\S]{0,200}dispatchPendingCommands/)
  })

  it('can cancel before the main process returns the run id without restoring stale pointers', () => {
    const storeSource = readFileSync('src/ai/store/ai.ts', 'utf8')
    assert.match(
      storeSource,
      /_currentThreadId\.value \?\? _interruptedThreadId\.value \?\? _liveTurn\.value\?\.threadId/,
    )
    assert.match(
      storeSource,
      /_runTransitionEpoch === turnEpoch[\s\S]{0,160}_currentTurnId\.value === turnId[\s\S]{0,160}_currentThreadId\.value = result\.threadId/,
    )
    assert.match(storeSource, /if \(_cancelInFlight\) return _cancelInFlight/)
  })

  it('does not clear or dispatch over a newer run when checkpoint refresh resolves late', async () => {
    const module = await loadRuntimeEventsModule()
    const checkpoint = Promise.withResolvers()
    const thread = module.ref({ id: 'thread-1', messages: [], messagesLoaded: false })
    const threadRunState = module.ref('streaming')
    const liveTurn = module.ref({ threadId: 'thread-1', turnId: 'turn-old' })
    let ownsRun = true
    const previousWindow = globalThis.window
    globalThis.window = {
      electronAPI: {
        aiGetThreadMessages: () => checkpoint.promise,
      },
    }

    try {
      const runtimeEvents = module.createRuntimeEvents({
        activeThread: module.computed(() => thread.value),
        threadRunState,
        liveTurn,
        finalizePendingCreativeApply() {},
        clearLiveTurn() { liveTurn.value = null },
        clearRunPointers() {},
        resetEditReviewState() {},
        resetCreativeReviewState() {},
        normalizeMessagesForDisplay: messages => messages,
        getCompletedRoundResult: () => null,
        getCompletedCreativeRoundResult: () => null,
        updateThread(updated) { thread.value = updated },
      })

      const completion = runtimeEvents.onRunDone(
        { threadId: 'thread-1', turnId: 'turn-old' },
        () => ownsRun,
      )
      ownsRun = false
      liveTurn.value = { threadId: 'thread-1', turnId: 'turn-new' }
      checkpoint.resolve([{ id: 'assistant-old', role: 'assistant', content: 'old' }])

      assert.deepEqual(await completion, {
        completedSuccessfully: true,
        checkpointRefreshed: false,
        stillCurrent: false,
      })
      assert.equal(threadRunState.value, 'streaming')
      assert.equal(liveTurn.value.turnId, 'turn-new')
      assert.deepEqual(thread.value.messages, [])
    } finally {
      globalThis.window = previousWindow
    }
  })

  it('retains pending handoff when checkpoint messages are empty', async () => {
    const module = await loadRuntimeEventsModule()
    const thread = module.ref({ id: 'thread-1', messages: [], messagesLoaded: false })
    const previousWindow = globalThis.window
    globalThis.window = {
      electronAPI: {
        async aiGetThreadMessages() { return [] },
      },
    }
    try {
      const runtimeEvents = module.createRuntimeEvents({
        activeThread: module.computed(() => thread.value),
        threadRunState: module.ref('streaming'),
        liveTurn: module.ref(null),
        finalizePendingCreativeApply() {},
        clearLiveTurn() {},
        clearRunPointers() {},
        resetEditReviewState() {},
        resetCreativeReviewState() {},
        normalizeMessagesForDisplay: messages => messages,
        getCompletedRoundResult: () => null,
        getCompletedCreativeRoundResult: () => null,
        updateThread(updated) { thread.value = updated },
      })

      assert.deepEqual(
        await runtimeEvents.onRunDone({ threadId: 'thread-1', turnId: 'turn-1' }),
        {
          completedSuccessfully: true,
          checkpointRefreshed: false,
          stillCurrent: true,
        },
      )
    } finally {
      globalThis.window = previousWindow
    }
  })
})

describe('pending command UI contract', () => {
  it('hides the pending list while approval is required and shows it again afterwards', async () => {
    const { JSDOM } = await import('jsdom')
    const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost' })
    const globalKeys = [
      'window',
      'document',
      'Element',
      'HTMLElement',
      'Node',
      'SVGElement',
      'sessionStorage',
      'ResizeObserver',
    ]
    const previousGlobals = new Map(
      globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    )

    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }

    for (const key of globalKeys) {
      const value = key === 'sessionStorage'
        ? dom.window.sessionStorage
        : key === 'ResizeObserver'
          ? ResizeObserverStub
          : dom.window[key]
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    }

    let app
    try {
      const module = await loadAgentPanelModule()
      const store = module.reactive({
        activeThread: { id: 'thread-1', messages: [], title: 'Thread' },
        activeThreadId: 'thread-1',
        pendingCommands: [{ id: 'command-1', text: 'queued' }],
        isStreaming: false,
        isInterrupted: true,
        streamingPreviewMessage: null,
        liveTurnThreadId: 'thread-1',
      })
      globalThis.__iwriterAgentPanelStore = store
      app = module.createApp(module.default)
      app.mount(dom.window.document.querySelector('#app'))

      assert.equal(dom.window.document.querySelector('.pending-command-list'), null)

      store.isInterrupted = false
      store.isStreaming = true
      await module.nextTick()
      assert.ok(dom.window.document.querySelector('.pending-command-list'))
    } finally {
      app?.unmount()
      delete globalThis.__iwriterAgentPanelStore
      dom.window.close()
      for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  })

  it('keeps each item and its icon actions on one line below the task plan', () => {
    const panelSource = readFileSync('src/components/ai/AgentPanel.vue', 'utf8')
    const listSource = readFileSync('src/components/ai/agent-panel/PendingCommandList.vue', 'utf8')

    assert.ok(panelSource.indexOf('<TaskPlanCard') < panelSource.indexOf('<PendingCommandList'))
    assert.match(listSource, /flex[^\"]*items-center/)
    assert.match(listSource, /truncate/)
    assert.match(listSource, /IconArrowForward/)
    assert.match(listSource, /IconPencil/)
    assert.match(listSource, /IconTrash/)
    assert.doesNotMatch(listSource, /<h[1-6]|pendingCommands\.title|footer/i)
  })
})
