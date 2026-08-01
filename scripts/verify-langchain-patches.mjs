import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { convertChunksToEvents } from '@langchain/core/language_models/compat'
import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages'
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
  assert.match(source, /"_contextLedger"/)
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
          name: 'list_writing_styles',
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
    name: 'list_writing_styles',
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

assert.equal(replayedSummaryMessage instanceof HumanMessage, false)
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
const configuredSummarizationMiddleware = createSummarizationMiddleware({
  backend: { write: async filePath => ({ path: filePath }) },
  model: configuredSummaryModel,
  trigger: { type: 'messages', value: 1 },
  keep: { type: 'messages', value: 0 },
  tokenCounter: () => 100,
  trimTokensToSummarize: 1_000,
  summaryPrompt: 'Summarize: {conversation}',
})
const summaryCommand = await configuredSummarizationMiddleware.wrapModelCall({
  messages: [new HumanMessage('hello')],
  state: { messages: [new HumanMessage('hello')] },
  model: requestModel,
  tools: [],
}, async () => new AIMessage('handled'))
const summaryContent = summaryCommand.update._summarizationEvent.summaryMessage.content

assert.equal(configuredSummaryModelCalls, 1)
assert.equal(requestModelCalls, 0)
assert.ok(configuredSummaryModelConfig.tags.includes('langsmith:nostream'))
assert.equal(configuredSummaryModelConfig.metadata.lc_source, 'summarization')
assert.match(summaryContent, /PUBLIC SUMMARY/)
assert.doesNotMatch(summaryContent, /private reasoning/)

class SentinelCallbackHandler extends BaseCallbackHandler {
  name = 'sentinel_callback_handler'
}

const sharedHandler = new SentinelCallbackHandler()
const ambientCallbacks = new CallbackManager()
ambientCallbacks.addHandler(sharedHandler, true)
const explicitCallbacks = new CallbackManager()
explicitCallbacks.addHandler(sharedHandler, true)
const originalGetRunnableConfig = AsyncLocalStorageProviderSingleton.getRunnableConfig

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
