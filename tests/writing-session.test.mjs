import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/scaffold/approval/WritingSessionRegistry.ts'],
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

const CH = path.resolve('/ws/manuscript/ch001.md')
const OTHER = path.resolve('/ws/manuscript/ch002.md')

describe('decideWritingSessionApproval (Stage 2 pure verdict)', () => {
  it('auto-approves a block edit to an authorized file and reports activateFile', async () => {
    const { decideWritingSessionApproval } = await loadModule()
    const d = decideWritingSessionApproval({
      toolName: 'edit_block',
      args: { block_id: 3, file_path: CH, new_content: 'x' },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(d.kind, 'auto-approve')
    assert.equal(d.activateFile, CH)
    assert.deepEqual(d.decision, { type: 'approved' })
  })

  it('matches after path normalization (unresolved vs resolved)', async () => {
    const { decideWritingSessionApproval } = await loadModule()
    const d = decideWritingSessionApproval({
      toolName: 'replace_range',
      args: { start_block_id: 1, end_block_id: 2, file_path: '/ws/manuscript/../manuscript/ch001.md', new_content: 'x' },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(d.kind, 'auto-approve')
    assert.equal(d.activateFile, CH)
  })

  it('sends an unauthorized (out-of-scope) file to review', async () => {
    const { decideWritingSessionApproval } = await loadModule()
    const d = decideWritingSessionApproval({
      toolName: 'edit_block',
      args: { block_id: 1, file_path: OTHER, new_content: 'x' },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(d.kind, 'requires-review')
  })

  it('never auto-approves create_document (new-chapter creation)', async () => {
    const { decideWritingSessionApproval } = await loadModule()
    const d = decideWritingSessionApproval({
      toolName: 'create_document',
      args: { file_path: CH, content: 'x' },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(d.kind, 'requires-review')
  })

  it('sends a block edit without an explicit file_path (active document) to review', async () => {
    const { decideWritingSessionApproval } = await loadModule()
    const d = decideWritingSessionApproval({
      toolName: 'edit_block',
      args: { block_id: 1, new_content: 'x' },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(d.kind, 'requires-review')
  })

  it('sends a virtual_id (unsaved, non-absolute) target to review', async () => {
    const { decideWritingSessionApproval } = await loadModule()
    const d = decideWritingSessionApproval({
      toolName: 'edit_block',
      args: { block_id: 1, file_path: 'untitled:abc', new_content: 'x' },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(d.kind, 'requires-review')
  })
})

describe('WritingSessionRegistry (Stage 2 skeleton)', () => {
  it('registers authorization and exposes normalized authorized files', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry()
    reg.registerAuthorization('t1', 'plan A', ['/ws/manuscript/ch001.md', 'untitled:x', '  '])
    const files = reg.getAuthorizedFiles('t1')
    assert.equal(files.has(CH), true)
    assert.equal(files.size, 1) // virtual_id and blank dropped
    assert.equal(reg.getPlanText('t1'), 'plan A')
  })

  it('lazily activates a session and captures baseline exactly once', async () => {
    const { WritingSessionRegistry } = await loadModule()
    let captures = 0
    const reg = new WritingSessionRegistry(() => { captures += 1; return 'BASELINE' })
    assert.equal(reg.hasActiveSession('t1', CH), false)

    const s1 = reg.ensureActiveSession('t1', CH)
    assert.equal(s1.baselineSnapshot, 'BASELINE')
    assert.equal(captures, 1)
    assert.equal(reg.hasActiveSession('t1', CH), true)

    const s2 = reg.ensureActiveSession('t1', CH)
    assert.equal(s2, s1) // same session object
    assert.equal(captures, 1) // baseline not re-captured
  })

  it('accumulates edits into the active session', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: { block_id: 1 }, at: 1 })
    reg.recordAccumulation('t1', CH, { toolName: 'insert_block', args: { after_block_id: 1 }, at: 2 })
    const s = reg.getActiveSession('t1', CH)
    assert.equal(s.accumulated.length, 2)
    assert.equal(s.accumulated[0].toolName, 'edit_block')
    assert.equal(s.accumulated[1].toolName, 'insert_block')
  })

  it('isolates sessions per thread and per file', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: {}, at: 1 })
    assert.equal(reg.hasActiveSession('t2', CH), false)
    assert.equal(reg.hasActiveSession('t1', OTHER), false)
  })

  it('closes a session, returning it and clearing active state', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: {}, at: 1 })
    const closed = reg.closeSession('t1', CH)
    assert.equal(closed.targetFile, CH)
    assert.equal(closed.accumulated.length, 1)
    assert.equal(reg.hasActiveSession('t1', CH), false)
  })

  it('clearThread drops authorizations and sessions', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.registerAuthorization('t1', 'p', [CH])
    reg.ensureActiveSession('t1', CH)
    reg.clearThread('t1')
    assert.equal(reg.getAuthorizedFiles('t1').size, 0)
    assert.equal(reg.hasActiveSession('t1', CH), false)
  })
})
