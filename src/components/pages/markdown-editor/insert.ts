import { type Editor } from '@tiptap/vue-3'
import { find } from 'linkifyjs'
import { iwPopupTool } from '@/components/common/tiptap/iw-popup-tools'
import path from 'path-browserify'
import { IMAGE_EXTENSIONS } from '@/types/file-extension'
import { notify } from '@/utils/notifications'

function isValidUrl(text: string): boolean {
  if (!text?.trim()) return false
  
  // 使用linkifyjs检测URL
  const links = find(text.trim())
  
  // 检查是否整个文本都是一个链接
  return links.length === 1 && links[0]!.value === text.trim()
}

export function toggleLink(editor: Editor | undefined) {
  if (!editor || !editor.isEditable) return
  if (editor?.isActive('link')) {
    editor?.chain().focus().unsetLink().run()
  } else {
    // 找到iwPopupTools扩展
    const iwPopupToolsExt = editor.extensionManager.extensions.find(ext => ext.name === 'iwPopupTools')
    if (iwPopupToolsExt && iwPopupToolsExt.options.tools) {
      // 找到iwLinkPopupTool实例
      const linkTool = iwPopupToolsExt.options.tools.find((tool: iwPopupTool) => tool.options.type === 'link')
      if (linkTool) linkTool.editMode = true
    }
    
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
      const markRange = editor.state.selection.$from.marks().find(mark => mark.type.name === 'link')
      if (markRange) {
        // 扩展到整个link范围
        editor.chain().focus().extendMarkRange('link').setLink({ href: '' }).run()
      } else {
        editor.chain().focus().setLink({ href: '' }).run()
      }
    }
  }
}

function isValidLatex(text: string): boolean {
  if (!text?.trim()) return false
  
  // Check if text looks like LaTeX (contains backslashes or common math symbols)
  return /\\|[\{\}\^\\_]|\$\$?|\\[a-zA-Z]+/.test(text.trim())
}

export function toggleMath(editor: Editor | undefined) {
  if (!editor || !editor.isEditable) return
  
  if (editor?.isActive('inlineMath')) {
    // 如果当前在 inlineMath node 内，删除该 node
    editor?.chain().focus().deleteNode('inlineMath').run()
  } else {
    // 找到iwPopupTools扩展
    const iwPopupToolsExt = editor.extensionManager.extensions.find(ext => ext.name === 'iwPopupTools')
    if (iwPopupToolsExt && iwPopupToolsExt.options.tools) {
      // 找到iwMathPopupTool实例
      const mathTool = iwPopupToolsExt.options.tools.find((tool: iwPopupTool) => tool.options.type === 'inlineMath')
      if (mathTool) mathTool.editMode = true
    }
    
    if (!editor.state.selection.empty) {
      const selectedText = editor.state.doc.textBetween(
        editor.state.selection.from, 
        editor.state.selection.to
      )
      
      if (isValidLatex(selectedText)) {
        editor.chain().focus().deleteSelection().insertInlineMath({ latex: selectedText }).setNodeSelection(editor.state.selection.from).run()
        return
      }
    }
    
    editor.chain().focus().insertInlineMath({ latex: '\\LaTeX' }).setNodeSelection(editor.state.selection.from).run()
  }
}

export function insertMathBlock(editor: Editor | undefined) {
  if (!editor || !editor.isEditable) return

  const hasSelection = !editor.state.selection.empty
  if (hasSelection) {
    // If there's a selection, wrap it in block math
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from, 
      editor.state.selection.to
    )
    
    editor.chain().focus().deleteSelection().run()

    // Clean up the text for inline math (remove newlines, extra spaces)
    //const latex = selectedText.replace(/\s+/g, ' ').trim()
    if (isValidLatex(selectedText)) {
      editor.chain().focus().insertBlockMath({ latex: selectedText }).run()
      return
    }
  }

  // Insert a empty block math node
  editor.chain().focus().insertBlockMath({ latex: 'Please\\ input\\ \\LaTeX\\ expression...' }).run()
}

export function insertTable(editor: Editor | undefined) {
  if (!editor?.isEditable) return
  editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

export async function insertLocalMedia(editor: Editor | undefined) {
    if (!editor?.isEditable) return
    try {
    // 打开文件选择对话框
    if (window.electronAPI?.showOpenDialog) {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Image Files', extensions: [...IMAGE_EXTENSIONS] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (!result.canceled && result.filePaths.length > 0 && result.filePaths[0]) {
        const selectedPath = result.filePaths[0]

        // 更新图片的src属性（替换而不是添加）
        editor?.chain().focus().setImage({
          src: `file://${selectedPath}`,
          alt: path.basename(selectedPath),
          title: selectedPath
        }).run()

      }
    } else {
      throw new Error('This feature is only available in desktop app')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'File Selection Error')
  }
}

export function insertImage(editor: Editor | undefined) {
  if (!editor?.isEditable) return
  editor?.chain().focus().setImage({ 
    src: "", 
    alt: '',
    title: '',
  }).run()
}

export function insertAudio(editor: Editor | undefined) {
  if (!editor?.isEditable) return
  const url = prompt('Enter audio URL:')
  if (url) {
    const audioHtml = `<audio controls><source src="${url}" type="audio/mpeg">Your browser does not support the audio element.</audio>`
    editor?.chain().focus().insertContent(audioHtml).run()
  }
}

export function insertVideo(editor: Editor | undefined) {
  if (!editor?.isEditable) return
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
  if (!editor?.isEditable) return
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
  if (!editor?.isEditable) return
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
  if (!editor?.isEditable) return false
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
  if (!editor?.isEditable) return false
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
