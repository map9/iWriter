import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModules() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export * from './electron/ai/application/WritingSessionCoordinator.ts'
            export * from './electron/ai/scaffold/approval/WritingSessionRegistry.ts'
            export * from './electron/ai/runtime/ThreadRuntimeStore.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'writing-session-coordinator-test-entry.ts',
        },
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

async function createHarness(options = {}) {
  const {
    ThreadRuntimeStore,
    WritingSessionCoordinator,
    WritingSessionRegistry,
  } = await loadModules()
  const registry = new WritingSessionRegistry()
  const runtimeStore = new ThreadRuntimeStore()
  const sentEvents = []
  const strategy = options.strategy ?? {
    buildReviewItems: async () => [],
  }
  const coordinator = new WritingSessionCoordinator({
    registry,
    snapshotBroker: {
      requestSnapshot: options.requestSnapshot ?? (async () => null),
    },
    runtimeStore,
    getThreadDomain: () => options.domain ?? 'creative',
    getStrategy: () => strategy,
    rendererBridge: {
      sendRunInterrupted: event => sentEvents.push(event),
    },
  })
  return { coordinator, registry, runtimeStore, sentEvents }
}

function createChapter(testContext, content = 'DISK BASELINE') {
  const directory = mkdtempSync(path.join(tmpdir(), 'iwriter-writing-session-'))
  testContext.after(() => rmSync(directory, { recursive: true, force: true }))
  const chapter = path.join(directory, 'chapter.md')
  writeFileSync(chapter, content, 'utf-8')
  return chapter
}

describe('WritingSessionCoordinator lifecycle', () => {
  it('decorates auto-apply edits and whole-chapter finalize reviews', async testContext => {
    const chapter = createChapter(testContext, 'DISK CURRENT')
    const { coordinator, registry } = await createHarness({
      requestSnapshot: async filePath => ({ filePath, viewMarkdown: 'EDITOR CURRENT' }),
    })
    registry.ensureActiveSession('thread-review', chapter, 'SESSION BASELINE')
    registry.recordAgentSnapshot('thread-review', chapter, 'AGENT SNAPSHOT')
    const reviews = [
      {
        kind: 'edit',
        payload: {
          id: 'edit-1', status: 'pending', kind: 'block', type: 'edit', filePath: chapter,
        },
      },
      {
        kind: 'creative',
        payload: {
          id: 'finalize-1',
          status: 'pending',
          kind: 'creative_chapter_finalize',
          toolName: 'finalize_chapter',
          chapter,
          baseline: '',
          current: '',
        },
      },
      {
        kind: 'creative',
        payload: {
          id: 'plan-1',
          status: 'pending',
          kind: 'creative_plan',
          toolName: 'confirm_writing_plan',
          plan: '计划',
        },
      },
    ]

    await coordinator.decorateReviews(reviews, 'thread-review', [4, 9, 12], new Set([4]))

    assert.equal(reviews[0].payload.autoApply, true)
    assert.equal(reviews[1].payload.baseline, 'SESSION BASELINE')
    assert.equal(reviews[1].payload.current, 'EDITOR CURRENT')
    assert.equal(reviews[1].payload.hasExternalEdits, true)
    assert.equal('baseline' in reviews[2].payload, false)
  })

  it('closes approved and edited finalize sessions without changing accepted content', async testContext => {
    const approvedChapter = createChapter(testContext, 'APPROVED CURRENT')
    const editedChapter = createChapter(testContext, 'EDITED CURRENT')
    const { coordinator, registry } = await createHarness()
    registry.ensureActiveSession('thread-accepted', approvedChapter, 'APPROVED BASELINE')
    registry.ensureActiveSession('thread-accepted', editedChapter, 'EDITED BASELINE')

    coordinator.applyFinalizeDecisions('thread-accepted', {
      actionRequestCount: 2,
      actionNames: ['finalize_chapter', 'finalize_chapter'],
      finalizeArgsByIndex: {
        0: { chapter: approvedChapter },
        1: { chapter: editedChapter },
      },
    }, [{ type: 'approved' }, { type: 'edited', editedArgs: {} }])

    assert.equal(registry.hasActiveSession('thread-accepted', approvedChapter), false)
    assert.equal(registry.hasActiveSession('thread-accepted', editedChapter), false)
    assert.equal(readFileSync(approvedChapter, 'utf-8'), 'APPROVED CURRENT')
    assert.equal(readFileSync(editedChapter, 'utf-8'), 'EDITED CURRENT')
  })

  it('keeps a finalize session open when the author requests rework', async testContext => {
    const chapter = createChapter(testContext, 'CURRENT')
    const { coordinator, registry } = await createHarness()
    registry.ensureActiveSession('thread-rework', chapter, 'BASELINE')

    coordinator.applyFinalizeDecisions('thread-rework', {
      actionRequestCount: 1,
      actionNames: ['finalize_chapter'],
      finalizeArgsByIndex: { 0: { chapter } },
    }, [{ type: 'responded', response: '请继续修改' }])

    assert.equal(registry.hasActiveSession('thread-rework', chapter), true)
    assert.equal(readFileSync(chapter, 'utf-8'), 'CURRENT')
  })

  it('restores the baseline and closes a rejected finalize session', async testContext => {
    const chapter = createChapter(testContext, 'CURRENT')
    const { coordinator, registry } = await createHarness()
    registry.ensureActiveSession('thread-rejected', chapter, 'BASELINE')

    coordinator.applyFinalizeDecisions('thread-rejected', {
      actionRequestCount: 1,
      actionNames: ['finalize_chapter'],
      finalizeArgsByIndex: { 0: { chapter } },
    }, [{ type: 'rejected' }])

    assert.equal(registry.hasActiveSession('thread-rejected', chapter), false)
    assert.equal(readFileSync(chapter, 'utf-8'), 'BASELINE')
  })

  it('stashes only normalized plan and finalize arguments by original action index', async () => {
    const { coordinator } = await createHarness()

    const stashed = coordinator.stashInterruptArgs([
      { name: 'read_document', args: { file_path: '/tmp/read.md' } },
      {
        name: 'confirm_writing_plan',
        args: { plan: '写作计划', target_files: ['/tmp/a.md', 42, '/tmp/b.md'] },
      },
      { name: 'finalize_chapter', args: { chapter: '/tmp/a.md', summary: '完成' } },
      { name: 'finalize_chapter', args: { chapter: 42, summary: false } },
    ])

    assert.deepEqual(stashed, {
      confirmPlanArgsByIndex: {
        1: { plan: '写作计划', targetFiles: ['/tmp/a.md', '/tmp/b.md'] },
      },
      finalizeArgsByIndex: {
        2: { chapter: '/tmp/a.md', summary: '完成' },
        3: { chapter: '', summary: undefined },
      },
    })
  })

  it('records agent snapshots only for files auto-applied by the resumed batch', async testContext => {
    const firstChapter = createChapter(testContext, 'FIRST DISK')
    const secondChapter = createChapter(testContext, 'SECOND DISK')
    const { coordinator, registry } = await createHarness({
      requestSnapshot: async filePath => ({
        filePath,
        viewMarkdown: filePath === firstChapter ? 'FIRST AGENT SNAPSHOT' : 'UNEXPECTED',
      }),
    })
    registry.recordAccumulation('thread-snapshots', firstChapter, {
      toolName: 'edit_block', args: {}, at: 1,
    }, 'FIRST BASELINE')
    registry.recordAccumulation('thread-snapshots', secondChapter, {
      toolName: 'edit_block', args: {}, at: 2,
    }, 'SECOND BASELINE')
    registry.recordAgentSnapshot('thread-snapshots', firstChapter, 'FIRST OLD SNAPSHOT')
    registry.recordAgentSnapshot('thread-snapshots', secondChapter, 'SECOND OLD SNAPSHOT')

    await coordinator.recordAutoAppliedSnapshots('thread-snapshots', [firstChapter])

    assert.equal(
      registry.getActiveSession('thread-snapshots', firstChapter).lastAgentSnapshot,
      'FIRST AGENT SNAPSHOT',
    )
    assert.equal(
      registry.getActiveSession('thread-snapshots', secondChapter).lastAgentSnapshot,
      'SECOND OLD SNAPSHOT',
    )
  })

  it('falls back to disk when editor snapshot capture fails', async testContext => {
    const chapter = createChapter(testContext, 'DISK AFTER SNAPSHOT ERROR')
    const { coordinator, registry } = await createHarness({
      requestSnapshot: async () => { throw new Error('renderer unavailable') },
    })
    const originalWarn = console.warn
    console.warn = () => {}
    try {
      await coordinator.registerApprovedPlans('thread-snapshot-error', {
        actionRequestCount: 1,
        actionNames: ['confirm_writing_plan'],
        confirmPlanArgsByIndex: {
          0: { plan: '计划', targetFiles: [chapter] },
        },
      }, [{ type: 'approved' }])
    } finally {
      console.warn = originalWarn
    }

    assert.equal(
      registry.getActiveSession('thread-snapshot-error', chapter).baselineSnapshot,
      'DISK AFTER SNAPSHOT ERROR',
    )
  })

  it('anchors a missing future chapter to an empty baseline without requesting a snapshot', async testContext => {
    const directory = mkdtempSync(path.join(tmpdir(), 'iwriter-writing-session-future-'))
    testContext.after(() => rmSync(directory, { recursive: true, force: true }))
    const chapter = path.join(directory, 'future.md')
    let snapshotRequests = 0
    const { coordinator, registry } = await createHarness({
      requestSnapshot: async () => {
        snapshotRequests += 1
        return null
      },
    })

    await coordinator.registerApprovedPlans('thread-future', {
      actionRequestCount: 1,
      actionNames: ['confirm_writing_plan'],
      confirmPlanArgsByIndex: {
        0: { plan: '新章计划', targetFiles: [chapter] },
      },
    }, [{ type: 'approved' }])

    assert.equal(snapshotRequests, 0)
    assert.equal(registry.getActiveSession('thread-future', chapter).baselineSnapshot, '')
  })

  it('registers approved plan arguments and falls back to the disk baseline', async testContext => {
    const chapter = createChapter(testContext, 'DISK BASELINE')
    const { coordinator, registry } = await createHarness()

    await coordinator.registerApprovedPlans('thread-approved', {
      actionRequestCount: 1,
      actionNames: ['confirm_writing_plan'],
      confirmPlanArgsByIndex: {
        0: { plan: '批准计划', targetFiles: [chapter] },
      },
    }, [{ type: 'approved' }])

    assert.equal(registry.getPlanText('thread-approved'), '批准计划')
    assert.equal(
      registry.getActiveSession('thread-approved', chapter).baselineSnapshot,
      'DISK BASELINE',
    )
  })

  it('registers edited plan arguments and anchors the editor baseline', async testContext => {
    const chapter = createChapter(testContext)
    const { coordinator, registry } = await createHarness({
      requestSnapshot: async filePath => ({
        filePath,
        viewMarkdown: 'EDITOR BASELINE',
      }),
    })

    await coordinator.registerApprovedPlans('thread-1', {
      actionRequestCount: 1,
      actionNames: ['confirm_writing_plan'],
      confirmPlanArgsByIndex: {
        0: { plan: '初稿计划', targetFiles: [chapter] },
      },
    }, [{
      type: 'edited',
      editedArgs: { plan: '修改后计划', target_files: [chapter] },
    }])

    assert.equal(registry.getPlanText('thread-1'), '修改后计划')
    assert.equal(registry.getAuthorizedFiles('thread-1').has(chapter), true)
    assert.equal(
      registry.getActiveSession('thread-1', chapter).baselineSnapshot,
      'EDITOR BASELINE',
    )
  })
})
