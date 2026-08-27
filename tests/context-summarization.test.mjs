import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let modulePromise
let chatSendModulePromise

async function loadChatSendModule() {
  if (!chatSendModulePromise) {
    chatSendModulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { reactive, ref, nextTick } from 'vue'
            export * from './src/ai/components/agent-panel/composables/useChatSend.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'chat-send-test-entry.ts',
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
            buildApi.onResolve({ filter: /^@\/ai\/state\/aiStore$/ }, () => ({
              path: 'ai-store',
              namespace: 'test-stub',
            }))
            buildApi.onLoad({ filter: /.*/, namespace: 'test-stub' }, () => ({
              contents: 'export function useAiStore() { return globalThis.__iwriterTestAiStore }',
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

async function loadTooltipModule() {
  const result = await build({
    stdin: {
      contents: `export { TooltipManager } from './src/components/common/statusbar/utils/TooltipManager.ts'`,
      resolveDir: process.cwd(),
      sourcefile: 'tooltip-manager-test-entry.ts',
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

function sessionStats(currentTokens) {
  return {
    visible: true,
    currentTokens,
    triggerTokens: 1000,
    requestBudgetTokens: 1200,
    keepTokens: 100,
    maxInputTokens: 2000,
  }
}

async function flushVueWatchers(nextTick) {
  await nextTick()
  await new Promise(resolvePromise => setImmediate(resolvePromise))
  await nextTick()
}

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export {
              EDITING_SUMMARIZATION_PROFILE,
              CREATIVE_SUMMARIZATION_PROFILE,
              buildSummarizationInstruction,
              buildSummarizationPrompt,
            } from './electron/ai/scaffold/summarization/SummarizationFramework.ts'
            export {
              insertContextCompressionEvents,
            } from './src/ai/presentation/conversation/buildConversationEntries.ts'
            export {
              createRuntimeEvents,
            } from './src/ai/state/runEvents.ts'
            export {
              StreamEventAdapter,
              parseDeepAgentsSummarizationEvent,
            } from './electron/ai/ipc/StreamEventAdapter.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'context-summarization-test-entry.ts',
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
  return modulePromise
}

describe('summarization framework', () => {
  it('uses one common envelope with domain-specific state fields', async () => {
    const {
      EDITING_SUMMARIZATION_PROFILE,
      CREATIVE_SUMMARIZATION_PROFILE,
      buildSummarizationInstruction,
      buildSummarizationPrompt,
    } = await loadModule()

    const editingInstruction = buildSummarizationInstruction(EDITING_SUMMARIZATION_PROFILE)
    const editing = buildSummarizationPrompt(EDITING_SUMMARIZATION_PROFILE)
    const creative = buildSummarizationPrompt(CREATIVE_SUMMARIZATION_PROFILE)

    assert.doesNotMatch(editingInstruction, /\{conversation\}/)
    assert.doesNotMatch(editingInstruction, /Conversation to compact:/)
    assert.match(editingInstruction, /## Current task/)

    for (const prompt of [editing, creative]) {
      assert.equal(prompt.match(/\{conversation\}/g)?.length, 1)
      assert.match(prompt, /## Current task/)
      assert.match(prompt, /## Evidence and source references/)
      assert.match(prompt, /## Retrieval keys/)
      assert.match(prompt, /mutable state.*not.*append/is)
      assert.match(prompt, /Each fact.*only one section/is)
      assert.match(prompt, /semantic results.*inventory/is)
      assert.match(prompt, /unless.*block.*deliverable/is)
      assert.match(prompt, /confirmed.*inference.*open/is)
      assert.match(prompt, /6-10.*discriminative literal keys/is)
      assert.doesNotMatch(prompt, /When the current summary lacks.*grep/is)
      assert.doesNotMatch(prompt, /context ledger/i)
      assert.match(prompt, /Do not invent missing state/)
    }

    assert.match(editing, /block IDs/)
    assert.doesNotMatch(editing, /selected Playbook/)
    assert.match(creative, /selected Playbook/)
    assert.match(creative, /confirmed project facts from candidates/)
  })
})

describe('context compression display event', () => {
  it('keeps a live compression card at its stream position before later text and status', async () => {
    const { JSDOM } = await import('jsdom')
    const { parse } = await import('@vue/compiler-sfc')
    const { compile } = await import('@vue/compiler-dom')
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
      const source = readFileSync(
        'src/ai/components/agent-panel/chat-area/AgentMessageBubble.vue',
        'utf8',
      )
      const descriptor = parse(source).descriptor
      assert.ok(descriptor.template?.content)
      const renderCode = compile(descriptor.template.content, {
        mode: 'function',
        prefixIdentifiers: true,
      })
        .code
        .replace(/\)!/g, ')')
      const render = new Function('Vue', renderCode)(Vue)

      const event = {
        id: 'compression-after-anchor',
        threadId: 'thread-1',
        status: 'completed',
        startedAt: 1,
        timestamp: 2,
      }
      const component = {
        render,
        setup() {
          const blocks = [
            { type: 'text', text: 'BEFORE_COMPRESSION' },
            { type: 'context_compression', event },
            { type: 'text', text: 'AFTER_COMPRESSION' },
          ]
          return {
            shouldRenderMessage: true,
            message: {
              id: 'assistant-1',
              role: 'assistant',
              content: 'BEFORE_COMPRESSIONAFTER_COMPRESSION',
              timestamp: 1,
              toolCalls: [],
            },
            isEditing: false,
            isPreview: true,
            isExpanded: true,
            isOverflow: false,
            isHovered: false,
            visibleContentBlocks: blocks,
            renderableContentBlocks: blocks.filter(block => block.type !== 'context_compression'),
            contextCompressionBlocks: blocks.filter(block => block.type === 'context_compression'),
            readToolCalls: [],
            editToolCalls: [],
            creativeReviewToolCalls: [],
            isLatestAssistantMessage: false,
            shouldShowThinkingToggle: false,
            thinkingContent: '',
            previewStatusText: 'STREAM_STATUS',
            showPreviewPulse: false,
            showHoverToolbar: false,
            maxTextareaHeight: '100px',
            splitAssistantText: text => [{ kind: 'prose', text }],
            isReadToolById: () => true,
            findSubTaskFor: () => undefined,
            shouldShowTaskFallback: () => false,
            toolCallById: () => undefined,
            contentBlockToolPosition: () => 'single',
            contentBlockToolMarginClass: () => '',
            taskSubagentTypeOf: () => undefined,
            readToolPosition: () => 'single',
            formatTime: () => '',
            t: key => key,
            handleCopy: () => {},
            startEdit: () => {},
            submitEdit: () => {},
            autoResize: () => {},
          }
        },
      }

      app = Vue.createApp(component)
      const passthroughStub = { render: () => Vue.h('div') }
      for (const name of [
        'SubTaskProgressView',
        'DomainMessageSession',
        'ThinkingBlock',
        'IconCopy',
        'IconPencil',
        'IconX',
        'IconSend',
      ]) {
        app.component(name, passthroughStub)
      }
      app.component('MarkdownContentView', {
        props: ['content'],
        render() {
          return Vue.h('div', { 'data-testid': 'text-block-stub' }, this.content)
        },
      })
      app.component('ToolCallCard', {
        render: () => Vue.h('div', { 'data-testid': 'tool-call-card-stub' }),
      })
      app.component('ContextCompressionCard', {
        render: () => Vue.h('div', { 'data-testid': 'context-compression-card-stub' }),
      })
      app.mount(dom.window.document.querySelector('#app'))

      const compressionCard = dom.window.document.querySelector(
        '[data-testid="context-compression-card-stub"]',
      )
      const textBlocks = [...dom.window.document.querySelectorAll('[data-testid="text-block-stub"]')]
      const beforeCompression = textBlocks.find(element => element.textContent === 'BEFORE_COMPRESSION')
      const afterCompression = textBlocks.find(element => element.textContent === 'AFTER_COMPRESSION')
      const status = [...dom.window.document.querySelectorAll('span')]
        .find(element => element.textContent === 'STREAM_STATUS')
      assert.ok(compressionCard)
      assert.ok(beforeCompression)
      assert.ok(afterCompression)
      assert.ok(status)
      assert.ok(
        beforeCompression.compareDocumentPosition(compressionCard)
          & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'expected earlier streamed text before the compression card',
      )
      assert.ok(
        compressionCard.compareDocumentPosition(afterCompression)
          & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'expected later streamed text after the compression card',
      )
      assert.ok(
        afterCompression.compareDocumentPosition(status)
          & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'expected the transient status after all streamed content',
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

  it('places same-turn compression markers after their actual tool anchors', async () => {
    const { insertContextCompressionEvents } = await loadModule()
    const message = (id, turnId, role = 'assistant', toolCallId) => ({
      kind: 'message',
      key: id,
      message: {
        id,
        turnId,
        role,
        content: id,
        timestamp: 1,
        ...(toolCallId
          ? {
              toolCalls: [{ id: toolCallId, name: 'read_file', arguments: {}, status: 'completed' }],
              contentBlocks: [{ type: 'tool_call', toolCallId }],
            }
          : {}),
      },
    })
    const mergedAssistantEntry = message('assistant-group', 'turn-1')
    mergedAssistantEntry.message.toolCalls = [
      { id: 'tool-a', name: 'read_file', arguments: {}, status: 'completed' },
      { id: 'tool-b', name: 'read_file', arguments: {}, status: 'completed' },
    ]
    mergedAssistantEntry.message.contentBlocks = [
      { type: 'tool_call', toolCallId: 'tool-a' },
      { type: 'tool_call', toolCallId: 'tool-b' },
    ]
    const entries = [
      message('user-1', 'turn-1', 'user'),
      mergedAssistantEntry,
      message('user-2', 'turn-2', 'user'),
    ]
    const events = [
      {
        id: 'compressed-b',
        threadId: 'thread-1',
        turnId: 'turn-1',
        anchorToolCallId: 'tool-b',
        status: 'completed',
        startedAt: 20,
        timestamp: 21,
      },
      {
        id: 'compressed-a',
        threadId: 'thread-1',
        turnId: 'turn-1',
        anchorToolCallId: 'tool-a',
        status: 'completed',
        startedAt: 10,
        timestamp: 11,
      },
    ]

    const result = insertContextCompressionEvents(entries, events)

    assert.deepEqual(
      result.map(entry => entry.key),
      ['user-1', 'assistant-group', 'user-2'],
    )
    assert.deepEqual(
      result[1].message.contentBlocks.map(block => block.type),
      ['tool_call', 'context_compression', 'tool_call', 'context_compression'],
    )
    assert.equal(result[1].message.contentBlocks[1].event.id, 'compressed-a')
    assert.equal(result[1].message.contentBlocks[3].event.id, 'compressed-b')
  })

  it('does not duplicate a live compression marker already embedded in content blocks', async () => {
    const { insertContextCompressionEvents } = await loadModule()
    const event = {
      id: 'compressed-live',
      threadId: 'thread-1',
      status: 'compressing',
      startedAt: 10,
      timestamp: 10,
    }
    const entries = [{
      kind: 'message',
      key: 'streaming-preview',
      isPreview: true,
      message: {
        id: 'streaming-preview',
        role: 'assistant',
        content: '',
        contentBlocks: [{ type: 'context_compression', event }],
        timestamp: 10,
      },
    }]

    const result = insertContextCompressionEvents(entries, [event])

    assert.deepEqual(result.map(entry => entry.key), ['streaming-preview'])
  })

  it('restores a pre-response compression marker after its user-message anchor', async () => {
    const { insertContextCompressionEvents } = await loadModule()
    const entries = [
      {
        kind: 'message',
        key: 'human-1',
        message: { id: 'human-1', role: 'user', content: 'review', timestamp: 1 },
      },
      {
        kind: 'message',
        key: 'assistant-1',
        message: { id: 'assistant-1', role: 'assistant', content: 'working', timestamp: 2 },
      },
    ]
    const result = insertContextCompressionEvents(entries, [{
      id: 'compressed-before-response',
      threadId: 'thread-1',
      anchorMessageId: 'human-1',
      status: 'completed',
      startedAt: 2,
      timestamp: 3,
    }])

    assert.deepEqual(
      result.map(entry => entry.key),
      ['human-1', 'compressed-before-response', 'assistant-1'],
    )
  })

  it('appends an unmatched live event so the compressing state is visible before assistant output', async () => {
    const { insertContextCompressionEvents } = await loadModule()
    const entries = [{
      kind: 'message',
      key: 'message-1',
      message: {
        id: 'message-1',
        turnId: 'turn-1',
        role: 'assistant',
        content: 'done',
        timestamp: 1,
      },
    }]
    const result = insertContextCompressionEvents(entries, [
      {
        id: 'compressed-later',
        threadId: 'thread-1',
        turnId: 'missing-turn',
        status: 'compressing',
        startedAt: 20,
        timestamp: 20,
      },
      {
        id: 'compressed-earlier',
        threadId: 'thread-1',
        status: 'compressing',
        startedAt: 10,
        timestamp: 10,
      },
    ])

    assert.deepEqual(
      result.map(entry => entry.key),
      ['message-1', 'compressed-earlier', 'compressed-later'],
    )
  })

  it('streams subagent summarization started/completed events to the same task card', async () => {
    const { StreamEventAdapter, parseDeepAgentsSummarizationEvent } = await loadModule()
    const customEvent = (phase, payload = {}) => ({
      type: 'event',
      method: 'custom',
      params: {
        namespace: [],
        timestamp: phase === 'started' ? 10 : 20,
        data: {
          name: 'deepagents_summarization',
          payload: {
            eventId: 'summary-1',
            phase,
            startedAt: 10,
            timestamp: phase === 'started' ? 10 : 20,
            threadId: 'thread-1',
            turnId: 'turn-1',
            subagentName: 'reviewer',
            subagentId: 'task-1',
            anchorMessageId: 'tool-message-1',
            anchorToolCallId: 'read-1',
            ...payload,
          },
        },
      },
    })
    const completed = customEvent('completed', {
      summary: 'summary text',
      filePath: '/conversation_history/subagent.md',
      compressedMessageCount: 7,
    })

    assert.deepEqual(parseDeepAgentsSummarizationEvent(completed), {
      eventId: 'summary-1',
      phase: 'completed',
      startedAt: 10,
      timestamp: 20,
      threadId: 'thread-1',
      turnId: 'turn-1',
      subagentName: 'reviewer',
      subagentId: 'task-1',
      anchorMessageId: 'tool-message-1',
      anchorToolCallId: 'read-1',
      summary: 'summary text',
      filePath: '/conversation_history/subagent.md',
      compressedMessageCount: 7,
      error: undefined,
    })
    assert.equal(parseDeepAgentsSummarizationEvent({ method: 'custom', params: { data: {} } }), null)

    const chunks = []
    const adapter = new StreamEventAdapter('thread-1', 'turn-1', {
      sendStreamChunk(chunk) { chunks.push(chunk) },
    })
    await adapter.consumeSummarizationEvents((async function* () {
      yield { method: 'messages', params: { data: {} } }
      yield customEvent('started')
      yield completed
    })())

    assert.deepEqual(chunks.map(chunk => chunk.type), [
      'context_compression',
      'context_compression',
    ])
    assert.deepEqual(chunks.map(chunk => chunk.status), ['compressing', 'completed'])
    assert.equal(chunks[0].eventId, chunks[1].eventId)
    assert.equal(chunks[1].subagentId, 'task-1')
    assert.equal(chunks[1].subagentName, 'reviewer')
    assert.equal(chunks[1].anchorMessageId, 'tool-message-1')
    assert.equal(chunks[1].anchorToolCallId, 'read-1')
    assert.equal(chunks[1].summary, 'summary text')
    assert.equal(chunks[1].filePath, '/conversation_history/subagent.md')

    const fallbackChunks = []
    const rootAdapter = new StreamEventAdapter('thread-1', 'turn-1', {
      sendStreamChunk(chunk) { fallbackChunks.push(chunk) },
    })
    await rootAdapter.consumeToolCalls((async function* () {
      yield {
        name: 'read_file',
        callId: 'latest-root-tool',
        input: { file_path: '/tmp/example.md' },
        status: Promise.resolve('finished'),
        output: Promise.resolve('done'),
        error: Promise.resolve(undefined),
      }
    })())
    await rootAdapter.consumeSummarizationEvents((async function* () {
      yield customEvent('started', {
        subagentName: undefined,
        subagentId: undefined,
        anchorMessageId: undefined,
        anchorToolCallId: undefined,
      })
    })())
    const fallbackCompression = fallbackChunks.find(chunk => chunk.type === 'context_compression')
    assert.equal(fallbackCompression.anchorToolCallId, 'latest-root-tool')
  })

  it('does not replace a final-response message anchor with an earlier tool anchor', async () => {
    const { StreamEventAdapter } = await loadModule()
    const chunks = []
    const adapter = new StreamEventAdapter('thread-1', 'turn-1', {
      sendStreamChunk(chunk) { chunks.push(chunk) },
    })

    await adapter.consumeToolCalls((async function* () {
      yield {
        name: 'read_file',
        callId: 'earlier-tool',
        input: { file_path: '/tmp/example.md' },
        status: Promise.resolve('finished'),
        output: Promise.resolve('done'),
        error: Promise.resolve(undefined),
      }
    })())
    await adapter.consumeSummarizationEvents((async function* () {
      yield {
        method: 'custom',
        params: {
          data: {
            name: 'deepagents_summarization',
            payload: {
              eventId: 'post-response-summary',
              phase: 'started',
              startedAt: 10,
              timestamp: 10,
              anchorMessageId: 'final-response',
            },
          },
        },
      }
    })())

    const compression = chunks.find(chunk => chunk.type === 'context_compression')
    assert.equal(compression.anchorMessageId, 'final-response')
    assert.equal(compression.anchorToolCallId, undefined)
  })

  it('keeps compression in the stream protocol and renderer memory only', () => {
    const engineSource = readFileSync('electron/ai/AgentEngine.ts', 'utf8')
    const preloadSource = readFileSync('electron/preload.ts', 'utf8')
    const storeSource = readFileSync('src/ai/state/aiStore.ts', 'utf8')
    const patchSource = readFileSync('patches/deepagents+1.11.1.patch', 'utf8')

    assert.match(engineSource, /durability: 'exit'/)
    assert.match(engineSource, /consumeSummarizationEvents\(run\)/)
    assert.doesNotMatch(engineSource, /_detectAndNotifySummarization/)
    assert.doesNotMatch(engineSource, /_seedSummarizationBaseline/)
    assert.doesNotMatch(preloadSource, /ai:context-compressed/)
    assert.doesNotMatch(storeSource, /onAiContextCompressed/)
    assert.match(patchSource, /deepagents_summarization/)
    assert.match(patchSource, /iwriter_subagent_id/)
  })

  it('renders a reusable expandable card at root and inside subagents', () => {
    const chatAreaSource = readFileSync(
      'src/ai/components/agent-panel/AgentChatArea.vue',
      'utf8',
    )
    const cardSource = readFileSync(
      'src/ai/components/agent-panel/chat-area/views/ContextCompressionCard.vue',
      'utf8',
    )
    const subTaskSource = readFileSync(
      'src/ai/components/agent-panel/chat-area/views/SubTaskProgressView.vue',
      'utf8',
    )
    const messageBubbleSource = readFileSync(
      'src/ai/components/agent-panel/chat-area/AgentMessageBubble.vue',
      'utf8',
    )
    const runtimeEventsSource = readFileSync('src/ai/state/runEvents.ts', 'utf8')
    const assemblerSource = readFileSync(
      'electron/ai/scaffold/subagents/SubagentAssembler.ts',
      'utf8',
    )
    const creativeCapabilitiesSource = readFileSync(
      'electron/ai/domain/creative/buildCreativeCapabilities.ts',
      'utf8',
    )
    const zhMessagesSource = readFileSync('src/i18n/messages/zh-CN.ts', 'utf8')

    assert.match(chatAreaSource, /entry\.kind === 'context-compressed'/)
    assert.match(chatAreaSource, /<ContextCompressionCard/)
    assert.match(chatAreaSource, /:show-timestamp="true"/)
    assert.match(cardSource, /context-compression-details/)
    assert.match(cardSource, /context-compression-timestamp/)
    assert.match(cardSource, /event\.summary/)
    assert.match(cardSource, /event\.filePath/)
    assert.match(cardSource, /expanded\.value = !expanded\.value/)
    assert.match(zhMessagesSource, /contextCompressing: '正在压缩上下文\.\.\.'/)
    assert.match(zhMessagesSource, /contextCompressionCompleted: '上下文压缩已完成'/)
    assert.match(subTaskSource, /<ContextCompressionCard/)
    assert.match(subTaskSource, /standaloneCompressionEvents/)
    assert.match(messageBubbleSource, /block\.type === 'context_compression'/)
    assert.match(subTaskSource, /subTask\.contextCompressionEvents/)
    assert.match(subTaskSource, /if \(value\) expanded\.value = true/)
    assert.match(runtimeEventsSource, /type === 'context_compression'/)
    assert.match(runtimeEventsSource, /upsertContextCompressionEvent/)
    assert.doesNotMatch(assemblerSource, /ContextLedgerMiddleware/)
    assert.doesNotMatch(creativeCapabilitiesSource, /ContextLedgerMiddleware/)
  })
})

describe('compact context indicator', () => {
  async function createChatSendHarness(
    responses = [sessionStats(100), sessionStats(360)],
  ) {
    const chatSendModule = await loadChatSendModule()
    let requestCount = 0
    const store = chatSendModule.reactive({
      activeThread: {
        id: 'thread-1',
        updatedAt: 1,
        domain: 'editing',
        mode: 'edit',
        modelId: 'model-1',
        usage: {
          latestMainInputTokens: 0,
          main: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
          subagents: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
        },
      },
      settings: { defaultMode: 'edit' },
      effectiveProviderConfig: { id: 'provider-1', defaultModelId: 'model-1' },
      displayMessages: [],
      isStreaming: true,
      isInterrupted: false,
      liveTurnThreadId: 'thread-1',
      draftInput: '',
      setDraftInput(value) { this.draftInput = value },
    })
    const previousStore = globalThis.__iwriterTestAiStore
    const previousWindow = globalThis.window
    globalThis.__iwriterTestAiStore = store
    globalThis.window = {
      electronAPI: {
        async aiGetSessionContextStats() {
          const response = responses[Math.min(requestCount, responses.length - 1)]
          requestCount += 1
          return response
        },
      },
    }
    const state = chatSendModule.useChatSend(chatSendModule.ref([]))
    await flushVueWatchers(chatSendModule.nextTick)

    return {
      state,
      store,
      nextTick: chatSendModule.nextTick,
      getRequestCount: () => requestCount,
      restore() {
        globalThis.__iwriterTestAiStore = previousStore
        globalThis.window = previousWindow
      },
    }
  }

  it('uses the latest main-agent input usage before the checkpoint catches up', async () => {
    const harness = await createChatSendHarness()
    try {
      assert.equal(harness.state.currentSessionTokens.value, 100)
      harness.store.activeThread.usage.main.inputTokens = 120
      harness.store.activeThread.usage.latestMainInputTokens = 240
      await flushVueWatchers(harness.nextTick)

      assert.equal(harness.getRequestCount(), 1)
      assert.equal(harness.state.currentSessionTokens.value, 240)
    } finally {
      harness.restore()
    }
  })

  it('keeps raw progress above 100% while clamping only the visual ring', async () => {
    const chatSendModule = await loadChatSendModule()
    const progress = chatSendModule.computeCompactProgress(120, 100)

    assert.deepEqual(progress, { raw: 1.2, visual: 1 })
  })

  it('pairs live usage with the active runtime threshold and keeps next runtime separate', async () => {
    const harness = await createChatSendHarness([{
      ...sessionStats(900),
      activeRuntime: {
        modelId: 'active-model',
        currentTokens: 80,
        triggerTokens: 100,
        requestBudgetTokens: 120,
        keepTokens: 10,
        maxInputTokens: 150,
      },
      nextRuntime: {
        modelId: 'next-model',
        currentTokens: 900,
        triggerTokens: 1000,
        requestBudgetTokens: 1200,
        keepTokens: 100,
        maxInputTokens: 2000,
      },
    }])
    try {
      assert.equal(harness.state.currentSessionTokens.value, 80)
      assert.equal(harness.state.compactTriggerTokens.value, 100)
      assert.equal(harness.state.activeContextStats.value.modelId, 'active-model')
      assert.equal(harness.state.nextContextStats.value.modelId, 'next-model')

      harness.store.activeThread.usage.main.inputTokens = 120
      harness.store.activeThread.usage.latestMainInputTokens = 120
      await flushVueWatchers(harness.nextTick)

      assert.equal(harness.state.compactProgressRatioRaw.value, 1.2)
      assert.equal(harness.state.compactProgressRatioVisual.value, 1)
      assert.equal(harness.state.activeContextStats.value.currentTokens, 120)
      assert.equal(harness.state.nextContextStats.value.currentTokens, 900)
    } finally {
      harness.restore()
    }
  })

  it('recalibrates context tokens when the run finishes', async () => {
    const harness = await createChatSendHarness()
    try {
      assert.equal(harness.state.currentSessionTokens.value, 100)
      harness.store.isStreaming = false
      await flushVueWatchers(harness.nextTick)

      assert.equal(harness.getRequestCount(), 2)
      assert.equal(harness.state.currentSessionTokens.value, 360)
    } finally {
      harness.restore()
    }
  })

  it('uses checkpoint stats after switching away from the running thread', async () => {
    const harness = await createChatSendHarness()
    try {
      harness.store.activeThread = {
        ...harness.store.activeThread,
        id: 'thread-2',
        usage: {
          ...harness.store.activeThread.usage,
          latestMainInputTokens: 900,
          main: {
            ...harness.store.activeThread.usage.main,
            inputTokens: 900,
          },
        },
      }
      await flushVueWatchers(harness.nextTick)

      assert.equal(harness.getRequestCount(), 2)
      assert.equal(harness.state.currentSessionTokens.value, 360)
    } finally {
      harness.restore()
    }
  })

  it('keeps equal-sized consecutive main calls ahead of a stale stats request', async () => {
    const staleStats = Promise.withResolvers()
    const harness = await createChatSendHarness([
      sessionStats(100),
      staleStats.promise,
    ])
    try {
      harness.store.activeThread.usage.main.inputTokens = 120
      harness.store.activeThread.usage.latestMainInputTokens = 240
      await flushVueWatchers(harness.nextTick)
      assert.equal(harness.state.currentSessionTokens.value, 240)

      harness.store.displayMessages.push({ id: 'message-1' })
      await flushVueWatchers(harness.nextTick)
      assert.equal(harness.getRequestCount(), 2)

      harness.store.activeThread.usage.main.inputTokens = 240
      await harness.nextTick()
      staleStats.resolve(sessionStats(100))
      await flushVueWatchers(harness.nextTick)

      assert.equal(harness.state.currentSessionTokens.value, 240)
    } finally {
      harness.restore()
    }
  })

  it('retains the latest main call input separately from cumulative usage', async () => {
    const { createRuntimeEvents } = await loadModule()
    let thread = { id: 'thread-1' }
    const runtimeEvents = createRuntimeEvents({
      getThreadById: () => thread,
      updateThread(updated) { thread = updated },
    })

    runtimeEvents.onStreamChunk({
      threadId: 'thread-1',
      type: 'usage',
      messageId: 'main-1',
      usage: {
        inputTokens: 240,
        outputTokens: 20,
        totalTokens: 260,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    })
    runtimeEvents.onStreamChunk({
      threadId: 'thread-1',
      type: 'usage',
      messageId: 'subagent-1',
      subagentId: 'task-1',
      usage: {
        inputTokens: 80,
        outputTokens: 10,
        totalTokens: 90,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    })

    assert.equal(thread.usage.latestMainInputTokens, 240)
    assert.equal(thread.usage.main.inputTokens, 240)
    assert.equal(thread.usage.subagents.inputTokens, 80)
  })

  it('updates an already visible tooltip without another hover', async () => {
    const { JSDOM } = await import('jsdom')
    const dom = new JSDOM('<div id="target"></div>', { pretendToBeVisual: true })
    const globalKeys = [
      'window',
      'document',
      'HTMLElement',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ]
    const previousGlobals = new Map(
      globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    )
    for (const key of globalKeys) {
      const value = key === 'requestAnimationFrame' || key === 'cancelAnimationFrame'
        ? dom.window[key].bind(dom.window)
        : dom.window[key]
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    }

    let manager
    try {
      const { TooltipManager } = await loadTooltipModule()
      manager = new TooltipManager()
      const target = dom.window.document.querySelector('#target')
      manager.show({ type: 'text', content: '100 tokens' }, target)
      await new Promise(resolvePromise => setTimeout(resolvePromise, 800))
      assert.equal(
        dom.window.document.querySelector('.iw-tooltip-content')?.textContent,
        '100 tokens',
      )

      assert.equal(typeof manager.update, 'function')
      manager.update({ type: 'text', content: '240 tokens' }, target)
      assert.equal(
        dom.window.document.querySelector('.iw-tooltip-content')?.textContent,
        '240 tokens',
      )
    } finally {
      manager?.dispose()
      dom.window.close()
      for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    }
  })
})
