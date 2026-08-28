import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

const modulePath = resolve('src/ai/thread/threadSelectionPersistence.ts')
let moduleCounter = 0

async function loadModule() {
  assert.ok(existsSync(modulePath), 'thread selection persistence module must exist')
  const result = await build({
    entryPoints: [modulePath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const code = `${result.outputFiles[0].text}\n// module-${moduleCounter++}`
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

function createStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

function createThread(overrides = {}) {
  return {
    id: 'thread-history',
    title: 'History',
    createdAt: 10,
    updatedAt: 20,
    messages: [{ id: 'message-1', role: 'user', content: 'hello', timestamp: 20 }],
    messagesLoaded: true,
    providerConfigId: 'provider-1',
    modelId: 'model-1',
    domain: 'editing',
    mode: 'edit',
    thinkingLevel: 'medium',
    workspacePath: '/workspace',
    ...overrides,
  }
}

describe('active AI thread selection persistence', () => {
  it('restores the selected draft as local-only without persisting its messages', async () => {
    const module = await loadModule()
    const storage = createStorage()
    const draft = createThread({
      id: 'thread-draft',
      title: 'New conversation',
      mode: 'creative',
      domain: 'creative',
      messages: [],
      messagesLoaded: false,
    })

    module.saveActiveThreadSelection(draft, true, storage)
    const selection = module.loadActiveThreadSelection(storage)
    const restored = module.resolveInitialThreadSelection(
      selection,
      [createThread()],
      '/workspace',
    )

    assert.equal(restored.activeThreadId, 'thread-draft')
    assert.equal(restored.localDraftThreadId, 'thread-draft')
    assert.deepEqual(restored.threads[0].messages, [])
    assert.equal(restored.threads[0].messagesLoaded, false)
    assert.equal(restored.threads[0].mode, 'creative')
    assert.equal(JSON.stringify(selection).includes('message-1'), false)
  })

  it('prefers the backend copy when a saved draft was accepted before shutdown', async () => {
    const module = await loadModule()
    const storage = createStorage()
    const draft = createThread({ id: 'thread-draft', messages: [], messagesLoaded: false })
    const persisted = createThread({ id: 'thread-draft', title: 'Accepted thread' })

    module.saveActiveThreadSelection(draft, true, storage)
    const restored = module.resolveInitialThreadSelection(
      module.loadActiveThreadSelection(storage),
      [persisted],
      '/workspace',
    )

    assert.equal(restored.activeThreadId, 'thread-draft')
    assert.equal(restored.localDraftThreadId, null)
    assert.equal(restored.threads[0].title, 'Accepted thread')
  })

  it('restores a selected history thread only in its current workspace', async () => {
    const module = await loadModule()
    const storage = createStorage()
    const first = createThread({ id: 'thread-first', updatedAt: 30 })
    const selected = createThread({ id: 'thread-selected', updatedAt: 20 })

    module.saveActiveThreadSelection(selected, false, storage)
    const sameWorkspace = module.resolveInitialThreadSelection(
      module.loadActiveThreadSelection(storage),
      [first, selected],
      '/workspace',
    )
    const otherWorkspace = module.resolveInitialThreadSelection(
      module.loadActiveThreadSelection(storage),
      [first, selected],
      '/other-workspace',
    )

    assert.equal(sameWorkspace.activeThreadId, 'thread-selected')
    assert.equal(otherWorkspace.activeThreadId, null)
  })
})
