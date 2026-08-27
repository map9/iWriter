import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

async function loadModule() {
  const result = await build({
    entryPoints: ['src/stores/workspaceTransition.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

describe('workspace thread transition', () => {
  it('commits an idle transition and creates a target-bound draft', async () => {
    const { executeWorkspaceTransition } = await loadModule()
    const events = []
    const state = { workspacePath: '/a' }

    const result = await executeWorkspaceTransition('/b', {
      prepareTarget: async path => { events.push(`prepare:${path}`); return true },
      getActivity: () => 'idle',
      confirm: async () => { events.push('unexpected-confirm'); return true },
      terminateCurrent: async () => { events.push('terminate:a'); return true },
      commit: path => { events.push(`commit:${path}`); state.workspacePath = path },
      afterCommit: path => { events.push(`create-draft:${path}`) },
    })

    assert.equal(result.status, 'completed')
    assert.equal(state.workspacePath, '/b')
    assert.deepEqual(events, [
      'prepare:/b',
      'terminate:a',
      'commit:/b',
      'create-draft:/b',
    ])
  })

  it('asks before HITL termination and leaves state untouched when declined', async () => {
    const { executeWorkspaceTransition } = await loadModule()
    const events = []
    const state = { workspacePath: '/a' }

    const result = await executeWorkspaceTransition('/b', {
      prepareTarget: async path => { events.push(`prepare:${path}`); return true },
      getActivity: () => 'hitl',
      confirm: async activity => { events.push(`confirm:${activity}`); return false },
      terminateCurrent: async () => { events.push('unexpected-terminate'); return true },
      commit: path => { state.workspacePath = path },
      afterCommit: () => { events.push('unexpected-draft') },
    })

    assert.equal(result.status, 'cancelled')
    assert.equal(state.workspacePath, '/a')
    assert.deepEqual(events, ['prepare:/b', 'confirm:hitl'])
  })

  it('does not commit when current thread termination fails', async () => {
    const { executeWorkspaceTransition } = await loadModule()
    const events = []
    const state = { workspacePath: '/a' }

    const result = await executeWorkspaceTransition('/b', {
      prepareTarget: async path => { events.push(`prepare:${path}`); return true },
      getActivity: () => 'running',
      confirm: async activity => { events.push(`confirm:${activity}`); return true },
      terminateCurrent: async () => { events.push('terminate:a'); return false },
      commit: path => { state.workspacePath = path },
      afterCommit: () => { events.push('unexpected-draft') },
    })

    assert.equal(result.status, 'termination-failed')
    assert.equal(state.workspacePath, '/a')
    assert.deepEqual(events, ['prepare:/b', 'confirm:running', 'terminate:a'])
  })

  it('does not prompt or mutate when target preparation fails', async () => {
    const { executeWorkspaceTransition } = await loadModule()
    const events = []

    const result = await executeWorkspaceTransition('/missing', {
      prepareTarget: async path => { events.push(`prepare:${path}`); return false },
      getActivity: () => 'hitl',
      confirm: async () => { events.push('unexpected-confirm'); return true },
      terminateCurrent: async () => { events.push('unexpected-terminate'); return true },
      commit: () => { events.push('unexpected-commit') },
      afterCommit: () => { events.push('unexpected-draft') },
    })

    assert.equal(result.status, 'preparation-failed')
    assert.deepEqual(events, ['prepare:/missing'])
  })

  it('selects only threads bound to the normalized current workspace', async () => {
    const { isThreadWorkspaceSelectable } = await loadModule()

    assert.equal(isThreadWorkspaceSelectable('/workspace/a/', '/workspace/a'), true)
    assert.equal(isThreadWorkspaceSelectable('C:\\Work\\Book', 'c:/work/book/'), true)
    assert.equal(isThreadWorkspaceSelectable('/', '/'), true)
    assert.equal(isThreadWorkspaceSelectable('C:\\', 'c:/'), true)
    assert.equal(isThreadWorkspaceSelectable('/workspace/b', '/workspace/a'), false)
    assert.equal(isThreadWorkspaceSelectable(null, '/workspace/a'), false)
    assert.equal(isThreadWorkspaceSelectable('/workspace/a', null), false)
  })
})
