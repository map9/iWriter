import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { SystemMessage } from '@langchain/core/messages'
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
              MAX_CONTEXT_LEDGER_PROMPT_CHARS,
              createContextLedgerMiddleware,
              updateContextLedger,
              renderContextLedger,
            } from './electron/ai/scaffold/middleware/ContextLedgerMiddleware.ts'
            export {
              EDITING_SUMMARIZATION_PROFILE,
              CREATIVE_SUMMARIZATION_PROFILE,
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

function aiMessage(id, name, args) {
  return {
    _getType: () => 'ai',
    content: '',
    tool_calls: [{ id, name, args }],
  }
}

function toolMessage(id, name, content, status) {
  return {
    _getType: () => 'tool',
    tool_call_id: id,
    name,
    content,
    ...(status ? { status } : {}),
  }
}

function runtimeContext(overrides = {}) {
  return {
    workspacePath: process.cwd(),
    activeFilePath: null,
    dirtyDocumentPaths: [],
    turnId: 'turn-1',
    ...overrides,
  }
}

describe('summarization framework', () => {
  it('uses one common envelope with domain-specific state fields', async () => {
    const {
      EDITING_SUMMARIZATION_PROFILE,
      CREATIVE_SUMMARIZATION_PROFILE,
      buildSummarizationPrompt,
    } = await loadModule()

    const editing = buildSummarizationPrompt(EDITING_SUMMARIZATION_PROFILE)
    const creative = buildSummarizationPrompt(CREATIVE_SUMMARIZATION_PROFILE)

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
      assert.match(prompt, /deterministic context ledger/i)
      assert.match(prompt, /Do not invent missing state/)
    }

    assert.match(editing, /block IDs/)
    assert.doesNotMatch(editing, /selected Playbook/)
    assert.match(creative, /selected Playbook/)
    assert.match(creative, /confirmed project facts from candidates/)
  })
})

describe('deterministic context ledger', () => {
  it('replaces a large read result with a bounded source/range record', async () => {
    const {
      MAX_CONTEXT_LEDGER_PROMPT_CHARS,
      updateContextLedger,
      renderContextLedger,
    } = await loadModule()
    const rawMarker = 'RAW_PROJECT_CONTENT_SHOULD_NOT_BE_COPIED'
    const rawResult = `${rawMarker}\n`.repeat(4_000)
    const packagePath = `${process.cwd()}/package.json`
    const messages = [
      aiMessage('read-1', 'read_file', {
        file_path: packagePath,
        offset: 0,
        limit: 100,
      }),
      toolMessage('read-1', 'read_file', rawResult),
    ]

    const ledger = updateContextLedger(messages, undefined, runtimeContext())
    const rendered = renderContextLedger(ledger, runtimeContext())

    assert.equal(ledger.records.length, 1)
    assert.equal(ledger.records[0].status, 'current')
    assert.equal(ledger.records[0].scope, 'lines:1-100')
    assert.match(ledger.records[0].revision, /^stat:/)
    assert.ok(rendered.length <= MAX_CONTEXT_LEDGER_PROMPT_CHARS)
    assert.ok(rendered.length < rawResult.length * 0.05)
    assert.doesNotMatch(rendered, new RegExp(rawMarker))
    assert.match(rendered, /package\.json/)
    assert.match(rendered, /lines:1-100/)
  })

  it('records confirmed missing paths and invalidates reads after mutations', async () => {
    const { updateContextLedger, renderContextLedger } = await loadModule()
    const packagePath = `${process.cwd()}/package.json`
    const missingPath = `${process.cwd()}/volume-that-does-not-exist.md`
    const firstMessages = [
      aiMessage('read-1', 'read_file', { file_path: packagePath }),
      toolMessage('read-1', 'read_file', '1 {"name":"iwriter"}'),
      aiMessage('read-2', 'read_file', { file_path: missingPath }),
      toolMessage(
        'read-2',
        'read_file',
        `Error: FILE_NOT_FOUND — file does not exist: ${missingPath}`,
      ),
    ]
    const firstLedger = updateContextLedger(firstMessages, undefined, runtimeContext())

    assert.equal(firstLedger.records.find(record => record.source === packagePath)?.status, 'current')
    assert.equal(
      firstLedger.records.find(record => record.source === missingPath)?.status,
      'missing',
    )

    const allMessages = [
      ...firstMessages,
      aiMessage('edit-1', 'edit_file', { file_path: packagePath }),
      toolMessage('edit-1', 'edit_file', `Successfully replaced 1 occurrence(s) in '${packagePath}'`),
    ]
    const updated = updateContextLedger(allMessages, firstLedger, runtimeContext())
    const rendered = renderContextLedger(updated, runtimeContext())

    assert.equal(updated.records.find(record => record.source === packagePath)?.status, 'stale')
    assert.equal(
      updated.records.find(record => record.source === missingPath)?.status,
      'missing',
    )
    assert.match(rendered, /do not guess or retry unchanged/i)
  })

  it('expires volatile dirty-document reads on the next user turn', async () => {
    const { updateContextLedger, renderContextLedger } = await loadModule()
    const packagePath = `${process.cwd()}/package.json`
    const firstContext = runtimeContext({
      activeFilePath: packagePath,
      dirtyDocumentPaths: [packagePath],
      turnId: 'turn-1',
    })
    const messages = [
      aiMessage('read-1', 'get_document_outline', { file_path: packagePath }),
      toolMessage('read-1', 'get_document_outline', '# outline'),
    ]
    const ledger = updateContextLedger(messages, undefined, firstContext)

    assert.equal(ledger.records[0].status, 'current')
    assert.equal(ledger.records[0].revision, 'live:turn-1')

    const nextTurnPrompt = renderContextLedger(ledger, {
      ...firstContext,
      turnId: 'turn-2',
    })
    assert.match(nextTurnPrompt, /"status":"stale"/)

    const reopenedPrompt = renderContextLedger(ledger, {
      ...firstContext,
      turnId: null,
    })
    assert.match(reopenedPrompt, /"status":"stale"/)
  })

  it('injects the ledger as hidden system context without adding a chat message', async () => {
    const { createContextLedgerMiddleware, updateContextLedger } = await loadModule()
    const packagePath = `${process.cwd()}/package.json`
    const context = runtimeContext()
    const rawMessages = [
      aiMessage('read-1', 'read_file', { file_path: packagePath }),
      toolMessage('read-1', 'read_file', '1 {"name":"iwriter"}'),
    ]
    const ledger = updateContextLedger(rawMessages, undefined, context)
    const effectiveMessages = [{ _getType: () => 'human', content: 'recent user message' }]
    const middleware = createContextLedgerMiddleware()
    let forwarded

    await middleware.wrapModelCall(
      {
        state: { messages: rawMessages, _contextLedger: ledger },
        messages: effectiveMessages,
        systemMessage: new SystemMessage('base system prompt'),
        runtime: { context },
      },
      async (request) => {
        forwarded = request
        return { content: 'ok' }
      },
    )

    assert.equal(forwarded.messages, effectiveMessages)
    assert.equal(forwarded.messages.length, 1)
    assert.match(JSON.stringify(forwarded.systemMessage.content), /context_ledger/)
    assert.match(JSON.stringify(forwarded.systemMessage.content), /package\.json/)
  })

  it('caps checkpoint records and the injected prompt independently of conversation size', async () => {
    const {
      MAX_CONTEXT_LEDGER_PROMPT_CHARS,
      updateContextLedger,
      renderContextLedger,
    } = await loadModule()
    const messages = []
    for (let index = 0; index < 120; index += 1) {
      const id = `read-${index}`
      const filePath = `${process.cwd()}/missing-${String(index).padStart(3, '0')}-${'x'.repeat(120)}.md`
      messages.push(aiMessage(id, 'read_file', { file_path: filePath }))
      messages.push(toolMessage(id, 'read_file', `Error: FILE_NOT_FOUND — ${filePath} does not exist`))
    }

    const ledger = updateContextLedger(messages, undefined, runtimeContext())
    const rendered = renderContextLedger(ledger, runtimeContext())

    assert.equal(ledger.records.length, 80)
    assert.ok(rendered.length <= MAX_CONTEXT_LEDGER_PROMPT_CHARS)
    assert.match(rendered, /omitted_older_entries/)
  })
})

describe('context compression display event', () => {
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
    assert.match(assemblerSource, /middleware: \[createContextLedgerMiddleware\(\)\]/)
    assert.match(creativeCapabilitiesSource, /\.\.\.GENERAL_PURPOSE_SUBAGENT/)
    assert.match(creativeCapabilitiesSource, /middleware: \[createContextLedgerMiddleware\(\)\]/)
    assert.match(creativeCapabilitiesSource, /path\.join\(skillsRoot, 'creative', 'common'\)/)
    assert.match(creativeCapabilitiesSource, /path\.join\(skillsRoot, 'creative', 'main'\)/)
    assert.match(creativeCapabilitiesSource, /synthesized general-purpose agent inherits the root skills/)
  })
})
