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
        <div class="max-w-80 truncate text-sm text-base-content/70">
          {{ activeDocumentTitle }}
        </div>
        <div class="h-4 w-px bg-base-300" />
        <button
          class="btn btn-sm btn-ghost rounded-full px-3 normal-case"
          @click="appStore.setCleanMode(false)"
        >
          {{ t('cleanMode.exit') }}
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
        <div class="flex flex-1 overflow-hidden">

          <!-- Welcome Page (No tabs open) -->
          <WelcomePage v-if="appStore.tabs.length === 0" />
          
          <!-- Document Pages for each tab：单一动态组件，按 documentType 映射 Page -->
          <div
            v-for="tab in appStore.tabs"
            :key="tab.id"
            :class="tab.isActive ? 'flex h-full w-full' : 'hidden'"
          >
            <component
              :is="pageComponentFor(tab)"
              :ref="(el: unknown) => setPageRef(tab.id, el)"
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

  <!-- Print Preview: HTML engine (markdown or image — mode print or export) -->
  <PrintDialog
    v-if="appStore.printPreviewSource?.kind !== 'pdf'"
    :visible="appStore.showPrintPreviewDialog"
    :html="appStore.printPreviewHtml"
    :title="appStore.printPreviewTitle"
    :mode="appStore.printPreviewMode"
    :default-save-path="appStore.printPreviewDefaultSavePath"
    :skip-save-dialog="appStore.printPreviewSkipSaveDialog"
    :profile="appStore.printPreviewProfile"
    @close="appStore.closePrintPreview()"
  />

  <!-- Print Preview: PDF (print only) -->
  <PdfPrintDialog
    v-if="appStore.printPreviewSource?.kind === 'pdf'"
    :visible="appStore.showPrintPreviewDialog"
    :file-path="(appStore.printPreviewSource as { kind: 'pdf'; filePath: string; numPages: number }).filePath"
    :num-pages="(appStore.printPreviewSource as { kind: 'pdf'; filePath: string; numPages: number }).numPages"
    :title="appStore.printPreviewTitle"
    @close="appStore.closePrintPreview()"
  />

  <!-- Git 提交身份 + 克隆弹窗（差异改为编辑区 tab，见 DiffViewerPage） -->
  <GitIdentityDialog />
  <GitCloneDialog />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useAiStore } from '@/ai/state/aiStore'
import { useGitStore } from '@/stores/git'
import { DocumentType } from '@/types'
import type { FileTab } from '@/types'
import type { EditorStateRequestEvent, SnapshotRequestEvent } from '@shared/ai/contracts'
import type { WorkspaceTransitionActivity } from '@/stores/workspaceTransition'
import { notify } from '@/utils/notifications'
import updaterService from '@/updater/UpdaterService'
import { buildSerializedSnapshot } from '@/ai/document/SnapshotSerializer'
import { buildEditorStateSnapshot } from '@/ai/document/EditorStateSerializer'
import TitleBar from '@/components/TitleBar.vue'
import LeftSidebar from '@/components/LeftSidebar.vue'
import RightSidebar from '@/components/RightSidebar.vue'
import StatusBar from '@/components/StatusBar.vue'
import WelcomePage from '@/components/pages/WelcomePage.vue'
// 所有页面/对话框懒加载，减少初始 chunk：
//   - MarkdownEditorPage 携带 TipTap/highlight/katex (~2.5MB)，onMounted 后立即预加载
//   - PDFViewerPage 携带 pdfjs-dist (413KB)；PrintDialog 携带 pagedjs-lib (892KB)
const MarkdownEditorPage = defineAsyncComponent(() => import('@/components/pages/MarkdownEditorPage.vue'))
const ImageViewerPage = defineAsyncComponent(() => import('@/components/pages/ImageViewerPage.vue'))
const PDFViewerPage = defineAsyncComponent(() => import('@/components/pages/PDFViewerPage.vue'))
const OfficeViewerPage = defineAsyncComponent(() => import('@/components/pages/OfficeViewerPage.vue'))
const DiffViewerPage = defineAsyncComponent(() => import('@/components/pages/DiffViewerPage.vue'))
const UnknownPage = defineAsyncComponent(() => import('@/components/pages/UnknownPage.vue'))
const UpdateDialog = defineAsyncComponent(() => import('@/components/updater/UpdateDialog.vue'))
const PreferencesDialog = defineAsyncComponent(() => import('@/components/preferences/PreferencesDialog.vue'))
const PrintDialog = defineAsyncComponent(() => import('@/components/print/PrintDialog.vue'))
const PdfPrintDialog = defineAsyncComponent(() => import('@/components/print/PdfPrintDialog.vue'))
const GitIdentityDialog = defineAsyncComponent(() => import('@/components/sidebar/scm/GitIdentityDialog.vue'))
const GitCloneDialog = defineAsyncComponent(() => import('@/components/sidebar/scm/GitCloneDialog.vue'))

const appStore = useAppStore()
const aiStore = useAiStore()
const gitStore = useGitStore()
const { t } = useI18n()

// Page 组件按 documentType 映射（渲染层的懒加载映射，替代 tab-kind 中的 component 字段）
const PAGE_COMPONENTS: Partial<Record<DocumentType, Component>> = {
  [DocumentType.MARKDOWN_EDITOR]: MarkdownEditorPage,
  [DocumentType.IMAGE_VIEWER]: ImageViewerPage,
  [DocumentType.PDF_VIEWER]: PDFViewerPage,
  [DocumentType.OFFICE_VIEWER]: OfficeViewerPage,
  [DocumentType.DIFF_VIEWER]: DiffViewerPage,
}
function pageComponentFor(tab: FileTab): Component {
  return (tab.documentType && PAGE_COMPONENTS[tab.documentType]) || UnknownPage
}

// 各 Page 通过 defineExpose 暴露的最小接口
interface PageExposed {
  tab?: FileTab
  handleMenuAction?: (action: string) => Promise<boolean>
  updateMenuFormattingState?: (...args: unknown[]) => void
}

// tab.id → 已挂载 Page 实例（替代 4 个 typed ref 数组）。
// 非激活 tab 以 hidden class 保持挂载，其实例仍留在表中。
const pageRefs = new Map<string, PageExposed>()
function setPageRef(tabId: string, el: unknown) {
  if (el) pageRefs.set(tabId, el as PageExposed)
  else pageRefs.delete(tabId)
}

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

function getActivePageRef(): PageExposed | null {
  if (!activeTab.value) return null
  return pageRefs.get(activeTab.value.id) ?? null
}

// Update dialog methods
function handleUpdateConfirm() {
  const status = updaterService.status.value
  if (status.type === 'error' && status.errorStage === 'check') {
    updaterService.closeDialog()
    void appStore.presentUpdateFlow()
    return
  }

  const shouldInstall =
    status.type === 'downloaded' ||
    (status.type === 'error' && status.errorStage === 'install')

  if (shouldInstall) {
    updaterService.closeDialog()
    updaterService.installUpdate().catch(error => {
      console.error('Failed to install update:', error)
      notify.error(
        error instanceof Error ? error.message : String(error),
        t('notify.update.installFailed')
      )
    })
    return
  }

  const shouldDownload =
    status.type === 'available' ||
    (status.type === 'error' && status.errorStage === 'download')

  if (shouldDownload) {
    updaterService.downloadUpdate().catch(error => {
      console.error('Failed to download update:', error)
      notify.error(
        error instanceof Error ? error.message : String(error),
        t('notify.update.downloadFailed')
      )
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
      notify.error(
        error instanceof Error ? error.message : String(error),
        t('notify.update.skipVersionFailed')
      )
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
// 版本控制只跟随可用工作区；外部删除时立即清空 SCM，避免保留旧仓库数据。
watch(
  [() => appStore.currentFolder, () => appStore.isWorkspaceAvailable],
  ([folder, available]) => { void gitStore.onFolderChanged(available ? folder : null) },
  { immediate: true },
)

onMounted(() => {
  appStore.setWorkspaceTransitionHooks({
    getActivity: (): WorkspaceTransitionActivity => {
      if (aiStore.isInterrupted) return 'hitl'
      if (aiStore.isStreaming) return 'running'
      return 'idle'
    },
    confirm: async activity => {
      const message = activity === 'hitl'
        ? t('agentPanel.panel.workspaceSwitchHitl')
        : t('agentPanel.panel.workspaceSwitchRunning')
      const result = await window.electronAPI.showMessageBox({
        type: 'question',
        title: t('agentPanel.panel.workspaceSwitchTitle'),
        message,
        detail: t('agentPanel.panel.workspaceSwitchDetail'),
        buttons: [
          t('agentPanel.panel.workspaceSwitchContinue'),
          t('agentPanel.common.cancel'),
        ],
        defaultId: 1,
        cancelId: 1,
      })
      return result.response === 0
    },
    terminateCurrent: async activity => activity === 'idle' || aiStore.cancelStreaming(),
    prepareNext: targetPath => aiStore.prepareNewThread(targetPath),
  })
  aiStore.init()

  // MarkdownEditorPage 做了懒加载以缩短首屏时间（TipTap/highlight/katex ~2.5MB）。
  // 这里立即触发预加载，确保绝大多数用户在打开第一个 markdown tab 前已加载完毕。
  import('@/components/pages/MarkdownEditorPage.vue').catch(() => { /* ignore */ })

  document.addEventListener('keydown', handleWindowEscape, true)
  document.addEventListener('mousemove', handleWindowMouseMove, true)

  window.electronAPI.onAiRequestSnapshot?.(async (req: SnapshotRequestEvent) => {
    type TipTapEditor = import('@tiptap/core').Editor
    let editor: TipTapEditor | null = null
    let editorFilePath: string | null = null

    if (req.tabId) {
      const matchingTab = appStore.tabs.find(tab => tab.id === req.tabId)
      editor = matchingTab?.docState?.editorInstance as TipTapEditor | null ?? null
      editorFilePath = matchingTab?.path ?? null
    } else if (!req.filePath) {
      const activeTab = appStore.activeTab
      editor = activeTab?.docState?.editorInstance as TipTapEditor | null ?? null
      editorFilePath = activeTab?.path ?? null
    } else {
      const target = req.filePath.replace(/\\/g, '/').toLowerCase()
      const matchingTab = appStore.tabs.find(tab => {
        const tabPath = tab.path?.replace(/\\/g, '/').toLowerCase()
        return tabPath === target
      })
      if (matchingTab) {
        editor = matchingTab.docState?.editorInstance as TipTapEditor | null ?? null
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

  window.electronAPI.onAiRequestEditorState?.((req: EditorStateRequestEvent) => {
    window.electronAPI.aiEditorStateResponse?.({
      requestId: req.requestId,
      state: buildEditorStateSnapshot(appStore.tabs, appStore.activeTab, {
        includeOpenTabs: req.includeOpenTabs,
      }),
    })
  })

  // 监听更新可用状态 —— 首次 available 时自动弹窗（与现有行为一致）
  watch([
    () => updaterService.isUpdateAvailable.value,
    () => updaterService.updateInfo.value?.version
  ], ([isAvailable, version]) => {
    if (isAvailable && version) {
      updaterService.openDialog()
    }
  })
})

onUnmounted(() => {
  clearCleanModeChromeTimer()
  document.removeEventListener('keydown', handleWindowEscape, true)
  document.removeEventListener('mousemove', handleWindowMouseMove, true)
  appStore.setWorkspaceTransitionHooks(null)
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
