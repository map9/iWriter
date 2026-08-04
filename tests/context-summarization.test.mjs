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
              extractSubagentCompressionEvent,
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
  it('places a non-message marker before the first assistant entry of the triggering turn', async () => {
    const { insertContextCompressionEvents } = await loadModule()
    const message = (id, turnId, role = 'assistant') => ({
      kind: 'message',
      key: id,
      message: {
        id,
        turnId,
        role,
        content: id,
        timestamp: 1,
      },
    })
    const entries = [
      message('user-1', 'turn-1', 'user'),
      message('assistant-1a', 'turn-1'),
      message('assistant-1b', 'turn-1'),
      message('user-2', 'turn-2', 'user'),
    ]
    const event = {
      id: 'compressed-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      timestamp: 10,
      compressedMessageCount: 20,
    }

    const result = insertContextCompressionEvents(entries, [event])

    assert.deepEqual(
      result.map(entry => entry.key),
      ['user-1', 'compressed-1', 'assistant-1a', 'assistant-1b', 'user-2'],
    )
    assert.equal(result[1].kind, 'context-compressed')
    assert.equal('message' in result[1], false)
  })

  it('drops events without a visible assistant turn match', async () => {
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
        timestamp: 20,
        compressedMessageCount: 30,
      },
      {
        id: 'compressed-earlier',
        threadId: 'thread-1',
        timestamp: 10,
        compressedMessageCount: 10,
      },
    ])

    assert.deepEqual(
      result.map(entry => entry.key),
      ['message-1'],
    )
  })

  it('detects a subagent summary from the subagent final state and routes it to that task card', async () => {
    const { StreamEventAdapter, extractSubagentCompressionEvent } = await loadModule()
    const summaryState = {
      messages: [{ content: 'old' }, { content: 'recent' }],
      _summarizationEvent: {
        cutoffIndex: 1,
        summaryMessage: { content: 'summary' },
        filePath: '/conversation_history/subagent.md',
      },
    }
    assert.deepEqual(extractSubagentCompressionEvent(summaryState), {
      compressedMessageCount: 1,
    })
    assert.equal(extractSubagentCompressionEvent({ _summarizationEvent: { cutoffIndex: 0 } }), null)
    assert.equal(extractSubagentCompressionEvent({ _summarizationEvent: { cutoffIndex: 1 } }), null)

    const chunks = []
    const empty = async function* () {}
    const adapter = new StreamEventAdapter('thread-1', 'turn-1', {
      sendStreamChunk(chunk) { chunks.push(chunk) },
    })
    await adapter.consumeSubagents((async function* () {
      yield {
        name: 'reviewer',
        cause: { type: 'toolCall', tool_call_id: 'task-1' },
        output: Promise.resolve(summaryState),
        messages: empty(),
        toolCalls: empty(),
        subagents: empty(),
      }
    })())

    assert.deepEqual(chunks.map(chunk => chunk.type), [
      'subagent_start',
      'context_compressed',
      'subagent_end',
    ])
    assert.equal(chunks[1].subagentId, 'task-1')
    assert.equal(chunks[1].subagentName, 'reviewer')
    assert.equal(chunks[1].compressedMessageCount, 1)
  })

  it('renders the marker as a localized divider instead of a chat bubble or toast', () => {
    const chatAreaSource = readFileSync(
      'src/components/ai/agent-panel/AgentChatArea.vue',
      'utf8',
    )
    const storeSource = readFileSync('src/ai/store/ai.ts', 'utf8')
    const subTaskSource = readFileSync(
      'src/components/ai/agent-panel/chat-area/views/SubTaskProgressView.vue',
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
    assert.match(chatAreaSource, /class="flex items-center gap-2 py-1\.5"/)
    assert.match(chatAreaSource, /class="h-px flex-1 bg-base-content\/15"/)
    assert.match(chatAreaSource, /<AgentMessageBubble\s+v-else/)
    assert.match(
      chatAreaSource,
      /toLocaleTimeString\(locale\.value,\s*\{\s*hour: '2-digit',\s*minute: '2-digit',\s*\}\)/,
    )
    assert.doesNotMatch(chatAreaSource, /second: '2-digit'/)
    assert.match(zhMessagesSource, /contextCompressed: '上下文已压缩（\{time\}）'/)
    assert.match(subTaskSource, /subTask\.contextCompressionEvents/)
    assert.match(subTaskSource, /agentPanel\.chatArea\.contextCompressed/)
    assert.match(subTaskSource, /latestCompressionEvent/)
    assert.match(subTaskSource, /subtask-context-compressed-summary/)
    assert.match(subTaskSource, /subtask-context-compressed-event/)
    assert.match(runtimeEventsSource, /type === 'context_compressed'/)
    assert.match(assemblerSource, /middleware: \[createContextLedgerMiddleware\(\)\]/)
    assert.match(creativeCapabilitiesSource, /\.\.\.GENERAL_PURPOSE_SUBAGENT/)
    assert.match(creativeCapabilitiesSource, /middleware: \[createContextLedgerMiddleware\(\)\]/)
    assert.match(creativeCapabilitiesSource, /path\.join\(skillsRoot, 'creative', 'common'\)/)
    assert.match(creativeCapabilitiesSource, /path\.join\(skillsRoot, 'creative', 'main'\)/)
    assert.match(creativeCapabilitiesSource, /synthesized general-purpose agent inherits the root skills/)
    assert.match(
      storeSource,
      /onAiContextCompressed\?\.\(\(event\) => \{\s*addContextCompressionEvent\(event\)\s*\}\)/,
    )
    assert.doesNotMatch(
      storeSource,
      /onAiContextCompressed\?\.\(\([^)]*\) => \{\s*notify\./,
    )
  })
})
