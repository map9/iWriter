import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/ai/state/settings.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [{
          name: 'renderer-settings-test-dependencies',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/ai\/client\/AgentClient$/ }, () => ({
              path: 'agent-client',
              namespace: 'settings-test',
            }))
            buildApi.onResolve({ filter: /^@\/ai\/model\/providers\/provider-presets$/ }, () => ({
              path: 'provider-presets',
              namespace: 'settings-test',
            }))
            buildApi.onResolve({ filter: /^@\/utils\/notifications$/ }, () => ({
              path: 'notifications',
              namespace: 'settings-test',
            }))
            buildApi.onResolve({ filter: /^@\/i18n$/ }, () => ({
              path: 'i18n',
              namespace: 'settings-test',
            }))
            buildApi.onLoad({ filter: /.*/, namespace: 'settings-test' }, args => {
              if (args.path === 'agent-client') {
                return {
                  contents: `export const agentClient = {
                    switchThreadRuntime: request => globalThis.__switchThreadRuntime(request),
                    updateConfig: settings => globalThis.__updateAiConfig?.(settings),
                  }`,
                }
              }
              if (args.path === 'provider-presets') {
                return {
                  contents: `export const getProviderPresetById = () => undefined
                    export const getProviderPresets = () => []`,
                }
              }
              if (args.path === 'notifications') {
                return {
                  contents: `export const notify = {
                    warning: message => globalThis.__runtimeWarnings?.push(message),
                    error: message => globalThis.__runtimeErrors?.push(message),
                  }`,
                }
              }
              return {
                contents: `export const i18n = {
                  global: { t: key => key },
                }`,
              }
            })
          },
        }],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return modulePromise
}

function deferred() {
  let resolve
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createHarness(createAiSettingsState, options = {}) {
  let thread = options.thread === undefined ? {
    id: 'thread-1',
    title: 'Thread',
    createdAt: 1,
    updatedAt: 1,
    providerConfigId: 'provider-1',
    modelId: 'model-current',
    domain: 'editing',
    mode: 'edit',
    thinkingLevel: 'medium',
  } : options.thread
  const updates = []
  const settings = {
    providerConfigs: [{
      id: 'provider-1',
      type: 'openai-compat',
      label: 'Provider',
      apiKey: 'secret',
      defaultModelId: 'model-current',
      models: ['model-current', 'model-first', 'model-second'],
      enabled: true,
    }],
    activeProviderConfigId: 'provider-1',
    defaultMode: 'edit',
    toolPermissions: {},
    webSearchProviderConfigs: [],
    activeWebSearchProviderConfigId: null,
  }
  globalThis.localStorage = {
    getItem: () => JSON.stringify(settings),
    setItem: () => {},
  }
  globalThis.__runtimeWarnings = []
  globalThis.__runtimeErrors = []

  const state = createAiSettingsState({
    getActiveThread: () => thread,
    getThreadById: threadId => threadId === thread?.id ? thread : null,
    isLocalOnlyThread: () => false,
    canChangeThreadDomain: () => false,
    updateThread: nextThread => {
      thread = nextThread
      updates.push(nextThread)
    },
  })
  return { state, updates, getThread: () => thread }
}

const candidateFor = modelId => ({
  providerConfigId: 'provider-1',
  modelId,
  thinkingLevel: 'medium',
})

const responseFor = (status, modelId) => ({
  status,
  candidate: candidateFor(modelId),
  currentEffectiveContextTokens: 10_000,
  candidateCompactTriggerTokens: 20_000,
  ...(status === 'rejected' ? { reason: 'context-exceeds-compact-trigger' } : {}),
})

describe('renderer runtime selection', () => {
  it('drops the legacy provider model selection when loading settings', async () => {
    const { loadAiSettings } = await loadModule()
    globalThis.localStorage = {
      getItem: () => JSON.stringify({
        providerConfigs: [{
          id: 'provider-legacy',
          type: 'openai-compat',
          label: 'Legacy Provider',
          apiKey: 'secret',
          defaultModelId: 'model-default',
          lastSelectedModelId: 'model-legacy',
          models: ['model-default'],
          enabled: true,
        }],
        activeProviderConfigId: 'provider-legacy',
        defaultMode: 'edit',
        toolPermissions: {},
        webSearchProviderConfigs: [],
        activeWebSearchProviderConfigId: null,
      }),
      setItem: () => {},
    }

    const settings = loadAiSettings()

    assert.equal(settings.providerConfigs[0].defaultModelId, 'model-default')
    assert.equal(Object.hasOwn(settings.providerConfigs[0], 'lastSelectedModelId'), false)
  })

  it('updates the provider default when selecting a model without an active thread', async () => {
    const { createAiSettingsState } = await loadModule()
    const { state } = createHarness(createAiSettingsState, { thread: null })
    const storedSettings = []
    const pushedSettings = []
    globalThis.localStorage.setItem = (_key, value) => {
      storedSettings.push(JSON.parse(value))
    }
    globalThis.__updateAiConfig = settings => {
      pushedSettings.push(settings)
    }

    assert.equal(await state.setCurrentModelId('model-second'), true)
    assert.equal(state.settings.value.providerConfigs[0].defaultModelId, 'model-second')
    assert.equal(storedSettings[0].providerConfigs[0].defaultModelId, 'model-second')
    assert.equal(pushedSettings[0].providerConfigs[0].defaultModelId, 'model-second')
  })

  it('uses the provider default when switching providers', async () => {
    const { createAiSettingsState } = await loadModule()
    const requests = []
    globalThis.__switchThreadRuntime = async request => {
      requests.push(request)
      return {
        status: 'committed',
        candidate: request.candidate,
        currentEffectiveContextTokens: 10_000,
        candidateCompactTriggerTokens: 20_000,
      }
    }
    const { state, getThread } = createHarness(createAiSettingsState)
    state.settings.value.providerConfigs.push({
      id: 'provider-2',
      type: 'openai-compat',
      label: 'Second Provider',
      apiKey: 'secret',
      defaultModelId: 'model-provider-default',
      lastSelectedModelId: 'model-provider-legacy',
      models: ['model-provider-default'],
      enabled: true,
    })

    assert.equal(await state.setActiveProvider('provider-2'), true)
    assert.equal(requests[0].candidate.modelId, 'model-provider-default')
    assert.equal(getThread().providerConfigId, 'provider-2')
    assert.equal(getThread().modelId, 'model-provider-default')
  })

  it('falls back to the provider model list when switching to a provider without a default', async () => {
    const { createAiSettingsState } = await loadModule()
    const requests = []
    globalThis.__switchThreadRuntime = async request => {
      requests.push(request)
      return {
        status: 'committed',
        candidate: request.candidate,
        currentEffectiveContextTokens: 10_000,
        candidateCompactTriggerTokens: 20_000,
      }
    }
    const { state, getThread } = createHarness(createAiSettingsState)
    state.settings.value.providerConfigs.push({
      id: 'provider-2',
      type: 'openai-compat',
      label: 'Second Provider',
      apiKey: 'secret',
      defaultModelId: '',
      lastSelectedModelId: 'model-provider-legacy',
      models: ['model-provider-first'],
      enabled: true,
    })

    assert.equal(await state.setActiveProvider('provider-2'), true)
    assert.equal(requests[0].candidate.modelId, 'model-provider-first')
    assert.equal(getThread().providerConfigId, 'provider-2')
    assert.equal(getThread().modelId, 'model-provider-first')
    assert.equal(state.settings.value.providerConfigs[1].defaultModelId, 'model-provider-first')
  })

  it('lets only the latest provider/model request mutate the thread', async () => {
    const { createAiSettingsState } = await loadModule()
    const requests = []
    globalThis.__switchThreadRuntime = request => {
      const pending = deferred()
      requests.push({ request, pending })
      return pending.promise
    }
    const { state, updates, getThread } = createHarness(createAiSettingsState)

    const first = state.setCurrentModelId('model-first')
    const second = state.setCurrentModelId('model-second')
    requests[1].pending.resolve(responseFor('rejected', 'model-second'))
    requests[0].pending.resolve(responseFor('committed', 'model-first'))

    assert.equal(await second, false)
    assert.equal(await first, false)
    assert.equal(getThread().modelId, 'model-current')
    assert.deepEqual(updates, [])
    assert.equal(state.isRuntimeSwitching.value, false)
    assert.equal(globalThis.__runtimeWarnings.length, 1)
  })

  it('stores an active-turn switch as pending and commits it after resolution', async () => {
    const { createAiSettingsState } = await loadModule()
    globalThis.__switchThreadRuntime = async () => responseFor('pending', 'model-first')
    const { state, getThread } = createHarness(createAiSettingsState)

    assert.equal(await state.setCurrentModelId('model-first'), true)
    assert.equal(getThread().modelId, 'model-current')
    assert.deepEqual(getThread().pendingRuntime, candidateFor('model-first'))

    state.applyRuntimeSwitchResolution(
      'thread-1',
      responseFor('committed', 'model-first'),
    )
    assert.equal(getThread().modelId, 'model-first')
    assert.equal(getThread().pendingRuntime, undefined)
    assert.equal(state.settings.value.providerConfigs[0].defaultModelId, 'model-first')
  })
})
