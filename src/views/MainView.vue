<template>
  <div
    v-if="appStore.isCleanMode"
    class="fixed inset-x-0 top-0 z-40 h-3"
    @mouseenter="revealCleanModeChrome()"
  />

  <transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-3 scale-[0.985]"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-500 ease-out"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-3 scale-[0.985]"
  >
    <div
      v-if="appStore.isCleanMode && showCleanModeChrome"
      class="fixed left-1/2 top-3 z-50 -translate-x-1/2"
      @mouseenter="clearCleanModeChromeTimer"
      @mouseleave="scheduleCleanModeChromeHide(500)"
    >
      <div class="no-drag flex items-center gap-3 rounded-full border border-border-separator bg-background-window/92 px-3 py-1.5 shadow-lg backdrop-blur-md">
        <div class="max-w-80 truncate text-sm text-text-secondary">
          {{ activeDocumentTitle }}
        </div>
        <div class="h-4 w-px bg-border-separator" />
        <button
          class="toolbar-button text-sm"
          @click="appStore.setCleanMode(false)"
        >
          Exit Clean Mode
        </button>
      </div>
    </div>
  </transition>

  <!-- Workzone Wrapper -->
  <div class="mainview">
  
    <!-- Left Sidebar -->
    <LeftSidebar v-if="appStore.isLeftSidebarVisible && !appStore.isCleanMode" />
    
    <!-- Workzone -->
    <div class="workzone0">
      <!-- Title Bar -->
      <TitleBar v-if="!appStore.isCleanMode" />

      <!-- Document Workarea -->
      <div class="workzone1">

        <!-- Document Page -->
        <div class="document-page-wrapper">

          <!-- Welcome Page (No tabs open) -->
          <WelcomePage v-if="appStore.tabs.length === 0" />
          
          <!-- Document Pages for each tab -->
          <div 
            v-for="tab in appStore.tabs" 
            :key="tab.id"
            :class="tab.isActive ? 'document-page' : 'hidden'"
          >
            <!-- Markdown Editor Page -->
            <MarkdownEditorPage 
              v-if="tab.documentType === DocumentType.MARKDOWN_EDITOR"
              ref="markdownEditorRefs"
              :tab="tab"
            />
            
            <!-- Image Viewer Page -->
            <ImageViewerPage 
              v-else-if="tab.documentType === DocumentType.IMAGE_VIEWER"
              ref="imageViewerRefs"
              :tab="tab"
            />
            
            <!-- PDF Viewer Page -->
            <PDFViewerPage 
              v-else-if="tab.documentType === DocumentType.PDF_VIEWER"
              ref="pdfViewerRefs"
              :tab="tab"
            />
            
            <!-- Fallback for unknown types -->
            <div v-else class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <IconAlertTriangle class="w-16 h-16 mx-auto mb-4 text-status-warning" />
                <div class="text-xl mb-2 text-text-secondary">不支持的文件类型</div>
                <div class="text-base mx-auto max-w-xl mb-2 text-text-tertiary">The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding.</div>
                <div class="flex gap-3 justify-center">
                  <button 
                    @click="openWithShell(tab.path)"
                    class="button button-primary w-44 mb-4 h-9"
                  >
                    <IconFolderOpen class="icon-base" />
                    <span>Open Anyway</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Right Sidebar (AI Chat) -->
        <RightSidebar v-show="appStore.isRightSidebarVisible && !appStore.isCleanMode" />
      </div>
    </div>
  </div>
  
  <!-- Status Bar -->
  <StatusBar v-if="appStore.isStatusbarVisible && !appStore.isCleanMode"/>
  
  <!-- Update Dialog -->
  <UpdateDialog
    v-if="updateDialogData"
    :updateInfo="updateDialogData"
    :visible="showUpdateDialog"
    @update="handleUpdateConfirm"
    @later="handleUpdateLater"
    @skip="handleUpdateSkip"
    @close="handleUpdateDialogClose"
    @view-details="handleViewUpdateDetails"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAiStore } from '@/ai/store/ai'
import { DocumentType } from '@/types'
import type { UpdateInfo } from '@/updater/types'
import type { SnapshotRequestEvent } from '@/ai/ipc'
import { notify } from '@/utils/notifications'
import updaterService from '@/updater/UpdaterService'
import { buildSerializedSnapshot } from '@/ai/snapshot/SnapshotSerializer'
import TitleBar from '@/components/TitleBar.vue'
import LeftSidebar from '@/components/LeftSidebar.vue'
import RightSidebar from '@/components/RightSidebar.vue'
import StatusBar from '@/components/StatusBar.vue'
import WelcomePage from '@/components/pages/WelcomePage.vue'
import MarkdownEditorPage from '@/components/pages/MarkdownEditorPage.vue'
import ImageViewerPage from '@/components/pages/ImageViewerPage.vue'
import PDFViewerPage from '@/components/pages/PDFViewerPage.vue'
import UpdateDialog from '@/components/updater/UpdateDialog.vue'
import { 
  IconAlertTriangle,
  IconFolderOpen, 
} from '@tabler/icons-vue'

const appStore = useAppStore()
const aiStore = useAiStore()

// Refs for different page types
const markdownEditorRefs = ref<InstanceType<typeof MarkdownEditorPage>[]>([])
const imageViewerRefs = ref<InstanceType<typeof ImageViewerPage>[]>([])
const pdfViewerRefs = ref<InstanceType<typeof PDFViewerPage>[]>([])

// Update dialog state
const showUpdateDialog = ref(false)
const updateDialogData = ref<UpdateInfo | null>(null)
const showCleanModeChrome = ref(false)
let cleanModeChromeTimer: ReturnType<typeof setTimeout> | null = null
const handleWindowEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !appStore.isCleanMode) return
  appStore.setCleanMode(false)
}

// Computed
const activeTab = computed(() => appStore.activeTab)
const activeDocumentTitle = computed(() => activeTab.value?.name || 'Writing')

// Methods
function clearCleanModeChromeTimer() {
  if (cleanModeChromeTimer) {
    clearTimeout(cleanModeChromeTimer)
    cleanModeChromeTimer = null
  }
}

function scheduleCleanModeChromeHide(delay = 2200) {
  clearCleanModeChromeTimer()
  if (!appStore.isCleanMode) return

  cleanModeChromeTimer = setTimeout(() => {
    showCleanModeChrome.value = false
    cleanModeChromeTimer = null
  }, delay)
}

function revealCleanModeChrome(delay = 2200) {
  if (!appStore.isCleanMode) return
  showCleanModeChrome.value = true
  scheduleCleanModeChromeHide(delay)
}

function handleWindowMouseMove(event: MouseEvent) {
  if (!appStore.isCleanMode || showCleanModeChrome.value) return
  if (event.clientY <= 16) {
    revealCleanModeChrome()
  }
}

function getActivePageRef() {
  if (!activeTab.value) return null

  switch (activeTab.value.documentType) {
    case DocumentType.MARKDOWN_EDITOR:
      return markdownEditorRefs.value.find(ref => ref && ref.tab?.id === activeTab.value?.id)
    case DocumentType.IMAGE_VIEWER:
      return imageViewerRefs.value.find(ref => ref && ref.tab?.id === activeTab.value?.id)
    case DocumentType.PDF_VIEWER:
      return pdfViewerRefs.value.find(ref => ref && ref.tab?.id === activeTab.value?.id)
    default:
      return null
  }
}

async function openWithShell(filePath: string | undefined) {
  if (!filePath) return
  
  try {
    await window.electronAPI.openWithShell(filePath)
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件操作')
  }
}

// Update dialog methods
function handleUpdateConfirm() {
  showUpdateDialog.value = false
  updaterService.installUpdate().catch(error => {
    console.error('Failed to install update:', error)
    notify.error('更新安装失败', '请稍后重试')
  })
}

function handleUpdateLater() {
  showUpdateDialog.value = false
  updateDialogData.value = null
}

function handleUpdateSkip() {
  showUpdateDialog.value = false
  updateDialogData.value = null
  // TODO: Save skipped version to avoid showing again
}

function handleUpdateDialogClose() {
  showUpdateDialog.value = false
  updateDialogData.value = null
}

function handleViewUpdateDetails() {
  if (updateDialogData.value) {
    updaterService.openReleaseNotes(updateDialogData.value.version)
  }
}

// Lifecycle
onMounted(() => {
  aiStore.init()

  document.addEventListener('keydown', handleWindowEscape, true)
  document.addEventListener('mousemove', handleWindowMouseMove, true)

  window.electronAPI.onAiRequestSnapshot?.(async (req: SnapshotRequestEvent) => {
    type TipTapEditor = import('@tiptap/core').Editor
    let editor: TipTapEditor | null = null
    let editorFilePath: string | null = null

    if (!req.filePath) {
      const activeTab = appStore.activeTab
      editor = activeTab?.editorInstance as TipTapEditor | null ?? null
      editorFilePath = activeTab?.path ?? null
    } else {
      const target = req.filePath.replace(/\\/g, '/').toLowerCase()
      const matchingTab = appStore.tabs.find(tab => {
        const tabPath = tab.path?.replace(/\\/g, '/').toLowerCase()
        return tabPath === target
      })
      if (matchingTab) {
        editor = matchingTab.editorInstance as TipTapEditor | null ?? null
        editorFilePath = matchingTab.path ?? null
      }
    }

    const snapshot = await buildSerializedSnapshot(
      req.filePath,
      editor,
      editorFilePath,
      null
    )

    window.electronAPI.aiSnapshotResponse?.({
      requestId: req.requestId,
      filePath: req.filePath,
      snapshot,
    })
  })

  // 监听更新可用状态
  watch(() => updaterService.isUpdateAvailable.value, (isAvailable) => {
    if (isAvailable && updaterService.updateInfo.value) {
      updateDialogData.value = updaterService.updateInfo.value
      showUpdateDialog.value = true
    }
  })
})

onUnmounted(() => {
  clearCleanModeChromeTimer()
  document.removeEventListener('keydown', handleWindowEscape, true)
  document.removeEventListener('mousemove', handleWindowMouseMove, true)
  aiStore.teardown()
})

watch(() => appStore.isCleanMode, (enabled) => {
  if (enabled) {
    revealCleanModeChrome(2600)
    return
  }

  clearCleanModeChromeTimer()
  showCleanModeChrome.value = false
}, { immediate: true })

// Expose methods to parent component (App.vue)
defineExpose({
  handleMenuAction: async (action: string): Promise<boolean> => {
    // First try to handle through the active page
    const activePageRef = getActivePageRef()
    if (activePageRef?.handleMenuAction) {
      return await activePageRef.handleMenuAction(action)
    }
    return false
  }
})
</script>
