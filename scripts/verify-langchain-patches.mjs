import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { convertChunksToEvents } from '@langchain/core/language_models/compat'
import { AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'

const require = createRequire(import.meta.url)
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
