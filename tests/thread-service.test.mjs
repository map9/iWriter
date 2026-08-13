import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModules() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export * from './electron/ai/application/ThreadService.ts'
            export * from './electron/ai/runtime/ThreadRuntimeStore.ts'
            export * from './electron/ai/runtime/AgentRunner.ts'
            export * from './electron/ai/runtime/AgentCache.ts'
            export * from './electron/ai/scaffold/approval/WritingSessionRegistry.ts'
            export * from './electron/ai/thread/ThreadListQuery.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'thread-service-test-entry.ts',
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
  return modulePromise
}

function aiSettings() {
  return {
    providerConfigs: [{
      id: 'provider-1',
      type: 'openai-compat',
      label: 'Test Provider',
      apiKey: 'secret',
      defaultModelId: 'model-1',
      enabled: true,
    }],
    activeProviderConfigId: 'provider-1',
    defaultMode: 'edit',
    toolPermissions: {},
    webSearchProviderConfigs: [],
    activeWebSearchProviderConfigId: null,
  }
}

async function createHarness(options = {}) {
  const {
    AgentCache,
    AgentRunner,
    ThreadListQuery,
    ThreadRuntimeStore,
    ThreadService,
    WritingSessionRegistry,
  } = await loadModules()
  const checkpointer = { get: options.checkpointGet ?? (async () => undefined) }
  const threadListQuery = new ThreadListQuery({
    backend: 'memory',
    db: null,
    checkpointer,
  })
  const runtimeStore = new ThreadRuntimeStore()
  const agentRunner = new AgentRunner()
  const agentCache = new AgentCache(() => {})
  const writingSessions = new WritingSessionRegistry()
  const adminDeletes = []
  let adminClearCount = 0
  const checkpointerAdmin = {
    deleteThread: threadId => adminDeletes.push(threadId),
    clearAll: () => { adminClearCount += 1 },
  }
  const fallbackClears = []
  let fallbackClearAllCount = 0
  const service = new ThreadService({
    getCheckpointer: () => checkpointer,
    getThreadListQuery: () => threadListQuery,
    runtimeStore,
    agentRunner,
    agentCache,
    writingSessions,
    getCheckpointerAdmin: () => checkpointerAdmin,
    clearFallbackNotifications: (...args) => fallbackClears.push(args),
    clearAllFallbackNotifications: () => { fallbackClearAllCount += 1 },
  })
  return {
    service,
    threadListQuery,
    runtimeStore,
    agentRunner,
    agentCache,
    writingSessions,
    adminDeletes,
    getAdminClearCount: () => adminClearCount,
    fallbackClears,
    getFallbackClearAllCount: () => fallbackClearAllCount,
  }
}

describe('ThreadService', () => {
  it('marks thread metadata as updated and records run errors', async () => {
    const { service, threadListQuery } = await createHarness()
    const before = threadListQuery.createMeta({
      id: 'thread-touch',
      domain: 'editing',
      mode: 'edit',
      modelId: 'model-1',
      providerConfigId: 'provider-1',
    }).updatedAt

    service.touchThread('thread-touch', true)

    const meta = service.getMeta('thread-touch')
    assert.equal(meta.hasError, true)
    assert.equal(meta.updatedAt >= before, true)
  })

  it('clears all thread resources without leaving runtime state', async () => {
    const {
      service,
      threadListQuery,
      runtimeStore,
      agentRunner,
      agentCache,
      writingSessions,
      getAdminClearCount,
      getFallbackClearAllCount,
    } = await createHarness()
    threadListQuery.createMeta({
      id: 'thread-clear',
      domain: 'editing',
      mode: 'edit',
      modelId: 'model-1',
      providerConfigId: 'provider-1',
    })
    runtimeStore.setContext('thread-clear', { workspacePath: '/workspace' })
    agentRunner.begin('thread-clear')
    agentCache.getOrCreate('thread-clear', 'cache-clear', () => ({
      agent: { id: 'agent-clear' },
      resource: { id: 'resource-clear' },
    }))
    writingSessions.registerAuthorization('thread-clear', 'plan', ['/workspace/chapter.md'])

    service.clearThreads()

    assert.deepEqual(service.listThreads(), [])
    assert.equal(runtimeStore.getContext('thread-clear'), null)
    assert.equal(agentRunner.isActive('thread-clear'), false)
    assert.equal(agentCache.size, 0)
    assert.equal(writingSessions.getAuthorizedFiles('thread-clear').size, 0)
    assert.equal(getAdminClearCount(), 1)
    assert.equal(getFallbackClearAllCount(), 1)
  })

  it('deletes every resource owned by one thread', async () => {
    const {
      service,
      threadListQuery,
      runtimeStore,
      agentRunner,
      agentCache,
      writingSessions,
      adminDeletes,
      fallbackClears,
    } = await createHarness()
    threadListQuery.createMeta({
      id: 'thread-delete',
      domain: 'editing',
      mode: 'edit',
      modelId: 'model-1',
      providerConfigId: 'provider-1',
    })
    runtimeStore.setContext('thread-delete', { workspacePath: '/workspace' })
    agentRunner.begin('thread-delete')
    agentCache.getOrCreate('thread-delete', 'cache-delete', () => ({
      agent: { id: 'agent-delete' },
      resource: { id: 'resource-delete' },
    }))
    writingSessions.registerAuthorization('thread-delete', 'plan', ['/workspace/chapter.md'])

    service.deleteThread('thread-delete')

    assert.equal(service.getMeta('thread-delete'), null)
    assert.equal(runtimeStore.getContext('thread-delete'), null)
    assert.equal(agentRunner.isActive('thread-delete'), false)
    assert.equal(agentCache.size, 0)
    assert.equal(writingSessions.getAuthorizedFiles('thread-delete').size, 0)
    assert.deepEqual(adminDeletes, ['thread-delete'])
    assert.deepEqual(fallbackClears, [['thread-delete']])
  })

  it('waits for cancellation before clearing the active turn state', async () => {
    const { service, runtimeStore, agentRunner, fallbackClears } = await createHarness()
    runtimeStore.setCurrentTurnId('thread-1', 'turn-1')
    runtimeStore.setInterrupted('thread-1', {
      actionRequestCount: 1,
      actionNames: ['edit_block'],
    })
    const release = Promise.withResolvers()
    const controller = agentRunner.begin('thread-1')
    agentRunner.track('thread-1', release.promise)

    const cancellation = service.cancel('thread-1')
    assert.equal(controller.signal.aborted, true)
    assert.notEqual(runtimeStore.getInterrupted('thread-1'), null)

    release.resolve()
    await cancellation
    assert.equal(runtimeStore.getInterrupted('thread-1'), null)
    assert.equal(runtimeStore.getCurrentTurnId('thread-1'), null)
    assert.deepEqual(fallbackClears, [['thread-1', 'turn-1']])
  })

  it('reads checkpoint messages and preserves the raw messages for interrupt rehydration', async () => {
    const rawMessages = [{
      _getType: () => 'human',
      content: '<turn_bindings>hidden</turn_bindings>正文问题',
      id: 'message-1',
    }]
    const { service } = await createHarness({
      checkpointGet: async () => ({ channel_values: { messages: rawMessages } }),
    })

    const result = await service.readMessages('thread-1')

    assert.equal(result.rawMessages, rawMessages)
    assert.equal(result.messages.length, 1)
    assert.equal(result.messages[0].role, 'user')
    assert.equal(result.messages[0].content, '正文问题')
  })

  it('returns empty message collections when checkpoint reading fails', async () => {
    const { service } = await createHarness({
      checkpointGet: async () => { throw new Error('checkpoint unavailable') },
    })

    const originalError = console.error
    console.error = () => {}
    try {
      assert.deepEqual(await service.readMessages('thread-1'), {
        messages: [],
        rawMessages: [],
      })
    } finally {
      console.error = originalError
    }
  })

  it('lists persisted thread metadata as renderer threads', async () => {
    const { service, threadListQuery } = await createHarness()
    threadListQuery.createMeta({
      id: 'thread-list',
      domain: 'creative',
      mode: 'creative',
      modelId: 'model-1',
      providerConfigId: 'provider-1',
      thinkingLevel: 'medium',
    })
    threadListQuery.setTitle('thread-list', '章节讨论')

    const threads = service.listThreads()

    assert.equal(threads.length, 1)
    assert.equal(threads[0].id, 'thread-list')
    assert.equal(threads[0].title, '章节讨论')
    assert.equal(threads[0].domain, 'creative')
    assert.deepEqual(threads[0].messages, [])
  })

  it('creates a new thread and derives its first title', async () => {
    const { service, runtimeStore } = await createHarness()

    const prepared = service.prepareTurn(aiSettings(), {
      turnId: 'turn-new',
      userText: '  写第一章  ',
      uiLocale: 'zh-CN',
      domain: 'creative',
      mode: 'creative',
      workspacePath: '/workspace',
    })

    assert.match(prepared.threadId, /^thread-\d+-[a-z0-9]+$/)
    assert.equal(prepared.turnId, 'turn-new')
    assert.equal(prepared.isNewThread, true)
    const meta = service.getMeta(prepared.threadId)
    assert.equal(meta.title, '写第一章')
    assert.equal(meta.domain, 'creative')
    assert.equal(meta.mode, 'creative')
    assert.equal(runtimeStore.getCurrentTurnId(prepared.threadId), 'turn-new')
  })

  it('prepares an existing thread turn and clears a stale interrupt', async () => {
    const { service, threadListQuery, runtimeStore } = await createHarness()
    threadListQuery.createMeta({
      id: 'thread-1',
      domain: 'editing',
      mode: 'edit',
      modelId: 'model-1',
      providerConfigId: 'provider-1',
      thinkingLevel: 'medium',
    })
    runtimeStore.setInterrupted('thread-1', {
      actionRequestCount: 1,
      actionNames: ['edit_block'],
    })

    const prepared = service.prepareTurn(aiSettings(), {
      threadId: 'thread-1',
      turnId: 'turn-1',
      userText: '继续修改',
      uiLocale: 'zh-CN',
      domain: 'editing',
      mode: 'edit',
      threadRuntime: {
        providerConfigId: 'provider-1',
        modelId: 'model-2',
        thinkingLevel: 'high',
      },
      workspacePath: '/workspace',
    })

    assert.equal(prepared.threadId, 'thread-1')
    assert.equal(prepared.turnId, 'turn-1')
    assert.equal(prepared.isNewThread, false)
    assert.equal(prepared.language, 'zh-CN')
    assert.equal(prepared.runtime.modelId, 'model-2')
    assert.deepEqual(runtimeStore.getContext('thread-1'), {
      workspacePath: '/workspace',
      language: 'zh-CN',
    })
    assert.equal(runtimeStore.getCurrentTurnId('thread-1'), 'turn-1')
    assert.equal(runtimeStore.getInterrupted('thread-1'), null)
    const meta = service.getMeta('thread-1')
    assert.equal(meta.domain, 'editing')
    assert.equal(meta.mode, 'edit')
    assert.equal(meta.modelId, 'model-2')
    assert.equal(meta.providerConfigId, 'provider-1')
    assert.equal(meta.thinkingLevel, 'high')
  })
})
