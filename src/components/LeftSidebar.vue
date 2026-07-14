<template>
  <div 
    class="iw-sidebar iw-left-sidebar"
    :style="{ width: `${appStore.leftSidebarWidth}px` }"
  >
    <div class="drag-region flex h-10 items-center border-b border-base-300 bg-base-200 px-2">
      <!-- macOS traffic lights are handled by the system -->
      <div v-if="shouldReserveMacTrafficLights" class="flex items-center pl-20"></div>
      <AppMenuButton
        v-if="showAppMenuButton"
        class="no-drag -ml-2 shrink-0"
      />
      
      <!-- Sidebar Mode Navigation - only show when sidebar is visible -->
      <div class="drag-region flex flex-1 items-center">
        <div v-if="appStore.isLeftSidebarVisible" class="no-drag ml-auto flex h-full items-center gap-2">
          <!-- Main navigation group: folder, search, tags -->
          <div class="join flex items-center">
            <button
              v-for="mode in mainSidebarModes"
              :key="mode.key"
              @click="handleModeClick(mode.key)"
              :disabled="!appStore.hasOpenFolder"
              class="iw-toolbar-btn btn-sm join-item"
              :class="{
                'iw-toolbar-btn-active': appStore.leftSidebarMode === mode.key && appStore.hasOpenFolder,
              }"
              :title="mode.title"
            >
              <component :is="mode.icon" class="icon-sm" />
            </button>

            <div class="join-item flex h-9 w-4 items-center justify-center">
              <div class="h-1/2 w-px bg-base-300"></div>
            </div>
            
            <button
              @click="handleModeClick(SidebarMode.TOC)"
              :disabled="appStore.tabs.length === 0"
              class="iw-toolbar-btn btn-sm join-item"
              :class="{
                'iw-toolbar-btn-active': appStore.leftSidebarMode === SidebarMode.TOC && appStore.tabs.length > 0,
              }"
              title="Table of Contents"
            >
              <IconList class="icon-sm" />
            </button>
            </div>
        </div>
      </div>
    </div>

    <!-- Sidebar Content -->
    <div class="iw-sidebar-content">
      <!-- Start(No Folder) Opened -->
      <NoFolderOpened
        v-show="appStore.leftSidebarMode === SidebarMode.START"
      />

      <!-- Explorer -->
      <ExplorerPanel
        v-show="appStore.leftSidebarMode === SidebarMode.EXPLORER"
      />

      <!-- Search -->
      <SearchPanel
        v-show="appStore.leftSidebarMode === SidebarMode.SEARCH"
      />

      <!-- Source Control -->
      <SourceControlPanel
        v-show="appStore.leftSidebarMode === SidebarMode.SOURCE_CONTROL"
      />

      <!-- By TAG -->
      <TagPanel
        v-show="appStore.leftSidebarMode === SidebarMode.TAG"
      />

      <!-- Table of Contents -->
      <TocPanel
        v-show="appStore.leftSidebarMode === SidebarMode.TOC"
      />
    </div>
    
    <!-- Resizable handle -->
    <div 
      class="iw-resize-handle right-0"
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
  IconList,
  IconGitBranch,
} from '@tabler/icons-vue'

import { SidebarMode } from '@/types'
import AppMenuButton from './AppMenuButton.vue'
import NoFolderOpened from './sidebar/NoFolderOpened.vue'
import ExplorerPanel from './sidebar/ExplorerPanel.vue'
import SearchPanel from './sidebar/SearchPanel.vue'
import SourceControlPanel from './sidebar/SourceControlPanel.vue'
import TagPanel from './sidebar/TagPanel.vue'
import TocPanel from './sidebar/TocPanel.vue'

const appStore = useAppStore()
const isMaximized = ref(false)
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

const isMacPlatform = computed(() => window.electronAPI?.platform === 'darwin')
const showAppMenuButton = computed(() => !isMacPlatform.value)
const shouldReserveMacTrafficLights = computed(() => isMacPlatform.value && !isMaximized.value)

const mainSidebarModes = computed(() => [
  {
    key: SidebarMode.EXPLORER as const,
    title: 'Explorer',
    icon: IconFolder
  },
  {
    key: SidebarMode.SEARCH as const,
    title: 'Search',
    icon: IconSearch
  },
  {
    key: SidebarMode.SOURCE_CONTROL as const,
    title: 'Source Control',
    icon: IconGitBranch
  }/*,
  {
    key: SidebarMode.TAG as const,
    title: 'By TAG',
    icon: IconTag
  }*/
])

function handleModeClick(mode: SidebarMode) {
  if (mode === SidebarMode.TOC && appStore.tabs.length === 0) {
    return
  }
  if ([SidebarMode.EXPLORER, SidebarMode.SEARCH, SidebarMode.SOURCE_CONTROL, SidebarMode.TAG].includes(mode) && !appStore.hasOpenFolder) {
    return
  }
  
  appStore.setLeftSidebarMode(mode as SidebarMode)
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
    if (appStore.isLeftSidebarVisible === false) {
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
  if ([SidebarMode.EXPLORER, SidebarMode.SEARCH, SidebarMode.SOURCE_CONTROL, SidebarMode.TAG].includes(appStore.leftSidebarMode) && !appStore.hasOpenFolder) {
    appStore.setLeftSidebarMode(SidebarMode.START)
  }
  if (appStore.leftSidebarMode === SidebarMode.TOC && appStore.tabs.length === 0) {
    // 如果有文件夹打开，切换到explorer，否则切换到start
    if (appStore.hasOpenFolder) {
      appStore.setLeftSidebarMode(SidebarMode.EXPLORER)
    } else {
      appStore.setLeftSidebarMode(SidebarMode.START)
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
