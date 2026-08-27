import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/application/RuntimeSwitchService.ts'],
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

const candidate = {
  providerConfigId: 'provider-next',
  modelId: 'model-next',
  thinkingLevel: 'medium',
}

function budget(triggerTokens) {
  return {
    requestBudgetTokens: Math.ceil(triggerTokens / 0.85),
    triggerTokens,
    keepTokens: 1000,
    source: 'provider-override',
  }
}

describe('RuntimeSwitchService', () => {
  it('accepts only context strictly below the candidate compact trigger', async () => {
    const { evaluateRuntimeCompatibility } = await loadModule()

    assert.equal(evaluateRuntimeCompatibility(79_999, budget(80_000)).compatible, true)
    assert.equal(evaluateRuntimeCompatibility(80_000, budget(80_000)).compatible, false)
    assert.equal(evaluateRuntimeCompatibility(80_001, budget(80_000)).reason, 'context-exceeds-compact-trigger')
  })

  it('rejects an incompatible candidate without mutating thread runtime metadata', async () => {
    const { RuntimeSwitchService } = await loadModule()
    const commits = []
    const deferrals = []
    const service = new RuntimeSwitchService({
      inspect: async () => ({ currentTokens: 80_000, budget: budget(80_000) }),
      getThreadState: () => 'idle',
      commit: (...args) => commits.push(args),
      defer: (...args) => deferrals.push(args),
    })

    const result = await service.request({ threadId: 'thread-1', candidate })

    assert.equal(result.status, 'rejected')
    assert.equal(result.reason, 'context-exceeds-compact-trigger')
    assert.deepEqual(commits, [])
    assert.deepEqual(deferrals, [])
  })

  it('commits while idle and defers while an active turn owns the thread', async () => {
    const { RuntimeSwitchService } = await loadModule()
    const commits = []
    const deferrals = []
    let state = 'idle'
    const service = new RuntimeSwitchService({
      inspect: async () => ({ currentTokens: 20_000, budget: budget(80_000) }),
      getThreadState: () => state,
      commit: (...args) => commits.push(args),
      defer: (...args) => deferrals.push(args),
    })

    assert.equal((await service.request({ threadId: 'thread-1', candidate })).status, 'committed')
    state = 'active'
    assert.equal((await service.request({ threadId: 'thread-2', candidate })).status, 'pending')

    assert.deepEqual(commits, [['thread-1', candidate]])
    assert.deepEqual(deferrals, [['thread-2', candidate]])
  })
})
