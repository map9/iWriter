import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let pathUtilsModulePromise
let runtimePathUtilsModulePromise

async function loadPathUtilsModule() {
  if (!pathUtilsModulePromise) {
    pathUtilsModulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/utils/pathUtils.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return pathUtilsModulePromise
}

async function loadRuntimePathUtilsModule() {
  if (!runtimePathUtilsModulePromise) {
    runtimePathUtilsModulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/runtime/PathUtils.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return runtimePathUtilsModulePromise
}

describe('pathUtils cross-platform parsing', () => {
  it('extracts base names from Windows paths', async () => {
    const { pathUtils } = await loadPathUtilsModule()

    assert.equal(pathUtils.basename('C:\\Users\\ctfo\\Documents'), 'Documents')
    assert.equal(pathUtils.basename('C:\\Users\\ctfo\\Documents\\'), 'Documents')
    assert.equal(pathUtils.basename('C:\\Users\\ctfo\\Documents\\note.md', '.md'), 'note')
  })

  it('keeps Windows drive roots when resolving parent directories', async () => {
    const { pathUtils } = await loadPathUtilsModule()

    assert.equal(pathUtils.dirname('C:\\Users\\ctfo\\Documents\\note.md'), 'C:/Users/ctfo/Documents')
    assert.equal(pathUtils.dirname('C:\\note.md'), 'C:/')
    assert.equal(pathUtils.parentDir('C:\\note.md'), 'C:/')
    assert.equal(pathUtils.normalize('C:'), 'C:')
    assert.equal(pathUtils.isAbsolutePath('C:'), false)
  })

  it('preserves UNC roots when normalizing and joining paths', async () => {
    const { pathUtils } = await loadPathUtilsModule()

    assert.equal(pathUtils.normalize('\\\\server\\share\\Documents'), '//server/share/Documents')
    assert.equal(pathUtils.join('\\\\server\\share', 'Documents', 'note.md'), '//server/share/Documents/note.md')
    assert.equal(pathUtils.dirname('\\\\server\\share\\Documents\\note.md'), '//server/share/Documents')
  })
})

describe('renderer path display code', () => {
  it('does not derive file or folder names by splitting only on POSIX separators', async () => {
    const files = [
      'src/components/sidebar/ExplorerPanel.vue',
      'src/ai/components/agent-panel/composables/useContextFiles.ts',
      'src/ai/components/agent-panel/input/AgentContextChips.vue',
    ]

    for (const file of files) {
      const source = await readFile(file, 'utf-8')
      assert.equal(
        /\.split\((['"])\/\1\)\.pop\(\)/.test(source),
        false,
        `${file} should use pathUtils.basename() for cross-platform file names`
      )
    }
  })
})

describe('main-process path containment', () => {
  it('does not confuse a sibling with a shared path prefix for a child', async () => {
    const { isPathInside } = await loadRuntimePathUtilsModule()

    assert.equal(isPathInside('/project/book', '/project/book-notes/chapter.md'), false)
  })
})
