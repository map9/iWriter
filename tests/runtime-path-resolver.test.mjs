import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/runtime/RuntimePathResolver.ts'],
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

function runtimeWithWorkspace(workspacePath) {
  return { context: { workspacePath } }
}

describe('resolveRuntimePath', () => {
  it('resolves workspace-relative paths to canonical absolute paths', async () => {
    const { resolveRuntimePath } = await loadModule()

    assert.deepEqual(
      resolveRuntimePath('chapters/../notes/outline.md', runtimeWithWorkspace('/project/book'), 'file_path'),
      { ok: true, path: '/project/book/notes/outline.md' },
    )
  })

  it('resolves dot to the workspace root', async () => {
    const { resolveRuntimePath } = await loadModule()

    assert.deepEqual(
      resolveRuntimePath('.', runtimeWithWorkspace('/project/book'), 'directory_path'),
      { ok: true, path: '/project/book' },
    )
  })

  it('keeps an external absolute path independent of the workspace', async () => {
    const { resolveRuntimePath } = await loadModule()

    assert.deepEqual(
      resolveRuntimePath('/external/refs/../source.md', runtimeWithWorkspace('/project/book'), 'file_path'),
      { ok: true, path: '/external/source.md' },
    )
  })

  it('rejects a relative path when no workspace is open', async () => {
    const { resolveRuntimePath } = await loadModule()

    assert.deepEqual(
      resolveRuntimePath('chapter.md', runtimeWithWorkspace(null), 'file_path'),
      {
        ok: false,
        error: 'Error: file_path is relative, but no workspace folder is open: "chapter.md".',
      },
    )
  })

  it('rejects a relative path that escapes the workspace', async () => {
    const { resolveRuntimePath } = await loadModule()

    assert.deepEqual(
      resolveRuntimePath('../outside.md', runtimeWithWorkspace('/project/book'), 'file_path'),
      {
        ok: false,
        error: 'Error: relative file_path escapes the current workspace: "../outside.md".',
      },
    )
  })
})
