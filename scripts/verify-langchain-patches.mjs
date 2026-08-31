import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { ContextOverflowError } from '@langchain/core/errors'
import { convertChunksToEvents } from '@langchain/core/language_models/compat'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { createSummarizationMiddleware } from 'deepagents'

const require = createRequire(import.meta.url)
const deepagentsPackageDir = path.dirname(require.resolve('deepagents/package.json'))
const deepagentsRuntimeSources = readdirSync(path.join(deepagentsPackageDir, 'dist'))
  .filter(name => /^langsmith-.*\.(?:js|cjs)$/.test(name))
  .map(name => readFileSync(path.join(deepagentsPackageDir, 'dist', name), 'utf8'))
  .filter(source => source.includes('const EXCLUDED_STATE_KEYS'))

assert.ok(deepagentsRuntimeSources.length >= 2)
for (const source of deepagentsRuntimeSources) {
  assert.match(source, /"_summarizationSessionId"/)
  assert.match(source, /"_summarizationEvent"/)
  assert.match(source, /deepagents_summarization/)
  assert.match(source, /iwriter_subagent_id/)
}

const langGraphPackageDir = path.dirname(require.resolve('@langchain/langgraph/package.json'))
const { ensureLangGraphConfig } = await import(pathToFileURL(
  path.join(langGraphPackageDir, 'dist/pregel/utils/config.js'),
).href)

async function collectFinishedBlocks(chunks) {
  const finished = []
  for await (const event of convertChunksToEvents(chunks)) {
    if (event.event === 'content-block-finish') finished.push(event.content)
  }
  return finished
}

const reasoningTextAndToolBlocks = await collectFinishedBlocks([
  new ChatGenerationChunk({
    message: new AIMessageChunk({
      content: '',
      additional_kwargs: { reasoning_content: 'thinking' },
    }),
    text: '',
  }),
  new ChatGenerationChunk({
    message: new AIMessageChunk({ content: 'final answer' }),
    text: 'final answer',
  }),
  new ChatGenerationChunk({
    message: new AIMessageChunk({
      content: '',
      tool_call_chunks: [{
        id: 'call_1',
        name: 'get_section',
        args: '{"heading_block_id":1}',
        index: 0,
      }],
    }),
    text: '',
  }),
])

assert.deepEqual(reasoningTextAndToolBlocks, [
  { type: 'reasoning', reasoning: 'thinking' },
  { type: 'text', text: 'final answer' },
  {
    type: 'tool_call',
    id: 'call_1',
    name: 'get_section',
    args: { heading_block_id: 1 },
  },
])

const reasoningAndParallelToolBlocks = await collectFinishedBlocks([
  new ChatGenerationChunk({
    message: new AIMessageChunk({
      content: '',
      additional_kwargs: { reasoning_content: 'thinking' },
    }),
    text: '',
  }),
  new ChatGenerationChunk({
    message: new AIMessageChunk({
      content: '',
      tool_call_chunks: [
        {
          id: 'call_read',
          name: 'read_file',
          args: '{"file_path":"/skills/writing-style/SKILL.md"}',
          index: 0,
        },
        {
          id: 'call_list',
          name: 'list_items',
          args: '{}',
          index: 1,
        },
      ],
    }),
    text: '',
  }),
])

assert.deepEqual(reasoningAndParallelToolBlocks, [
  { type: 'reasoning', reasoning: 'thinking' },
  {
    type: 'tool_call',
    id: 'call_read',
    name: 'read_file',
    args: { file_path: '/skills/writing-style/SKILL.md' },
  },
  {
    type: 'tool_call',
    id: 'call_list',
    name: 'list_items',
    args: {},
  },
])

const mixedIndexedContentBlocks = await collectFinishedBlocks([
  new ChatGenerationChunk({
    message: new AIMessageChunk({
      content: [{ type: 'text', text: 'visible', index: 0 }],
    }),
    text: '',
  }),
  new ChatGenerationChunk({
    message: new AIMessageChunk({
      content: [{ type: 'reasoning', reasoning: 'hidden', index: 0 }],
    }),
    text: '',
  }),
])

assert.deepEqual(mixedIndexedContentBlocks, [
  { type: 'text', text: 'visible', index: 0 },
  { type: 'reasoning', reasoning: 'hidden', index: 0 },
])

const summarizationMiddleware = createSummarizationMiddleware({
  backend: { write: async filePath => ({ path: filePath }) },
})
const replayedSummaryMessage = {
  [Symbol.for('langchain.message')]: true,
  type: 'human',
  content: 'checkpoint summary',
  additional_kwargs: { lc_source: 'summarization' },
  response_metadata: {},
}

// @langchain/core >=1.2.9 routes instanceof through HumanMessage.isInstance,
// so checkpoint-rehydrated message objects now satisfy both checks.
assert.equal(replayedSummaryMessage instanceof HumanMessage, true)
assert.equal(HumanMessage.isInstance(replayedSummaryMessage), true)
assert.equal(summarizationMiddleware.stateSchema.safeParse({
  _summarizationEvent: {
    cutoffIndex: 1,
    summaryMessage: replayedSummaryMessage,
    filePath: null,
  },
}).success, true)

let configuredSummaryModelCalls = 0
let requestModelCalls = 0
let configuredSummaryModelConfig
const historyFiles = new Map()
let historyWriteCount = 0
const historyBackend = {
  async write(filePath, content) {
    historyWriteCount += 1
    historyFiles.set(filePath, content)
    return { path: filePath }
  },
  async downloadFiles(filePaths) {
    return filePaths.map(filePath => historyFiles.has(filePath)
      ? { path: filePath, content: new TextEncoder().encode(historyFiles.get(filePath)) }
      : { path: filePath, error: 'not found' })
  },
  async uploadFiles(files) {
    return files.map(([filePath, content]) => {
      historyWriteCount += 1
      historyFiles.set(filePath, new TextDecoder().decode(content))
      return { path: filePath }
    })
  },
}
const configuredSummaryModel = {
  profile: { maxInputTokens: 10_000 },
  invoke: async (_messages, config) => {
    configuredSummaryModelCalls += 1
    configuredSummaryModelConfig = config
    return new AIMessage({
      content: [
        { type: 'reasoning', reasoning: 'private reasoning must not enter the summary' },
        { type: 'text', text: 'PUBLIC SUMMARY' },
      ],
    })
  },
}
const requestModel = {
  profile: { maxInputTokens: 10_000 },
  invoke: async () => {
    requestModelCalls += 1
    return new AIMessage('wrong model')
  },
}
const originalGetRunnableConfig = AsyncLocalStorageProviderSingleton.getRunnableConfig
const summarizationStreamEvents = []
const configuredSummarizationMiddleware = createSummarizationMiddleware({
  backend: historyBackend,
  model: configuredSummaryModel,
  trigger: { type: 'messages', value: 1 },
  keep: { type: 'messages', value: 0 },
  tokenCounter: () => 100,
  trimTokensToSummarize: 1_000,
  summaryPrompt: 'Summarize: {conversation}',
})
let summaryCommand
try {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = () => ({
    writer: event => summarizationStreamEvents.push(event),
    metadata: {
      thread_id: 'thread-1',
      turn_id: 'turn-1',
      lc_agent_name: 'reviewer',
      iwriter_subagent_id: 'task-1',
    },
  })
  summaryCommand = await configuredSummarizationMiddleware.wrapModelCall({
    messages: [new HumanMessage('hello')],
    state: { messages: [new HumanMessage('hello')] },
    model: requestModel,
    tools: [],
  }, async () => new AIMessage('handled'))
} finally {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = originalGetRunnableConfig
}
const summaryContent = summaryCommand.update._summarizationEvent.summaryMessage.content

assert.equal(configuredSummaryModelCalls, 1)
assert.equal(requestModelCalls, 0)
assert.ok(configuredSummaryModelConfig.tags.includes('langsmith:nostream'))
assert.equal(configuredSummaryModelConfig.metadata.lc_source, 'summarization')
assert.match(summaryContent, /PUBLIC SUMMARY/)
assert.doesNotMatch(summaryContent, /private reasoning/)
assert.match(summaryContent, /grep/i)
assert.match(summaryContent, /read_file/i)
assert.match(summaryContent, /offset/i)
assert.match(summaryContent, /limit/i)
assert.match(summaryContent, /context ledger.*current/is)
assert.match(summaryContent, /search.*conversation history.*before rereading.*project source/is)
assert.match(summaryContent, /Summary block.*Original messages/is)
assert.match(summaryContent, /20-40 lines/i)
assert.match(summaryContent, /hard maximum.*80 lines/i)
assert.match(summaryContent, /stale.*history lacks/is)
const archivedHistory = [...historyFiles.values()].join('\n')
assert.match(archivedHistory, /## Compression archive:/)
assert.match(archivedHistory, /### Summary/)
assert.match(archivedHistory, /PUBLIC SUMMARY/)
assert.match(archivedHistory, /### Original messages/)
assert.match(archivedHistory, /hello/)
assert.equal(historyWriteCount, 1)
assert.deepEqual(
  summarizationStreamEvents.map(event => event.name),
  ['deepagents_summarization', 'deepagents_summarization'],
)
assert.deepEqual(
  summarizationStreamEvents.map(event => event.payload.phase),
  ['started', 'completed'],
)
assert.equal(summarizationStreamEvents[0].payload.eventId, summarizationStreamEvents[1].payload.eventId)
assert.equal(summarizationStreamEvents[1].payload.summary, 'PUBLIC SUMMARY')
assert.equal(summarizationStreamEvents[1].payload.subagentName, 'reviewer')
assert.equal(summarizationStreamEvents[1].payload.subagentId, 'task-1')

await configuredSummarizationMiddleware.wrapModelCall({
  messages: [new HumanMessage('second archived history')],
  state: { messages: [new HumanMessage('second archived history')] },
  model: requestModel,
  tools: [],
}, async () => new AIMessage('handled again'))

const appendedHistory = [...historyFiles.values()].join('\n')
assert.equal(appendedHistory.match(/## Compression archive:/g)?.length, 2)
assert.equal(appendedHistory.match(/### Summary/g)?.length, 2)
assert.match(appendedHistory, /hello/)
assert.match(appendedHistory, /second archived history/)
assert.equal(historyWriteCount, 2)

const prefixMessages = [
  new HumanMessage('old user evidence'),
  new AIMessage('old assistant conclusion'),
  new HumanMessage('recent user question'),
]
const prefixSystemMessage = new SystemMessage('stable system prompt')
const prefixTools = [{
  name: 'read_file',
  description: 'Read one file',
  schema: { type: 'object', properties: {} },
}]
const prefixRequestModel = {
  profile: { maxInputTokens: 10_000 },
  withConfig(config) {
    return { ...this, hiddenConfig: config }
  },
  async invoke() {
    throw new Error('The active request model must not generate summaries')
  },
}
let prefixStandaloneModelCalls = 0
const prefixSummaryModel = {
  profile: { maxInputTokens: 10_000 },
  sourceModel: 'summary-without-thinking',
  withConfig(config) {
    return { ...this, hiddenConfig: config }
  },
  async invoke() {
    prefixStandaloneModelCalls += 1
    return new AIMessage('standalone summary should not run on the primary path')
  },
}
const prefixHandlerRequests = []
const prefixReuseMiddleware = createSummarizationMiddleware({
  model: prefixSummaryModel,
  backend: { write: async filePath => ({ path: filePath }) },
  trigger: { type: 'messages', value: 1 },
  keep: { type: 'messages', value: 1 },
  tokenCounter: () => 100,
  trimTokensToSummarize: 1_000,
  summaryInstruction: 'CACHE-AWARE SUMMARY INSTRUCTION',
  summaryPrompt: 'Fallback summary: {conversation}',
})

let prefixSummaryCacheDebugLogCount = 0
const originalConsoleDebug = console.debug
console.debug = (...args) => {
  if (args[0] === '[SummarizationMiddleware] Summary cache usage') {
    prefixSummaryCacheDebugLogCount += 1
  }
}
let prefixCommand
try {
  prefixCommand = await prefixReuseMiddleware.wrapModelCall({
    messages: prefixMessages,
    state: { messages: prefixMessages },
    model: prefixRequestModel,
    systemMessage: prefixSystemMessage,
    tools: prefixTools,
  }, async request => {
    prefixHandlerRequests.push(request)
    return prefixHandlerRequests.length === 1
      ? new AIMessage({
          content: 'PREFIX SUMMARY',
          usage_metadata: {
            input_tokens: 1_000,
            output_tokens: 80,
            total_tokens: 1_080,
            input_token_details: { cache_read: 750, cache_creation: 100 },
            output_token_details: { reasoning: 0 },
          },
          response_metadata: {
            model_provider: 'deepseek',
            model_name: 'deepseek-v4-flash',
          },
        })
      : new AIMessage('handled with compacted context')
  })
} finally {
  console.debug = originalConsoleDebug
}

assert.equal(prefixStandaloneModelCalls, 0)
assert.equal(prefixHandlerRequests.length, 2)
const prefixSummaryRequest = prefixHandlerRequests[0]
assert.notEqual(prefixSummaryRequest.model, prefixRequestModel)
assert.equal(prefixSummaryRequest.model.sourceModel, 'summary-without-thinking')
assert.deepEqual(prefixSummaryRequest.model.hiddenConfig, {
  tags: ['langsmith:nostream'],
  metadata: { lc_source: 'summarization' },
})
assert.equal(prefixSummaryRequest.systemMessage, prefixSystemMessage)
assert.equal(prefixSummaryRequest.tools, prefixTools)
assert.equal(prefixSummaryRequest.messages.length, 3)
assert.equal(prefixSummaryRequest.messages[0], prefixMessages[0])
assert.equal(prefixSummaryRequest.messages[1], prefixMessages[1])
assert.equal(prefixSummaryRequest.messages[2].content, 'CACHE-AWARE SUMMARY INSTRUCTION')
assert.doesNotMatch(prefixSummaryRequest.messages[2].content, /old user evidence/)
assert.match(prefixHandlerRequests[1].messages[0].content, /PREFIX SUMMARY/)
assert.equal(prefixHandlerRequests[1].messages[1], prefixMessages[2])
assert.match(prefixCommand.update._summarizationEvent.summaryMessage.content, /PREFIX SUMMARY/)
assert.equal(prefixSummaryCacheDebugLogCount, 0)

const postTurnMessages = [
  new HumanMessage('first user message'),
  new AIMessage('first assistant message'),
]
const postTurnMainResponse = new AIMessage('POST-TURN MAIN RESPONSE')
const postTurnHandlerRequests = []
const postTurnMiddleware = createSummarizationMiddleware({
  backend: { write: async filePath => ({ path: filePath }) },
  trigger: { type: 'messages', value: 3 },
  keep: { type: 'messages', value: 0 },
  tokenCounter: messages => messages.length,
  trimTokensToSummarize: 1_000,
  summaryInstruction: 'POST-TURN SUMMARY INSTRUCTION',
  summaryPrompt: 'Fallback summary: {conversation}',
})

const postTurnResponse = await postTurnMiddleware.wrapModelCall({
  messages: postTurnMessages,
  state: { messages: postTurnMessages },
  model: prefixRequestModel,
  systemMessage: prefixSystemMessage,
  tools: prefixTools,
}, async request => {
  postTurnHandlerRequests.push(request)
  return postTurnHandlerRequests.length === 1
    ? postTurnMainResponse
    : new AIMessage('POST-TURN SUMMARY')
})

assert.equal(postTurnResponse, postTurnMainResponse)
assert.equal(postTurnHandlerRequests.length, 2)
assert.equal(postTurnHandlerRequests[0].model, prefixRequestModel)
assert.equal(postTurnHandlerRequests[0].messages.length, 2)
assert.deepEqual(postTurnHandlerRequests[1].model.hiddenConfig, {
  tags: ['langsmith:nostream'],
  metadata: { lc_source: 'summarization' },
})
assert.equal(postTurnHandlerRequests[1].messages.length, 4)
assert.equal(postTurnHandlerRequests[1].messages[2], postTurnMainResponse)
assert.equal(postTurnHandlerRequests[1].messages[3].content, 'POST-TURN SUMMARY INSTRUCTION')

const postTurnUpdate = await postTurnMiddleware.afterModel({
  messages: [...postTurnMessages, postTurnMainResponse],
})
assert.equal(postTurnUpdate._summarizationEvent.cutoffIndex, 3)
assert.match(postTurnUpdate._summarizationEvent.summaryMessage.content, /POST-TURN SUMMARY/)

const nextTurnUserMessage = new HumanMessage('next turn starts normally')
const nextTurnRawMessages = [...postTurnMessages, postTurnMainResponse, nextTurnUserMessage]
const nextTurnHandlerRequests = []
await postTurnMiddleware.wrapModelCall({
  messages: nextTurnRawMessages,
  state: {
    messages: nextTurnRawMessages,
    ...postTurnUpdate,
  },
  model: prefixRequestModel,
  systemMessage: prefixSystemMessage,
  tools: prefixTools,
}, async request => {
  nextTurnHandlerRequests.push(request)
  return new AIMessage({
    content: '',
    tool_calls: [{ name: 'read_file', args: {}, id: 'next-turn-tool' }],
  })
})
assert.equal(nextTurnHandlerRequests.length, 1)
assert.match(nextTurnHandlerRequests[0].messages[0].content, /POST-TURN SUMMARY/)
assert.equal(nextTurnHandlerRequests[0].messages[1], nextTurnUserMessage)

let toolFallbackRequestModelCalls = 0
const toolFallbackRequestModel = {
  profile: { maxInputTokens: 10_000 },
  withConfig(config) {
    return { ...this, hiddenConfig: config }
  },
  async invoke() {
    toolFallbackRequestModelCalls += 1
    return new AIMessage('request model fallback should not run')
  },
}
let toolFallbackModelCalls = 0
const toolFallbackModel = {
  async invoke() {
    toolFallbackModelCalls += 1
    return new AIMessage({
      content: 'TOOL-CALL FALLBACK SUMMARY',
      usage_metadata: {
        input_tokens: 400,
        output_tokens: 40,
        total_tokens: 440,
        input_token_details: { cache_read: 100, cache_creation: 0 },
        output_token_details: { reasoning: 0 },
      },
      response_metadata: {
        model_provider: 'anthropic',
        model_name: 'claude-sonnet',
      },
    })
  },
}
let toolFallbackHandlerCalls = 0
const toolFallbackMiddleware = createSummarizationMiddleware({
  backend: { write: async filePath => ({ path: filePath }) },
  trigger: { type: 'messages', value: 1 },
  keep: { type: 'messages', value: 0 },
  tokenCounter: () => 100,
  trimTokensToSummarize: 1_000,
  summaryInstruction: 'RETURN SUMMARY TEXT ONLY',
  summaryPrompt: 'Fallback summary: {conversation}',
  fallbackModel: toolFallbackModel,
})

let fallbackSummaryCacheDebugLogCount = 0
console.debug = (...args) => {
  if (args[0] === '[SummarizationMiddleware] Summary cache usage') {
    fallbackSummaryCacheDebugLogCount += 1
  }
}
let toolFallbackCommand
try {
  toolFallbackCommand = await toolFallbackMiddleware.wrapModelCall({
    messages: [new HumanMessage('history that needs compression')],
    state: { messages: [new HumanMessage('history that needs compression')] },
    model: toolFallbackRequestModel,
    systemMessage: prefixSystemMessage,
    tools: prefixTools,
  }, async () => {
    toolFallbackHandlerCalls += 1
    if (toolFallbackHandlerCalls === 1) {
      return new AIMessage({
        content: '',
        tool_calls: [{ name: 'read_file', args: { file_path: '/tmp/a' }, id: 'call-1' }],
      })
    }
    return new AIMessage('handled after tool-call fallback')
  })
} finally {
  console.debug = originalConsoleDebug
}

assert.equal(toolFallbackHandlerCalls, 2)
assert.equal(toolFallbackRequestModelCalls, 0)
assert.equal(toolFallbackModelCalls, 1)
assert.match(toolFallbackCommand.update._summarizationEvent.summaryMessage.content, /TOOL-CALL FALLBACK SUMMARY/)
assert.equal(fallbackSummaryCacheDebugLogCount, 0)

let overflowSummaryModelCalls = 0
let overflowHandlerCalls = 0
let overflowArchiveWrites = 0
let overflowArchiveContent = ''
const overflowMiddleware = createSummarizationMiddleware({
  backend: {
    async write(filePath, content) {
      overflowArchiveWrites += 1
      overflowArchiveContent = content
      return { path: filePath }
    },
  },
  model: {
    profile: { maxInputTokens: 10_000 },
    async invoke() {
      overflowSummaryModelCalls += 1
      return new AIMessage(`OVERFLOW SUMMARY ${overflowSummaryModelCalls}`)
    },
  },
  trigger: { type: 'messages', value: 1 },
  keep: { type: 'messages', value: 0 },
  tokenCounter: () => 100,
  trimTokensToSummarize: 1_000,
  summaryPrompt: 'Summarize: {conversation}',
})
await overflowMiddleware.wrapModelCall({
  messages: [new HumanMessage('overflow history')],
  state: { messages: [new HumanMessage('overflow history')] },
  model: requestModel,
  tools: [],
}, async () => {
  overflowHandlerCalls += 1
  if (overflowHandlerCalls === 1) throw new ContextOverflowError()
  return new AIMessage('handled after retry')
})

assert.equal(overflowSummaryModelCalls, 2)
assert.equal(overflowHandlerCalls, 2)
assert.equal(overflowArchiveWrites, 1)
assert.match(overflowArchiveContent, /OVERFLOW SUMMARY 2/)
assert.doesNotMatch(overflowArchiveContent, /OVERFLOW SUMMARY 1/)

class SentinelCallbackHandler extends BaseCallbackHandler {
  name = 'sentinel_callback_handler'
}

const sharedHandler = new SentinelCallbackHandler()
const ambientCallbacks = new CallbackManager()
ambientCallbacks.addHandler(sharedHandler, true)
const explicitCallbacks = new CallbackManager()
explicitCallbacks.addHandler(sharedHandler, true)
try {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = () => ({
    callbacks: ambientCallbacks,
  })
  const mergedConfig = ensureLangGraphConfig({ callbacks: explicitCallbacks })

  assert.ok(mergedConfig.callbacks instanceof CallbackManager)
  assert.deepEqual(mergedConfig.callbacks.handlers, [sharedHandler])
  assert.deepEqual(mergedConfig.callbacks.inheritableHandlers, [sharedHandler])
  assert.notEqual(mergedConfig.callbacks, ambientCallbacks)
  assert.notEqual(mergedConfig.callbacks, explicitCallbacks)
} finally {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = originalGetRunnableConfig
}

const firstDistinctHandler = new SentinelCallbackHandler()
const secondDistinctHandler = new SentinelCallbackHandler()
try {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = () => undefined
  const mergedConfig = ensureLangGraphConfig(
    { callbacks: [firstDistinctHandler] },
    { callbacks: [secondDistinctHandler] },
  )

  assert.deepEqual(mergedConfig.callbacks, [
    firstDistinctHandler,
    secondDistinctHandler,
  ])
} finally {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = originalGetRunnableConfig
}

console.log('LangChain patch verification passed')
