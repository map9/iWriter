import { type Editor } from '@tiptap/vue-3'
import { 
  insertImage, 
  insertAudio, 
  insertVideo, 
  insertLink, 
  insertInlineLink,
  insertMathBlock, 
  insertInlineMath,
  insertReferenceLink,
  insertFootnote,
  toggleTaskItemChecked,
  setTaskItemChecked,
} from './insert'
import {
  moveRowAbove,
  moveRowBelow,
  moveColumnLeft,
  moveColumnRight,
  copyTable,
  deleteTable,
} from '@/components/common/utils/TableOperations'

// Handle menu actions
export async function doMenuAction(editor: Editor | undefined, action: string): Promise<boolean> {
  if (!editor) return false
  
  switch (action) {
    case 'undo':
      editor.chain().focus().undo().run()
      return true
    case 'redo':
      editor.chain().focus().redo().run()
      return true

    case 'toggle-invisible-characters':
      editor.commands.toggleInvisibleCharacters()
      return true
      
    case 'heading-1':
      editor.chain().focus().setHeading({ level: 1 }).run()
      return true
    case 'heading-2':
      editor.chain().focus().setHeading({ level: 2 }).run()
      return true
    case 'heading-3':
      editor.chain().focus().setHeading({ level: 3 }).run()
      return true
    case 'heading-4':
      editor.chain().focus().setHeading({ level: 4 }).run()
      return true
    case 'heading-5':
      editor.chain().focus().setHeading({ level: 5 }).run()
      return true
    case 'heading-6':
      editor.chain().focus().setHeading({ level: 6 }).run()
      return true
    case 'paragraph':
      editor.chain().focus().setParagraph().run()
      return true

    // Promote and Demote Heading
    case 'promote-heading':
      if (editor.isActive('heading', { level: 6 })) {
        editor.chain().focus().setHeading({ level: 5 }).run()
      } else if (editor.isActive('heading', { level: 5 })) {
        editor.chain().focus().setHeading({ level: 4 }).run()
      } else if (editor.isActive('heading', { level: 4 })) {
        editor.chain().focus().setHeading({ level: 3 }).run()
      } else if (editor.isActive('heading', { level: 3 })) {
        editor.chain().focus().setHeading({ level: 2 }).run()
      } else if (editor.isActive('heading', { level: 2 })) {
        editor.chain().focus().setHeading({ level: 1 }).run()
      } else if (editor.isActive('paragraph')) {
        editor.chain().focus().setHeading({ level: 6 }).run()
      }
      return true
    case 'demote-heading':
      if (editor.isActive('heading', { level: 1 })) {
        editor.chain().focus().setHeading({ level: 2 }).run()
      } else if (editor.isActive('heading', { level: 2 })) {
        editor.chain().focus().setHeading({ level: 3 }).run()
      } else if (editor.isActive('heading', { level: 3 })) {
        editor.chain().focus().setHeading({ level: 4 }).run()
      } else if (editor.isActive('heading', { level: 4 })) {
        editor.chain().focus().setHeading({ level: 5 }).run()
      } else if (editor.isActive('heading', { level: 5 })) {
        editor.chain().focus().setHeading({ level: 6 }).run()
      } else if (editor.isActive('heading', { level: 6 })) {
        editor.chain().focus().setParagraph().run()
      }
      return true
    
    // Table operations  
    case 'insert-table':
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      return true
    case 'table-toggle-header-row':
      editor.chain().focus().toggleHeaderRow().run()
      return true
    case 'table-toggle-header-column':
      editor.chain().focus().toggleHeaderColumn().run()
      return true
    case 'table-insert-row-above':
      editor.chain().focus().addRowBefore().run()
      return true
    case 'table-insert-row-below':
      editor.chain().focus().addRowAfter().run()
      return true
    case 'table-insert-column-left':
      editor.chain().focus().addColumnBefore().run()
      return true
    case 'table-insert-column-right':
      editor.chain().focus().addColumnAfter().run()
      return true
    case 'table-move-row-above':
      moveRowAbove(editor)
      return true
    case 'table-move-row-below':
      moveRowBelow(editor)
      return true
    case 'table-move-column-left':
      moveColumnLeft(editor)
      return true
    case 'table-move-column-right':
      moveColumnRight(editor)
      return true
    case 'table-delete-row':
      editor.chain().focus().deleteRow().run()
      return true
    case 'table-delete-column':
      editor.chain().focus().deleteColumn().run()
      return true
    case 'table-duplicate':
      return await copyTable(editor)
    case 'table-delete':
      return deleteTable(editor)
    
    case 'insert-media':
      return true

    case 'insert-code-block':
      editor.chain().focus().toggleCodeBlock().run()
      return true

    case 'toggle-caption':
      //editor.chain().focus().setCaptionPosition('auto').run()
      return true    

    case 'insert-math-block':
      insertMathBlock(editor)
      return true
    case 'insert-alert-information':
    case 'insert-alert-suggestion':
    case 'insert-alert-important':
    case 'insert-alert-warning':
    case 'insert-alert-notification':
      console.log(`Unsupported menu command: ${action}`)
      return true
    case 'insert-quote-block':
      editor.chain().focus().toggleBlockquote().run()
      return true
    
    // Lists
    case 'ordered-list':
      editor.chain().focus().toggleOrderedList().run()
      return true
    case 'bullet-list':
      editor.chain().focus().toggleBulletList().run()
      return true
    case 'task-list':
      editor.chain().focus().toggleTaskList().run()
      return true
    
    // Toggle Task Status
    case 'toggle-task-status':
      toggleTaskItemChecked(editor)
      return true
    case 'complete-task':
      setTaskItemChecked(editor, true)
      return true
    case 'uncomplete-task':
      setTaskItemChecked(editor, false)
      return true

    // Increase/Decrease List Item Level
    case 'increase-indent':
      if (editor.can().sinkListItem('listItem')) {
        editor.chain().focus().sinkListItem('listItem').run()
      } else if (editor.can().sinkListItem('taskItem')) {
        editor.chain().focus().sinkListItem('taskItem').run()
      }
      return true
    case 'decrease-indent':
      if (editor.can().liftListItem('listItem')) {
        editor.chain().focus().liftListItem('listItem').run()
      } else if (editor.can().liftListItem('taskItem')) {
        editor.chain().focus().liftListItem('taskItem').run()
      }
      return true
    
    // Insert paragraph above/below
    case 'insert-paragraph-above':
      editor.chain().focus().insertContent('\n\n').run()
      return true
    case 'insert-paragraph-below':
      editor.chain().focus().insertContent('\n\n').run()
      return true
    
    // Reference Link and Footnote
    case 'reference-link':
      insertReferenceLink(editor)
      return true
    case 'footnote':
      insertFootnote(editor)
      return true
    
    // Horizontal Rule
    case 'horizontal-rule':
      editor.chain().focus().setHorizontalRule().run()
      return true

    // Format Main Menu
    case 'bold':
      editor.chain().focus().toggleBold().run()
      return true
    case 'italic':
      editor.chain().focus().toggleItalic().run()
      return true
    case 'underline':
      editor.chain().focus().toggleUnderline().run()
      return true
    case 'strikethrough':
      editor.chain().focus().toggleStrike().run()
      return true

    // Text Align
    case 'align-left':
      editor.chain().focus().setTextAlign('left').run()
      return true
    case 'align-center':
      editor.chain().focus().setTextAlign('center').run()
      return true
    case 'align-right':
      editor.chain().focus().setTextAlign('right').run()
      return true
    case 'align-justify':
      editor.chain().focus().setTextAlign('justify').run()
      return true

    case 'superscript':
      editor.chain().focus().toggleSuperscript().run()
      return true
    case 'subscript':
      editor.chain().focus().toggleSubscript().run()
      return true
    case 'highlight':
      editor.chain().focus().toggleHighlight().run()
      return true

    case 'inline-code':
      editor.chain().focus().toggleCode().run()
      return true
    case 'inline-math':
      insertInlineMath(editor)
      return true
    case 'inline-link':
      insertInlineLink(editor)
      return true

    case 'clear-formatting':
      editor.chain().focus().unsetAllMarks().run()
      return true
      
    default:
      console.log('Unhandled menu action in MarkdownEditor:', action)
      return false
  }
}