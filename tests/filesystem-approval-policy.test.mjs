import assert from 'node:assert/strict'
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
})
