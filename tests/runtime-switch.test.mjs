import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

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
    const { canSwitchRuntime } = await loadModule()

    assert.equal(canSwitchRuntime(79_999, budget(80_000)), true)
    assert.equal(canSwitchRuntime(80_000, budget(80_000)), false)
    assert.equal(canSwitchRuntime(80_001, budget(80_000)), false)
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
      clearPending: () => {},
    })

    const result = await service.request({ threadId: 'thread-1', candidate })

    assert.deepEqual(result, {
      status: 'rejected',
      candidate,
      currentEffectiveContextTokens: 80_000,
      candidateCompactTriggerTokens: 80_000,
      reason: 'context-exceeds-compact-trigger',
    })
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
      clearPending: () => {},
    })

    assert.deepEqual(await service.request({ threadId: 'thread-1', candidate }), {
      status: 'committed',
      candidate,
      currentEffectiveContextTokens: 20_000,
      candidateCompactTriggerTokens: 80_000,
    })
    state = 'active'
    assert.equal((await service.request({ threadId: 'thread-2', candidate })).status, 'pending')

    assert.deepEqual(commits, [['thread-1', candidate]])
    assert.deepEqual(deferrals, [['thread-2', candidate]])
  })

  it('revalidates pending selection against the final context before committing it', async () => {
    const { RuntimeSwitchService } = await loadModule()
    const commits = []
    const cleared = []
    let currentTokens = 79_999
    const service = new RuntimeSwitchService({
      inspect: async () => ({ currentTokens, budget: budget(80_000) }),
      getThreadState: () => 'active',
      commit: (...args) => commits.push(args),
      defer: () => {},
      clearPending: threadId => cleared.push(threadId),
    })

    assert.equal((await service.request({ threadId: 'thread-1', candidate })).status, 'pending')
    currentTokens = 80_000
    const result = await service.finalize('thread-1', candidate)

    assert.equal(result.status, 'rejected')
    assert.deepEqual(commits, [])
    assert.deepEqual(cleared, ['thread-1'])
  })

  it('unregisters the runtime-switch IPC handler with the other AI handlers', () => {
    const source = readFileSync('electron/App.ts', 'utf8')
    assert.match(source, /removeHandler\('ai:switch-thread-runtime'\)/)
  })
})
