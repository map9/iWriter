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
            export * from './electron/ai/runtime/AgentCache.ts'
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
  it('builds a stable runtime identity and changes it for effective runtime inputs', async () => {
    const { createAgentRuntimeConfig } = await loadRuntimeModules()

    const first = createAgentRuntimeConfig(runtimeInput())
    const same = createAgentRuntimeConfig(runtimeInput())
    const changedWorkspace = createAgentRuntimeConfig(runtimeInput({ workspacePath: '/other' }))
    const changedCredential = createAgentRuntimeConfig(runtimeInput({ resolvedApiKey: 'secret-87654321' }))

    assert.equal(first.cacheKey, same.cacheKey)
    assert.notEqual(first.cacheKey, changedWorkspace.cacheKey)
    assert.notEqual(first.cacheKey, changedCredential.cacheKey)
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
})
