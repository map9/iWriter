import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { buildEditorStateTool } from './electron/ai/tools/common/EditorStateTools.ts'
            export { buildEditorStateSnapshot } from './src/ai/document/EditorStateSerializer.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'editor-state-entry.ts',
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

describe('get_editor_state', () => {
  it('returns the renderer state snapshot without exposing workspace configuration', async () => {
    const expected = {
      activeDocument: {
        path: '/project/chapter.md',
        virtualId: null,
        name: 'chapter.md',
        fileType: 'markdown-editor',
        dirty: true,
        cursorBlockId: 3,
        cursorSection: { heading: 'Scene', headingBlockId: 2 },
        selection: { blockIds: [3], content: '{b:3} Selected paragraph' },
        outline: [{ blockId: 2, level: 2, text: 'Scene' }],
      },
      openTabs: [],
    }
    const broker = { requestEditorState: async () => expected }
    const { buildEditorStateTool } = await loadModule()

    const result = JSON.parse(await buildEditorStateTool(broker).invoke({}))

    assert.deepEqual(result, expected)
    assert.equal('workspacePath' in result, false)
  })

  it('returns a stable no-window error when renderer state is unavailable', async () => {
    const broker = { requestEditorState: async () => null }
    const { buildEditorStateTool } = await loadModule()

    const result = await buildEditorStateTool(broker).invoke({})

    assert.equal(result, 'Error: Editor state is currently unavailable.')
  })

  it('does not repeat active-tab identity inside the editor state snapshot', async () => {
    const tabs = [
      {
        id: 'saved',
        name: 'chapter.md',
        path: '/project/chapter.md',
        documentType: 'markdown-editor',
        isDirty: true,
      },
      {
        id: 'draft',
        name: 'Untitled',
        documentType: 'markdown-editor',
        isDirty: false,
      },
    ]
    const { buildEditorStateSnapshot } = await loadModule()

    const state = buildEditorStateSnapshot(tabs, tabs[1])

    assert.deepEqual(state, {
      activeDocument: {
        path: null,
        virtualId: 'untitled:draft',
        name: 'Untitled',
        fileType: 'markdown-editor',
        dirty: false,
        cursorBlockId: null,
        cursorSection: null,
        selection: null,
        outline: [],
      },
      openTabs: [
        {
          path: '/project/chapter.md',
          virtualId: null,
          name: 'chapter.md',
          fileType: 'markdown-editor',
          dirty: true,
        },
      ],
    })
  })
})
