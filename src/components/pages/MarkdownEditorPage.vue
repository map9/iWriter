<template>
  <div class="flex flex-col h-full">
    <!-- Editor Toolbar -->
    <div class="toolbar">
      <!-- Spacer -->
      <div class="flex-grow flex-shrink flex-basis-0"></div>
      <!-- Undo/Redo Group -->
      <div class="toolbar-group">
        <button
          @click="editor?.chain().focus().undo().run()"
          :disabled="!editor?.can().undo()"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Undo (⌘Z)"
        >
          <IconArrowBackUp class = "w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().redo().run()"
          :disabled="!editor?.can().redo()"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Redo (⌘⇧Z)"
        >
          <IconArrowForwardUp class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <!-- Heading Dropdown -->
      <div class="toolbar-group">
        <select
          v-model="currentHeading"
          @change="setHeading(editor, currentHeading)"
          :disabled="!editor"
          class="px-3 text-sm border-none border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 h-7 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
          <option value="5">Heading 5</option>
          <option value="6">Heading 6</option>
          <option value="paragraph">Paragraph</option>
        </select>
      </div>
          
      <!-- Text Formatting Group -->
      <div class="toolbar-group">
        <button
          @click="editor?.chain().focus().toggleBold().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('bold') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Bold (⌘B)"
        >
          <IconBold class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleItalic().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('italic') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Italic (⌘I)"
        >
          <IconItalic class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleUnderline().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('underline') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Underline (⌘U)"
        >
          <IconUnderline class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleStrike().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('strike') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Strikethrough (⌘⇧X)"
        >
          <IconStrikethrough class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <!-- List Group -->
      <div class="toolbar-group">
        <button
          @click="editor?.chain().focus().toggleOrderedList().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('orderedList') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Ordered List"
        >
          <IconListNumbers class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleBulletList().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('bulletList') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Bullet List"
        >
          <IconList class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleTaskList().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('taskList') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Task List"
        >
          <IconListCheck class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <!-- Text Alignment Group -->
      <div class="toolbar-group">
        <button
          @click="editor?.chain().focus().setTextAlign('left').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'left' === getCurrentAlignment() }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Left"
        >
          <IconAlignLeft class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('center').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'center' === getCurrentAlignment() }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Center"
        >
          <IconAlignCenter class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('right').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'right' === getCurrentAlignment() }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Right"
        >
          <IconAlignRight class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('justify').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'justify' === getCurrentAlignment() }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Justified"
        >
          <IconAlignJustified class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <!-- Insert Group -->
      <div class="toolbar-group">
        <button
          @click="insertTable(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Insert Table"
        >
          <IconTable class="w-5 h-5" />
        </button>
        <button
          @click="insertImage(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Insert Image"
        >
          <IconPhoto class="w-5 h-5" />
        </button>
        <button
          @click="insertAudio(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Insert Audio"
        >
          <IconVolume class="w-5 h-5" />
        </button>
        <button
          @click="insertVideo(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Insert Video"
        >
          <IconVideo class="w-5 h-5" />
        </button>
        <button
          @click="insertLink(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Insert Link"
        >
          <IconLink class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <!-- Block Group -->
      <div class="toolbar-group">
        <button
          @click="editor?.chain().focus().toggleBlockquote().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('blockquote') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Quote Block"
        >
          <IconBlockquote class="w-5 h-5" />
        </button>
        <button
          @click="insertMathBlock(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Math Block"
        >
          <IconMath class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleCodeBlock().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('codeBlock') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Code Block"
        >
          <IconCode class="w-5 h-5" />
        </button>
      </div>
      
      <!-- Spacer -->
      <div class="flex-grow flex-shrink flex-basis-0"></div>
      
      <!-- Fullscreen Button -->
      <div class="toolbar-group">
        <button
          @click="toggleFullscreen"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Toggle Fullscreen"
        >
          <IconMaximize class="w-5 h-5" />
        </button>
      </div>
    </div>
    
    <!-- TipTap Editor -->
    <div class="flex-1 overflow-y-auto scrollbar-thin">
        <EditorContent v-if="editor" :editor="editor" class="w-full h-full max-w-3xl my-4 mx-auto"/>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { ref, toRef, watch, onBeforeUnmount, nextTick } from 'vue'
import { EditorContent, useEditor, VueNodeViewRenderer } from '@tiptap/vue-3'
import { NodeSelection } from '@tiptap/pm/state'

import { getHierarchicalIndexes, TableOfContents } from '@tiptap/extension-table-of-contents'
import { UndoRedo, Dropcursor, Gapcursor, TrailingNode, Focus, Placeholder } from '@tiptap/extensions'

import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import TextAlign from '@tiptap/extension-text-align'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import FileHandler from '@tiptap/extension-file-handler'

import Blockquote from '@tiptap/extension-blockquote'

import css from 'highlight.js/lib/languages/css'
import js from 'highlight.js/lib/languages/javascript'
import ts from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
import { all, createLowlight } from 'lowlight'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import CodeBlockComponent from '@/components/common/tiptap/CodeBlockComponent.vue'
import ImageComponent from '@/components/common/tiptap/ImageComponent.vue'

import 'katex/dist/katex.min.css'
import { Mathematics, migrateMathStrings } from '@tiptap/extension-mathematics'

import { ListItem, BulletList, OrderedList, ListKeymap, TaskItem, TaskList } from '@tiptap/extension-list'

import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import Code from '@tiptap/extension-code'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Typography from '@tiptap/extension-typography'
import { TextStyleKit } from '@tiptap/extension-text-style'

import InvisibleCharacters from '@tiptap/extension-invisible-characters'

import { marked } from 'marked'
// @ts-ignore
import TurndownService from 'turndown'

import { useAppStore } from '@/stores/app'
import type { FileTab } from '@/types'
import { notify } from '@/utils/notifications'
import { MarkdownTocProvider } from '@/services/toc/MarkdownTocProvider'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconListNumbers,
  IconList,
  IconListCheck,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustified,
  IconTable,
  IconPhoto,
  IconVolume,
  IconVideo,
  IconLink,
  IconBlockquote,
  IconMath,
  IconCode,
  IconMaximize
} from '@tabler/icons-vue'
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
  onFileHandlerDrop,
  onFileHandlerPaste,
  onPlaceholder,
} from '@/utils/MarkDownEditorHelper'


// Hover Toolbar imports
//import HoverToolbar from '@/components/common/tiptap/HoverToolbar.vue'
//import CodeBlockToolbar from '@/components/common/tiptap/toolbars/CodeBlockToolbar.vue'
//import HeadingToolbar from '@/components/common/tiptap/toolbars/HeadingToolbar.vue'
//import DefaultToolbar from '@/components/common/tiptap/toolbars/DefaultToolbar.vue'
//import { HoverToolbarExtension } from '@/components/common/tiptap/HoverToolbarPlugin'

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

// Toolbar state
const currentHeading = ref('paragraph')
const isFullscreen = ref(false)

// 控制HoverToolbar的显示 - 简化生命周期管理
//const showHoverToolbar = ref(false)

// create a lowlight instance
const lowlight = createLowlight(all)
lowlight.register('html', html)
lowlight.register('css', css)
lowlight.register('js', js)
lowlight.register('ts', ts)

// Create TipTap editor instance
const editor = useEditor({
  extensions: [
    TableOfContents.configure({
      getIndex: getHierarchicalIndexes,
      onUpdate: content => {
        // Update the TOC provider with new data
        if (props.tab.tocProvider) {
          props.tab.tocProvider.updateFromTipTap?.(content)
        }
      },
    }),
    UndoRedo, Dropcursor, Gapcursor, TrailingNode, 
    Focus.configure({
      className: 'has-focus',
      mode: 'all',
    }),

    Document, Heading, Paragraph, Text, HorizontalRule,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'image', 'caption'],
    }),
    TableKit.configure({
      table: { resizable: true },
    }),
    
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          textAlign: {
            default: 'left',
            parseHTML: (element: HTMLElement) => {
              const align = element.style.textAlign
              return ['left', 'center', 'right', 'justify'].includes(align) ? align : 'left'
            },
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.textAlign || attributes.textAlign === 'left') {
                return {}
              }
              return { style: `text-align: ${attributes.textAlign}` }
            },
          },
        }
      },
      addNodeView() {
        return VueNodeViewRenderer(ImageComponent)
      },
    }),
    Youtube.configure({
      controls: false,
      nocookie: true
    }),
    FileHandler.configure({
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
      onDrop: onFileHandlerDrop,
      onPaste: onFileHandlerPaste,
    }),

    Blockquote,
    CodeBlockLowlight.extend({
      addNodeView() {
        return VueNodeViewRenderer(CodeBlockComponent)
      },
    }).configure({ lowlight }),
    Mathematics.configure({
      inlineOptions: {
        onClick: (node, pos) => {
          const newCalculation = prompt('Enter new calculation:', node.attrs.latex)
          if (newCalculation) {
            editor.value?.chain().setNodeSelection(pos).updateInlineMath({ latex: newCalculation }).focus().run()
          }
        },
      },
      blockOptions: {
        onClick: (node, pos) => {
          const newCalculation = prompt('Enter new calculation:', node.attrs.latex)
          if (newCalculation) {
            editor.value?.chain().setNodeSelection(pos).updateBlockMath({ latex: newCalculation }).focus().run()
          }
        },
      },
      // Options for the KaTeX renderer. See here: https://katex.org/docs/options.html
      katexOptions: {
        throwOnError: false, // don't throw an error if the LaTeX code is invalid
        macros: {
          '\\R': '\\mathbb{R}', // add a macro for the real numbers
          '\\N': '\\mathbb{N}', // add a macro for the natural numbers
        },
      },
    }),    


    BulletList, OrderedList, ListItem, ListKeymap,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),

    
    Bold, Italic, Strike, Underline, Code, Link,
    Subscript, Superscript, Typography,
    Highlight,
    
    TextStyleKit,

    InvisibleCharacters,
    Placeholder.configure({
      placeholder: onPlaceholder,
    }),
    
    // Hover Toolbar Extension
    /*
    HoverToolbarExtension.configure({
      supportedNodeTypes: ['paragraph', 'heading', 'codeBlock', 'blockquote', 'image'],
      hoverDelay: 100,
      hideDelay: 200
    }),
    */
  ],
  content: '',
  editorProps: {
    attributes: {
      //class: 'prose max-w-none focus:outline-none',
      //class: 'prose prose-lg max-w-none focus:outline-none min-h-full',
      class: 'flex-1 flex-shrink p-[3rem] pb-[30vh] focus:outline-none',
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
    migrateMathStrings(editor)

    // Load content when editor is created
    loadTabContent(editor).then(() => {
      // After loading, you may want to do something.
      updateMenuFormattingState()
      // 编辑器完全初始化后显示HoverToolbar
      //showHoverToolbar.value = true
    })
  }
})



// Watch for editor state changes and update toolbar
watch(() => editor.value, (newEditor) => {
  if (newEditor) {
    const updateState = () => {
      updateToolbarState()
    }
    
    // Listen to editor state changes
    newEditor.on('selectionUpdate', updateState)
    newEditor.on('transaction', updateState)
    
    // Initial update
    updateState()
    
    // Initialize TOC provider and store it in tab
    props.tab.tocProvider = new MarkdownTocProvider(newEditor)
  }
}, { immediate: true })


// Cleanup
onBeforeUnmount(() => {
  // 先隐藏HoverToolbar，确保组件卸载顺序正确
  //showHoverToolbar.value = false
  
  // Clear TOC provider
  if (props.tab.tocProvider) {
    props.tab.tocProvider.destroy()
    props.tab.tocProvider = undefined
  }
  
  // 等待下一帧后再销毁编辑器，确保HoverToolbar完全卸载
  nextTick(() => {
    editor.value?.destroy()
  })
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

// 获取当前对齐状态
function getCurrentAlignment(): string {
  if (!editor.value) return 'left'
  
  /*
  // 检查当前选中的是否是图片节点
  const { selection } = editor.value.state
  
  if (selection instanceof NodeSelection && 
      selection.node && 
      selection.node.type.name === 'image') {
    // 对于图片节点，返回其 textAlign 属性
    return selection.node.attrs.textAlign || 'left'
  } else*/ {
    // 对于文本节点，检查当前激活的对齐方式
    if (editor.value.isActive({ textAlign: 'center' })) return 'center'
    if (editor.value.isActive({ textAlign: 'right' })) return 'right'
    if (editor.value.isActive({ textAlign: 'justify' })) return 'justify'
    return 'left'
  }
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
          editorInstance.commands.setContent(htmlContent, { emitUpdate: false })
        } else if (isIWriterFile(props.tab.path)) {
          // iWriter files are stored as JSON with HTML content
          try {
            const parsed = JSON.parse(content)
            editorInstance.commands.setContent(parsed.content || '', { emitUpdate: false })
          } catch {
            editorInstance.commands.setContent(content, { emitUpdate: false })
          }
        } else {
          // Plain text
          editorInstance.commands.setContent(content, { emitUpdate: false })
        }
      } else {
        // Default to HTML content for new tabs
        editorInstance.commands.setContent(content, { emitUpdate: false })
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

// Toolbar functions
function updateToolbarState() {
  if (!editor.value) return
  
  currentHeading.value = getHeading(editor.value)
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  
  // Emit event to parent component to handle fullscreen
  const event = new CustomEvent('toggle-fullscreen', {
    detail: { isFullscreen: isFullscreen.value }
  })
  document.dispatchEvent(event)
}

// Handle menu actions
async function handleMenuAction(action: string): Promise<boolean> {
  if (!editor.value) return false
  
  switch (action) {
    case 'undo':
      editor.value.chain().focus().undo().run()
      return true
    case 'redo':
      editor.value.chain().focus().redo().run()
      return true

    case 'toggle-invisible-characters':
      editor.value.commands.toggleInvisibleCharacters()
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
      insertTable(editor.value)
      return true
    case 'insert-media':
      return true

    case 'insert-code-block':
      editor.value.chain().focus().toggleCodeBlock().run()
      return true

    case 'toggle-caption':
      //editor.value.chain().focus().setCaptionPosition('auto').run()
      return true    

    case 'insert-math-block':
      insertMathBlock(editor.value)
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
    
    // Toggle Task Status
    case 'toggle-task-status':
      return true
    case 'complete-task':
      return true
    case 'uncomplete-task':
      return true

    // Increase/Decrease List Item Level
    case 'increase-indent':
      if (editor.value.can().sinkListItem('listItem')) {
        editor.value.chain().focus().sinkListItem('listItem').run()
      } else if (editor.value.can().sinkListItem('taskItem')) {
        editor.value.chain().focus().sinkListItem('taskItem').run()
      }
      return true
    case 'decrease-indent':
      if (editor.value.can().liftListItem('listItem')) {
        editor.value.chain().focus().liftListItem('listItem').run()
      } else if (editor.value.can().liftListItem('taskItem')) {
        editor.value.chain().focus().liftListItem('taskItem').run()
      }
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
      insertReferenceLink(editor.value)
      return true
    case 'footnote':
      insertFootnote(editor.value)
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

    // Text Align
    case 'align-left':
      editor.value.chain().focus().setTextAlign('left').run()
      return true
    case 'align-center':
      editor.value.chain().focus().setTextAlign('center').run()
      return true
    case 'align-right':
      editor.value.chain().focus().setTextAlign('right').run()
      return true
    case 'align-justify':
      editor.value.chain().focus().setTextAlign('justify').run()
      return true

    // Superscript Subscript Highlight
    case 'superscript':
      editor.value.chain().focus().toggleSuperscript().run()
      return true
    case 'subscript':
      editor.value.chain().focus().toggleSubscript().run()
      return true
    case 'highlight':
      editor.value.chain().focus().toggleHighlight().run()
      return true

    case 'inline-code':
      editor.value.chain().focus().toggleCode().run()
      return true
    case 'inline-math':
      insertInlineMath(editor.value)
      return true
    case 'inline-link':
      insertInlineLink(editor.value)
      return true

    case 'clear-formatting':
      editor.value.chain().focus().unsetAllMarks().run()
      return true
      
    default:
      console.log('Unhandled menu action in MarkdownEditor:', action)
      return false
  }
}

// 统计信息计算辅助函数
function getParagraphTypeName(contentState: any): string {
  if (typeof contentState.type === 'number') {
    return `heading-${contentState.type}`
  }
  
  switch (contentState.type) {
    case 'paragraph': return 'paragraph'
    case 'blockquote': return 'blockquote'
    case 'bulletList': return 'bullet-list'
    case 'orderedList': return 'ordered-list'
    case 'taskList': return 'task-list'
    case 'codeBlock': return 'code-block'
    default: return 'paragraph'
  }
}

function getCurrentLineFromPos(pos: number): number {
  if (!editor.value) return 1
  const doc = editor.value.state.doc
  let line = 1
  let currentPos = 0
  
  doc.descendants((node: any, offset: number) => {
    if (currentPos >= pos) return false
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      if (offset + node.nodeSize >= pos) {
        return false
      }
      line++
    }
    currentPos = offset + node.nodeSize
    return true
  })
  
  return line
}

function getCurrentColumnFromPos(pos: number): number {
  if (!editor.value) return 1
  const doc = editor.value.state.doc
  const resolved = doc.resolve(pos)
  return resolved.parentOffset + 1
}

function getSelectionCharCount(selection: any): number {
  if (selection.empty) return 0
  return selection.to - selection.from
}

function getSelectionWordCount(selection: any): number {
  if (selection.empty || !editor.value) return 0
  const selectedText = editor.value.state.doc.textBetween(selection.from, selection.to)
  return countWords(selectedText)
}

function countWords(text: string): number {
  if (!text.trim()) return 0
  // 使用正则匹配单词，排除标点符号
  const words = text.trim().match(/\b[a-zA-Z0-9\u4e00-\u9fff]+\b/g)
  return words ? words.length : 0
}

function countParagraphs(doc: any): number {
  let count = 0
  doc.descendants((node: any) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      count++
    }
  })
  return count
}

function detectLineEnding(text: string): 'LF' | 'CRLF' {
  if (text.includes('\r\n')) return 'CRLF'
  return 'LF'
}

function calculateEditorStats(): import('@/types').EditorStats {
  if (!editor.value) {
    return {
      currentLine: 1,
      currentColumn: 1,
      paragraphType: 'paragraph',
      selectionCharCount: 0,
      selectionWordCount: 0,
      totalCharCount: 0,
      totalWordCount: 0,
      totalParagraphCount: 0,
      lineEnding: 'LF',
      invisibleCharacters: false,
    }
  }

  const selection = editor.value.state.selection
  const doc = editor.value.state.doc
  const content = doc.textContent

  // 获取段落类型信息（复用updateMenuFormattingState的逻辑）
  let contentState = 'paragraph'
  if (editor.value.isActive('heading')) {
    contentState = editor.value.getAttributes('heading').level
  } else if (editor.value.isActive('blockquote')) {
    contentState = 'blockquote'
  } else if (editor.value.isActive('bulletList')) {
    contentState = 'bulletList'
  } else if (editor.value.isActive('orderedList')) {
    contentState = 'orderedList'
  } else if (editor.value.isActive('taskList')) {
    contentState = 'taskList'
  } else if (editor.value.isActive('codeBlock')) {
    contentState = 'codeBlock'
  }

  return {
    currentLine: getCurrentLineFromPos(selection.from),
    currentColumn: getCurrentColumnFromPos(selection.from),
    paragraphType: getParagraphTypeName({ type: contentState }),
    selectionCharCount: getSelectionCharCount(selection),
    selectionWordCount: getSelectionWordCount(selection),
    totalCharCount: content.length,
    totalWordCount: countWords(content),
    totalParagraphCount: countParagraphs(doc),
    lineEnding: detectLineEnding(content),
    // @ts-ignore
    invisibleCharacters: editor.value?.storage.invisibleCharacters?.visibility?.() ?? false,
  }
}

// Update menu state
function updateMenuFormattingState() {
  if (window.electronAPI?.windowContentChange && editor.value) {
    const textAlign = getCurrentAlignment()

    const formatting = {
      bold: editor.value.isActive('bold'),
      italic: editor.value.isActive('italic'),
      underline: editor.value.isActive('underline'),
      textAlign: textAlign,
      strikethrough: editor.value.isActive('strike'),
      script: editor.value.isActive('superscript')? 'superscript' : editor.value.isActive('subscript')? 'subscript' : 'none',
      highlight: editor.value.isActive('highlight'),
      inlineCode: editor.value.isActive('code'),
    }
    const undoRedo = {
      undo: editor.value.can().undo(),
      redo: editor.value.can().redo(),
    }

    let contentState = 'paragraph'
    let [canSink, canLift] = [false, false]
    if (editor.value.isActive('heading'))
      contentState = editor.value.getAttributes('heading').level
    else if (editor.value.isActive('heading'))
      contentState = 'paragraph'
    else if (editor.value.isActive('blockquote'))
      contentState = 'blockquote'
    else if (editor.value.isActive('bulletList')) {
      contentState = 'bulletList'
      canSink = editor.value.can().sinkListItem('listItem')
      canLift = editor.value.can().liftListItem('listItem')
    }
    else if (editor.value.isActive('orderedList')) {
      contentState = 'orderedList'
      canSink = editor.value.can().sinkListItem('listItem')
      canLift = editor.value.can().liftListItem('listItem')
    }
    else if (editor.value.isActive('taskList')) {
      contentState = 'taskList'
      canSink = editor.value.can().sinkListItem('taskItem')
      canLift = editor.value.can().liftListItem('taskItem')
    }
    else if (editor.value.isActive('codeBlock'))
      contentState = 'codeBlock'
    else
      contentState = 'paragraph'
    
    const context = {
      type: 'tiptap-editor',
      hasActiveDocument: true,
      hasSelection: !editor.value.state.selection.empty,
      undoRedo,
      contentState: { 
        type: contentState,
        canSink: canSink,
        canLift: canLift
      },
      formatting
    }
    
    window.electronAPI.windowContentChange(context)
    
    // 更新编辑器统计信息
    const stats = calculateEditorStats()
    appStore.updateActiveTabStats(stats)
  }
}

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
  updateMenuFormattingState,
})
</script>

<style lang="scss">

/*
--white: #fff;
--black: #2e2b29;
--black-contrast: #110f0e;
--gray-1: rgba(61, 37, 20, .05);
--gray-2: rgba(61, 37, 20, .08);
--gray-3: rgba(61, 37, 20, .12);
--gray-4: rgba(53, 38, 28, .3);
--gray-5: rgba(28, 25, 23, .6);
--green: #22c55e;
--purple: #6a00f5;
--purple-contrast: #5800cc;
--purple-light: rgba(88, 5, 255, .05);
--yellow-contrast: #facc15;
--yellow: rgba(250, 204, 21, .4);
--yellow-light: #fffae5;
--red: #ff5c33;
--red-light: #ffebe5;
--shadow: 0px 12px 33px 0px rgba(0, 0, 0, .06), 0px 3.618px 9.949px 0px rgba(0, 0, 0, .04);
*/

/* Modern editor styles */
.tiptap {
  /*color: #888888;*/
  line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  
  :first-child {
    margin-top: 0;
  }

  // Focus styles
  .has-focus {
    color: inherit;
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

  /* Task list styles */
  ul[data-type="taskList"] {
    list-style: none;
    margin-left: 0;
    padding: 0;
    
    li {
      display: flex;
      align-items: flex-start;
      
      > label {
        flex: 0 0 auto;
        margin-right: 0.5rem;
        user-select: none;
      }

      > div {
        flex: 1 1 auto;
      }
    }

    input[type='checkbox'] {
      cursor: pointer;
    }

    ul[data-type='taskList'] {
      margin: 0;
    }
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

  /* Highlight */
  mark {
    background-color: #fef08a;
    border-radius: 0.25rem;
    box-decoration-break: clone;
    padding: 0.125rem 0.25rem;
  }

  /* Link styles */
  a {
    color: #3b82f6;
    text-decoration: underline;
    
    &:hover {
      color: #1d4ed8;
    }
  }

  blockquote {
    border-left: 4px solid #3b82f6;
    margin: 1.5rem 0;
    padding-left: 1rem;
    font-style: italic;
    color: #64748b;
  }

  /* Table-specific styling */
  table {
    border-collapse: collapse;
    margin: 0;
    overflow: hidden;
    table-layout: fixed;
    width: 100%;

    td,
    th {
      border: 1px solid rgba(61, 37, 20, .12);
      box-sizing: border-box;
      min-width: 1em;
      padding: 6px 8px;
      position: relative;
      vertical-align: top;

      > * {
        margin-bottom: 0;
      }
    }

    th {
      background-color: rgba(61, 37, 20, .05);
      font-weight: bold;
      text-align: left;
    }

    .selectedCell:after {
      background: rgba(61, 37, 20, .08);
      content: '';
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      pointer-events: none;
      position: absolute;
      z-index: 2;
    }

    .column-resize-handle {
      background-color: #6a00f5;
      bottom: -2px;
      pointer-events: none;
      position: absolute;
      right: -2px;
      top: 0;
      width: 4px;
    }
  }

  .tableWrapper {
    margin: 1.5rem 0;
    overflow-x: auto;
  }

  &.resize-cursor {
    cursor: ew-resize;
    cursor: col-resize;
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

  /* Code block */
  pre {
    background: #000000;
    border-radius: 0.5rem;
    color: #FFFFFF;
    font-family: 'JetBrainsMono', monospace;
    padding: 0.75rem 1rem;

    code {
      background: none;
      color: inherit;
      font-size: 0.8rem;
      padding: 0;
    }

    /* Code styling */
    .hljs-comment,
    .hljs-quote {
      color: #616161;
    }

    .hljs-variable,
    .hljs-template-variable,
    .hljs-attribute,
    .hljs-tag,
    .hljs-name,
    .hljs-regexp,
    .hljs-link,
    .hljs-name,
    .hljs-selector-id,
    .hljs-selector-class {
      color: #f98181;
    }

    .hljs-number,
    .hljs-meta,
    .hljs-built_in,
    .hljs-builtin-name,
    .hljs-literal,
    .hljs-type,
    .hljs-params {
      color: #fbbc88;
    }

    .hljs-string,
    .hljs-symbol,
    .hljs-bullet {
      color: #b9f18d;
    }

    .hljs-title,
    .hljs-section {
      color: #faf594;
    }

    .hljs-keyword,
    .hljs-selector-tag {
      color: #70cff8;
    }

    .hljs-emphasis {
      font-style: italic;
    }

    .hljs-strong {
      font-weight: 700;
    }
  }

  /* Image */
  img {
    display: block;
    height: auto;
    max-width: 100%;
    border-radius: 0.5rem;

    &.ProseMirror-selectednode {
      outline: 3px solid #6a00f5;
    }
  }

  /* Youtube embed */
  div[data-youtube-video] {
    cursor: move;
    margin: 1.5rem;
    
    iframe {
      border: 0.5rem solid #110f0e;
      display: block;
      min-height: 200px;
      min-width: 200px;
      outline: 0px solid transparent;
    }

    &.ProseMirror-selectednode iframe {
      outline: 3px solid #3b82f6;
      transition: outline 0.15s;
    }
  }

  // Mathematics extension styles
  .tiptap-mathematics-render {
    padding: 0 0.25rem;

    &--editable {
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #eee;
      }
    }
  }

  .tiptap-mathematics-render {
    border-radius: 0.25rem;

    &[data-type='inline-math'] {
      display: inline-block;
    }

    &[data-type='block-math'] {
      display: block;
      margin: 1rem 0;
      padding: 1rem;
      text-align: center;
    }

    &.inline-math-error,
    &.block-math-error {
      background: #ffebe5;
      color: #ff5c33;
      border: 1px solid #ae2300;
      padding: 0.5rem;
      border-radius: 0.25rem;
    }
  }

  /* Placeholder (at the top) */
  p.is-editor-empty:first-child::before {
    color: rgba(53, 38, 28, .3);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }

  /* Placeholder (on every new line) */
  .is-empty::before {
    color: rgba(53, 38, 28, .3);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
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