<template>
  <div class="flex items-center h-9 select-none w-full drag-region overflow-hidden bg-background-primary border-b border-border-primary">
    <!-- Window Controls - handled by system traffic lights -->
    <div v-if="!isMaximized && !appStore.showLeftSidebar" class="flex items-center pl-20"></div>
    <!-- Left Sidebar Toggle -->
    <div class="flex items-center flex-shrink-0 no-drag" :class="isMaximized ? 'pl-2 pr-1' : 'px-1'">
      <button
        @click="appStore.toggleLeftSidebar()"
        class="toolbar-button"
        title="Toggle Sidebar"
      >
        <IconLayoutSidebarLeftCollapse
          v-if="appStore.showLeftSidebar"
          class="icon-base"
        />
        <IconLayoutSidebarLeftExpand
          v-else
          class="icon-base"
        />
      </button>
    </div>

    <!-- Tab Navigation -->
    <div class="flex items-center px-2 flex-shrink-0 no-drag">
      <button
        @click="navigateTabs(-1)"
        :disabled="!canNavigateBack"
        class="toolbar-button"
        title="Previous Tab"
      >
        <IconChevronLeft class="icon-base" />
      </button>
      <button
        @click="navigateTabs(1)"
        :disabled="!canNavigateForward"
        class="toolbar-button"
        title="Next Tab"
      >
        <IconChevronRight class="icon-base" />
      </button>
    </div>

    <!-- Document Tabs Area - 按内容伸缩，有最大宽度限制 -->
    <div class="flex items-center h-full overflow-hidden no-drag max-w-[calc(100%-256px)]">
      <!-- Document Tabs Container -->
      <div ref="tabsContainer" class="flex items-center h-full overflow-x-auto scrollbar-hide">
        <!-- Tabs List -->
        <div class="flex items-center">
          <div 
            v-for="(tab, idx) in appStore.tabs" 
            :key="tab.id"
            :ref="el => { if (tab.isActive) activeTabRef = el as HTMLElement}"
            :class="[
              idx === 0 ? 'border-l' : '',
              'flex items-center px-3 py-2 space-x-2 border-r border-border-primary min-w-32 max-w-48 flex-shrink-0',
              tab.isActive ? 'bg-background-secondary' : 'hover:bg-interactive-hover'
            ]"
            @click="switchTab(tab.id)"
            :title="tab.name"
          >
            <!-- 文档类型图标（固定宽度） -->
            <component 
              :is="getTabIcon(tab)" 
              class="icon-sm flex-shrink-0"
            />
            
            <!-- 标签名称（伸缩部分） -->
            <span class="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis mr-2 text-text-primary">{{ tab.name }}</span>
            
            <!-- 未保存指示器（固定宽度） -->
            <div 
              v-if="tab.isDirty" 
              class="icon-dot flex-shrink-0"
            />
            
            <!-- 关闭按钮（固定宽度） -->
            <button 
              @click.stop="closeTab(tab.id)"
              class="toolbar-button flex-shrink-0"
              title="Close Tab"
            >
              <IconX class="icon-sm" />
            </button>
          </div>
        </div>
      </div>

      <!-- New Tab Button - 固定在标签右侧 -->
      <div class="flex items-center px-2 flex-shrink-0 no-drag">
        <button
          @click="appStore.createTab(undefined, undefined, '')"
          class="toolbar-button flex-shrink-0"
          title="New Tab"
        >
          <IconPlus class="icon-base" />
        </button>
      </div>
    </div>
    
    <!-- Flexible drag area - 填充剩余空间，可被完全压缩 -->
    <div class="flex-1 h-full cursor-move drag-region min-w-44"></div>
    
    <!-- Right Sidebar Toggle -->
    <div class="flex items-center px-2 flex-shrink-0 no-drag">
      <button
        @click="appStore.toggleRightSidebar()"
        class="toolbar-button flex-shrink-0"
        title="Toggle AI Chat"
      >
        <IconLayoutSidebarRightCollapse
          v-if="appStore.showRightSidebar"
          class="icon-base"
        />
        <IconLayoutSidebarRightExpand
          v-else
          class="icon-base"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import type { FileTab } from '@/types'
import { SidebarMode } from '@/types'
import pathUtils from '@/utils/pathUtils'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconPlus,
} from '@tabler/icons-vue'

const appStore = useAppStore()
const isMaximized = ref(false)
const tabsContainer = ref<HTMLElement>()
let activeTabRef: HTMLElement | null = null
const { getIconByExtension } = useDocumentTypeDetector()

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
  return getIconByExtension(pathUtils.extension(tab.name))
}

function switchTab(tabId: string) {
  appStore.setActiveTab(tabId)
  // 确保激活的标签在视图中可见
  nextTick(() => {
    scrollActiveTabIntoView()
  })
}

// 滚动激活标签到可视区域
function scrollActiveTabIntoView() {
  if (!tabsContainer.value || !activeTabRef) return
  
  const container = tabsContainer.value
  const activeTab = activeTabRef
  
  const containerRect = container.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()
  
  // 检查标签是否在容器的可视区域内
  const isTabVisible = (
    tabRect.left >= containerRect.left &&
    tabRect.right <= containerRect.right
  )
  
  if (!isTabVisible) {
    // 计算需要滚动的距离
    const scrollLeft = activeTab.offsetLeft - container.offsetLeft - (container.clientWidth - activeTab.clientWidth) / 2
    container.scrollTo({
      left: scrollLeft,
      behavior: 'smooth'
    })
  }
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
  if (appStore.leftSidebarMode !== SidebarMode.TOC && !appStore.hasOpenFolder) {
    appStore.setLeftSidebarMode(SidebarMode.START)
  }
  if (appStore.leftSidebarMode === SidebarMode.TOC && appStore.tabs.length === 0) {
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
})

// 监听相关状态变化
watch([() => appStore.hasOpenFolder, () => appStore.tabs.length], () => {
  checkAndSwitchMode()
})

// 监听激活标签变化，确保其可见
watch(() => appStore.activeTabId, () => {
  nextTick(() => {
    scrollActiveTabIntoView()
  })
})

</script>

<style>

</style>