import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let modulePromise

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
            } from './src/ai/store/modules/runtimeDisplay.ts'
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
  it('renders an embedded root compression card after its anchor message timestamp', async () => {
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
        'src/components/ai/agent-panel/chat-area/AgentMessageBubble.vue',
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
      const toolCall = {
        id: 'read-1',
        name: 'read_file',
        arguments: {},
        status: 'completed',
      }
      const component = {
        render,
        setup() {
          const blocks = [
            { type: 'tool_call', toolCallId: toolCall.id },
            { type: 'context_compression', event },
          ]
          return {
            shouldRenderMessage: true,
            message: {
              id: 'assistant-1',
              role: 'assistant',
              content: '',
              timestamp: 1,
              toolCalls: [toolCall],
            },
            isEditing: false,
            isPreview: false,
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
            previewStatusText: '',
            showPreviewPulse: false,
            showHoverToolbar: false,
            maxTextareaHeight: '100px',
            splitAssistantText: () => [],
            isReadToolById: () => true,
            findSubTaskFor: () => undefined,
            shouldShowTaskFallback: () => false,
            toolCallById: () => toolCall,
            contentBlockToolPosition: () => 'single',
            contentBlockToolMarginClass: () => '',
            taskSubagentTypeOf: () => undefined,
            readToolPosition: () => 'single',
            formatTime: () => 'MESSAGE_TIME',
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
        'MarkdownContentView',
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
      const timestamp = [...dom.window.document.querySelectorAll('div')]
        .find(element => element.children.length === 0 && element.textContent.trim() === 'MESSAGE_TIME')
      assert.ok(compressionCard)
      assert.ok(timestamp)
      assert.ok(
        timestamp.compareDocumentPosition(compressionCard)
          & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'expected the anchor message timestamp to render before the compression card',
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

  it('keeps compression in the stream protocol and renderer memory only', () => {
    const engineSource = readFileSync('electron/ai/AgentEngine.ts', 'utf8')
    const preloadSource = readFileSync('electron/preload.ts', 'utf8')
    const storeSource = readFileSync('src/ai/store/ai.ts', 'utf8')
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
      'src/components/ai/agent-panel/AgentChatArea.vue',
      'utf8',
    )
    const cardSource = readFileSync(
      'src/components/ai/agent-panel/chat-area/views/ContextCompressionCard.vue',
      'utf8',
    )
    const subTaskSource = readFileSync(
      'src/components/ai/agent-panel/chat-area/views/SubTaskProgressView.vue',
      'utf8',
    )
    const messageBubbleSource = readFileSync(
      'src/components/ai/agent-panel/chat-area/AgentMessageBubble.vue',
      'utf8',
    )
    const runtimeEventsSource = readFileSync('src/ai/store/modules/runtimeEvents.ts', 'utf8')
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
