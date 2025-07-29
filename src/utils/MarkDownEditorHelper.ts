import { type Editor as coreEditor } from '@tiptap/core'
import { type Editor as vueEditor } from '@tiptap/vue-3'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'

// Update current heading based on editor state
export function getHeading(editor: vueEditor | undefined) : string {
  return editor?.isActive('heading') ? editor?.getAttributes('heading').level : 'paragraph';
}

export function setHeading(editor: vueEditor | undefined, heading: string) {
  if (!editor) return
  
  if (heading === 'paragraph') {
    editor.chain().focus().setParagraph().run()
  } else {
    const level = parseInt(heading) as 1 | 2 | 3 | 4 | 5 | 6
    editor.chain().focus().setHeading({ level }).run()
  }
}

export function insertTable(editor: vueEditor | undefined) {
  editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

export function insertMathBlock(editor: vueEditor | undefined) {
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

export function insertInlineMath(editor: vueEditor | undefined) {
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

export function insertImage(editor: vueEditor | undefined) {
  editor?.chain().focus().setImage({ 
    src: "https://placehold.co/800x400", 
    alt: '',
    title: '800x400',
  }).run()
}

export function insertAudio(editor: vueEditor | undefined) {
  const url = prompt('Enter audio URL:')
  if (url) {
    const audioHtml = `<audio controls><source src="${url}" type="audio/mpeg">Your browser does not support the audio element.</audio>`
    editor?.chain().focus().insertContent(audioHtml).run()
  }
}

export function insertVideo(editor: vueEditor | undefined) {
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

export function insertLink(editor: vueEditor | undefined) {
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

export function insertReferenceLink(editor: vueEditor | undefined) {
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

export function insertFootnote(editor: vueEditor | undefined) {
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

export function insertInlineLink(editor: vueEditor | undefined) {
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

export function onFileHandlerDrop(editor: coreEditor, files: File[], pos: number): void {
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

export function onFileHandlerPaste(editor: coreEditor, files: File[], pasteContent?: string): void {
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

export function onPlaceholder(option: { editor: coreEditor; node: ProsemirrorNode; pos: number; hasAnchor: boolean }): string {
  const { editor, node, pos, hasAnchor } = option
  // Use a placeholder:
  //placeholder: 'Input text here …',
  // Use different placeholders depending on the node type:
  if (node.type.name === 'heading') {
    return `Heading ${node.attrs.level}`
  }

  return 'Input text here...'
}