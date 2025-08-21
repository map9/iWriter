import { type Editor } from '@tiptap/vue-3'

export function insertMathBlock(editor: Editor | undefined) {
  if (!editor) return

  const hasSelection = !editor.state.selection.empty
  if (hasSelection) {
    // If there's a selection, wrap it in block math
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from, 
      editor.state.selection.to
    )
    
    editor.chain().focus().deleteSelection().run()

    // Clean up the text for inline math (remove newlines, extra spaces)
    const latex = selectedText.replace(/\s+/g, ' ').trim()

    // If selection looks like LaTeX (contains backslashes or common math symbols), use it directly
    const isLikelyLatex = /\\|[\{\}\^\\_]|\$\$?|\\[a-zA-Z]+/.test(selectedText)
    if (isLikelyLatex) {
      return editor.chain().focus().insertBlockMath({ latex: selectedText }).run()
    }
  }

  // Insert a empty block math node
  return editor.chain().focus().insertBlockMath({ latex: 'Pealse input Latex...' }).run()
}

export function insertInlineMath(editor: Editor | undefined) {
  if (!editor) return

    const hasSelection = !editor.state.selection.empty
  if (hasSelection) {
    // If there's a selection, wrap it in block math
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from, 
      editor.state.selection.to
    )
    
    editor.chain().focus().deleteSelection().run()

    // If selection looks like LaTeX (contains backslashes or common math symbols), use it directly
    const isLikelyLatex = /\\|[\{\}\^\\_]|\$\$?|\\[a-zA-Z]+/.test(selectedText)
    if (isLikelyLatex) {
      return editor.chain().focus().insertInlineMath({ latex: selectedText }).run()
    }
  }

  // Insert a empty block math node
  return editor.chain().focus().insertInlineMath({ latex: 'Pealse input Latex...' }).run()
}

export function insertTable(editor: Editor | undefined) {
  editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

export function insertImage(editor: Editor | undefined) {
  editor?.chain().focus().setImage({ 
    src: "", 
    alt: '',
    title: '',
  }).run()
}

export function insertAudio(editor: Editor | undefined) {
  const url = prompt('Enter audio URL:')
  if (url) {
    const audioHtml = `<audio controls><source src="${url}" type="audio/mpeg">Your browser does not support the audio element.</audio>`
    editor?.chain().focus().insertContent(audioHtml).run()
  }
}

export function insertVideo(editor: Editor | undefined) {
  const url = prompt('Enter YouTube video URL:')
  if (url) {
    // Extract video ID from YouTube URL
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)
    if (match) {
      editor?.chain().focus().setYoutubeVideo({
        src: url,
        width: 640,
        height: 480,
      }).run()
    } else {
      alert('Please enter a valid YouTube URL')
    }
  }
}

export function insertLink(editor: Editor | undefined) {
  const url = prompt('Enter URL:')
  if (url) {
    const linkText = prompt('Enter link text (optional):') || url
    
    // If there's selected text, just set the link
    if (editor?.state.selection.empty === false) {
      editor?.chain().focus().setLink({ href: url }).run()
    } else {
      // If no selection, insert link with text
      editor?.chain().focus().insertContent(`<a href="${url}">${linkText}</a>`).run()
    }
  }
}

export function insertReferenceLink(editor: Editor | undefined) {
  const refLinkText = prompt('Enter link text:', '')
  const refLinkUrl = prompt('Enter link URL:', '')
  if (refLinkText && refLinkUrl && editor) {
    const refId = `ref${Date.now()}`
    editor.chain().focus().insertContent(`[${refLinkText}][${refId}]`).run()
    // Move to end and add reference definition
    editor.chain().focus().command(({ tr, dispatch }) => {
      if (dispatch) {
        const endPos = tr.doc.content.size
        tr.insertText(`\n\n[${refId}]: ${refLinkUrl}`, endPos)
      }
      return true
    }).run()
  }
}

export function insertFootnote(editor: Editor | undefined) {
  const footnoteText = prompt('Enter footnote text:', '')
  if (footnoteText && editor) {
    const footnoteId = Date.now().toString()
    editor.chain().focus().insertContent(`[^${footnoteId}]`).run()
    // Move to end and add footnote definition
    editor.chain().focus().command(({ tr, dispatch }) => {
      if (dispatch) {
        const endPos = tr.doc.content.size
        tr.insertText(`\n\n[^${footnoteId}]: ${footnoteText}`, endPos)
      }
      return true
    }).run()
  }
}

export function insertInlineLink(editor: Editor | undefined) {
if (editor?.isActive('link')) {
    editor?.chain().focus().unsetLink().run()
  } else {
    const previousUrl = editor?.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    // cancelled
    if (url === null) {
      return
    }

    // empty
    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    // update link
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
}

export function toggleTaskItemChecked(editor: Editor | undefined) {
  return editor?.chain().focus().command(({ tr, state }) => {
    const { selection } = state
    const { $from } = selection

    // 查找当前选择位置的TaskItem节点
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === 'taskItem') {
        const pos = $from.start(depth) - 1
        const currentChecked = node.attrs.checked || false

        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          checked: !currentChecked
        })
        return true
      }
    }
    return false
  }).run()
}

export function setTaskItemChecked(editor: Editor | undefined, checked: boolean) {
  return editor?.chain().focus().command(({ tr, state }) => {
    const { selection } = state
    const { $from } = selection

    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === 'taskItem') {
        if (node.attrs.checked === checked)
          return true

        const pos = $from.start(depth) - 1

        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          checked: checked
        })
        return true
      }
    }
    return false
  }).run()
}