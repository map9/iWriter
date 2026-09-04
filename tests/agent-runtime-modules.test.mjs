import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let runtimeModulesPromise

async function loadRuntimeModules() {
  if (!runtimeModulesPromise) {
    runtimeModulesPromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export * from './electron/ai/runtime/RuntimeConfig.ts'
            export * from './electron/ai/config/ProviderConfigRevision.ts'
            export * from './electron/ai/runtime/AgentCache.ts'
            export * from './electron/ai/runtime/AgentRunner.ts'
            export * from './electron/ai/application/InterruptCoordinator.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'agent-runtime-modules-test-entry.ts',
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
  return runtimeModulesPromise
}

function runtimeInput(overrides = {}) {
  return {
    threadId: 'thread-1',
    providerConfig: {
      id: 'provider-1',
      baseUrl: 'https://example.test/v1',
      fallbackModelId: 'fallback-model',
      maxRequestTokens: 200_000,
      modelPolicies: {
        'model-1': { maxRequestTokens: 180_000 },
      },
    },
    domain: 'editing',
    mode: 'edit',
    modelId: 'model-1',
    thinkingLevel: 'medium',
    language: 'zh-CN',
    workspacePath: '/workspace',
    skillSources: ['/builtin-skills', '/workspace/.iwriter/skills'],
    resolvedApiKey: 'secret-12345678',
    ...overrides,
  }
}

describe('agent runtime modules', () => {
  it('creates the same provider revision regardless of object key order', async () => {
    const { createProviderConfigRevision } = await loadRuntimeModules()
    const first = runtimeInput().providerConfig
    const reordered = {
      modelPolicies: first.modelPolicies,
      maxRequestTokens: first.maxRequestTokens,
      fallbackModelId: first.fallbackModelId,
      baseUrl: first.baseUrl,
      id: first.id,
    }

    assert.equal(
      createProviderConfigRevision(first),
      createProviderConfigRevision(reordered),
    )
  })

  it('builds a stable runtime identity and changes it for effective runtime inputs', async () => {
    const { createAgentRuntimeConfig } = await loadRuntimeModules()

    const first = createAgentRuntimeConfig(runtimeInput())
    const same = createAgentRuntimeConfig(runtimeInput())
    const changedWorkspace = createAgentRuntimeConfig(runtimeInput({ workspacePath: '/other' }))
    const changedCredential = createAgentRuntimeConfig(runtimeInput({ resolvedApiKey: 'secret-87654321' }))
    const changedProfiles = createAgentRuntimeConfig(runtimeInput({
      providerConfig: {
        ...runtimeInput().providerConfig,
        modelProfiles: {
          'model-1': { maxInputTokens: 320_000 },
        },
      },
    }))

    assert.equal(first.cacheKey, same.cacheKey)
    assert.notEqual(first.cacheKey, changedWorkspace.cacheKey)
    assert.notEqual(first.cacheKey, changedCredential.cacheKey)
    assert.notEqual(first.cacheKey, changedProfiles.cacheKey)
    assert.deepEqual(first.skillSources, ['/builtin-skills', '/workspace/.iwriter/skills'])
  })

  it('builds one cached resource per key and cleans only the requested thread', async () => {
    const { AgentCache } = await loadRuntimeModules()
    const cleaned = []
    const cache = new AgentCache(resource => cleaned.push(resource.id))
    let buildCount = 0

    const first = cache.getOrCreate('thread-1', 'key-1', () => {
      buildCount += 1
      return { agent: { id: 'agent-1' }, resource: { id: 'resource-1' } }
    })
    const same = cache.getOrCreate('thread-1', 'key-1', () => {
      buildCount += 1
      return { agent: { id: 'unexpected' }, resource: { id: 'unexpected' } }
    })
    cache.getOrCreate('thread-2', 'key-2', () => ({
      agent: { id: 'agent-2' },
      resource: { id: 'resource-2' },
    }))

    assert.equal(first, same)
    assert.equal(buildCount, 1)

    cache.deleteThread('thread-1')
    assert.deepEqual(cleaned, ['resource-1'])
    assert.equal(cache.size, 1)

    cache.clear()
    assert.deepEqual(cleaned, ['resource-1', 'resource-2'])
    assert.equal(cache.size, 0)
  })

  it('owns abort controllers and waits for tracked cancellation handoff', async () => {
    const { AgentRunner } = await loadRuntimeModules()
    const runner = new AgentRunner()
    const release = Promise.withResolvers()
    const controller = runner.begin('thread-1')
    runner.track('thread-1', release.promise)

    const cancellation = runner.cancel('thread-1')
    assert.equal(controller.signal.aborted, true)
    assert.equal(runner.isActive('thread-1'), true)

    release.resolve()
    await cancellation
    assert.equal(runner.isActive('thread-1'), false)
  })

  it('merges reviewed decisions back into the original interrupt order', async () => {
    const { InterruptCoordinator } = await loadRuntimeModules()
    const coordinator = new InterruptCoordinator()
    const interrupted = {
      actionRequestCount: 4,
      actionNames: ['read_file', 'replace_block', 'write_file', 'finalize_chapter'],
      autoDecisionsByIndex: {
        0: { type: 'edited', editedArgs: { source: 'auto' } },
        2: { type: 'rejected', message: 'Policy rejected.' },
      },
      reviewActionOriginalIndices: [1, 3],
    }

    const merged = coordinator.mergeDecisions(interrupted, [
      { type: 'edited', editedArgs: { block_id: 'b-2' } },
      { type: 'responded', message: 'Revise the ending.' },
    ])

    assert.deepEqual(merged, [
      { type: 'edited', editedArgs: { source: 'auto' }, message: undefined },
      { type: 'edited', editedArgs: { block_id: 'b-2' }, message: undefined },
      { type: 'rejected', message: 'Policy rejected.' },
      { type: 'responded', message: 'Revise the ending.' },
    ])

    // The coordinator owns its copies; callers cannot mutate stored auto-decisions by alias.
    merged[0].editedArgs.source = 'changed'
    assert.equal(interrupted.autoDecisionsByIndex[0].editedArgs.source, 'auto')
  })

  it('defaults missing interrupt decisions to rejection', async () => {
    const { InterruptCoordinator } = await loadRuntimeModules()
    const coordinator = new InterruptCoordinator()

    const merged = coordinator.mergeDecisions({
      actionRequestCount: 2,
      actionNames: ['read_file', 'write_file'],
      reviewActionOriginalIndices: [9],
    }, [{ type: 'approved' }])

    assert.deepEqual(merged, [
      { type: 'rejected', message: 'User did not review this action.' },
      { type: 'rejected', message: 'User did not review this action.' },
    ])
  })

  it('protects applied block edits when a resume batch contains reject-style decisions', async () => {
    const { InterruptCoordinator, BLOCK_EDIT_APPLIED_MESSAGE } = await loadRuntimeModules()
    const coordinator = new InterruptCoordinator()
    const interrupted = {
      actionRequestCount: 3,
      actionNames: ['edit_block', 'write_file', 'insert_block'],
    }

    const decisions = coordinator.buildLangGraphDecisions(interrupted, [
      { type: 'approved' },
      { type: 'rejected', message: 'Do not write.' },
      { type: 'edited', editedArgs: { block_id: 'b-3', content: 'New' } },
    ])

    assert.deepEqual(decisions, [
      { type: 'reject', message: `__IWRITER_RESPOND__\n${BLOCK_EDIT_APPLIED_MESSAGE}` },
      { type: 'reject', message: 'Do not write.' },
      { type: 'reject', message: `__IWRITER_RESPOND__\n${BLOCK_EDIT_APPLIED_MESSAGE}` },
    ])
  })

  it('maps normal approve, edit, respond, and reject decisions for LangGraph', async () => {
    const { InterruptCoordinator } = await loadRuntimeModules()
    const coordinator = new InterruptCoordinator()
    const interrupted = {
      actionRequestCount: 4,
      actionNames: ['read_file', 'write_file', 'ask_human', 'delete'],
    }

    assert.deepEqual(coordinator.buildLangGraphDecisions(interrupted, [
      { type: 'approved' },
      { type: 'edited', editedArgs: { file_path: '/tmp/a.md' } },
      { type: 'responded', message: 'Use a shorter title.' },
      { type: 'rejected' },
    ]), [
      { type: 'approve' },
      { type: 'edit', editedAction: { name: 'write_file', args: { file_path: '/tmp/a.md' } } },
      { type: 'reject', message: '__IWRITER_RESPOND__\nUse a shorter title.' },
      { type: 'reject', message: 'User rejected the edit.' },
    ])
  })

  it('rejects an empty human response before resuming LangGraph', async () => {
    const { InterruptCoordinator } = await loadRuntimeModules()
    const coordinator = new InterruptCoordinator()

    assert.throws(() => coordinator.buildLangGraphDecisions({
      actionRequestCount: 1,
      actionNames: ['ask_human'],
    }, [{ type: 'responded', message: '   ' }]), /requires non-empty message/)
  })
})
