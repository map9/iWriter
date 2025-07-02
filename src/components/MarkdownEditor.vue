<template>
  <div class="flex-1 flex flex-col h-full overflow-hidden">
    <!-- Tab Editor Content -->
    <div v-for="tab in appStore.tabs" :key="tab.id" class="flex-1 h-full">
      <div v-show="tab.isActive" class="h-full overflow-y-auto editor-scroll-area">
        <EditorContent
          :editor="editors[tab.id]"
          class="min-h-full p-6 focus:outline-none"
        />
      </div>
    </div>
    
    <!-- Welcome Screen when no tabs -->
    <div v-if="appStore.tabs.length === 0" class="flex-1 flex items-center justify-center bg-gray-50 overflow-y-auto">
      <div class="text-center text-gray-500">
        <IconFileText :size="48" class="mx-auto mb-4 text-gray-300" />
        <h2 class="text-xl font-semibold mb-2">Document Content Area</h2>
        <p class="text-sm">
          Create a new document or open an existing one to start editing
        </p>
        <div class="mt-6 space-x-4">
          <button
            @click="appStore.createNewTab()"
            class="btn btn-primary"
          >
            New Document
          </button>
          <button
            @click="appStore.openFileDialog()"
            class="btn btn-secondary"
          >
            Open Document
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
import { IconFileText } from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import type { FileTab } from '@/stores/app'

const appStore = useAppStore()

// Store for all editor instances - each tab gets its own editor
const editors = ref<Record<string, any>>({})

// Loading flags for each tab to prevent content sync issues
const loadingFlags = ref<Record<string, boolean>>({})

// Initialize markdown parser and converter
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
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

// Function to create a new editor instance for a tab
function createEditorForTab(tabId: string) {
  const editor = useEditor({
    extensions: [
      Color,
      TextStyle,
      
      StarterKit.configure({
        // Most extensions like Link, TaskList, etc. are included in StarterKit v3
      }),
      
      Math.configure({
        blockOptions: {
          onClick: node => {
            const newCalculation = prompt('Enter new calculation:', node.attrs.latex)
            if (newCalculation && editor) {
              editor.chain().updateBlockMath({ latex: newCalculation }).run()
            }
          },
        },
        inlineOptions: {
          onClick: node => {
            const newCalculation = prompt('Enter new calculation:', node.attrs.latex)
            if (newCalculation && editor) {
              editor.chain().updateInlineMath({ latex: newCalculation }).run()
            }
          },
        },
      }),
      
      // Table extension
      TableKit,
      
      // List extensions (includes TaskList and TaskItem)
      ListKit.configure({
        taskItem: {
          nested: true,
        },
        orderedList: {
          keepMarks: true,
        },
      }),

      // Media extensions
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg',
        },
      }),
      Youtube.configure({
        controls: false,
        nocookie: true,
        width: 480,
        height: 320,
      }),
      
      TextStyleKit,
      Highlight.configure({
        multicolor: true,
      }),
      Superscript,
      Subscript,
      Underline,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      // Don't emit updates while loading content
      if (loadingFlags.value[tabId]) return
      
      const htmlContent = editor.getHTML()
      
      // Find the tab for this editor
      const tab = appStore.tabs.find(t => t.id === tabId)
      if (!tab) return
      
      // Convert content based on file type
      let contentToSave = htmlContent
      
      if (tab.path) {
        if (isMarkdownFile(tab.path)) {
          // For .md files, convert HTML to Markdown
          contentToSave = turndownService.turndown(htmlContent)
        } else if (isIWriterFile(tab.path)) {
          // For .iwt files, save as HTML directly
          contentToSave = htmlContent
        }
      } else {
        // For untitled files, default to HTML format (.iwt)
        contentToSave = htmlContent
      }
      
      // Update the tab content in store
      appStore.updateTabContent(tabId, contentToSave)
    },
    onSelectionUpdate: () => {
      // Update menu formatting state when selection changes
      const tab = appStore.tabs.find(t => t.id === tabId)
      if (tab?.isActive) {
        updateMenuFormattingState()
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-full',
        spellcheck: 'false',
      },
    },
  })
  
  return editor
}

// Watch for tabs changes to create/destroy editors
watch(() => appStore.tabs, (newTabs, oldTabs) => {
  // Create editors for new tabs
  newTabs.forEach(tab => {
    if (!editors.value[tab.id]) {
      editors.value[tab.id] = createEditorForTab(tab.id)
      loadingFlags.value[tab.id] = false
      // Load content immediately after creating editor
      nextTick(() => {
        loadTabContent(tab.id)
      })
    }
  })
  
  // Clean up editors for removed tabs
  if (oldTabs) {
    oldTabs.forEach(oldTab => {
      if (!newTabs.find(tab => tab.id === oldTab.id)) {
        if (editors.value[oldTab.id]) {
          editors.value[oldTab.id].destroy()
          delete editors.value[oldTab.id]
          delete loadingFlags.value[oldTab.id]
        }
      }
    })
  }
}, { immediate: true, deep: true })

// Watch for tab content changes
watch(() => appStore.tabs.map(tab => ({ id: tab.id, content: tab.content })), (newContents) => {
  newContents.forEach(({ id, content }) => {
    const tab = appStore.tabs.find(t => t.id === id)
    if (tab && editors.value[id] && content !== undefined) {
      loadTabContent(id)
    }
  })
}, { deep: true })

// Watch for active tab changes
watch(() => appStore.activeTab, (newTab) => {
  if (newTab && editors.value[newTab.id]) {
    // Update menu state when tab becomes active
    updateMenuFormattingState()
  }
})

// Load content for a specific tab
function loadTabContent(tabId: string) {
  const editor = editors.value[tabId]
  const tab = appStore.tabs.find(t => t.id === tabId)
  if (!editor || !tab) return
  
  // Set loading flag to prevent onUpdate from firing
  loadingFlags.value[tabId] = true
  
  const fileContent = tab.content || ''
  let htmlContent = fileContent
  
  if (tab.path) {
    if (isMarkdownFile(tab.path)) {
      // For .md files, convert Markdown to HTML
      htmlContent = marked(fileContent)
    } else if (isIWriterFile(tab.path)) {
      // For .iwt files, content is already HTML
      htmlContent = fileContent
    }
  } else {
    // For untitled files, assume HTML format (.iwt)
    htmlContent = fileContent
  }
  
  // Set content for this tab's editor
  editor.commands.setContent(htmlContent)
  
  // Reset loading flag after content is set
  setTimeout(() => {
    loadingFlags.value[tabId] = false
  }, 100)
}

// Function to update menu formatting state
function updateMenuFormattingState() {
  const activeTab = appStore.activeTab
  if (!activeTab || !window.electronAPI?.windowContentChange) return
  
  const editor = editors.value[activeTab.id]
  if (!editor) return
  
  const formatting = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strikethrough: editor.isActive('strike'),
    inlineCode: editor.isActive('code')
  }
  
  window.electronAPI.windowContentChange({
    type: 'tiptap-editor',
    formatting: formatting,
  })
}

// Handle menu actions for the active editor
const handleMenuAction = (action: string): boolean => {
  const activeTab = appStore.activeTab
  if (!activeTab) return false
  
  const editor = editors.value[activeTab.id]
  if (!editor) return false

  switch (action) {
    case 'undo':
      editor.chain().focus().undo().run()
      break
    case 'redo':
      editor.chain().focus().redo().run()
      break

    case 'heading-1':
      editor.chain().focus().setHeading({ level: 1 }).run()
      break
    case 'heading-2':
      editor.chain().focus().setHeading({ level: 2 }).run()
      break
    case 'heading-3':
      editor.chain().focus().setHeading({ level: 3 }).run()
      break
    case 'heading-4':
      editor.chain().focus().setHeading({ level: 4 }).run()
      break
    case 'heading-5':
      editor.chain().focus().setHeading({ level: 5 }).run()
      break
    case 'heading-6':
      editor.chain().focus().setHeading({ level: 6 }).run()
      break
    case 'paragraph':
      editor.chain().focus().setParagraph().run()
      break
    
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
      break
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
      break
    
    // Blocks
    case 'code-block':
      editor.chain().focus().toggleCodeBlock().run()
      break
    case 'math-block':
      console.warn('Block math called.')
      const latexBlock = prompt('Enter block math expression:', '')
      if (latexBlock) {
        editor.chain().focus().setBlockMath({ latex: latexBlock }).run()
      }
      break
    case 'quote-block':
      editor.chain().focus().toggleBlockquote().run()
      break
    
    // Lists
    case 'ordered-list':
      editor.chain().focus().toggleOrderedList().run()
      break
    case 'bullet-list':
      editor.chain().focus().toggleBulletList().run()
      break
    case 'task-list':
      editor.chain().focus().toggleTaskList().run()
      break

    // Increase/Decrease List Item Level
    case 'increase-indent':
      editor.chain().focus().liftListItem('listItem').run()
      break
    case 'decrease-indent':
      editor.chain().focus().sinkListItem('listItem').run()
      break
    
    // Insert paragraph above/below
    case 'insert-paragraph-above':
      editor.chain().focus().insertContent('\n\n').run()
      break
    case 'insert-paragraph-below':
      editor.chain().focus().insertContent('\n\n').run()
      break
    
    // Reference Link and Footnote
    case 'reference-link':
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
      break
    case 'footnote':
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
      break
    
    // Horizontal Rule
    case 'horizontal-rule':
      editor.chain().focus().setHorizontalRule().run()
      break

    // Format Main Menu
    case 'bold':
      editor.chain().focus().toggleBold().run()
      break
    case 'italic':
      editor.chain().focus().toggleItalic().run()
      break
    case 'underline':
      editor.chain().focus().toggleUnderline().run()
      break
    case 'strikethrough':
      editor.chain().focus().toggleStrike().run()
      break
    case 'inline-code':
      editor.chain().focus().toggleCode().run()
      break
    case 'inline-math':
      const latex = prompt('Enter inline math expression:', '')
      if (latex) {
        editor.chain().focus().setInlineMath({ latex }).run()
      }
      break
    case 'inline-link':
      if (editor.isActive('link')) {
        editor.chain().focus().unsetLink().run()
      } else {
        const previousUrl = editor.getAttributes('link').href
        const url = window.prompt('URL', previousUrl)

        // cancelled
        if (url === null) {
          return
        }

        // empty
        if (url === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
          return
        }

        // update link
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      }
      break
    default:
      console.log('Unhandled menu action in MarkdownEditor:', action)
      return false
  }
  
  // If we reach here, the action was handled
  return true
}

onMounted(async () => {
  // Wait for component to be ready
  await nextTick()
  
  // Initial menu state update for active tab
  if (appStore.activeTab && editors.value[appStore.activeTab.id]) {
    updateMenuFormattingState()
  }
})

// Expose methods to parent component
defineExpose({
  handleMenuAction,
  updateMenuFormattingState
})

onBeforeUnmount(() => {
  // Clean up all editors
  Object.values(editors.value).forEach(editor => {
    editor?.destroy()
  })
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