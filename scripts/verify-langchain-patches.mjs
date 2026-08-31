import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { convertChunksToEvents } from '@langchain/core/language_models/compat'
import { AIMessageChunk, HumanMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import {
  createFilesystemMiddleware,
  createSummarizationMiddleware,
} from 'deepagents'
import { StreamChannel } from '@langchain/langgraph'

const require = createRequire(import.meta.url)
const deepagentsPackageDir = path.dirname(require.resolve('deepagents/package.json'))
const deepagentsPackage = JSON.parse(
  readFileSync(path.join(deepagentsPackageDir, 'package.json'), 'utf8'),
)

// DeepAgents 1.13 replaces the retired project patch with public contracts.
assert.equal(deepagentsPackage.version, '1.13.2')
assert.equal(
  readdirSync('patches').some(name => name.startsWith('deepagents+')),
  false,
  'DeepAgents must run without patch-package overrides',
)

const filesystemMiddleware = createFilesystemMiddleware({ backend: {} })
const filesystemToolNames = filesystemMiddleware.tools.map(tool => tool.name)
assert.ok(filesystemToolNames.includes('delete'))
assert.equal(filesystemToolNames.includes('delete_file'), false)

const summarizationMiddleware = createSummarizationMiddleware({
  backend: { write: async filePath => ({ path: filePath }) },
})
assert.equal(summarizationMiddleware.name, 'SummarizationMiddleware')
assert.equal(typeof summarizationMiddleware.wrapModelCall, 'function')

const replayedSummaryMessage = {
  [Symbol.for('langchain.message')]: true,
  type: 'human',
  content: 'checkpoint summary',
  additional_kwargs: { lc_source: 'summarization' },
  response_metadata: {},
}
assert.equal(replayedSummaryMessage instanceof HumanMessage, true)
assert.equal(HumanMessage.isInstance(replayedSummaryMessage), true)
assert.equal(summarizationMiddleware.stateSchema.safeParse({
  _summarizationEvent: {
    cutoffIndex: 1,
    summaryMessage: replayedSummaryMessage,
    filePath: null,
  },
}).success, true)

// LangGraph's public extension channel is the transport used by iWriter's
// context-compression transformer.
const extensionChannel = StreamChannel.local()
assert.equal(typeof extensionChannel[Symbol.asyncIterator], 'function')
extensionChannel.close()

async function collectFinishedBlocks(chunks) {
  const finished = []
  for await (const event of convertChunksToEvents(chunks)) {
    if (event.event === 'content-block-finish') finished.push(event.content)
  }
  return finished
}

// @langchain/core patch: keep provider reasoning, text, and parallel tool
// chunks in distinct content blocks even when their source indexes collide.
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

const parallelToolBlocks = await collectFinishedBlocks([
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
        { id: 'call_list', name: 'list_items', args: '{}', index: 1 },
      ],
    }),
    text: '',
  }),
])
assert.deepEqual(parallelToolBlocks.map(block => block.id), ['call_read', 'call_list'])

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

// @langchain/langgraph patch: de-duplicate callbacks merged from ambient and
// explicit runnable configs so a model/tool event is not emitted twice.
const langGraphPackageDir = path.dirname(require.resolve('@langchain/langgraph/package.json'))
const { ensureLangGraphConfig } = await import(pathToFileURL(
  path.join(langGraphPackageDir, 'dist/pregel/utils/config.js'),
).href)

class SentinelCallbackHandler extends BaseCallbackHandler {
  name = 'sentinel_callback_handler'
}

const originalGetRunnableConfig = AsyncLocalStorageProviderSingleton.getRunnableConfig
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
  assert.deepEqual(mergedConfig.callbacks, [firstDistinctHandler, secondDistinctHandler])
} finally {
  AsyncLocalStorageProviderSingleton.getRunnableConfig = originalGetRunnableConfig
}

assert.equal(existsSync('patches/@langchain+core+1.2.9.patch'), true)
assert.equal(existsSync('patches/@langchain+langgraph+1.4.13.patch'), true)
console.log('LangChain compatibility verification passed')
