import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/scaffold/approval/FilesystemApprovalPolicy.ts'],
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

describe('filesystem approval policy', () => {
  it('sends an explicit external absolute path to HITL review', async () => {
    const { decideFilesystemWriteApproval } = await loadModule()

    const decision = decideFilesystemWriteApproval({
      toolName: 'write_file',
      args: { file_path: '/Users/author/Downloads/reference-notes.md' },
    })

    assert.deepEqual(decision, {
      kind: 'requires-review',
      reason: 'Absolute file operation requires user review.',
    })
  })

  it('requires review for native delete even inside an internal virtual directory', async () => {
    const { decideFilesystemWriteApproval } = await loadModule()

    const decision = decideFilesystemWriteApproval({
      toolName: 'delete',
      args: { file_path: '/conversation_history/session-1.md' },
    })

    assert.deepEqual(decision, {
      kind: 'requires-review',
      reason: 'Delete operation requires user review.',
    })
  })

  it('rejects deleting virtual, workspace, AI, or filesystem roots', async () => {
    const { decideFilesystemWriteApproval } = await loadModule()
    const workspaceRoot = path.resolve('/Users/author/Book')
    const aiRoot = path.resolve('/Users/author/.iwriter/ai')

    for (const target of [
      '/',
      '/conversation_history/',
      '/conversation_history/.',
      '/large_tool_results/',
      '/large_tool_results//',
      workspaceRoot,
      aiRoot,
      path.dirname(workspaceRoot),
    ]) {
      const decision = decideFilesystemWriteApproval({
        toolName: 'delete',
        args: { file_path: target },
        protectedRoots: [workspaceRoot, aiRoot],
      })

      assert.equal(decision.kind, 'auto-reject', target)
      assert.match(decision.decision.message, /protected root/i, target)
    }
  })

  it('rejects canonical aliases and platform case variants of a protected root', async () => {
    const { decideFilesystemWriteApproval } = await loadModule()
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'iwriter-delete-policy-'))
    const workspaceRoot = path.join(tempRoot, 'Workspace')
    const workspaceAlias = path.join(tempRoot, 'workspace-alias')
    try {
      await mkdir(workspaceRoot)
      await symlink(workspaceRoot, workspaceAlias, 'dir')

      const aliasDecision = decideFilesystemWriteApproval({
        toolName: 'delete',
        args: { file_path: workspaceAlias },
        protectedRoots: [workspaceRoot],
      })
      assert.equal(aliasDecision.kind, 'auto-reject')

      if (process.platform === 'darwin' || process.platform === 'win32') {
        const caseDecision = decideFilesystemWriteApproval({
          toolName: 'delete',
          args: { file_path: workspaceRoot.toLocaleLowerCase('en-US') },
          protectedRoots: [workspaceRoot],
        })
        assert.equal(caseDecision.kind, 'auto-reject')
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not recognize the retired delete_file name as a filesystem mutation', async () => {
    const { decideFilesystemWriteApproval, isFilesystemWriteToolName } = await loadModule()

    const decision = decideFilesystemWriteApproval({
      toolName: 'delete_file',
      args: { file_path: '/Users/author/Book/obsolete.md' },
    })

    assert.equal(isFilesystemWriteToolName('delete_file'), false)
    assert.deepEqual(decision, {
      kind: 'requires-review',
      reason: 'Not a filesystem write tool.',
    })
  })

  it('projects native delete as an always-recursive high-risk review item', async () => {
    const result = await build({
      entryPoints: ['electron/ai/ipc/FilesystemReviewAdapter.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
    })
    const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

    const review = module.buildFilesystemReviewItemFromAction({
      name: 'delete',
      args: { file_path: '/Users/author/Book/drafts' },
    }, 'tool-call-1')

    assert.equal(review.toolName, 'delete')
    assert.equal(review.targetPath, '/Users/author/Book/drafts')
    assert.equal(review.recursive, true)
    assert.equal(review.toolCallId, 'tool-call-1')
  })
})
