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
      <div class="no-drag flex items-center gap-3 rounded-full border border-base-300 bg-base-100/95 px-3 py-1.5 shadow-sm backdrop-blur-md">
        <div class="max-w-80 truncate text-sm text-base-content/65">
          {{ activeDocumentTitle }}
        </div>
        <div class="h-4 w-px bg-base-300" />
        <button
          class="iw-btn btn-sm btn-ghost rounded-full px-3 normal-case"
          @click="appStore.setCleanMode(false)"
        >
          Exit Clean Mode
        </button>
      </div>
    </div>
  </transition>

  <!-- MainView Wrapper -->
  <div class="flex flex-1 flex-row overflow-hidden bg-base-100">
  
    <!-- Left Sidebar -->
    <LeftSidebar v-if="appStore.isLeftSidebarVisible && !appStore.isCleanMode" />
    
    <!-- Workzone Wrapper 0 -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Title Bar -->
      <TitleBar v-if="!appStore.isCleanMode" />

      <!-- Workzone Wrapper 1 -->
      <div class="flex flex-1 flex-row overflow-hidden">

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
            <UnknownPage v-else
              :tab="tab"
            />
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
    v-if="updaterService.updateInfo.value"
    :updateInfo="updaterService.updateInfo.value"
    :visible="updaterService.dialogVisible.value"
    @update="handleUpdateConfirm"
    @later="handleUpdateLater"
    @skip="handleUpdateSkip"
    @close="handleUpdateDialogClose"
    @view-details="handleViewUpdateDetails"
  />

  <!-- Preferences Dialog -->
  <PreferencesDialog
    :visible="appStore.showPreferencesDialog"
    :initialTab="appStore.preferencesInitialTab"
    @close="appStore.closePreferences()"
  />

  <!-- Print Preview Dialog -->
  <PrintPreviewDialog
    :visible="appStore.showPrintPreviewDialog"
    :html="appStore.printPreviewHtml"
    :title="appStore.printPreviewTitle"
    @close="appStore.closePrintPreview()"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAiStore } from '@/ai/store/ai'
import { DocumentType } from '@/types'
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
import '@/components/pages/markdown-editor/style.scss'
import ImageViewerPage from '@/components/pages/ImageViewerPage.vue'
import PDFViewerPage from '@/components/pages/PDFViewerPage.vue'
import UnknownPage from '@/components/pages/UnknownPage.vue'
import UpdateDialog from '@/components/updater/UpdateDialog.vue'
import PreferencesDialog from '@/components/preferences/PreferencesDialog.vue'
import PrintPreviewDialog from '@/components/print-preview/PrintPreviewDialog.vue'

const appStore = useAppStore()
const aiStore = useAiStore()

// Refs for different page types
const markdownEditorRefs = ref<InstanceType<typeof MarkdownEditorPage>[]>([])
const imageViewerRefs = ref<InstanceType<typeof ImageViewerPage>[]>([])
const pdfViewerRefs = ref<InstanceType<typeof PDFViewerPage>[]>([])

// Update dialog：可见性与数据都集中在 updaterService 中，此处只保留句柄
// （模板直接读 updaterService.dialogVisible / updaterService.updateInfo）

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

// Update dialog methods
function handleUpdateConfirm() {
  const statusType = updaterService.status.value.type

  if (statusType === 'downloaded') {
    updaterService.closeDialog()
    updaterService.installUpdate().catch(error => {
      console.error('Failed to install update:', error)
      notify.error('更新安装失败', '请稍后重试')
    })
    return
  }

  if (statusType === 'available') {
    updaterService.downloadUpdate().catch(error => {
      console.error('Failed to download update:', error)
      notify.error('更新下载失败', '请稍后重试')
    })
  }
}

function handleUpdateLater() {
  updaterService.closeDialog()
}

function handleUpdateSkip() {
  const version = updaterService.updateInfo.value?.version
  if (version) {
    updaterService.updateConfig({ skipVersion: version }).catch(error => {
      console.error('Failed to save skipped version:', error)
      notify.error('跳过版本保存失败', '请稍后重试')
    })
  }
  updaterService.closeDialog()
  updaterService.status.value = { type: 'idle', message: '' }
  updaterService.updateInfo.value = null
  updaterService.isUpdateAvailable.value = false
  updaterService.downloadProgress.value = 0
  updaterService.downloadDetails.value = null
}

function handleUpdateDialogClose() {
  updaterService.closeDialog()
  // 关闭 Dialog 不清除 updateInfo —— 下载后台继续，可通过 StatusBar 点击重开
}

function handleViewUpdateDetails() {
  const info = updaterService.updateInfo.value
  if (info) {
    updaterService.openReleaseNotes(info.version)
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

  // 监听更新可用状态 —— 首次 available 时自动弹窗（与现有行为一致）
  watch(() => updaterService.isUpdateAvailable.value, (isAvailable) => {
    if (isAvailable && updaterService.updateInfo.value) {
      updaterService.openDialog()
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
    // Preferences actions — intercepted before page delegation
    switch (action) {
      case 'preferences':
        appStore.openPreferences('editor')
        return true
      case 'preferences-text-replacement':
        appStore.openPreferences('editor')
        return true
      case 'preferences-spelling-grammar':
        appStore.openPreferences('spelling')
        return true
      case 'view-theme-settings':
        appStore.openPreferences('themes')
        return true
      case 'auto-update-settings':
        appStore.openPreferences('updates')
        return true
    }
    // Delegate to active page
    const activePageRef = getActivePageRef()
    if (activePageRef?.handleMenuAction) {
      return await activePageRef.handleMenuAction(action)
    }
    return false
  }
})
</script>
