import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let contractsPromise

async function loadContracts() {
  if (!contractsPromise) {
    contractsPromise = (async () => {
      const result = await build({
        entryPoints: ['shared/ai/contracts/index.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return contractsPromise
}

describe('shared AI contracts', () => {
  it('keeps agent mode and domain normalization stable', async () => {
    const { normalizeAgentMode, resolveAgentDomain } = await loadContracts()

    assert.equal(normalizeAgentMode('creative'), 'creative')
    assert.equal(normalizeAgentMode('removed-mode'), 'edit')
    assert.equal(resolveAgentDomain('edit'), 'editing')
  })

  it('keeps semantic tool classification stable', async () => {
    const { inferToolKind } = await loadContracts()

    assert.equal(inferToolKind('get_section'), 'read')
    assert.equal(inferToolKind('edit_block'), 'edit')
    assert.equal(inferToolKind('unregistered_tool'), 'other')
  })

  it('resolves environment-backed API key references without changing literal keys', async () => {
    const { resolveApiKeyReference } = await loadContracts()
    const resolveApiKey = name => name === 'AI_KEY' ? 'secret' : undefined

    assert.equal(resolveApiKeyReference('$AI_KEY', resolveApiKey), 'secret')
    assert.equal(resolveApiKeyReference(' literal-secret ', resolveApiKey), 'literal-secret')
  })

  it('normalizes web search providers into canonical order', async () => {
    const { normalizeWebSearchProviderConfigs } = await loadContracts()

    assert.deepEqual(
      normalizeWebSearchProviderConfigs([]).map(item => item.type),
      ['bocha', 'exa', 'serper', 'tavily'],
    )
  })
})
