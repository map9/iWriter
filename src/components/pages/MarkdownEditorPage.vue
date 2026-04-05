<template>
  <div class="document-viewer-wrapper">
    <!-- Editor Toolbar -->
    <fieldset v-if="!appStore.isCleanMode" class="toolbar" :disabled="isReadonly">
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
      
      <!-- Clean Mode Button -->
      <div class="toolbar-group">
        <button
          @click="appStore.toggleCleanMode()"
          :disabled="!editor"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Toggle Clean Mode"
        >
          <IconMaximize class="w-5 h-5" />
        </button>
      </div>
    </fieldset>
    
    <!-- TipTap Editor -->
    <div ref="editorScrollRef" class="editor-content-wrapper">
        <!-- Selection Highlight Layer (外部高亮层) -->
        <SelectionHighlightLayer
          v-if="editor"
          :editor="editor"
          :selection-range="editor.storage.iwSearchReplace.selectionRange"
          :show="editor.storage.iwSearchReplace.searchInSelection"
        />

        <!-- Editor Content -->
        <EditorContent
          v-if="editor"
          :editor="editor"
          class="editor-content w-full max-w-3xl my-4 mx-auto"
        />

        <!-- Search & Replace Panel -->
        <SearchReplacePanel v-if="editor" :editor="editor" />
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, toRef, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { generateJSON, Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import { Transaction } from '@tiptap/pm/state'

import 'katex/dist/katex.min.css'
import { migrateMathStrings } from '@tiptap/extension-mathematics'

import SearchReplacePanel from '@/components/common/tiptap/iw-search-replace/components/SearchReplacePanel.vue'
import { createMarkdownEditorExtensions } from '@/utils/editorExtensions'
import SelectionHighlightLayer from '@/components/common/tiptap/iw-search-replace/components/SelectionHighlightLayer.vue'

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
const TYPEWRITER_ANCHOR_RATIO = 0.38
const EDITOR_BASE_CLASS = 'flex-1 flex-shrink-0 p-[3rem] pb-[30vh] focus:outline-none'

// Loading flag for this editor
const isLoading = ref(false)
const editorScrollRef = ref<HTMLElement | null>(null)
let typewriterSyncFrame = 0
const AUTO_SAVE_DELAY = 2000
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// Toolbar state
const currentHeading = ref('paragraph')
const isReadonly = computed(() => appStore.isTabReadonly(props.tab))

function syncProofreadRuntime() {
  const currentEditor = editor.value
  if (!currentEditor) return

  if (!appStore.canRunProofread(props.tab)) {
    currentEditor.commands.showProofreadErrors(false)
    currentEditor.commands.disableProofread()
    return
  }

  currentEditor.commands.showProofreadErrors(!!props.tab.editState?.showProofreadErrors)
  if (props.tab.editState?.proofread !== false) {
    currentEditor.commands.enableProofread()
  } else {
    currentEditor.commands.disableProofread()
  }
}

function getEditorClass(focusModeEnabled: boolean): string {
  return focusModeEnabled
    ? `${EDITOR_BASE_CLASS} editor-focus-mode`
    : EDITOR_BASE_CLASS
}

function applyEditorModeClasses(currentEditor: Editor | null | undefined, focusModeEnabled: boolean) {
  if (!currentEditor) return

  currentEditor.setOptions({
    editorProps: {
      ...currentEditor.options.editorProps,
      attributes: {
        ...currentEditor.options.editorProps?.attributes,
        class: getEditorClass(focusModeEnabled),
        spellcheck: 'false',
      },
    },
  })
}

const extensions = createMarkdownEditorExtensions({
  tocUpdateCallback: content => {
    if (props.tab.tocProvider) {
      props.tab.tocProvider.updateFromTipTap?.(content)
    }
  },
  filePathResolver: (src) => {
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
  onFileHandlerDrop: (currentEditor, files, pos) => {
    if (isReadonly.value) return true
    onFileHandlerDrop(currentEditor, files, pos)
    return true
  },
  onFileHandlerPaste: (currentEditor, files, pasteContent) => {
    if (isReadonly.value) return true
    return onFileHandlerPaste(currentEditor, files, pasteContent)
  },
})

// Create TipTap editor instance
const editor = useEditor({
  extensions,
  content: '',
  editorProps: {
    attributes: {
      class: getEditorClass(appStore.isFocusMode),
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor, transaction }) => {
    // 当非加载状态下，内容发生变化，使用新的dirty判断逻辑
    if (!isLoading.value && !isReadonly.value) {
      const isDirty = !(props.tab.savedCheckPoint === undoDepth(editor.state))
      if (transaction.docChanged) {
        appStore.updateTabState(props.tab.id, { isDirty })
        scheduleAutoSave()
      }
    }

    if (transaction.docChanged) {
      updateEditorState()
    }

    scheduleTypewriterSync()
  },
  onSelectionUpdate: () => {
    updateEditorState()
    scheduleTypewriterSync()
  },
  onCreate: ({ editor }) => {
    migrateMathStrings(editor)
    loadTabContent(editor).then(async () => {
      updateEditorState()
      setFirstLineIndent(props.tab.editState?.firstLineIndent || true)
      setSmartPunctuation(props.tab.editState?.smartPunctuation || true)
      setInvisibleCharacters(props.tab.editState?.invisibleCharacters || true)
      syncProofreadRuntime()
      scheduleTypewriterSync(true)
    })
  },
  onFocus: () => {
    scheduleTypewriterSync()
  }
})


// Watch for editor state changes and update toolbar
watch(() => editor.value, (newEditor) => {
  if (newEditor) {
    newEditor.setEditable(!isReadonly.value)
    applyEditorModeClasses(newEditor, appStore.isFocusMode)
    syncProofreadRuntime()
    nextTick(() => {
      scheduleTypewriterSync(true)
    })
    appStore.updateTabState(props.tab.id, { editorInstance: newEditor, tocProvider: new MarkdownTocProvider(newEditor)})
  }
}, { immediate: true })

watch(isReadonly, (readonly) => {
  editor.value?.setEditable(!readonly)
  if (readonly && autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  syncProofreadRuntime()
})

watch(() => appStore.isTypewriterMode, (enabled) => {
  if (!enabled && typewriterSyncFrame !== 0) {
    cancelAnimationFrame(typewriterSyncFrame)
    typewriterSyncFrame = 0
    return
  }

  nextTick(() => {
    scheduleTypewriterSync(true)
  })
})

watch(() => props.tab.isActive, (isActive) => {
  if (!isActive) {
    void flushAutoSave(true)
    return
  }

  window.electronAPI?.windowContentChange?.({
    edit: {
      readonly: isReadonly.value,
      fileReadonly: !!props.tab.fileReadonly,
      editReadonly: !!props.tab.editReadonly,
    }
  })
  syncProofreadRuntime()

  nextTick(() => {
    scheduleTypewriterSync(true)
  })
}, { immediate: true })

watch(() => appStore.isFocusMode, (enabled) => {
  applyEditorModeClasses(editor.value, enabled)
}, { immediate: true })

watch(() => appStore.autoSave, (enabled) => {
  if (!enabled && autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
})

onMounted(() => {
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

// Cleanup
onBeforeUnmount(() => {
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  if (typewriterSyncFrame !== 0) {
    cancelAnimationFrame(typewriterSyncFrame)
  }

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

function scheduleTypewriterSync(force = false) {
  if (!appStore.isTypewriterMode || !editor.value || !editorScrollRef.value) return

  if (typewriterSyncFrame !== 0) {
    cancelAnimationFrame(typewriterSyncFrame)
  }

  typewriterSyncFrame = requestAnimationFrame(() => {
    typewriterSyncFrame = 0
    syncTypewriterScroll(force)
  })
}

function syncTypewriterScroll(force = false) {
  const currentEditor = editor.value
  const scrollContainer = editorScrollRef.value

  if (!appStore.isTypewriterMode || !currentEditor || !scrollContainer) return
  if ((!force && !currentEditor.view.hasFocus()) || currentEditor.view.composing) return
  if (!currentEditor.state.selection.empty) return

  try {
    const caretCoords = currentEditor.view.coordsAtPos(currentEditor.state.selection.head)
    const containerRect = scrollContainer.getBoundingClientRect()
    const targetTop = containerRect.top + containerRect.height * TYPEWRITER_ANCHOR_RATIO
    const delta = caretCoords.top - targetTop

    if (Math.abs(delta) > 1) {
      scrollContainer.scrollTop += delta
    }
  } catch (error) {
    console.warn('Failed to sync typewriter mode:', error)
  }
}

function scheduleAutoSave() {
  if (!appStore.canRunAutoSave(props.tab)) return

  if (autoSaveTimer !== null) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void flushAutoSave()
  }, AUTO_SAVE_DELAY)
}

async function flushAutoSave(allowInactive: boolean = false) {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  if (!appStore.canRunAutoSave(props.tab)) return
  if (!allowInactive && !props.tab.isActive) return

  await appStore.saveTab(props.tab, false, true)
}

function handleWindowBlur() {
  void flushAutoSave()
}

function handleVisibilityChange() {
  if (document.hidden) {
    void flushAutoSave()
  }
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

    case 'find':
      if (editor.value) {
        editor.value.commands.openSearch()
      }
      return true
    case 'replace':
      if (editor.value) {
        editor.value.commands.openReplace()
      }
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
      if (editor.value && appStore.canRunProofread(props.tab)) {
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
      content: !editor.value.state.selection.empty ? undefined : getContentState(editor.value),
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

  if (appStore.canRunProofread(props.tab)) {
    editor.value?.commands.showProofreadErrors(showProofreadErrors)
  }
  
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

  if (!appStore.canRunProofread(props.tab)) {
    editor.value?.commands.showProofreadErrors(false)
    editor.value?.commands.disableProofread()
  } else if (proofread === true) {
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
.editor-content-wrapper {
  position: relative;
  overflow: auto;
}

// Editor content 需要透明背景，让下层的高亮层透出来
.editor-content {
  position: relative;
  z-index: 2;
  // 移除背景色，让高亮层可见
  // background: transparent;
}
</style>
