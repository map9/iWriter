import type { Editor } from '@tiptap/vue-3'

// Update current heading based on editor state
export function getHeading(editor: Editor | null) : string {
  return editor?.isActive('heading') ? editor?.getAttributes('heading').level : 'paragraph';
}

export function setHeading(editor: Editor | null, heading: string) {
  if (!editor) return
  
  if (heading === 'paragraph') {
    editor.chain().focus().setParagraph().run()
  } else {
    const level = parseInt(heading) as 1 | 2 | 3 | 4 | 5 | 6
    editor.chain().focus().setHeading({ level }).run()
  }
}

export function insertTable(editor: Editor | null) {
  editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

export function insertMathBlock(editor: Editor | null) {
  const latex = prompt('Enter LaTeX expression:')
  if (latex) {
    editor?.chain().focus().setBlockMath({ latex }).run()
  }
}

export function insertInlineMath(editor: Editor | null) {
  const latex = prompt('Enter inline math expression:', '')
  if (latex) {
    editor?.chain().focus().setInlineMath({ latex }).run()
  }
}

export function insertImage(editor: Editor | null) {
  const url = prompt('Enter image URL:')
  if (url) {
    editor?.chain().focus().setImage({ src: url }).run()
  }
}

export function insertAudio(editor: Editor | null) {
  const url = prompt('Enter audio URL:')
  if (url) {
    const audioHtml = `<audio controls><source src="${url}" type="audio/mpeg">Your browser does not support the audio element.</audio>`
    editor?.chain().focus().insertContent(audioHtml).run()
  }
}

export function insertVideo(editor: Editor | null) {
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

export function insertLink(editor: Editor | null) {
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

export function insertReferenceLink(editor: Editor | null) {
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

export function insertFootnote(editor: Editor | null) {
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

export function insertInlineLink(editor: Editor | null) {
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
