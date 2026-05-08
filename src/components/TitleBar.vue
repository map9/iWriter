<template>
  <div class="iw-titlebar gap-2">
    <!-- Window Controls - handled by system traffic lights -->
    <div v-if="!isMaximized && !appStore.isLeftSidebarVisible" class="flex items-center pl-20"></div>
    <!-- Left Sidebar Toggle -->
    <div class="no-drag flex items-center">
      <button
        @click="appStore.toggleLeftSidebar()"
        class="iw-toolbar-btn btn-sm"
        title="Toggle Sidebar"
      >
        <IconLayoutSidebarLeftCollapse
          v-if="appStore.isLeftSidebarVisible"
          class="icon-sm"
        />
        <IconLayoutSidebarLeftExpand
          v-else
          class="icon-sm"
        />
      </button>
    </div>

    <!-- Tab Navigation -->
    <div class="no-drag join flex">
      <button
        @click="navigateTabs(-1)"
        :disabled="!canNavigateBack"
        class="iw-toolbar-btn btn-sm join-item"
        title="Previous Tab"
      >
        <IconChevronLeft class="icon-sm" />
      </button>
      <button
        @click="navigateTabs(1)"
        :disabled="!canNavigateForward"
        class="iw-toolbar-btn btn-sm join-item"
        title="Next Tab"
      >
        <IconChevronRight class="icon-sm" />
      </button>
    </div>

    <!-- Document Tabs Area - 按内容伸缩，有最大宽度限制 -->
    <div class="no-drag flex items-center h-full overflow-hidden max-w-[calc(100%-256px)]">
      <!-- Document Tabs Container -->
      <div ref="tabsContainer" class="flex items-center h-full overflow-x-auto scrollbar-hide">
        <!-- Tabs List -->
        <div class="flex items-center">
          <div 
            v-for="(tab, idx) in appStore.tabs" 
            :key="tab.id"
            :ref="(el: any) => { if (tab.isActive) setActivaeTabRef(el)}"
            :class="[
              idx === 0 ? 'border-l' : '',
              'group flex items-center px-3 py-2 space-x-2 border-r border-base-300 min-w-32 max-w-48 shrink-0',
              tab.isActive ? 'bg-base-100' : 'hover:bg-base-200'
            ]"
            @click="switchTab(tab.id)"
            :title="tab.name"
          >
            <!-- 文档类型图标（固定宽度） -->
            <component 
              :is="getTabIcon(tab)" 
              class="icon-sm shrink-0"
            />

            <!-- 标签名称（伸缩部分） -->
            <span class="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis mr-2 text-base-content select-none">{{ tab.name }}</span>
            
            <!-- 只读指示器 -->
            <span
              v-if="tab.fileReadonly || tab.editReadonly"
              class="text-xs text-warning-content shrink-0 mr-1 select-none"
              :title="tab.fileReadonly ? '文件只读' : '只读模式'"
            >🔒</span>

            <!-- 未保存状态与关闭按钮共用一个固定位置 -->
            <div class="relative size-6 shrink-0">
              <div
                v-if="tab.isDirty"
                class="icon-dot absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-warning group-hover:hidden"
              />
              <button
                @click.stop="closeTab(tab.id)"
                :class="[
                  'btn btn-ghost btn-xs btn-square absolute inset-0',
                  tab.isDirty ? 'hidden group-hover:flex' : 'flex'
                ]"
                title="Close Tab"
              >
                <IconX class="icon-2xs" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- New Tab Button - 固定在标签右侧 -->
      <div class="flex items-center px-2 no-drag">
        <button
          @click="appStore.createTab(undefined, undefined)"
          class="iw-toolbar-btn btn-sm"
          title="New Tab"
        >
          <IconPlus class="icon-sm" />
        </button>
      </div>
    </div>

    <!-- Flexible drag area - 填充剩余空间，可被完全压缩 -->
    <div class="flex-1 h-full cursor-move drag-region min-w-0"></div>
    
    <AiStatusButton />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import type { FileTab } from '@/types'
import { SidebarMode } from '@/types'
import pathUtils from '@/utils/pathUtils'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import AiStatusButton from './AiStatusButton.vue'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
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

function setActivaeTabRef(el: HTMLElement) {
  activeTabRef = el
}

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
  
  if (newIndex >= 0 && newIndex < appStore.tabs.length && appStore.tabs[newIndex]) {
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
