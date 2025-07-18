<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 flex overflow-hidden">
    
      <!-- Left Sidebar -->
      <LeftSidebar v-if="appStore.showLeftSidebar" />
      
      <!-- Main Content -->
      <div class="h-full flex-1 flex flex-col overflow-hidden">
        <!-- Title Bar -->
        <TitleBar />

          <div class="flex-1 flex overflow-hidden">

            <!-- Editor Area -->
            <div class="flex-1 flex flex-col overflow-hidden">

              <!-- Document Pages -->
              <div class="flex-1 overflow-hidden">
                <!-- Welcome Page (No tabs open) -->
                <WelcomePage v-if="appStore.tabs.length === 0" />
                
                <!-- Document Pages for each tab -->
                <div 
                  v-for="tab in appStore.tabs" 
                  :key="tab.id"
                  :class="[
                    'h-full',
                    tab.isActive ? 'block' : 'hidden'
                  ]"
                >
                  <!-- Markdown Editor Page -->
                  <MarkdownEditorPage 
                    v-if="tab.documentType === DocumentType.TEXT_EDITOR"
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
                  <div v-else class="h-full flex items-center justify-center text-gray-500">
                    <div class="text-center">
                      <IconAlertTriangle class="w-16 h-16 mx-auto mb-4 text-gray-700" />
                      <div class="text-xl mb-2">不支持的文件类型</div>
                      <div class="text-base mx-auto max-w-xl mb-2">The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding.</div>
                      <div class="flex gap-3 justify-center">
                        <button 
                          @click="openWithShell(tab.path)"
                          class="btn btn-primary h-9 items-center justify-center space-x-2 whitespace-nowrap"
                        >
                          <span>Open Anyway</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Right Sidebar (AI Chat) -->
            <RightSidebar v-if="appStore.showRightSidebar" />
          </div>
        </div>
      </div>
    
    <!-- Status Bar -->
    <StatusBar v-if="appStore.showStatusbar"/>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { DocumentType } from '@/types'
import { notify } from '@/utils/notifications'
import TitleBar from '@/components/TitleBar.vue'
import LeftSidebar from '@/components/LeftSidebar.vue'
import RightSidebar from '@/components/RightSidebar.vue'
import StatusBar from '@/components/StatusBar.vue'
import WelcomePage from '@/components/pages/WelcomePage.vue'
import MarkdownEditorPage from '@/components/pages/MarkdownEditorPage.vue'
import ImageViewerPage from '@/components/pages/ImageViewerPage.vue'
import PDFViewerPage from '@/components/pages/PDFViewerPage.vue'
import { 
  IconAlertTriangle,
} from '@tabler/icons-vue'

const appStore = useAppStore()

// Refs for different page types
const markdownEditorRefs = ref<any[]>([])
const imageViewerRefs = ref<any[]>([])
const pdfViewerRefs = ref<any[]>([])

// Computed
const activeTab = computed(() => appStore.activeTab)

// Methods
function getActivePageRef() {
  if (!activeTab.value) return null

  switch (activeTab.value.documentType) {
    case DocumentType.TEXT_EDITOR:
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
    notify.success(`${error instanceof Error ? error.message : String(error)}`, '文件操作')
  }
}

// Expose methods to parent component (App.vue)
defineExpose({
  handleMenuAction: async (action: string) => {
    // First try to handle through the active page
    let handled = false
    const activePageRef = getActivePageRef()
    if (activePageRef?.handleMenuAction) {
      handled = activePageRef.handleMenuAction(action)
    }
    
    // If not handled by active page, fallback to app store
    if (!handled) {
      await appStore.handleMenuAction(action)
    }
  },
  updateMenuFormattingState: () => {
    const activePageRef = getActivePageRef()
    if (activePageRef?.updateMenuFormattingState) {
      activePageRef.updateMenuFormattingState()
    }
  }
})
</script>