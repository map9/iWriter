import { type Editor } from '@tiptap/vue-3'
import { getTableState } from '@/components/common/tiptap'
import type { ParagraphState } from '@/types'

export function getHeading(editor: Editor | undefined) : string {
  return editor?.isActive('heading') ? editor?.getAttributes('heading').level : 'paragraph';
}

export function setHeading(editor: Editor | undefined, heading: string) {
  if (!editor) return
  
  if (heading === 'paragraph') {
    editor.chain().focus().setParagraph().run()
  } else {
    const level = parseInt(heading) as 1 | 2 | 3 | 4 | 5 | 6
    editor.chain().focus().setHeading({ level }).run()
  }
}

export function getContentState(editor: Editor | undefined) : ParagraphState {
  let type = 'unknown'
  
  if (!editor) {
    return { type } 
  }

  if (editor?.isActive('heading'))
    type = editor?.getAttributes('heading').level
  else if (editor?.isActive('blockquote'))
    type = 'blockquote'
  else if (editor?.isActive('bulletList')) {
    return {
      type: 'bulletList',
      data: {
        canSink: editor?.can().sinkListItem('listItem'),
        canLift: editor?.can().liftListItem('listItem')
      }
    }
  }
  else if (editor?.isActive('orderedList')) {
    return {
      type: 'orderedList',
      data: {
        canSink: editor?.can().sinkListItem('listItem'),
        canLift: editor?.can().liftListItem('listItem')
      }
    }
  }
  else if (editor?.isActive('taskList')) {
    return {
      type: 'taskList',
      data: {
        canSink: editor?.can().sinkListItem('taskItem'),
        canLift: editor?.can().liftListItem('taskItem'),
        checked: editor.getAttributes('taskItem').checked || false
      }
    }
  }
  else if (editor?.isActive('image'))
    type = 'image'
  else if (editor?.isActive('table')) {
    return {
      type: 'table',
      data: getTableState(editor)
    }
  }
  else if (editor?.isActive('codeBlock'))
    type = 'codeBlock'
  else if (editor?.isActive('blockMath'))
    type = 'mathBlock'
  else if (editor?.isActive('paragraph')) // all list are paragraph
    type = 'paragraph'
  else if (editor?.isActive('horizontalRule'))
    type = 'horizontalRule'
  else
    console.info('Unknown content type')

  return {
    type,
  }
}

export function getCurrentAlignment(editor: Editor | undefined) : string {
  if (!editor) return 'left'
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  if (editor.isActive({ textAlign: 'justify' })) return 'justify'
  return 'left'
}
