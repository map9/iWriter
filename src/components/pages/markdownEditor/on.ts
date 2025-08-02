import { type Editor } from '@tiptap/core'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'

export function onFileHandlerDrop(editor: Editor, files: File[], pos: number): void {
  files.forEach(file => {
    const fileReader = new FileReader()

    fileReader.readAsDataURL(file)
    fileReader.onload = () => {
      editor
        .chain()
        .insertContentAt(pos, {
          type: 'image',
          attrs: {
            src: fileReader.result,
            alt: file.name.replace(/\.[^/.]+$/, ''),
            title: file.name,
          },
        })
        .focus()
        .run()
    }
  })
}

export function onFileHandlerPaste(editor: Editor, files: File[], pasteContent?: string): void {
  files.forEach(file => {
    const fileReader = new FileReader()

    fileReader.readAsDataURL(file)
    fileReader.onload = () => {
      editor
        .chain()
        .insertContentAt(editor.state.selection.anchor, {
          type: 'image',
          attrs: {
            src: fileReader.result,
            alt: file.name.replace(/\.[^/.]+$/, ''),
            title: file.name,
          },
        })
        .focus()
        .run()
    }
  })
}

export function onPlaceholder(option: { editor: Editor; node: ProsemirrorNode; pos: number; hasAnchor: boolean }): string {
  const { editor, node, pos, hasAnchor } = option
  // Use a placeholder:
  //placeholder: 'Input text here …',
  // Use different placeholders depending on the node type:
  if (node.type.name === 'heading') {
    return `Heading ${node.attrs.level}`
  }

  return 'Input text here...'
}