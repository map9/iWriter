<template>
  <div class="flex items-center h-9 bg-gray-50 border-b border-gray-200 select-none drag-region">
    <!-- Window Controls - handled by system traffic lights -->
    <div v-if="!isMaximized && !appStore.showLeftSidebar" class="flex items-center pl-20"></div>

    <!-- Left Sidebar Toggle -->
    <div class="flex items-center no-drag" :class="isMaximized ? 'pl-2 pr-1' : 'px-1'">
      <button
        @click="appStore.toggleLeftSidebar()"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        title="Toggle Sidebar"
      >
        <IconLayoutSidebarLeftCollapse
          v-if="appStore.showLeftSidebar"
          :size="20"
          class="text-gray-600"
        />
        <IconLayoutSidebarLeftExpand
          v-else
          :size="20"
          class="text-gray-600"
        />
      </button>
    </div>

    <!-- Document Tabs Area -->
    <div class="flex items-center min-w-0">
      <!-- Tab Navigation -->
      <div class="flex items-center px-2 no-drag">
        <button
          @click="navigateTabs(-1)"
          :disabled="!canNavigateBack"
          class="p-1 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous Tab"
        >
          <IconChevronLeft :size="20" class="text-gray-600" />
        </button>
        <button
          @click="navigateTabs(1)"
          :disabled="!canNavigateForward"
          class="p-1 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next Tab"
        >
          <IconChevronRight :size="20" class="text-gray-600" />
        </button>
      </div>
      
      <!-- Document Tabs -->
      <div class="flex-1 flex items-center min-w-0 overflow-hidden no-drag">
        <!-- Left separator for tabs -->
        <div v-if="appStore.tabs.length > 0" class="w-px h-9 bg-gray-200"></div>
        
        <div 
          v-for="tab in appStore.tabs" 
          :key="tab.id"
          :class="[
            'px-4 py-2 border-r border-gray-200 cursor-pointer flex items-center space-x-2 min-w-0',
            tab.isActive ? 'bg-white border-b-white' : 'hover:bg-gray-100'
          ]"
          @click="switchTab(tab.id)"
        >
          <!-- Document Type Icon -->
          <component 
            :is="getTabIcon(tab)" 
            class="w-4 h-4 flex-shrink-0"
          />
          
          <!-- Tab Name -->
          <span class="truncate text-sm">{{ tab.name }}</span>
          
          <!-- Dirty Indicator -->
          <div 
            v-if="tab.isDirty" 
            class="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0"
          />
          
          <!-- Close Button -->
          <button 
            @click.stop="closeTab(tab.id)"
            class="ml-2 w-4 h-4 flex items-center justify-center hover:bg-gray-200 rounded flex-shrink-0"
          >
            <IconX class="w-3 h-3" />
          </button>
        </div>
        
        <!-- New Tab Button - next to tabs when tabs exist -->
        <div class="flex items-center px-2 no-drag">
          <button
            @click="appStore.createNewTab(undefined, undefined, '')"
            class="p-1 rounded hover:bg-gray-200 transition-colors"
            title="New Tab"
          >
            <IconPlus :size="20" class="text-gray-600" />
          </button>
        </div>
      </div>
    </div>
    
    <!-- Flexible drag area -->
    <div class="flex-1"></div>
    
    <!-- Right Sidebar Toggle -->
    <div class="flex items-center px-2 no-drag">
      <button
        @click="appStore.toggleRightSidebar()"
        class="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Toggle AI Chat"
      >
        <IconLayoutSidebarRightCollapse
          v-if="appStore.showRightSidebar"
          :size="20"
          class="text-gray-600"
        />
        <IconLayoutSidebarRightExpand
          v-else
          :size="20"
          class="text-gray-600"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { DocumentType } from '@/types'
import type { FileTab } from '@/types'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconPlus,
  IconFileText, 
  IconPhoto, 
  IconFile,
} from '@tabler/icons-vue'

const appStore = useAppStore()
const isMaximized = ref(false)

// Computed
const activeTab = computed(() => appStore.activeTab)

const canNavigateBack = computed(() => {
  const activeIndex = appStore.tabs.findIndex(tab => tab.isActive)
  return activeIndex > 0
})

const canNavigateForward = computed(() => {
  const activeIndex = appStore.tabs.findIndex(tab => tab.isActive)
  return activeIndex < appStore.tabs.length - 1
})

function navigateTabs(direction: number) {
  const activeIndex = appStore.tabs.findIndex(tab => tab.isActive)
  const newIndex = activeIndex + direction
  
  if (newIndex >= 0 && newIndex < appStore.tabs.length) {
    appStore.setActiveTab(appStore.tabs[newIndex].id)
  }
}

function getTabIcon(tab: FileTab) {
  switch (tab.documentType) {
    case DocumentType.TEXT_EDITOR:
      return IconFileText
    case DocumentType.PDF_VIEWER:
      return IconFile
    case DocumentType.IMAGE_VIEWER:
      return IconPhoto
    default:
      return IconFile
  }
}

function switchTab(tabId: string) {
  appStore.setActiveTab(tabId)
}

async function closeTab(tabId: string) {
  // Use the centralized closeTab function from app store
  await appStore.closeTab(tabId)
}

function getDisplayName(fileName: string): string {
  if (!fileName) return fileName
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return fileName
  }
  return fileName.substring(0, lastDotIndex)
}


// 监听状态变化，自动切换到合适的模式
function checkAndSwitchMode() {
  // 如果当前是被禁用的模式，自动切换
  if (['explorer', 'search', 'tag'].includes(appStore.leftSidebarMode) && !appStore.hasOpenFolder) {
    appStore.setLeftSidebarMode('start')
  }
  if (appStore.leftSidebarMode === 'toc' && appStore.tabs.length === 0) {
    // 如果有文件夹打开，切换到explorer，否则切换到start
    if (appStore.hasOpenFolder) {
      appStore.setLeftSidebarMode('explorer')
    } else {
      appStore.setLeftSidebarMode('start')
    }
  }
}

onMounted(async () => {
  if (window.electronAPI) {
    // 监听窗口状态变化事件
    if (window.electronAPI.onWindowStateChanged) {
      window.electronAPI.onWindowStateChanged((state: { maximized: boolean }) => {
        isMaximized.value = state.maximized
      })
    }
    
    // 初始状态为未最大化
    isMaximized.value = false
  }
  
  // 初始检查模式
  checkAndSwitchMode()
})

// 监听相关状态变化
watch([() => appStore.hasOpenFolder, () => appStore.tabs.length], () => {
  checkAndSwitchMode()
})

</script>

<style>
.drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>