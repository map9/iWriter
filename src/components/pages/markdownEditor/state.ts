import { type Editor } from '@tiptap/vue-3'

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

export function getContentType(editor: Editor | undefined) : {contentType: string, canSink: boolean, canLift: boolean} {
  let contentType = 'paragraph'
  let [canSink, canLift] = [false, false]

  if (editor?.isActive('heading'))
    contentType = editor?.getAttributes('heading').level
  else if (editor?.isActive('paragraph'))
    contentType = 'paragraph'
  else if (editor?.isActive('blockquote'))
    contentType = 'blockquote'
  else if (editor?.isActive('bulletList')) {
    contentType = 'bulletList'
    canSink = editor?.can().sinkListItem('listItem')
    canLift = editor?.can().liftListItem('listItem')
  }
  else if (editor?.isActive('orderedList')) {
    contentType = 'orderedList'
    canSink = editor?.can().sinkListItem('listItem')
    canLift = editor?.can().liftListItem('listItem')
  }
  else if (editor?.isActive('taskList')) {
    contentType = 'taskList'
    canSink = editor?.can().sinkListItem('taskItem')
    canLift = editor?.can().liftListItem('taskItem')
  }
  else if (editor?.isActive('codeBlock'))
    contentType = 'codeBlock'
  else
    contentType = 'paragraph'

  return { contentType, canSink, canLift }
}

export function getCurrentAlignment(editor: Editor | undefined) : string {
  if (!editor) return 'left'
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  if (editor.isActive({ textAlign: 'justify' })) return 'justify'
  return 'left'
}
