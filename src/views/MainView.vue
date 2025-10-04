<template>
  <!-- Workzone Wrapper -->
  <div class="mainview">
  
    <!-- Left Sidebar -->
    <LeftSidebar v-if="appStore.isLeftSidebarVisible" />
    
    <!-- Workzone -->
    <div class="workzone0">
      <!-- Title Bar -->
      <TitleBar />

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
        <RightSidebar v-if="appStore.isRightSidebarVisible" />
      </div>
    </div>
  </div>
  
  <!-- Status Bar -->
  <StatusBar v-if="appStore.isStatusbarVisible"/>
  
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
import { DocumentType } from '@/types'
import type { UpdateInfo } from '@/updater/types'
import { notify } from '@/utils/notifications'
import updaterService from '@/updater/UpdaterService'
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

// Refs for different page types
const markdownEditorRefs = ref<any[]>([])
const imageViewerRefs = ref<any[]>([])
const pdfViewerRefs = ref<any[]>([])

// Update dialog state
const showUpdateDialog = ref(false)
const updateDialogData = ref<UpdateInfo | null>(null)

// Computed
const activeTab = computed(() => appStore.activeTab)

// Methods
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
  // 监听更新可用状态
  watch(() => updaterService.isUpdateAvailable.value, (isAvailable) => {
    if (isAvailable && updaterService.updateInfo.value) {
      updateDialogData.value = updaterService.updateInfo.value
      showUpdateDialog.value = true
    }
  })
})

onUnmounted(() => {
  // 响应式状态会自动清理，不需要手动清理
})

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