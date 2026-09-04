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
      prepareCurrent: async () => {
        events.push('prepare-tabs')
        return () => { events.push('commit-tabs') }
      },
      prepareNext: path => {
        events.push(`prepare-draft:${path}`)
        return () => { events.push(`commit-draft:${path}`) }
      },
      terminateCurrent: async () => { events.push('terminate:a'); return true },
      commitWorkspace: path => { events.push(`commit-workspace:${path}`); state.workspacePath = path },
    })

    assert.equal(result, true)
    assert.equal(state.workspacePath, '/b')
    assert.deepEqual(events, [
      'prepare:/b',
      'prepare-tabs',
      'prepare-draft:/b',
      'terminate:a',
      'commit-workspace:/b',
      'commit-tabs',
      'commit-draft:/b',
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
      prepareCurrent: async () => { events.push('unexpected-tabs'); return () => {} },
      prepareNext: () => { events.push('unexpected-draft'); return () => {} },
      terminateCurrent: async () => { events.push('unexpected-terminate'); return true },
      commitWorkspace: path => { state.workspacePath = path },
    })

    assert.equal(result, false)
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
      prepareCurrent: async () => {
        events.push('prepare-tabs')
        return () => { events.push('unexpected-tab-commit') }
      },
      prepareNext: () => {
        events.push('prepare-draft')
        return () => { events.push('unexpected-draft-commit') }
      },
      terminateCurrent: async () => { events.push('terminate:a'); return false },
      commitWorkspace: path => { state.workspacePath = path },
    })

    assert.equal(result, false)
    assert.equal(state.workspacePath, '/a')
    assert.deepEqual(events, [
      'prepare:/b',
      'confirm:running',
      'prepare-tabs',
      'prepare-draft',
      'terminate:a',
    ])
  })

  it('does not prompt or mutate when target preparation fails', async () => {
    const { executeWorkspaceTransition } = await loadModule()
    const events = []

    const result = await executeWorkspaceTransition('/missing', {
      prepareTarget: async path => { events.push(`prepare:${path}`); return false },
      getActivity: () => 'hitl',
      confirm: async () => { events.push('unexpected-confirm'); return true },
      prepareCurrent: async () => { events.push('unexpected-tabs'); return () => {} },
      prepareNext: () => { events.push('unexpected-draft'); return () => {} },
      terminateCurrent: async () => { events.push('unexpected-terminate'); return true },
      commitWorkspace: () => { events.push('unexpected-commit') },
    })

    assert.equal(result, false)
    assert.deepEqual(events, ['prepare:/missing'])
  })

  it('does not terminate or commit when target draft preparation fails', async () => {
    const { executeWorkspaceTransition } = await loadModule()
    const events = []

    const result = await executeWorkspaceTransition('/b', {
      prepareTarget: async path => { events.push(`prepare:${path}`); return true },
      getActivity: () => 'idle',
      confirm: async () => true,
      prepareCurrent: async () => {
        events.push('prepare-tabs')
        return () => { events.push('unexpected-tab-commit') }
      },
      prepareNext: path => { events.push(`prepare-draft:${path}`); return null },
      terminateCurrent: async () => { events.push('unexpected-terminate'); return true },
      commitWorkspace: () => { events.push('unexpected-commit') },
    })

    assert.equal(result, false)
    assert.deepEqual(events, ['prepare:/b', 'prepare-tabs', 'prepare-draft:/b'])
  })

  it('selects threads only when workspace paths are exactly identical', async () => {
    const { isThreadWorkspaceSelectable } = await loadModule()

    assert.equal(isThreadWorkspaceSelectable('/workspace/a', '/workspace/a'), true)
    assert.equal(isThreadWorkspaceSelectable('/workspace/a/', '/workspace/a'), false)
    assert.equal(isThreadWorkspaceSelectable('C:\\Work\\Book', 'c:/work/book'), false)
    assert.equal(isThreadWorkspaceSelectable(' /workspace/a ', '/workspace/a'), false)
    assert.equal(isThreadWorkspaceSelectable('/', '/'), true)
    assert.equal(isThreadWorkspaceSelectable('/workspace/b', '/workspace/a'), false)
    assert.equal(isThreadWorkspaceSelectable(null, '/workspace/a'), false)
    assert.equal(isThreadWorkspaceSelectable('/workspace/a', null), false)
  })
})
