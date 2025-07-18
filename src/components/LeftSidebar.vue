<template>
  <div 
    class="sidebar relative h-full flex flex-col shrink-0 min-w-64"
    :style="{ width: `${appStore.leftSidebarWidth}px` }"
  >
    <div class="flex items-center h-9 bg-gray-50 border-b border-gray-200 select-none drag-region">
      <!-- Window Controls - handled by system traffic lights -->
      <div v-if="!isMaximized" class="flex items-center pl-20"></div>
      
      <!-- Sidebar Mode Navigation - only show when sidebar is visible -->
      <div class="flex items-center flex-1">
        <div v-if="appStore.showLeftSidebar" class="flex items-center gap-1 px-2 ml-auto no-drag">
          <!-- Main navigation group: folder, search, tags -->
          <button
            v-for="mode in mainSidebarModes"
            :key="mode.key"
            @click="handleModeClick(mode.key)"
            :disabled="!appStore.hasOpenFolder"
            class="p-1.5 rounded transition-colors"
            :class="{
              'bg-blue-100 text-blue-700': appStore.leftSidebarMode === mode.key && appStore.hasOpenFolder,
              'text-gray-600 hover:bg-gray-200': appStore.leftSidebarMode !== mode.key && appStore.hasOpenFolder,
              'text-gray-400 cursor-not-allowed': !appStore.hasOpenFolder
            }"
            :title="mode.title"
          >
            <component :is="mode.icon" class="w-5 h-5" />
          </button>
          
          <!-- Separator -->
          <div class="toolbar-separator" />
          
          <!-- TOC navigation -->
          <button
            @click="handleModeClick('toc')"
            :disabled="appStore.tabs.length === 0"
            class="p-1.5 rounded transition-colors"
            :class="{
              'bg-blue-100 text-blue-700': appStore.leftSidebarMode === 'toc' && appStore.tabs.length > 0,
              'text-gray-600 hover:bg-gray-200': appStore.leftSidebarMode !== 'toc' && appStore.tabs.length > 0,
              'text-gray-400 cursor-not-allowed': appStore.tabs.length === 0
            }"
            title="Table of Contents"
          >
            <IconList class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Sidebar Content -->
    <div class="sidebar-content flex-1 flex flex-col h-full">
      <!-- Start(No Folder) Opened -->
      <NoFolderOpened 
        v-if="appStore.leftSidebarMode === 'start'" 
        class="h-full"
      />
      
      <!-- Explorer -->
      <ExplorerPanel
        v-else-if="appStore.leftSidebarMode === 'explorer'"
        class="h-full"
      />
      
      <!-- Search -->
      <SearchPanel
        v-else-if="appStore.leftSidebarMode === 'search'"
        class="h-full"
      />
      
      <!-- By TAG -->
      <TagPanel
        v-else-if="appStore.leftSidebarMode === 'tag'"
        class="h-full"
      />
      
      <!-- Table of Contents -->
      <TocPanel
        v-else-if="appStore.leftSidebarMode === 'toc'"
        class="h-full"
      />
    </div>
    
    <!-- Resizable handle -->
    <div 
      class="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-blue-500 hover:opacity-50 transition-all bg-transparent"
      @mousedown="startResize"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconFolder,
  IconSearch,
  IconTag,
  IconList,
  IconDots
} from '@tabler/icons-vue'

import NoFolderOpened from './sidebar/NoFolderOpened.vue'
import ExplorerPanel from './sidebar/ExplorerPanel.vue'
import SearchPanel from './sidebar/SearchPanel.vue'
import TagPanel from './sidebar/TagPanel.vue'
import TocPanel from './sidebar/TocPanel.vue'

const appStore = useAppStore()
const isMaximized = ref(false)
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

const mainSidebarModes = computed(() => [
  {
    key: 'explorer' as const,
    title: 'Explorer',
    icon: IconFolder
  },
  {
    key: 'search' as const,
    title: 'Search',
    icon: IconSearch
  },
  {
    key: 'tag' as const,
    title: 'By TAG',
    icon: IconTag
  }
])

function handleModeClick(mode: string) {
  // 只有在按钮启用时才允许切换
  if (mode === 'toc' && appStore.tabs.length === 0) {
    return
  }
  if (['explorer', 'search', 'tag'].includes(mode) && !appStore.hasOpenFolder) {
    return
  }
  
  appStore.setLeftSidebarMode(mode as any)
}

function startResize(event: MouseEvent) {
  isResizing.value = true
  startX.value = event.clientX
  startWidth.value = appStore.leftSidebarWidth
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  
  // 防止选中文本
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ew-resize'
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value) return
  
  const deltaX = event.clientX - startX.value
  const newWidth = startWidth.value + deltaX
  
  // 确保最小宽度为正数，然后让store处理隐藏逻辑
  if (newWidth > 50) { // 设置一个基本的最小值避免负数
    appStore.setLeftSidebarWidth(newWidth)
    // 如果左侧边栏被隐藏，则停止调整大小，避免光标和缩放状态没有被恢复
    if (appStore.showLeftSidebar === false) {
      stopResize()
    }
  }
}

function stopResize() {
  isResizing.value = false
  
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  
  // 恢复鼠标状态
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
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

  // 清理事件监听器
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  })
})

// 监听相关状态变化
watch([() => appStore.hasOpenFolder, () => appStore.tabs.length], () => {
  checkAndSwitchMode()
})

</script>