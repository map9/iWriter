import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const dependencyStubs = {
  name: 'web-search-dependency-stubs',
  setup(buildApi) {
    buildApi.onResolve({ filter: /AiConfigStore$/ }, () => ({
      path: 'ai-config-store',
      namespace: 'test-stub',
    }))
    buildApi.onLoad({ filter: /^ai-config-store$/, namespace: 'test-stub' }, () => ({
      contents: `
        export class AiConfigStore {
          static loadSettings() {
            const config = globalThis.__iwriterWebSearchProviderConfig
            return {
              webSearchProviderConfigs: [config],
              activeWebSearchProviderConfigId: config.id,
            }
          }
        }
        export function resolveAiApiKeyEnvVar() { return 'test-key' }
      `,
      loader: 'js',
    }))

    buildApi.onResolve({ filter: /src\/types\/ai$/ }, () => ({
      path: 'ai-types',
      namespace: 'test-stub',
    }))
    buildApi.onLoad({ filter: /^ai-types$/, namespace: 'test-stub' }, () => ({
      contents: `
        export function getActiveWebSearchProviderConfig(configs, activeId) {
          return configs.find(config => config.id === activeId)
        }
        export function resolveApiKeyReference() { return 'test-key' }
      `,
      loader: 'js',
    }))

    buildApi.onResolve({ filter: /HtmlFetcher$/ }, () => ({
      path: 'html-fetcher',
      namespace: 'test-stub',
    }))
    buildApi.onLoad({ filter: /^html-fetcher$/, namespace: 'test-stub' }, () => ({
      contents: `
        export const DEFAULT_MAX_TOKENS = 1000
        export async function fetchUrl() { return {} }
      `,
      loader: 'js',
    }))
  },
}

async function loadWebSearchTool() {
  const result = await build({
    entryPoints: ['electron/ai/tools/common/WebTools.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [dependencyStubs],
  })
  const code = result.outputFiles[0].text
  const { buildWebTools } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )
  return buildWebTools().find(tool => tool.name === 'web_search')
}

const providerResponses = {
  tavily: {
    results: [{ title: 'Tavily result', url: 'https://example.com/tavily', content: 'snippet' }],
    images: [{ url: 'https://example.com/tavily.jpg', description: 'image' }],
  },
  bocha: {
    data: {
      webPages: { value: [{ name: 'Bocha result', url: 'https://example.com/bocha', summary: 'snippet' }] },
      images: { value: [{ contentUrl: 'https://example.com/bocha.jpg', name: 'image' }] },
    },
  },
  serper: {
    organic: [{ title: 'Serper result', link: 'https://example.com/serper', snippet: 'snippet' }],
  },
  exa: {
    results: [{ title: 'Exa result', url: 'https://example.com/exa', text: 'snippet' }],
  },
}

test('successful web searches do not log the user query', async () => {
  const originalFetch = globalThis.fetch
  const originalConsoleLog = console.log
  const capturedLogs = []
  const webSearch = await loadWebSearchTool()

  try {
    console.log = (...args) => capturedLogs.push(args)
    for (const [type, responseBody] of Object.entries(providerResponses)) {
      globalThis.__iwriterWebSearchProviderConfig = {
        id: `test-${type}`,
        type,
        label: type,
        apiKey: 'test-key',
      }
      globalThis.fetch = async () => ({
        ok: true,
        async json() {
          return responseBody
        },
      })

      const result = JSON.parse(await webSearch.invoke({
        query: 'private research topic',
        max_results: 2,
      }))

      assert.equal(result.provider, type)
    }

    assert.deepEqual(capturedLogs, [])
  } finally {
    console.log = originalConsoleLog
    globalThis.fetch = originalFetch
    delete globalThis.__iwriterWebSearchProviderConfig
  }
})
