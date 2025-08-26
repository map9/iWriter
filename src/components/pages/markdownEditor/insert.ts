import { type Editor } from '@tiptap/vue-3'
import { find } from 'linkifyjs'

export function toggleMath(editor: Editor | undefined) {
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

function isValidUrl(text: string): boolean {
  if (!text?.trim()) return false
  
  // 使用linkifyjs检测URL
  const links = find(text.trim())
  
  // 检查是否整个文本都是一个链接
  return links.length === 1 && links[0].value === text.trim()
}

export function toggleLink(editor: Editor | undefined) {
  if (!editor) return
  if (editor?.isActive('iwLink')) {
    editor?.chain().focus().unsetLink().run()
  } else {
    if (!editor.state.selection.empty) {
      const selectedText = editor.state.doc.textBetween(
        editor.state.selection.from, 
        editor.state.selection.to
      )
      
      if (isValidUrl(selectedText)) {
        editor.chain().focus().setLink({ href: selectedText }).run()
      } else {
        editor.chain().focus().setLink({ href: '' }).run()
      }
    } else {
      editor?.chain().focus().extendMarkRange('iwLink').setLink({ href: '' }).run()
    }
  }
}

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