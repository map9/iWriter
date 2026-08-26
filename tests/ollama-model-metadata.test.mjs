import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/ai/components/agent-panel/composables/useModelPicker.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [{
          name: 'model-picker-stubs',
          setup(buildContext) {
            buildContext.onResolve({ filter: /^vue$/ }, () => ({
              path: 'vue',
              namespace: 'model-picker-stub',
            }))
            buildContext.onResolve({ filter: /^@\/ai\/state\/aiStore$/ }, () => ({
              path: 'ai-store',
              namespace: 'model-picker-stub',
            }))
            buildContext.onLoad({ filter: /.*/, namespace: 'model-picker-stub' }, args => ({
              contents: args.path === 'vue'
                ? `
                    export function ref(value) { return { value } }
                    export function computed(getter) { return { get value() { return getter() } } }
                    export function watch() {}
                    export function nextTick(callback) { return Promise.resolve().then(callback) }
                  `
                : 'export function useAiStore() { return globalThis.__ollamaAiStore ?? {} }',
              loader: 'js',
            }))
          },
        }],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return modulePromise
}

function jsonResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body
    },
  }
}

describe('Ollama model metadata discovery', () => {
  it('maps show context length to modelProfiles and running context length to modelPolicies', async () => {
    const { fetchOllamaModelDiscovery } = await loadModule()
    const calls = []
    const details = {
      format: 'gguf',
      family: 'gemma4',
      families: ['gemma4'],
      parameter_size: '8.0B',
      quantization_level: 'Q4_K_M',
    }

    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init })
      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          models: [{
            name: 'gemma4:latest',
            model: 'gemma4:latest',
            modified_at: '2026-08-26T00:00:00Z',
            size: 6_598_580_464,
            digest: 'sha256-gemma4',
            details,
          }],
        })
      }
      if (url.endsWith('/api/show')) {
        return jsonResponse({
          parameters: 'temperature 0.7',
          license: 'Gemma Terms of Use',
          capabilities: ['completion', 'vision', 'tools'],
          modified_at: '2026-08-26T00:00:00Z',
          details,
          model_info: {
            'general.architecture': 'gemma4',
            'gemma4.context_length': 131_072,
          },
        })
      }
      if (url.endsWith('/api/ps')) {
        return jsonResponse({
          models: [{
            name: 'gemma4:latest',
            model: 'gemma4:latest',
            size: 6_598_580_464,
            digest: 'sha256-gemma4',
            details,
            expires_at: '2026-08-26T00:05:00Z',
            size_vram: 5_333_539_264,
            context_length: 32_768,
          }],
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    }

    const discovery = await fetchOllamaModelDiscovery(
      'http://localhost:11434',
      fetchImpl,
    )

    assert.equal(discovery.modelProfiles['gemma4:latest'].maxInputTokens, 131_072)
    assert.equal(discovery.modelProfiles['gemma4:latest'].imageInputs, true)
    assert.deepEqual(discovery.modelPolicies, {
      'gemma4:latest': { maxRequestTokens: 32_768 },
    })

    const showCall = calls.find(call => call.url.endsWith('/api/show'))
    assert.equal(showCall.init.method, 'POST')
    assert.equal(showCall.init.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(showCall.init.body), { model: 'gemma4:latest' })
    assert.equal(calls.some(call => call.url.endsWith('/api/ps')), true)
  })

  it('distinguishes an unavailable /api/ps snapshot from a successful empty snapshot', async () => {
    const { fetchOllamaModelDiscovery } = await loadModule()
    const fetchWithPsStatus = psOk => async (url) => {
      if (url.endsWith('/api/tags')) return jsonResponse({ models: [] })
      if (url.endsWith('/api/ps')) return jsonResponse({ models: [] }, psOk)
      throw new Error(`Unexpected URL: ${url}`)
    }

    const unavailable = await fetchOllamaModelDiscovery(
      'http://localhost:11434',
      fetchWithPsStatus(false),
    )
    const empty = await fetchOllamaModelDiscovery(
      'http://localhost:11434',
      fetchWithPsStatus(true),
    )
    const malformed = await fetchOllamaModelDiscovery(
      'http://localhost:11434',
      async (url) => {
        if (url.endsWith('/api/tags')) return jsonResponse({ models: [] })
        if (url.endsWith('/api/ps')) {
          return {
            ok: true,
            async json() {
              throw new SyntaxError('truncated JSON')
            },
          }
        }
        throw new Error(`Unexpected URL: ${url}`)
      },
    )

    assert.equal(unavailable.modelPolicies, undefined)
    assert.equal(malformed.modelPolicies, undefined)
    assert.deepEqual(empty.modelPolicies, {})
  })

  it('merges exact token limits without replacing explicit capability choices', async () => {
    const { mergeOllamaModelMetadata } = await loadModule()
    const existing = {
      modelProfiles: {
        'qwen3:latest': {
          maxInputTokens: 4096,
          imageInputs: false,
          toolCalling: false,
        },
      },
      modelPolicies: {
        'qwen3:latest': { maxRequestTokens: 2048 },
        'stopped:latest': { maxRequestTokens: 1024 },
      },
    }
    const discovery = {
      models: [],
      modelProfiles: {
        'qwen3:latest': {
          maxInputTokens: 131_072,
          imageInputs: true,
          toolCalling: true,
          reasoningOutput: true,
        },
      },
      modelPolicies: {
        'qwen3:latest': { maxRequestTokens: 32_768 },
      },
    }

    const merged = mergeOllamaModelMetadata(existing, discovery)

    assert.deepEqual(merged.modelProfiles['qwen3:latest'], {
      maxInputTokens: 131_072,
      imageInputs: false,
      toolCalling: false,
      reasoningOutput: true,
    })
    assert.deepEqual(merged.modelPolicies, {
      'qwen3:latest': { maxRequestTokens: 32_768 },
    })

    const retained = mergeOllamaModelMetadata(existing, {
      ...discovery,
      modelPolicies: undefined,
    })
    assert.deepEqual(retained.modelPolicies, existing.modelPolicies)
  })

  it('ignores stale discovery results after switching Ollama providers', async () => {
    const { useModelPicker } = await loadModule()
    const updates = []
    const providerA = {
      id: 'ollama-a',
      presetId: 'ollama',
      baseUrl: 'http://ollama-a:11434/v1',
    }
    const providerB = {
      id: 'ollama-b',
      presetId: 'ollama',
      baseUrl: 'http://ollama-b:11434/v1',
      modelProfiles: {
        'model-b:latest': { imageInputs: false },
      },
    }
    const store = {
      effectiveProviderConfig: providerA,
      availableModels: [],
      activeThread: undefined,
      updateProviderConfig(id, patch) {
        updates.push({ id, patch })
      },
      setCurrentModelId() {},
      setCurrentThinkingLevel() {},
    }
    globalThis.__ollamaAiStore = store

    let resolveATags
    const aTags = new Promise(resolve => {
      resolveATags = resolve
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (url.includes('ollama-a') && url.endsWith('/api/tags')) return aTags
      if (url.endsWith('/api/tags')) {
        const name = url.includes('ollama-a') ? 'model-a:latest' : 'model-b:latest'
        return jsonResponse({ models: [{ name }] })
      }
      if (url.endsWith('/api/show')) {
        return jsonResponse({
          capabilities: ['vision'],
          model_info: { 'test.context_length': 65_536 },
        })
      }
      if (url.endsWith('/api/ps')) return jsonResponse({ models: [] })
      throw new Error(`Unexpected URL: ${url}`)
    }

    try {
      const picker = useModelPicker()
      const firstRequest = picker.onMenuOpen()
      store.effectiveProviderConfig = providerB
      await picker.onMenuOpen()
      resolveATags(jsonResponse({ models: [{ name: 'model-a:latest' }] }))
      await firstRequest

      assert.deepEqual(picker.allModelItems.value.map(item => item.id), ['model-b:latest'])
      assert.equal(picker.getModelProfile('model-b:latest').imageInputs, false)
      assert.deepEqual(updates.map(update => update.id), ['ollama-b'])
    } finally {
      globalThis.fetch = originalFetch
      delete globalThis.__ollamaAiStore
    }
  })

  it('merges discovery with the latest config saved during the request', async () => {
    const { useModelPicker } = await loadModule()
    const updates = []
    const initialConfig = {
      id: 'ollama-local',
      presetId: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
    }
    const store = {
      effectiveProviderConfig: initialConfig,
      availableModels: [],
      activeThread: undefined,
      updateProviderConfig(id, patch) {
        updates.push({ id, patch })
      },
      setCurrentModelId() {},
      setCurrentThinkingLevel() {},
    }
    globalThis.__ollamaAiStore = store

    let resolveTags
    const tags = new Promise(resolve => {
      resolveTags = resolve
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (url.endsWith('/api/tags')) return tags
      if (url.endsWith('/api/show')) {
        return jsonResponse({
          capabilities: ['vision'],
          model_info: { 'test.context_length': 65_536 },
        })
      }
      if (url.endsWith('/api/ps')) return jsonResponse({ models: [] })
      throw new Error(`Unexpected URL: ${url}`)
    }

    try {
      const picker = useModelPicker()
      const request = picker.onMenuOpen()
      store.effectiveProviderConfig = {
        ...initialConfig,
        modelProfiles: {
          'model-local:latest': { imageInputs: false },
        },
      }
      resolveTags(jsonResponse({ models: [{ name: 'model-local:latest' }] }))
      await request

      assert.equal(picker.getModelProfile('model-local:latest').imageInputs, false)
      assert.equal(
        updates[0].patch.modelProfiles['model-local:latest'].imageInputs,
        false,
      )
    } finally {
      globalThis.fetch = originalFetch
      delete globalThis.__ollamaAiStore
    }
  })
})
