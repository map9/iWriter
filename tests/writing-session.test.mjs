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

  it('getActiveSessions returns only sessions with accumulation (M1-1 run-end fallback criterion)', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    // CH has accumulation, OTHER is pre-activated but empty (e.g. plan approved, writer未动笔).
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: {}, at: 1 })
    reg.ensureActiveSession('t1', OTHER, 'B')

    const withAccum = reg.getActiveSessions('t1')
    assert.equal(withAccum.length, 1)
    assert.equal(withAccum[0].file, CH)

    const all = reg.getActiveSessions('t1', true)
    assert.equal(all.length, 2)

    assert.deepEqual(reg.getActiveSessions('unknown-thread'), [])
  })

  it('closeSession removes a session so it no longer counts as un-finalized', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: {}, at: 1 })
    assert.equal(reg.getActiveSessions('t1').length, 1)
    reg.closeSession('t1', CH)
    assert.equal(reg.getActiveSessions('t1').length, 0)
  })

  it('recordAgentSnapshot stores the attribution baseline on the active session (M1-2)', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: {}, at: 1 })
    reg.recordAgentSnapshot('t1', CH, 'AGENT_STATE')
    assert.equal(reg.getActiveSession('t1', CH).lastAgentSnapshot, 'AGENT_STATE')
    // No-op for an unknown file (no throw, nothing created).
    reg.recordAgentSnapshot('t1', OTHER, 'X')
    assert.equal(reg.hasActiveSession('t1', OTHER), false)
  })

  it('agent-snapshot is per-file: re-snapshotting one session leaves others untouched (M1-2 scoping fix)', async () => {
    const { WritingSessionRegistry } = await loadModule()
    const reg = new WritingSessionRegistry(() => 'B')
    reg.recordAccumulation('t1', CH, { toolName: 'edit_block', args: {}, at: 1 })
    reg.recordAccumulation('t1', OTHER, { toolName: 'edit_block', args: {}, at: 1 })
    // Batch 1 auto-applied to CH → its agent snapshot captured.
    reg.recordAgentSnapshot('t1', CH, 'CH_AGENT')
    // Batch 2 auto-applies ONLY to OTHER; the resume loop is scoped to autoAppliedFiles, so CH is
    // NOT re-snapshotted. An author's edit to CH during batch 2 must stay detectable at finalize —
    // CH.lastAgentSnapshot must keep 'CH_AGENT' (a blanket all-sessions loop would clobber it).
    reg.recordAgentSnapshot('t1', OTHER, 'OTHER_AGENT')
    assert.equal(reg.getActiveSession('t1', CH).lastAgentSnapshot, 'CH_AGENT')
    assert.equal(reg.getActiveSession('t1', OTHER).lastAgentSnapshot, 'OTHER_AGENT')
  })
})

describe('decideDelegatedWriteGate (Stage 2b — delegated writes require a session)', () => {
  it('rejects a subagent block edit whose target is outside every authorization', async () => {
    const { decideDelegatedWriteGate } = await loadModule()
    const gate = decideDelegatedWriteGate({
      toolName: 'edit_block',
      args: { block_id: 5, file_path: CH },
      authorizedFiles: new Set(),
    })
    assert.equal(gate.kind, 'reject')
    assert.equal(gate.decision.type, 'rejected')
    assert.equal(gate.targetFile, CH)
    // The message must tell the caller what to fix; a bare rejection loops the subagent.
    assert.match(gate.decision.message, /confirm_writing_plan/)
    assert.match(gate.decision.message, /BEFORE delegating/)
  })

  it('passes a subagent block edit inside an active authorization', async () => {
    const { decideDelegatedWriteGate } = await loadModule()
    const gate = decideDelegatedWriteGate({
      toolName: 'edit_block',
      args: { block_id: 5, file_path: CH },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(gate.kind, 'pass')
  })

  it('rejects a delegated create_document outside the authorization, passes it inside', async () => {
    const { decideDelegatedWriteGate } = await loadModule()
    const args = { filename: 'ch001', directory: path.dirname(CH) }
    assert.equal(decideDelegatedWriteGate({ toolName: 'create_document', args, authorizedFiles: new Set() }).kind, 'reject')
    assert.equal(decideDelegatedWriteGate({ toolName: 'create_document', args, authorizedFiles: new Set([CH]) }).kind, 'pass')
  })

  it('rejects a delegated block edit with no explicit target file (cannot be matched to a session)', async () => {
    const { decideDelegatedWriteGate } = await loadModule()
    const gate = decideDelegatedWriteGate({
      toolName: 'edit_block',
      args: { block_id: 5 },
      authorizedFiles: new Set([CH]),
    })
    assert.equal(gate.kind, 'reject')
    assert.equal(gate.targetFile, null)
  })

  it('never gates a non-write tool', async () => {
    const { decideDelegatedWriteGate } = await loadModule()
    assert.equal(
      decideDelegatedWriteGate({ toolName: 'get_section', args: {}, authorizedFiles: new Set() }).kind,
      'pass'
    )
  })
})

describe('delegatedActionIndices (who issued the tool call)', () => {
  it('classifies action requests with no parent counterpart as delegated', async () => {
    const { delegatedActionIndices } = await loadModule()
    // Parent called task(); the three edits can only have come from inside the subagent.
    const idx = delegatedActionIndices(
      [{ name: 'edit_block' }, { name: 'edit_block' }, { name: 'delete_block' }],
      [{ name: 'task' }]
    )
    assert.deepEqual([...idx].sort((a, b) => a - b), [0, 1, 2])
  })

  it('classifies the main agent\'s own edits as not delegated', async () => {
    const { delegatedActionIndices } = await loadModule()
    const idx = delegatedActionIndices(
      [{ name: 'edit_block' }, { name: 'edit_block' }],
      [{ name: 'edit_block' }, { name: 'edit_block' }]
    )
    assert.equal(idx.size, 0)
  })

  it('counts per name: extra occurrences beyond the parent\'s are delegated', async () => {
    const { delegatedActionIndices } = await loadModule()
    const idx = delegatedActionIndices(
      [{ name: 'edit_block' }, { name: 'edit_block' }, { name: 'edit_block' }],
      [{ name: 'edit_block' }, { name: 'task' }]
    )
    assert.deepEqual([...idx].sort((a, b) => a - b), [1, 2])
  })

  it('classifies nothing when the parent tool calls are unavailable (never gate on a guess)', async () => {
    const { delegatedActionIndices } = await loadModule()
    assert.equal(delegatedActionIndices([{ name: 'edit_block' }], undefined).size, 0)
    assert.equal(delegatedActionIndices([{ name: 'edit_block' }], []).size, 0)
  })
})
