import { type Editor } from '@tiptap/core'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'

export function onFileHandlerDrop(editor: Editor, files: File[], pos: number): void {
  if (!editor.isEditable) return
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

export function onFileHandlerPaste(editor: Editor, files: File[], pasteContent?: string): boolean {
  if (!editor.isEditable) return true
  // 如果剪贴板包含 HTML 内容但没有图片标签，忽略文件
  // 这通常意味着是从 Word/富文本编辑器复制的文字（Word 会额外添加文字的 PNG 截图）
  if (pasteContent && pasteContent.length > 0 && !/<img\s+[^>]*src=/i.test(pasteContent)) {
    return false
  }
  
  // 如果 HTML 包含图片标签，提取 URL
  if (pasteContent && /<img\s+[^>]*src=/i.test(pasteContent)) {
    const imgMatch = pasteContent.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (imgMatch && imgMatch[1]) {
      const imgUrl = imgMatch[1]
      // 只使用 URL，不转换为 base64
      editor.chain().insertContentAt(editor.state.selection.anchor, {
        type: 'image',
        attrs: { src: imgUrl }
      }).focus().run()
      return true  // ← 提前返回，避免 TipTap 再次插入
    }
  }
  
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
  return files.length > 0
}

export function onPlaceholder(option: { editor: Editor; node: ProsemirrorNode; pos: number; hasAnchor: boolean }): string {
  const { node } = option
  // Use a placeholder:
  //placeholder: 'Input text here …',
  // Use different placeholders depending on the node type:
  if (node.type.name === 'heading') {
    return `Heading ${node.attrs.level}`
  }

  return 'Input text here...'
}
