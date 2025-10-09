<template>
  <div class="document-editor-wrapper">
    <!-- Editor Toolbar -->
    <div class="toolbar">
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
        <button
          @click="editor?.chain().focus().toggleHighlight().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('highlight') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Highlight"
        >
          <IconHighlight class="w-5 h-5" />
        </button>
        <button
          @click="toggleLink(editor)"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('link') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Link"
        >
          <IconLink class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleCode().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('code') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Inline Code"
        >
          <IconCode class="w-5 h-5" />
        </button>
        <button
          @click="toggleMath(editor)"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Inline Math"
        >
          <IconMath class="w-5 h-5" />
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
          :class="{ 'bg-gray-200': 'left' === getCurrentAlignment(editor) }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Left"
        >
          <IconAlignLeft class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('center').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'center' === getCurrentAlignment(editor) }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Center"
        >
          <IconAlignCenter class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('right').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'right' === getCurrentAlignment(editor) }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Align Right"
        >
          <IconAlignRight class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('justify').run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': 'justify' === getCurrentAlignment(editor) }"
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
          <IconFunction class="w-5 h-5" />
        </button>
        <button
          @click="editor?.chain().focus().toggleCodeBlock().run()"
          :disabled="!editor"
          :class="{ 'bg-gray-200': editor?.isActive('codeBlock') }"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Code Block"
        >
          <IconSourceCode class="w-5 h-5" />
        </button>
      </div>
      
      <!-- Spacer -->
      <div class="toolbar-spacer"></div>
      
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
    <div class="editor-content-wrapper">
        <EditorContent v-if="editor" :editor="editor" class="w-full max-w-3xl my-4 mx-auto"/>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { ref, toRef, watch, onBeforeUnmount, nextTick } from 'vue'
import { EditorContent, useEditor, VueNodeViewRenderer } from '@tiptap/vue-3'
import { generateJSON, Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import { Transaction } from '@tiptap/pm/state'
import { getHierarchicalIndexes, TableOfContents } from '@tiptap/extension-table-of-contents'
import { UndoRedo, Dropcursor, Gapcursor, TrailingNode, Focus, Placeholder } from '@tiptap/extensions'

import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
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

import 'katex/dist/katex.min.css'
import { InlineMath, BlockMath, migrateMathStrings } from '@tiptap/extension-mathematics'

import { ListItem, BulletList, OrderedList, ListKeymap, TaskItem, TaskList } from '@tiptap/extension-list'

import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Code from '@tiptap/extension-code'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyleKit } from '@tiptap/extension-text-style'

import InvisibleCharacters from '@tiptap/extension-invisible-characters'

import { iwCodeBlockView, iwImageView, iwTableView, iwMathBlockView, iwPopupTools, iwLinkPopupTool, iwMathPopupTool, iwTypography } from '@/components/common/tiptap'

import { iwProofreadExtension } from '@/components/common/tiptap/iw-proofread'

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconHighlight,
  IconCode,
  IconMath,
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
  IconFunction,
  IconSourceCode,
  IconMaximize
} from '@tabler/icons-vue'

import type { FileTab } from '@/types'
import { notify } from '@/utils/notifications'
import pathUtils from '@/utils/pathUtils'
import { MarkdownTocProvider } from '@/services/toc/MarkdownTocProvider'
import { setHeading, getContentState, getCurrentAlignment } from './markdown-editor/state' 
import { calculateFileStats } from './markdown-editor/stats' 
import { onFileHandlerDrop, onFileHandlerPaste, onPlaceholder } from './markdown-editor/on'
import { 
  toggleLink,
  toggleMath,
  insertTable,
  insertImage, 
  insertAudio, 
  insertVideo, 
  insertMathBlock, 
} from './markdown-editor/insert'
import { convertContentFrom } from '@/import-export'
import { onEditorMenuAction } from './markdown-editor/menu-action'
import { useAppStore } from '@/stores/app'
import type { WindowContentState } from '@/types'
import { DocumentType } from '@/types'

// Props
interface Props {
  tab: FileTab
}

const props = defineProps<Props>()

const appStore = useAppStore()

// Loading flag for this editor
const isLoading = ref(false)

// Toolbar state
const currentHeading = ref('paragraph')
const isFullscreen = ref(false)

// create a lowlight instance
const lowlight = createLowlight(all)
lowlight.register('html', html)
lowlight.register('css', css)
lowlight.register('js', js)
lowlight.register('ts', ts)

const extensions = [
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
    mode: 'all',
  }),

  Document, Heading, Paragraph, Text, HardBreak,
  Emoji.configure({
    emojis: gitHubEmojis,
    enableEmoticons: true,
  }),
  HorizontalRule,

  TableCell, TableHeader, TableRow,
  Table.configure({
    resizable: true 
  }).extend({
    addNodeView() {
      return VueNodeViewRenderer(iwTableView)
    }
  }),
  
  Image.configure({
    allowBase64: true
  }).extend({
    addAttributes() {
      return {
        src: {
          default: null,
          parseHTML: (element: any) => {
            let src = element.getAttribute('src')
            // 如果是相对路径且有当前文件夹，转换为绝对路径 
            if (
              src && (src.trim() !== '') &&
              !src.startsWith('data:image/') &&
              !src.startsWith('http') &&
              !src.startsWith('file://') &&
              pathUtils.isRelativePath(src) &&
              props.tab.path
            ) {
              const localDir = pathUtils.parentDir(props.tab.path)
              src = pathUtils.join(localDir, decodeURIComponent(src))
              src = `file://${src}`
            }
            return src
          },
          renderHTML: (attributes: Record<string, any>) => ({ src: attributes.src })
        },
        alt: {
          default: null,
        },
        title: {
          default: null,
        },
        width: {
          default: null,
        },
        height: {
          default: null,
        },
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
    addPasteRules() {
      return [
        {
          find: /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?)/gi,
          handler: ({ state, range, match }) => {
            const url = match[1]
            const { tr } = state
            const { from, to } = range
            
            // 获取当前段落
            const $from = tr.doc.resolve(from)
            const paragraph = $from.parent
            
            // 如果当前段落只有这个 URL 文本（或为空），替换整个段落
            if (paragraph.textContent.trim() === match[0].trim()) {
              const paragraphStart = $from.before()
              const paragraphEnd = $from.after()
              tr.replaceWith(paragraphStart, paragraphEnd, this.type.create({ src: url }))
            } else {
              // 否则，在段落后插入新的图片块
              tr.delete(from, to)
              const imageNode = this.type.create({ src: url })
              const insertPos = $from.after()
              tr.insert(insertPos, imageNode)
            }
          }
        }
      ]
    },
    addNodeView() {
      return VueNodeViewRenderer(iwImageView)
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
      return VueNodeViewRenderer(iwCodeBlockView)
    },
  }).configure({ lowlight }),
  
  InlineMath.configure({
    onClick: undefined, // 移除prompt，让PopupTools接管
    // Options for the KaTeX renderer. See here: https://katex.org/docs/options.html
    katexOptions: {
      throwOnError: false, // don't throw an error if the LaTeX code is invalid
      macros: {
        '\\R': '\\mathbb{R}', // add a macro for the real numbers
        '\\N': '\\mathbb{N}', // add a macro for the natural numbers
      },
    },
  }),
  BlockMath.extend({
    draggable: true,
    addNodeView() {
      return VueNodeViewRenderer(iwMathBlockView)
    },
  }).configure({
    katexOptions: {
      throwOnError: false,
      macros: {
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
      },
    },
  }),

  BulletList, OrderedList, ListItem, ListKeymap,
  TaskList,
  TaskItem.configure({
    nested: true,
  }),

  
  Bold, Italic, Strike, Underline,
  TextAlign.configure({
    types: ['heading', 'paragraph', 'image', 'caption'],
  }),
  Code, 
  iwPopupTools.configure({
    tools: [new iwLinkPopupTool(), new iwMathPopupTool()]
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      rel: 'noopener noreferrer nofollow'
    }
  }),
  Subscript, Superscript, iwTypography,
  Highlight,
  
  TextStyleKit,

  /*
  InvisibleCharacters和Placeholder不能一起存在
  会导致回车换行时，内容逆向滚动
  InvisibleCharacters和inline code不能一起存在，隔离了css的连续性
  */
  InvisibleCharacters,
  //Placeholder.configure({
  //  placeholder: onPlaceholder,
  //}),

  // 拼写检查扩展
  iwProofreadExtension.configure({
    /*
    engineType: 'typo',
    language: 'en',
    engineOptions: {
      dictionaryPath: '/dictionaries'
    },
    */
   
    engineType: 'languagetool',
    language: 'en-US',
    engineOptions: {
      // 可选：自定义 API URL，默认为官方免费 API
      apiUrl: 'https://api.languagetool.org/v2/check',
      // 可选：请求超时时间，默认 5000ms
      timeout: 8000
    },

    enabled: true,
    showErrors: true,
    debounceTime: 2000,
    maxWorkers: 4
  })
]

// Create TipTap editor instance
const editor = useEditor({
  extensions,
  content: '',
  editorProps: {
    attributes: {
      class: 'flex-1 flex-shrink-0 p-[3rem] pb-[30vh] focus:outline-none',
      spellcheck: 'false',
    },
  },
  onUpdate: () => {
    // 当非加载状态下，内容发生变化，使用新的dirty判断逻辑
    if (!isLoading.value && editor.value) {
      const isDirty = !(props.tab.savedCheckPoint === undoDepth(editor.value.state))
      appStore.updateTabState(props.tab.id, { isDirty })
    }
  },
  onSelectionUpdate: () => {
    updateEditorState()
  },
  onCreate: (options) => {
    migrateMathStrings(options.editor)
    loadTabContent(options.editor).then(async () => {
      updateEditorState()
      setFirstLineIndent(props.tab.editState?.firstLineIndent || true)
      setSmartPunctuation(props.tab.editState?.smartPunctuation || true)
      setInvisibleCharacters(props.tab.editState?.invisibleCharacters || true)
      setProofreadErrorsDisplay(props.tab.editState?.showProofreadErrors || true)
      setProofread(props.tab.editState?.proofread || true)
    })
  }
})


// Watch for editor state changes and update toolbar
watch(() => editor.value, (newEditor) => {
  if (newEditor) {
    appStore.updateTabState(props.tab.id, { editorInstance: newEditor, tocProvider: new MarkdownTocProvider(newEditor)})
  }
}, { immediate: true })

// Cleanup
onBeforeUnmount(() => {
  appStore.cleanTab(props.tab.id)
  
  // 等待下一帧后再销毁编辑器
  nextTick(() => {
    editor.value?.destroy()
  })
})

// Load content into editor
async function loadTabContent(editorInstance: Editor) {
  if (isLoading.value || !window.electronAPI || !editorInstance) return
  isLoading.value = true

  let lineEnding = props.tab.editState?.lineEnding ?? 'LF'
  try {
    // Load from file if path exists and content is empty
    if (props.tab.path) {
      const content = await window.electronAPI.readFile(props.tab.path)
      if (content !== null) {
        const contentConverted = await convertContentFrom(content, pathUtils.extension(props.tab.path))
        if (contentConverted === null) {
          throw new Error('Unsupport file format')
        }
        //editorInstance.commands.setContent(contentConverted, { emitUpdate: false })
        // 第一次加载文件内容，忽略掉 undo
        editorInstance.chain().command(({ tr, dispatch }: { tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
          if (dispatch) {
            tr.setMeta('addToHistory', false)
            const json = generateJSON(contentConverted.content, extensions)
            const doc = editorInstance.schema.nodeFromJSON(json)
            tr.replaceWith(0, tr.doc.content.size, doc.content)
            dispatch(tr)
          }
          return true
        })
        .run()
        lineEnding = contentConverted.lineEnding || 'LF'
      }
    }
    
    // 等待DOM更新后设置初始历史状态
    await nextTick()
    // 文件加载完成后，设置当前状态为"干净"状态
    appStore.updateTabState(props.tab.id, { 
      isDirty: false,
      savedCheckPoint: undoDepth(editorInstance.state)
    })
    setLineEnding(lineEnding)
  } catch (error) {
    notify.error(`加载文档内容失败: ${error instanceof Error ? error.message : String(error)}`, '编辑器错误')
  } finally {
    isLoading.value = false
  }
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
  switch (action) {
    case 'line-ending-crlf':
      setLineEnding('CRLF')
      return true
    case 'line-ending-lf':
      setLineEnding('LF')
      return true

    case 'toggle-first-line-indent':
      toggleFirstLineIndent()
      return true
    case 'toggle-space-line-break':
      toggleInvisibleCharacters()
      return true

    case 'toggle-smart-punctuation':
      toggleSmartPunctuation()
      return true
    case 'text-replace':
      notify.error(`${action}`, 'Not implemented')
      return true
    case 'preferences-text-replacement':
      notify.error(`${action}`, 'Not implemented')
      return true

    case 'toggle-spelling-grammar-errors':
      toggleProofreadErrorsDisplay()
      return true
    case 'check-whole-document':
      if (editor.value) {
        editor.value.commands.proofreadWhole()
      }
      return true
    case 'check-spelling-grammar-while-typing':
      toggleProofread()
      return true
    case 'preferences-spelling-grammar':
      notify.error(`${action}`, 'Not implemented')
      return true
  }

  return onEditorMenuAction(editor.value, action)
}

// Update editor state to Main Menu and Tab Stats
function updateEditorState() {
  if (window.electronAPI?.windowContentChange && editor.value) {
    const textAlign = getCurrentAlignment(editor.value)

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
    const windowContentState: WindowContentState = {
      type: DocumentType.MARKDOWN_EDITOR,
      hasActiveDocument: true,
      undoRedo,
      hasSelection: !editor.value.state.selection.empty,
      content: getContentState(editor.value),
      // @ts-expect-error - formatting types
      formatting
    }
    currentHeading.value = windowContentState.content?.type as string    
    window.electronAPI.windowContentChange(windowContentState)
    
    // 更新编辑器统计信息
    const stats = calculateFileStats(editor.value)
    appStore.updateTabState(props.tab.id, { fileStats: stats })
  }
}

function setLineEnding(lineEnding: 'CRLF' | 'LF') {
  appStore.updateTabState(props.tab.id, { editState: { lineEnding } })
  window.electronAPI.windowContentChange({ edit: { lineEnding } })
}

function toggleFirstLineIndent() {
  setFirstLineIndent( !props.tab.editState?.firstLineIndent )
}

function setFirstLineIndent(has: boolean) {
  const firstLineIndent: boolean = !!has

  const editorElement = document.querySelector('.tiptap') as HTMLElement;
  if (editorElement) {
    if (firstLineIndent) {
      editorElement.classList.add('first-line-indent')
    } else {
      editorElement.classList.remove('first-line-indent')
    }
  }
 
  appStore.updateTabState(props.tab.id, { editState: { firstLineIndent } })
  window.electronAPI?.windowContentChange?.({
    edit: { firstLineIndent }
  })
}

function toggleInvisibleCharacters() {
  setInvisibleCharacters(!props.tab.editState?.invisibleCharacters)
}

function setInvisibleCharacters(visible: boolean) {
  const invisibleCharacters = !!visible

  if (invisibleCharacters === true) {
    editor.value?.commands.showInvisibleCharacters()
  } else {
  editor.value?.commands.hideInvisibleCharacters()
  }

  appStore.updateTabState(props.tab.id, { editState: { invisibleCharacters } })
  window.electronAPI?.windowContentChange?.({
    edit: { invisibleCharacters }
  })
}

function toggleSmartPunctuation() {
  setSmartPunctuation(!props.tab.editState?.smartPunctuation)
}

function setSmartPunctuation(has: boolean) {
  const smartPunctuation = !!has

  editor.value?.commands.setSmartPunctuation(has)
  
  appStore.updateTabState(props.tab.id, { editState: { smartPunctuation } })
  window.electronAPI?.windowContentChange?.({
    edit: { smartPunctuation }
  })
}

function toggleProofreadErrorsDisplay() {
  setProofreadErrorsDisplay(!props.tab.editState?.showProofreadErrors)
}

function setProofreadErrorsDisplay(visible: boolean) {
  const showProofreadErrors = !!visible

  editor.value?.commands.showProofreadErrors(showProofreadErrors)
  
  appStore.updateTabState(props.tab.id, { editState: { showProofreadErrors } })
  window.electronAPI?.windowContentChange?.({
    edit: { showProofreadErrors }
  })
}

function toggleProofread() {
  setProofread(!props.tab.editState?.proofread)
}

function setProofread(enable: boolean) {
  const proofread = !!enable

  if (proofread === true) {
      editor.value?.commands.enableProofread()
  } else {
      editor.value?.commands.disableProofread()
  }

  appStore.updateTabState(props.tab.id, { editState: { proofread } })
  window.electronAPI?.windowContentChange?.({
    edit: { proofread }
  })

}

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
})
</script>

<style lang="scss">
</style>