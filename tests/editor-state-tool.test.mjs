import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            import { Editor } from '@tiptap/core'
            import Document from '@tiptap/extension-document'
            import Heading from '@tiptap/extension-heading'
            import Paragraph from '@tiptap/extension-paragraph'
            import Text from '@tiptap/extension-text'
            import UniqueID from '@tiptap/extension-unique-id'
            import { BulletList, ListItem } from '@tiptap/extension-list'

            export { buildEditorStateTool } from './electron/ai/tools/common/EditorStateTools.ts'
            export { buildEditorStateSnapshot } from './src/ai/document/EditorStateSerializer.ts'

            export function createEditorStateFixture() {
              return new Editor({
                element: document.createElement('div'),
                extensions: [
                  Document,
                  Heading,
                  Paragraph,
                  Text,
                  BulletList,
                  ListItem,
                  UniqueID.configure({
                    types: ['heading', 'paragraph', 'listItem'],
                    generateID: () => 'generated-id',
                  }),
                ],
                content: {
                  type: 'doc',
                  content: [
                    {
                      type: 'heading',
                      attrs: { level: 1, id: 'heading' },
                      content: [{ type: 'text', text: 'Title' }],
                    },
                    {
                      type: 'paragraph',
                      attrs: { id: 'paragraph' },
                      content: [{ type: 'text', text: 'Alpha bravo charlie' }],
                    },
                    {
                      type: 'bulletList',
                      content: [
                        {
                          type: 'listItem',
                          attrs: { id: 'item-one' },
                          content: [
                            {
                              type: 'paragraph',
                              attrs: { id: 'inside-one' },
                              content: [{ type: 'text', text: 'One' }],
                            },
                          ],
                        },
                        {
                          type: 'listItem',
                          attrs: { id: 'item-two' },
                          content: [
                            {
                              type: 'paragraph',
                              attrs: { id: 'inside-two' },
                              content: [{ type: 'text', text: 'Two' }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              })
            }
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

async function withDom(callback) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  try {
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    return await callback()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
    dom.window.close()
  }
}

describe('get_editor_state', () => {
  it('returns the renderer state snapshot without exposing workspace configuration', async () => {
    const expected = {
      activeDocument: {
        ref: '/project/chapter.md',
        fileType: 'markdown-editor',
        cursor: {
          blockId: 3,
          containerBlockId: null,
          sectionHeadingBlockId: 2,
          sectionHeading: 'Scene',
        },
        selection: { blockIds: [3], selectedText: 'Selected text' },
      },
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

  it('requests other tabs only when the caller opts in', async () => {
    let receivedOptions
    const broker = {
      requestEditorState: async options => {
        receivedOptions = options
        return { activeDocument: null, openTabs: [] }
      },
    }
    const { buildEditorStateTool } = await loadModule()

    await buildEditorStateTool(broker).invoke({ include_open_tabs: true })

    assert.deepEqual(receivedOptions, { includeOpenTabs: true })
  })

  it('omits other tabs unless explicitly requested', async () => {
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
        ref: 'untitled:draft',
        fileType: 'markdown-editor',
        displayName: 'Untitled',
        cursor: null,
        selection: null,
      },
    })
  })

  it('returns compact references for other tabs when requested', async () => {
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

    const state = buildEditorStateSnapshot(tabs, tabs[1], { includeOpenTabs: true })

    assert.deepEqual(state, {
      activeDocument: {
        ref: 'untitled:draft',
        fileType: 'markdown-editor',
        displayName: 'Untitled',
        cursor: null,
        selection: null,
      },
      openTabs: [
        {
          ref: '/project/chapter.md',
          fileType: 'markdown-editor',
        },
      ],
    })
  })

  it('returns the exact selected text instead of whole-block markdown', async () => {
    await withDom(async () => {
      const { buildEditorStateSnapshot, createEditorStateFixture } = await loadModule()
      const editor = createEditorStateFixture()
      editor.commands.setTextSelection({ from: 14, to: 19 })

      const state = buildEditorStateSnapshot([
        {
          id: 'saved',
          name: 'chapter.md',
          path: '/project/chapter.md',
          documentType: 'markdown-editor',
          isDirty: true,
          docState: { editorInstance: editor },
        },
      ], {
        id: 'saved',
        name: 'chapter.md',
        path: '/project/chapter.md',
        documentType: 'markdown-editor',
        isDirty: true,
        docState: { editorInstance: editor },
      })

      assert.deepEqual(state.activeDocument, {
        ref: '/project/chapter.md',
        fileType: 'markdown-editor',
        cursor: {
          blockId: 2,
          containerBlockId: null,
          sectionHeadingBlockId: 1,
          sectionHeading: 'Title',
        },
        selection: {
          blockIds: [2],
          selectedText: 'bravo',
        },
      })
      editor.destroy()
    })
  })

  it('distinguishes the current list item from its list container', async () => {
    await withDom(async () => {
      const { buildEditorStateSnapshot, createEditorStateFixture } = await loadModule()
      const editor = createEditorStateFixture()
      editor.commands.setTextSelection(39)
      const tab = {
        id: 'saved',
        name: 'chapter.md',
        path: '/project/chapter.md',
        documentType: 'markdown-editor',
        isDirty: false,
        docState: { editorInstance: editor },
      }

      const state = buildEditorStateSnapshot([tab], tab)

      assert.deepEqual(state.activeDocument?.cursor, {
        blockId: 5,
        containerBlockId: 3,
        sectionHeadingBlockId: 1,
        sectionHeading: 'Title',
      })
      editor.destroy()
    })
  })
})
