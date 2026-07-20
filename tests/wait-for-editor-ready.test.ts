import assert from 'node:assert/strict'
import test from 'node:test'
import type { Editor } from '@tiptap/core'
import { waitForEditorReady } from '../src/components/common/tiptap/utils/waitForEditorReady.ts'

function editorStub(): Editor {
  return {
    state: { doc: { content: { size: 100 } } },
    view: { dom: {} },
  } as unknown as Editor
}

test('does not treat an editor as loaded before FileTab has a saved checkpoint', async () => {
  const editor = editorStub()
  const result = await waitForEditorReady(
    () => ({ docState: { editorInstance: editor } }) as never,
    1,
  )

  assert.equal(result, null)
})

test('returns the editor after MarkdownEditorPage records its loaded checkpoint', async () => {
  const editor = editorStub()

  const result = await waitForEditorReady(
    () => ({ docState: { editorInstance: editor, savedCheckPoint: 0 } }) as never,
    1,
  )

  assert.equal(result, editor)
})
