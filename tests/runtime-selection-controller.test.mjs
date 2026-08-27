import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

async function loadModule() {
  const result = await build({
    entryPoints: ['src/ai/state/runtimeSelection.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

const original = {
  providerConfigId: 'provider-1',
  modelId: 'model-1',
  thinkingLevel: 'medium',
}

describe('RuntimeSelectionController', () => {
  it('lets only the latest compatibility response mutate committed selection', async () => {
    const { RuntimeSelectionController } = await loadModule()
    const requests = []
    const applied = []
    const controller = new RuntimeSelectionController({
      request: candidate => {
        const result = deferred()
        requests.push({ candidate, result })
        return result.promise
      },
      apply: candidate => applied.push(candidate),
    })
    const firstCandidate = { ...original, modelId: 'model-large' }
    const secondCandidate = { ...original, modelId: 'model-small' }

    const first = controller.select(firstCandidate)
    const second = controller.select(secondCandidate)
    requests[1].result.resolve({ status: 'rejected', compatible: false, candidate: secondCandidate })
    requests[0].result.resolve({ status: 'committed', compatible: true, candidate: firstCandidate })

    const [firstResult, secondResult] = await Promise.all([first, second])
    assert.equal(firstResult.stale, true)
    assert.equal(secondResult.accepted, false)
    assert.deepEqual(applied, [])
  })

  it('applies committed and pending selections but not rejected selections', async () => {
    const { RuntimeSelectionController } = await loadModule()
    const applied = []
    let response = { status: 'committed', compatible: true, candidate: original }
    const controller = new RuntimeSelectionController({
      request: async () => response,
      apply: (candidate, status) => applied.push([candidate, status]),
    })

    assert.equal((await controller.select(original)).accepted, true)
    response = { status: 'pending', compatible: true, candidate: original }
    assert.equal((await controller.select(original)).accepted, true)
    response = { status: 'rejected', compatible: false, candidate: original }
    assert.equal((await controller.select(original)).accepted, false)

    assert.deepEqual(applied, [
      [original, 'committed'],
      [original, 'pending'],
    ])
  })
})
