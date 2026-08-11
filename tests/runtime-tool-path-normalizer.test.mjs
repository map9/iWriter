import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/runtime/RuntimeToolPathNormalizer.ts'],
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

describe('normalizeRuntimeToolPaths', () => {
  it('canonicalizes model-facing workspace paths before review', async () => {
    const { normalizeRuntimeToolPaths } = await loadModule()
    const requests = [
      { name: 'edit_block', args: { file_path: 'chapters/01.md', block_id: 2 } },
      { name: 'create_document', args: { directory: 'notes', filename: 'idea.md' } },
      { name: 'confirm_writing_plan', args: { target_files: ['chapters/01.md', '/external/02.md'] } },
    ]

    const result = normalizeRuntimeToolPaths(requests, '/project/book')

    assert.deepEqual(result.actionRequests, [
      { name: 'edit_block', args: { file_path: '/project/book/chapters/01.md', block_id: 2 } },
      { name: 'create_document', args: { directory: '/project/book/notes', filename: 'idea.md' } },
      { name: 'confirm_writing_plan', args: { target_files: ['/project/book/chapters/01.md', '/external/02.md'] } },
    ])
    assert.deepEqual(result.errors, {})
  })

  it('preserves virtual paths and rejects workspace-relative escapes', async () => {
    const { normalizeRuntimeToolPaths } = await loadModule()
    const result = normalizeRuntimeToolPaths([
      { name: 'edit_block', args: { file_path: 'untitled:tab-1' } },
      { name: 'write_file', args: { file_path: '/conversation_history/notes.md' } },
      { name: 'delete_file', args: { file_path: '../outside.md' } },
    ], '/project/book')

    assert.equal(result.actionRequests[0].args.file_path, 'untitled:tab-1')
    assert.equal(result.actionRequests[1].args.file_path, '/conversation_history/notes.md')
    assert.match(result.errors[2], /escapes the current workspace/i)
  })
})
