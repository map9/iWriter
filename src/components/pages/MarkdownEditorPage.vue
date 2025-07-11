<template>
  <div class="h-full flex flex-col bg-white">
    <!-- Editor Toolbar -->
    <EditorToolbar 
      :editor="editor" 
    />
    
    <!-- TipTap Editor -->
    <div class="flex-1 overflow-hidden">
      <EditorContent
        :editor="editor"
        class="h-full p-6 focus:outline-none overflow-y-auto editor-scroll-area"
      />
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { ref, toRef, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import 'katex/dist/katex.min.css'
import { Math } from '@tiptap/extension-mathematics'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import { ListKit } from '@tiptap/extension-list'
import { Color, TextStyle, TextStyleKit } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Underline from '@tiptap/extension-underline'
import { marked } from 'marked'
import TurndownService from 'turndown'
import EditorToolbar from '@/components/EditorToolbar.vue'
import { useAppStore } from '@/stores/app'
import type { FileTab } from '@/types'
import { notify } from '@/utils/notifications'
import { 
  getHeading,
  setHeading, 
  insertTable, 
  insertImage, 
  insertAudio, 
  insertVideo, 
  insertLink, 
  insertInlineLink,
  insertMathBlock, 
  insertInlineMath,
  insertReferenceLink,
  insertFootnote,
} from '@/utils/MarkDownEditorHelper'

// Props
interface Props {
  tab: FileTab
}

const props = defineProps<Props>()
const appStore = useAppStore()

// Initialize markdown parser and converter
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

// Loading flag for this editor
const isLoading = ref(false)

// Create TipTap editor instance
const editor = useEditor({
  extensions: [
    Color,
    TextStyle,
    
    StarterKit.configure({
      // Most extensions like Link, TaskList, etc. are included in StarterKit v3
    }),
    
    // Additional extensions
    Underline,
    Subscript,
    Superscript,
    Highlight.configure({
      HTMLAttributes: {
        class: 'highlight'
      }
    }),
    
    // Math support
    Math.configure({
      katexOptions: {
        displayMode: false
      }
    }),
    
    // Table support with full table kit
    TableKit.configure({
    }),
    
    // List support
    ListKit.configure(),
    
    // Image support
    Image.configure({
      inline: true,
      allowBase64: true,
      HTMLAttributes: {
        class: 'editor-image'
      }
    }),
    
    // YouTube support
    Youtube.configure({
      controls: false,
      nocookie: true,
      HTMLAttributes: {
        class: 'youtube-embed'
      },
    }),
  ],
  content: '',
  editorProps: {
    attributes: {
      //class: 'prose max-w-none focus:outline-none',
      class: 'prose prose-lg max-w-none focus:outline-none min-h-full',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor }) => {
    // Convert content to appropriate format and update store
    updateTabContent(editor)
    updateMenuFormattingState()
  },
  onSelectionUpdate: ({ editor }) => {
    // Update menu formatting state
    updateMenuFormattingState()
  },
  onCreate: ({ editor }) => {
    // Load content when editor is created
    loadTabContent(editor)
  }
})

// Helper functions for file types
const getFileExtension = (filePath: string): string => {
  return filePath.split('.').pop()?.toLowerCase() || ''
}

const isMarkdownFile = (filePath: string): boolean => {
  const ext = getFileExtension(filePath)
  return ext === 'md' || ext === 'markdown'
}

const isIWriterFile = (filePath: string): boolean => {
  const ext = getFileExtension(filePath)
  return ext === 'iwt'
}

// Load content into editor
async function loadTabContent(editorInstance: any) {
  if (isLoading.value) return
  
  isLoading.value = true
  
  try {
    let content = props.tab.content || ''
    
    // Load from file if path exists and content is empty
    if (props.tab.path && !content) {
      if (window.electronAPI) {
        const fileContent = await window.electronAPI.readFile(props.tab.path)
        if (fileContent !== null) {
          content = fileContent
        }
      }
    }
    
    // Convert content based on file type
    if (content) {
      if (props.tab.path) {
        if (isMarkdownFile(props.tab.path)) {
          // Convert markdown to HTML for TipTap
          const htmlContent = await marked(content)
          editorInstance.commands.setContent(htmlContent)
        } else if (isIWriterFile(props.tab.path)) {
          // iWriter files are stored as JSON with HTML content
          try {
            const parsed = JSON.parse(content)
            editorInstance.commands.setContent(parsed.content || '')
          } catch {
            editorInstance.commands.setContent(content)
          }
        } else {
          // Plain text
          editorInstance.commands.setContent(content)
        }
      } else {
        // Default to HTML content for new tabs
        editorInstance.commands.setContent(content)
      }
    }
  } catch (error) {
    notify.error(`加载文档内容失败: ${error instanceof Error ? error.message : String(error)}`, '编辑器错误')
  } finally {
    isLoading.value = false
  }
}

// Update tab content in store
function updateTabContent(editorInstance: any) {
  if (isLoading.value) return
  
  let content = ''
  
  if (props.tab.path) {
    if (isMarkdownFile(props.tab.path)) {
      // Convert HTML back to markdown
      const html = editorInstance.getHTML()
      content = turndownService.turndown(html)
    } else if (isIWriterFile(props.tab.path)) {
      // Store as JSON for iWriter files
      const htmlContent = editorInstance.getHTML()
      content = JSON.stringify({
        content: htmlContent,
        metadata: {
          lastModified: new Date().toISOString(),
          wordCount: editorInstance.storage.characterCount?.words() || 0
        }
      })
    } else {
      // Plain text
      content = editorInstance.getText()
    }
  } else {
    // New tab - store as HTML
    content = editorInstance.getHTML()
  }
  
  appStore.updateTabContent(props.tab.id, content)
}

// Handle menu actions
function handleMenuAction(action: string): boolean {
  if (!editor.value) return false
  
  switch (action) {
    case 'undo':
      editor.value.chain().focus().undo().run()
      return true
    case 'redo':
      editor.value.chain().focus().redo().run()
      return true
      
    case 'heading-1':
      editor.value.chain().focus().setHeading({ level: 1 }).run()
      return true
    case 'heading-2':
      editor.value.chain().focus().setHeading({ level: 2 }).run()
      return true
    case 'heading-3':
      editor.value.chain().focus().setHeading({ level: 3 }).run()
      return true
    case 'heading-4':
      editor.value.chain().focus().setHeading({ level: 4 }).run()
      return true
    case 'heading-5':
      editor.value.chain().focus().setHeading({ level: 5 }).run()
      return true
    case 'heading-6':
      editor.value.chain().focus().setHeading({ level: 6 }).run()
      return true
    case 'paragraph':
      editor.value.chain().focus().setParagraph().run()
      return true

    // Promote and Demote Heading
    case 'promote-heading':
      if (editor.value.isActive('heading', { level: 6 })) {
        editor.value.chain().focus().setHeading({ level: 5 }).run()
      } else if (editor.value.isActive('heading', { level: 5 })) {
        editor.value.chain().focus().setHeading({ level: 4 }).run()
      } else if (editor.value.isActive('heading', { level: 4 })) {
        editor.value.chain().focus().setHeading({ level: 3 }).run()
      } else if (editor.value.isActive('heading', { level: 3 })) {
        editor.value.chain().focus().setHeading({ level: 2 }).run()
      } else if (editor.value.isActive('heading', { level: 2 })) {
        editor.value.chain().focus().setHeading({ level: 1 }).run()
      } else if (editor.value.isActive('paragraph')) {
        editor.value.chain().focus().setHeading({ level: 6 }).run()
      }
      return true
    case 'demote-heading':
      if (editor.value.isActive('heading', { level: 1 })) {
        editor.value.chain().focus().setHeading({ level: 2 }).run()
      } else if (editor.value.isActive('heading', { level: 2 })) {
        editor.value.chain().focus().setHeading({ level: 3 }).run()
      } else if (editor.value.isActive('heading', { level: 3 })) {
        editor.value.chain().focus().setHeading({ level: 4 }).run()
      } else if (editor.value.isActive('heading', { level: 4 })) {
        editor.value.chain().focus().setHeading({ level: 5 }).run()
      } else if (editor.value.isActive('heading', { level: 5 })) {
        editor.value.chain().focus().setHeading({ level: 6 }).run()
      } else if (editor.value.isActive('heading', { level: 6 })) {
        editor.value.chain().focus().setParagraph().run()
      }
      return true
    
    // Blocks
    case 'insert-table':
      insertTable(editor)
      return true
    case 'insert-image':
      insertImage(editor)
      return true
    case 'insert-code-block':
      editor.value.chain().focus().toggleCodeBlock().run()
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
      editor.value.chain().focus().toggleBlockquote().run()
      return true
    
    // Lists
    case 'ordered-list':
      editor.value.chain().focus().toggleOrderedList().run()
      return true
    case 'bullet-list':
      editor.value.chain().focus().toggleBulletList().run()
      return true
    case 'task-list':
      editor.value.chain().focus().toggleTaskList().run()
      return true

    // Increase/Decrease List Item Level
    case 'increase-indent':
      editor.value.chain().focus().liftListItem('listItem').run()
      return true
    case 'decrease-indent':
      editor.value.chain().focus().sinkListItem('listItem').run()
      return true
    
    // Insert paragraph above/below
    case 'insert-paragraph-above':
      editor.value.chain().focus().insertContent('\n\n').run()
      return true
    case 'insert-paragraph-below':
      editor.value.chain().focus().insertContent('\n\n').run()
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
      editor.value.chain().focus().setHorizontalRule().run()
      return true

    // Format Main Menu
    case 'bold':
      editor.value.chain().focus().toggleBold().run()
      return true
    case 'italic':
      editor.value.chain().focus().toggleItalic().run()
      return true
    case 'underline':
      editor.value.chain().focus().toggleUnderline().run()
      return true
    case 'strikethrough':
      editor.value.chain().focus().toggleStrike().run()
      return true

    case 'inline-code':
      editor.value.chain().focus().toggleCode().run()
      return true
    case 'inline-math':
      insertInlineMath(editor)
      return true
    case 'inline-link':
      insertInlineLink(editor)
      return true

    default:
      console.log('Unhandled menu action in MarkdownEditor:', action)
      return false
  }
}

// Update menu state
function updateMenuFormattingState() {
  if (window.electronAPI?.windowContentChange && editor.value) {
    const formatting = {
      heading: editor.value.isActive('heading') ? editor.value.getAttributes('heading').level : 'paragraph',
      bold: editor.value.isActive('bold'),
      italic: editor.value.isActive('italic'),
      underline: editor.value.isActive('underline'),
      strikethrough: editor.value.isActive('strike'),
      inlineCode: editor.value.isActive('code'),
    }
    
    const context = {
      type: 'tiptap-editor',
      hasActiveDocument: true,
      hasSelection: !editor.value.state.selection.empty,
      formatting
    }
    
    window.electronAPI.windowContentChange(context)
  }
}

// Watch for tab content changes
watch(() => props.tab.content, (newContent) => {
  /*
  if (editor.value && !isLoading.value) {
    console.log('before Tab content loaded:', props.tab.id)
    loadTabContent(editor.value)
  }
  */
})

// Focus editor when component becomes active
function focusEditor() {
  nextTick(() => {
    editor.value?.commands.focus()
  })
}

// Cleanup
onBeforeUnmount(() => {
  editor.value?.destroy()
})

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
  updateMenuFormattingState,
  focusEditor
})
</script>

<style lang="scss">
/* Modern editor styles */
.tiptap {
  line-height: 1.6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  
  :first-child {
    margin-top: 0;
  }

  /* Heading styles */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    line-height: 1.2;
    margin-top: 2rem;
    margin-bottom: 1rem;
    font-weight: 600;
    text-wrap: pretty;
  }

  h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-top: 0;
    margin-bottom: 1.5rem;
  }

  h2 {
    font-size: 1.5rem;
    margin-top: 2.5rem;
  }

  h3 {
    font-size: 1.25rem;
  }

  h4 {
    font-size: 1.125rem;
  }

  h5,
  h6 {
    font-size: 1rem;
  }

  /* List styles */
  ul,
  ol {
    padding: 0 1rem;
    margin: 1.25rem 1rem 1.25rem 0.4rem;

    li p {
      margin-top: 0.25em;
      margin-bottom: 0.25em;
    }
  }

  /* Code and preformatted text styles */
  code {
    background-color: #f1f5f9;
    border-radius: 0.25rem;
    color: #e11d48;
    font-size: 0.875rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    padding: 0.125rem 0.25rem;
  }

  pre {
    background: #1e293b;
    border-radius: 0.5rem;
    color: #f8fafc;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    margin: 1.5rem 0;
    padding: 1rem;
    overflow-x: auto;

    code {
      background: none;
      color: inherit;
      font-size: 0.875rem;
      padding: 0;
    }
  }

  blockquote {
    border-left: 4px solid #3b82f6;
    margin: 1.5rem 0;
    padding-left: 1rem;
    font-style: italic;
    color: #64748b;
  }

  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    cursor: pointer;
    margin: 2rem 0;

    &.ProseMirror-selectednode {
      border-top: 1px solid #3b82f6;
    }
  }

  /* Link styles */
  a {
    color: #3b82f6;
    text-decoration: underline;
    
    &:hover {
      color: #1d4ed8;
    }
  }

  /* Paragraph styles */
  p {
    margin: 1rem 0;
    
    &:first-child {
      margin-top: 0;
    }
    
    &:last-child {
      margin-bottom: 0;
    }
  }

  /* Youtube embed */
  div[data-youtube-video] {
    margin: 1.5rem 0;
    
    iframe {
      border-radius: 0.5rem;
      display: block;
      min-height: 200px;
      min-width: 200px;
      max-width: 100%;
    }

    &.ProseMirror-selectednode iframe {
      outline: 3px solid #3b82f6;
      transition: outline 0.15s;
    }
  }

  /* Highlight */
  mark {
    background-color: #fef08a;
    border-radius: 0.25rem;
    box-decoration-break: clone;
    padding: 0.125rem 0.25rem;
  }

  /* Task list styles */
  ul[data-type="taskList"] {
    list-style: none;
    padding: 0;
    
    li {
      display: flex;
      align-items: flex-start;
      
      label {
        flex-shrink: 0;
        margin-right: 0.5rem;
        margin-top: 0.125rem;
      }
      
      > div {
        flex: 1;
      }
    }
  }

  /* Table styles */
  table {
    border-collapse: collapse;
    margin: 1.5rem 0;
    table-layout: fixed;
    width: 100%;
    
    td, th {
      border: 1px solid #e2e8f0;
      box-sizing: border-box;
      min-width: 1em;
      padding: 0.5rem;
      position: relative;
      vertical-align: top;
      
      > * {
        margin-bottom: 0;
      }
    }
    
    th {
      background-color: #f8fafc;
      font-weight: 600;
      text-align: left;
    }
  }

  .editor-image {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 10px 0;
  }

  .youtube-embed {
    max-width: 100%;
    margin: 10px 0;
  }

  .highlight {
    background-color: #fff3cd;
    color: #856404;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .math {
    background-color: #f8f9fa;
    padding: 2px 4px;
    border-radius: 2px;
  }
}

/* Custom scrollbar styles for editor content */
.editor-scroll-area {
  scrollbar-width: auto;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.editor-scroll-area::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.editor-scroll-area::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 6px;
}

.editor-scroll-area::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 6px;
  border: 2px solid #f1f5f9;
}

.editor-scroll-area::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.editor-scroll-area::-webkit-scrollbar-corner {
  background: #f1f5f9;
}
</style>