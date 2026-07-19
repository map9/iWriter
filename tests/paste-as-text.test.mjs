import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import { resolve } from 'node:path'

let modulePromise

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    codeBlock: {
      content: 'text*',
      group: 'block',
      code: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: () => ['pre', ['code', 0]],
    },
    text: { group: 'inline' },
  },
})

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/components/pages/markdown-editor/clipboard-operations.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [
          {
            name: 'mock-notifications',
            setup(build) {
              build.onResolve({ filter: /^@\/utils\/notifications$/ }, () => ({
                path: 'notifications',
                namespace: 'paste-as-text-test',
              }))
              build.onLoad({ filter: /.*/, namespace: 'paste-as-text-test' }, () => ({
                contents: 'export const notify = { error() {} }',
                loader: 'js',
              }))
            },
          },
          {
            name: 'resolve-source-aliases',
            setup(build) {
              build.onResolve({ filter: /^@\// }, (args) => ({
                path: resolve('src', `${args.path.slice(2)}.ts`),
              }))
            },
          },
        ],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return modulePromise
}

async function withPasteEditor(content, selection, callback) {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>')
  const globalKeys = ['window', 'document', 'navigator', 'ClipboardEvent']
  const previousGlobals = Object.fromEntries(
    globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  const setGlobal = (key, value) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  let view

  try {
    dom.window.electronAPI = {
      readClipboardText: async () => 'one\ntwo',
    }
    setGlobal('window', dom.window)
    setGlobal('document', dom.window.document)
    setGlobal('navigator', dom.window.navigator)
    setGlobal('ClipboardEvent', class ClipboardEvent extends dom.window.Event {})

    const doc = schema.nodeFromJSON(content)
    view = new EditorView(dom.window.document.querySelector('#editor'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, selection),
      }),
    })
    const nativePasteText = view.pasteText.bind(view)
    let pasteTextCallCount = 0
    view.pasteText = (text, event) => {
      pasteTextCallCount += 1
      return nativePasteText(text, event)
    }

    return await callback({
      editor: {
        get state() {
          return view.state
        },
        view,
      },
      getDocument: () => view.state.doc.toJSON(),
      getPasteTextCallCount: () => pasteTextCallCount,
    })
  } finally {
    view?.destroy()
    dom.window.close()
    for (const key of globalKeys) {
      if (previousGlobals[key]) {
        Object.defineProperty(globalThis, key, previousGlobals[key])
      } else {
        delete globalThis[key]
      }
    }
  }
}

async function pasteTextAndReadDocument(content, selection) {
  const { pasteAsText } = await loadModule()

  return withPasteEditor(content, selection, async ({ editor, getDocument, getPasteTextCallCount }) => ({
    result: await pasteAsText(editor),
    document: getDocument(),
    pasteTextCallCount: getPasteTextCallCount(),
  }))
}

test('Paste as Text uses the native parser inside a code block', async () => {
  const result = await pasteTextAndReadDocument({
    type: 'doc',
    content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'code' }] }],
  }, 3)

  assert.equal(result.result, true)
  assert.equal(result.pasteTextCallCount, 1)
  assert.deepEqual(result.document, {
    type: 'doc',
    content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'coone\ntwode' }] }],
  })
})

test('Paste as Text uses the native parser to split normal paragraphs', async () => {
  const result = await pasteTextAndReadDocument({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'code' }] }],
  }, 3)

  assert.equal(result.result, true)
  assert.equal(result.pasteTextCallCount, 1)
  assert.deepEqual(result.document, {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'coone' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'twode' }] },
    ],
  })
})

test('Paste as Text keeps split paragraphs inside a quote block', async () => {
  const result = await pasteTextAndReadDocument({
    type: 'doc',
    content: [{
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'code' }] }],
    }],
  }, 4)

  assert.equal(result.result, true)
  assert.equal(result.pasteTextCallCount, 1)
  assert.deepEqual(result.document, {
    type: 'doc',
    content: [{
      type: 'blockquote',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'coone' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'twode' }] },
      ],
    }],
  })
})
