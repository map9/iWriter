<template>
  <div class="document-viewer-wrapper markdown-editor-page relative">
    <!-- Editor Toolbar -->
    <fieldset v-if="!appStore.isCleanMode" class="iw-toolbar" :disabled="isReadonly">
      <!-- Undo/Redo Group -->
      <div class="join">
        <button
          @click="editor?.chain().focus().undo().run()"
          :disabled="!editor?.can().undo()"
          class="iw-toolbar-btn btn-sm join-item"
          title="Undo (⌘Z)"
        >
          <IconArrowBackUp class = "icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().redo().run()"
          :disabled="!editor?.can().redo()"
          class="iw-toolbar-btn btn-sm join-item"
          title="Redo (⌘⇧Z)"
        >
          <IconArrowForwardUp class="icon-sm" />
        </button>
      </div>
      
      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>

      <!-- Heading Dropdown -->
      <div class="iw-toolbar-group">
        <select
          v-model="currentHeading"
          @change="setHeading(editor, currentHeading)"
          :disabled="!editor"
          class="iw-select px-3"
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
      <div class="iw-toolbar-group">
        <button
          @click="editor?.chain().focus().toggleBold().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('bold') }"
          class="iw-toolbar-btn btn-sm"
          title="Bold (⌘B)"
        >
          <IconBold class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleItalic().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('italic') }"
          class="iw-toolbar-btn btn-sm"
          title="Italic (⌘I)"
        >
          <IconItalic class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleUnderline().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('underline') }"
          class="iw-toolbar-btn btn-sm"
          title="Underline (⌘U)"
        >
          <IconUnderline class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleStrike().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('strike') }"
          class="iw-toolbar-btn btn-sm"
          title="Strikethrough (⌘⇧X)"
        >
          <IconStrikethrough class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleHighlight().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('highlight') }"
          class="iw-toolbar-btn btn-sm"
          title="Highlight"
        >
          <IconHighlight class="icon-sm" />
        </button>
        <button
          @click="toggleLink(editor)"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('link') }"
          class="iw-toolbar-btn btn-sm"
          title="Link"
        >
          <IconLink class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleCode().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('code') }"
          class="iw-toolbar-btn btn-sm"
          title="Inline Code"
        >
          <IconCode class="icon-sm" />
        </button>
        <button
          @click="toggleMath(editor)"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Inline Math"
        >
          <IconMath class="icon-sm" />
        </button>
      </div>
      
      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>
      
      <!-- List Group -->
      <div class="iw-toolbar-group">
        <button
          @click="editor?.chain().focus().toggleOrderedList().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('orderedList') }"
          class="iw-toolbar-btn btn-sm"
          title="Ordered List"
        >
          <IconListNumbers class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleBulletList().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('bulletList') }"
          class="iw-toolbar-btn btn-sm"
          title="Bullet List"
        >
          <IconList class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleTaskList().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('taskList') }"
          class="iw-toolbar-btn btn-sm"
          title="Task List"
        >
          <IconListCheck class="icon-sm" />
        </button>
      </div>
      
      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>
            
      <!-- Text Alignment Group -->
      <div class="join">
        <button
          @click="editor?.chain().focus().setTextAlign('left').run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': 'left' === getCurrentAlignment(editor) }"
          class="iw-toolbar-btn btn-sm join-item"
          title="Align Left"
        >
          <IconAlignLeft class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('center').run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': 'center' === getCurrentAlignment(editor) }"
          class="iw-toolbar-btn btn-sm join-item"
          title="Align Center"
        >
          <IconAlignCenter class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('right').run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': 'right' === getCurrentAlignment(editor) }"
          class="iw-toolbar-btn btn-sm join-item"
          title="Align Right"
        >
          <IconAlignRight class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().setTextAlign('justify').run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': 'justify' === getCurrentAlignment(editor) }"
          class="iw-toolbar-btn btn-sm join-item"
          title="Align Justified"
        >
          <IconAlignJustified class="icon-sm" />
        </button>
      </div>
      
      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>
            
      <!-- Insert Group -->
      <div class="iw-toolbar-group">
        <button
          @click="insertTable(editor)"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Insert Table"
        >
          <IconTable class="icon-sm" />
        </button>
        <button
          @click="insertImage(editor)"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Insert Image"
        >
          <IconPhoto class="icon-sm" />
        </button>
        <button
          @click="insertAudio(editor)"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Insert Audio"
        >
          <IconVolume class="icon-sm" />
        </button>
        <button
          @click="insertVideo(editor)"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Insert Video"
        >
          <IconVideo class="icon-sm" />
        </button>
      </div>
      
      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>
            
      <!-- Block Group -->
      <div class="iw-toolbar-group">
        <button
          @click="editor?.chain().focus().toggleBlockquote().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('blockquote') }"
          class="iw-toolbar-btn btn-sm"
          title="Quote Block"
        >
          <IconBlockquote class="icon-sm" />
        </button>
        <button
          @click="insertMathBlock(editor)"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Math Block"
        >
          <IconFunction class="icon-sm" />
        </button>
        <button
          @click="editor?.chain().focus().toggleCodeBlock().run()"
          :disabled="!editor"
          :class="{ 'bg-base-300': editor?.isActive('codeBlock') }"
          class="iw-toolbar-btn btn-sm"
          title="Code Block"
        >
          <IconSourceCode class="icon-sm" />
        </button>
      </div>

      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>

      <!-- Print Preview Button -->
      <div class="iw-toolbar-group">
        <button
          @click="openPrintPreview"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Print Preview (⌘P)"
        >
          <IconPrinter class="icon-sm" />
        </button>
      </div>

      <!-- Spacer -->
      <div class="iw-toolbar-spacer"></div>

      <!-- Clean Mode Button -->
      <div class="iw-toolbar-group">
        <button
          @click="appStore.toggleCleanMode()"
          :disabled="!editor"
          class="iw-toolbar-btn btn-sm"
          title="Toggle Clean Mode"
        >
          <IconMaximize class="icon-sm" />
        </button>
      </div>
    </fieldset>
    
    <!-- TipTap Editor -->
    <div ref="editorScrollRef" class="editor-content-wrapper relative overflow-auto">
        <!-- Shared Range Highlight Layer -->
        <RangeHighlightLayer
          v-if="editor"
          :editor="editor"
          :scroll-container="editorScrollRef ?? null"
        />

        <!-- Editor Content -->
        <div :class="editorPageStageClass">
          <div
            class="editor-page-frame relative my-4 shadow-sm"
            :style="editorPageStyle"
          >
            <EditorContent
              v-if="editor"
              :editor="editor"
              class="editor-content relative z-2"
            />
          </div>
        </div>
    </div>

    <!-- Search & Replace Panel -->
    <SearchReplacePanel v-if="editor" :editor="editor" />
  </div>

</template>

<script setup lang="ts">
import { ref, toRef, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { generateJSON, Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import { Transaction } from '@tiptap/pm/state'

import 'katex/dist/katex.min.css'
import '@/components/pages/markdown-editor/style.scss'
import { migrateMathStrings } from '@tiptap/extension-mathematics'

import SearchReplacePanel from '@/components/common/tiptap/iw-search-replace/components/SearchReplacePanel.vue'
import { createMarkdownEditorExtensions } from '@/utils/editorExtensions'
import { RangeHighlightLayer } from '@/components/common/tiptap/iw-range-highlight'

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
  IconMaximize,
  IconPrinter
} from '@tabler/icons-vue'

import type { EditSetting, FileTab } from '@/types'
import { notify } from '@/utils/notifications'
import pathUtils from '@/utils/pathUtils'
import { computeFileContentHash } from '@/utils/fileContentHash'
import { MarkdownTocProvider } from '@/services/toc/MarkdownTocProvider'
import { setHeading, getContentState, getCurrentAlignment } from './markdown-editor/state' 
import { calculateFileStats } from './markdown-editor/stats' 
import { onFileHandlerDrop, onFileHandlerPaste } from './markdown-editor/on'
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
import { getAllMarkdownThemes, getMarkdownThemeScreenBackground } from '@/components/print/markdownThemes'

// Props
interface Props {
  tab: FileTab
}

const props = defineProps<Props>()
const { t } = useI18n()

const appStore = useAppStore()
const TYPEWRITER_ANCHOR_RATIO = 0.38
const EDITOR_BASE_CLASS = 'flex-1 shrink-0 p-[3rem] pb-[30vh] focus:outline-none'

// Loading flag for this editor
const isLoading = ref(false)
const editorScrollRef = ref<HTMLElement | null>(null)
let typewriterSyncFrame = 0
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// Toolbar state
const currentHeading = ref('paragraph')
const isReadonly = computed(() => appStore.isTabReadonly(props.tab))
const editorPageStageClass = computed(() => {
  const baseClass = 'editor-page-stage box-border flex w-full justify-center'

  if (appStore.markdownEditorPageMode === 'fluid') {
    return `${baseClass} min-w-0`
  }

  return `${baseClass} min-w-max px-4`
})
const editorPageStyle = computed(() => {
  const themeId = appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId
  const backgroundColor = getMarkdownThemeScreenBackground(themeId) ?? 'var(--color-base-100)'

  switch (appStore.markdownEditorPageMode) {
    case 'fixed-1280':
      return { width: '1280px', minWidth: '1280px', backgroundColor }
    case 'fluid':
      return { width: '100%', minWidth: '480px', backgroundColor }
    case 'fixed-768':
    default:
      return { width: '768px', minWidth: '768px', backgroundColor }
  }
})

function syncEditMenuState(overrides: Partial<EditSetting> = {}) {
  window.electronAPI?.windowContentChange?.({
    edit: {
      ...props.tab.editState,
      ...overrides,
      readonly: isReadonly.value,
      fileReadonly: !!props.tab.fileReadonly,
      editReadonly: !!props.tab.editReadonly,
    }
  })
}

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
  editSetting: appStore.globalEditSetting,
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
      setFirstLineIndent(props.tab.editState?.firstLineIndent ?? true)
      setSmartPunctuation(props.tab.editState?.smartPunctuation ?? true)
      setInvisibleCharacters(props.tab.editState?.invisibleCharacters ?? true)
      syncProofreadRuntime()
      if (props.tab.isActive) {
        syncEditMenuState()
      }
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
      setScreenTheme(appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId)
      scheduleTypewriterSync(true)
    })
    appStore.updateTabState(props.tab.id, {
      editorInstance: newEditor,
      tocProvider: new MarkdownTocProvider(newEditor, {
        historyScopeId: props.tab.id,
        isActive: () => props.tab.isActive,
      })
    })
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

  syncEditMenuState()
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

watch(() => appStore.autoSaveDelayMs, () => {
  if (autoSaveTimer !== null && appStore.canRunAutoSave(props.tab)) {
    scheduleAutoSave()
  }
})

// 当 Proofread 引擎配置变更时，清除旧 decorations 并用新引擎重新检查
watch(
  () => ({
    engineType: appStore.globalEditSetting.proofreadEngineType,
    language: appStore.globalEditSetting.proofreadLanguage,
    apiUrl: appStore.globalEditSetting.proofreadApiUrl,
    apiKey: appStore.globalEditSetting.proofreadApiKey,
  }),
  (newVal) => {
    if (!editor.value || !appStore.canRunProofread(props.tab)) return
    const engineOptions = newVal.engineType === 'typo'
      ? { dictionaryPath: '/dictionaries' }
      : {
          apiUrl: newVal.apiUrl ?? 'https://api.languagetool.org/v2/check',
          apiKey: newVal.apiKey || undefined,
          timeout: 8000
        }
    editor.value.commands.reinitializeEngine({
      engineType: newVal.engineType ?? 'languagetool',
      language: newVal.language ?? 'en-US',
      engineOptions,
    })
  }
)

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
  let loadedPendingImport = false
  let lastSavedHash: string | undefined
  try {
    // Load from file if path exists and content is empty
    if (props.tab.path) {
      const content = await window.electronAPI.readFile(props.tab.path)
      if (content === null) {
        throw new Error(`Failed to read file: ${props.tab.path}`)
      }

      lastSavedHash = computeFileContentHash(content)
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
    } else if (props.tab.pendingImport?.markdown) {
      const contentConverted = await convertContentFrom(props.tab.pendingImport.markdown, 'md')
      if (contentConverted === null) {
        throw new Error('Unsupport imported markdown content')
      }
      editorInstance.chain().command(({ tr, dispatch }: { tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
        if (dispatch) {
          tr.setMeta('addToHistory', false)
          const json = generateJSON(contentConverted.content, extensions)
          const doc = editorInstance.schema.nodeFromJSON(json)
          tr.replaceWith(0, tr.doc.content.size, doc.content)
          dispatch(tr)
        }
        return true
      }).run()
      lineEnding = contentConverted.lineEnding || 'LF'
      loadedPendingImport = true
    }
    
    // 等待DOM更新后设置初始历史状态
    await nextTick()
    // 文件加载完成后，设置当前状态为"干净"状态
    appStore.updateTabState(props.tab.id, { 
      isDirty: loadedPendingImport,
      lastSavedHash,
      diskState: 'normal',
      pendingImport: undefined,
      savedCheckPoint: loadedPendingImport ? -1 : undoDepth(editorInstance.state)
    })
    setLineEnding(lineEnding)
  } catch (error) {
    notify.error(
      t('notify.editor.loadFailed', { filepath: props.tab.path || 'Unknown File', error: error instanceof Error ? error.message : String(error) }),
      t('notify.editor.errorContext')
    )
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
  }, appStore.autoSaveDelayMs)
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
function openPrintPreview() {
  if (editor.value) {
    appStore.openPrintPreview(editor.value.getHTML(), props.tab.name, { mode: 'print' })
  }
}

async function handleMenuAction(action: string): Promise<boolean> {
  switch (action) {
    case 'print':
      openPrintPreview()
      return true
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
      notify.error(`${action}`, t('notify.editor.notImplemented'))
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
      edit: {
        ...props.tab.editState,
        readonly: isReadonly.value,
        fileReadonly: !!props.tab.fileReadonly,
        editReadonly: !!props.tab.editReadonly,
      },
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
  syncEditMenuState({ lineEnding })
}

function toggleFirstLineIndent() {
  setFirstLineIndent( !props.tab.editState?.firstLineIndent )
}

function getCurrentEditorElement(): HTMLElement | null {
  return editorScrollRef.value?.querySelector('.tiptap') as HTMLElement | null
}

function setScreenTheme(themeId: string) {
  // Use editor.view.dom directly so the class is applied as soon as the editor
  // is created, without waiting for EditorContent to move the DOM element into
  // editorScrollRef (which happens in a separate nextTick and would otherwise
  // race with our own nextTick, leaving the theme unapplied on startup).
  const editorElement = (editor.value?.view.dom as HTMLElement | null) ?? getCurrentEditorElement()
  if (!editorElement) return

  for (const theme of getAllMarkdownThemes()) {
    editorElement.classList.remove(`markdown-theme-${theme.id}`)
  }
  editorElement.classList.add(`markdown-theme-${themeId}`)
}

function setFirstLineIndent(has: boolean) {
  const firstLineIndent: boolean = !!has

  const editorElement = getCurrentEditorElement()
  if (editorElement) {
    if (firstLineIndent) {
      editorElement.classList.add('first-line-indent')
    } else {
      editorElement.classList.remove('first-line-indent')
    }
  }
 
  appStore.updateTabState(props.tab.id, { editState: { firstLineIndent } })
  syncEditMenuState({ firstLineIndent })
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
  syncEditMenuState({ invisibleCharacters })
}

watch(
  () => appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId,
  (themeId) => {
    nextTick(() => setScreenTheme(themeId))
  },
  { immediate: true },
)

function toggleSmartPunctuation() {
  setSmartPunctuation(!props.tab.editState?.smartPunctuation)
}

function setSmartPunctuation(has: boolean) {
  const smartPunctuation = !!has

  editor.value?.commands.setSmartPunctuation(has)
  
  appStore.updateTabState(props.tab.id, { editState: { smartPunctuation } })
  syncEditMenuState({ smartPunctuation })
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
  syncEditMenuState({ showProofreadErrors })
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
  syncEditMenuState({ proofread })

}

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
})
</script>
