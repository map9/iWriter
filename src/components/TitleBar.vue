<template>
  <div
    class="drag-region relative flex h-10 w-full shrink-0 gap-2 items-center overflow-hidden border-b border-base-300 bg-base-200 px-2 text-base-content backdrop-blur"
    @dragover.prevent="handleDocumentDragOver"
    @dragleave="handleDocumentDragLeave"
    @drop.prevent="handleDocumentDrop"
  >
    <div v-if="showCustomWindowControls" class="no-drag absolute inset-x-0 top-0 z-20 h-1" aria-hidden="true"></div>
    <!-- macOS traffic lights are handled by the system -->
    <div v-if="shouldReserveMacTrafficLights" class="flex items-center pl-20"></div>
    <AppMenuButton
      v-if="showAppMenuButton"
      class="no-drag -ml-2 shrink-0"
    />
    <!-- Left Sidebar Toggle -->
    <div class="no-drag flex items-center">
      <button
        @click="appStore.toggleLeftSidebar()"
        class="btn btn-ghost btn-square btn-sm"
        :title="t('titlebar.toggleSidebar')"
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
        class="btn btn-ghost btn-square btn-sm join-item"
        :title="t('titlebar.previousTab')"
      >
        <IconChevronLeft class="icon-sm" />
      </button>
      <button
        @click="navigateTabs(1)"
        :disabled="!canNavigateForward"
        class="btn btn-ghost btn-square btn-sm join-item"
        :title="t('titlebar.nextTab')"
      >
        <IconChevronRight class="icon-sm" />
      </button>
    </div>

    <!-- Document Tabs Area - 按内容伸缩，有最大宽度限制 -->
    <div
      ref="tabsDropArea"
      class="no-drag flex items-center h-full overflow-hidden max-w-[calc(100%-256px)] min-w-0"
    >
      <!-- Document Tabs Container -->
      <div ref="tabsContainer" class="titlebar-tabs-viewport flex items-center h-full overflow-x-auto scrollbar-hide">
        <div class="relative flex items-center h-full pr-0.5" :class="tabCount > 0? 'pl-0.5' : ''">
          <div
            v-if="dropIndicatorVisible"
            class="titlebar-drop-indicator"
            :style="{ left: `${dropIndicatorLeft}px` }"
          />

          <!-- Tabs List -->
          <div class="flex items-center h-full">
            <div
              v-for="(tab, idx) in appStore.tabs"
              :key="tab.id"
              :ref="el => setTabRef(tab.id, el as HTMLElement | null, tab.isActive)"
              :class="[
                idx === 0 ? 'border-l' : '',
                'group flex items-center px-3 py-2 space-x-2 border-r border-base-300 min-w-32 max-w-48 shrink-0 h-full',
                tab.isActive ? 'bg-base-100' : 'hover:bg-base-200'
              ]"
              draggable="true"
              @dragstart="handleTabDragStart($event, tab.id)"
              @dragend="clearDragState()"
              @click="switchTab(tab.id)"
              @contextmenu.prevent.stop="handleTabContextMenu($event, tab)"
              :title="getTabTitle(tab)"
            >
              <!-- 文档类型图标（固定宽度） -->
              <component
                :is="getTabIcon(tab)"
                class="icon-sm shrink-0"
              />

              <!-- 标签名称（伸缩部分） -->
              <span :class="getTabNameClass(tab)">{{ tab.name }}</span>

              <!-- 只读指示器 -->
              <span
                v-if="tab.fileReadonly || tab.editReadonly"
                class="text-xs text-warning-content shrink-0 mr-1 select-none"
                :title="tab.fileReadonly ? t('titlebar.readonly.file') : t('titlebar.readonly.edit')"
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
                  :title="t('titlebar.closeTab')"
                >
                  <IconX class="icon-2xs" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- New Tab Button - 固定在标签右侧 -->
      <div class="flex items-center px-2 no-drag">
        <button
          @click="appStore.createOrActivateTab(undefined, undefined)"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('titlebar.newTab')"
        >
          <IconPlus class="icon-sm" />
        </button>
      </div>
    </div>

    <!-- Flexible drag area - 填充剩余空间，可被完全压缩 -->
    <div
      ref="flexibleDragArea"
      :class="[
        'flex-1 h-full min-w-0',
        dragMode ? 'no-drag' : 'drag-region cursor-move'
      ]"
    ></div>

    <AiStatusButton />
    <div v-if="showCustomWindowControls" class="no-drag -mr-2 flex h-full shrink-0 items-stretch">
      <button
        type="button"
        class="flex h-full w-11 items-center justify-center text-base-content/80 transition-colors hover:bg-base-300 hover:text-base-content"
        :title="t('titlebar.window.minimize')"
        :aria-label="t('titlebar.window.minimize')"
        @click="minimizeWindow"
      >
        <IconMinus class="icon-sm" />
      </button>
      <button
        type="button"
        class="flex h-full w-11 items-center justify-center text-base-content/80 transition-colors hover:bg-base-300 hover:text-base-content"
        :title="isMaximized ? t('titlebar.window.restore') : t('titlebar.window.maximize')"
        :aria-label="isMaximized ? t('titlebar.window.restore') : t('titlebar.window.maximize')"
        @click="toggleMaximizeWindow"
      >
        <IconRestore v-if="isMaximized" class="icon-sm" />
        <IconSquare v-else class="icon-xs" />
      </button>
      <button
        type="button"
        class="flex h-full w-11 items-center justify-center text-base-content/80 transition-colors hover:bg-error hover:text-error-content"
        :title="t('titlebar.window.close')"
        :aria-label="t('titlebar.window.close')"
        @click="closeAppWindow"
      >
        <IconX class="icon-sm" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import type { FileTab } from '@/types'
import type { ContextMenuItem } from '@/types/menu'
import { SidebarMode } from '@/types'
import pathUtils from '@/utils/pathUtils'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import { notify } from '@/utils/notifications'
import { DocumentType } from '@/types'
import { PANDOC_IMPORT_EXTENSIONS } from '@/import-export'
import AppMenuButton from './AppMenuButton.vue'
import AiStatusButton from '@/ai/components/shell/AiStatusButton.vue'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconPlus,
  IconMinus,
  IconRestore,
  IconSquare,
  IconGitCompare,
} from '@tabler/icons-vue'

type DragMode = 'file-open' | 'tab-reorder' | null

interface FileTreeDragData {
  id?: string
  label?: string
  type?: string
  path?: string
}

interface TabDragData {
  tabId: string
}

const FILETREE_DRAG_MIME = 'application/x-iwriter-filetree-node'
const TAB_DRAG_MIME = 'application/x-iwriter-tab'

const appStore = useAppStore()
const { t } = useI18n()
const isMaximized = ref(false)
const tabsDropArea = ref<HTMLElement>()
const tabsContainer = ref<HTMLElement>()
const flexibleDragArea = ref<HTMLElement>()
const tabRefs = ref(new Map<string, HTMLElement>())
let activeTabRef: HTMLElement | null = null

const dragMode = ref<DragMode>(null)
const dropIndicatorVisible = ref(false)
const dropInsertIndex = ref(0)
const dropIndicatorLeft = ref(0)
const draggedTabId = ref<string | null>(null)

const { getIconByExtension } = useDocumentTypeDetector()

const isMacPlatform = computed(() => window.electronAPI?.platform === 'darwin')
const showCustomWindowControls = computed(() => !isMacPlatform.value)
const showAppMenuButton = computed(() => !isMacPlatform.value && !appStore.isLeftSidebarVisible)
const shouldReserveMacTrafficLights = computed(() => isMacPlatform.value && !isMaximized.value && !appStore.isLeftSidebarVisible)

async function minimizeWindow() {
  const result = await window.electronAPI.minimizeWindow()
  if (!result.success) {
    console.warn('Failed to minimize window:', result.error)
  }
}

async function toggleMaximizeWindow() {
  const result = await window.electronAPI.toggleMaximizeWindow()
  if (result.success) {
    if (typeof result.maximized === 'boolean') {
      isMaximized.value = result.maximized
    }
  } else {
    console.warn('Failed to toggle maximize window:', result.error)
  }
}

async function closeAppWindow() {
  const result = await window.electronAPI.closeWindow()
  if (!result.success) {
    console.warn('Failed to close window:', result.error)
  }
}

function setTabRef(tabId: string, el: HTMLElement | null, isActive: boolean) {
  if (el) {
    el.dataset.tabId = tabId
    tabRefs.value.set(tabId, el)
    if (isActive) {
      activeTabRef = el
    }
    return
  }

  tabRefs.value.delete(tabId)
  if (activeTabRef && activeTabRef.dataset.tabId === tabId) {
    activeTabRef = null
  }
}

const tabCount = computed(() => {
  return appStore.tabs.length
})

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
  // 参数型 tab（diff）用 kind 专属图标，不按扩展名（其 name 含"(工作区)"等后缀）
  if (tab.documentType === DocumentType.DIFF_VIEWER) return IconGitCompare
  return getIconByExtension(pathUtils.extension(tab.name))
}

function getTabTitle(tab: FileTab): string {
  if (tab.diskState === 'external-modified') {
    return t('titlebar.tab.externalModifiedTitle', { name: tab.name })
  }

  if (tab.diskState === 'deleted') {
    return t('titlebar.tab.deletedTitle', { name: tab.name })
  }

  return tab.name
}

function getTabNameClass(tab: FileTab): string[] {
  return [
    'flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis mr-2 select-none',
    tab.diskState === 'external-modified' ? 'text-warning' : '',
    tab.diskState === 'deleted' ? 'text-error line-through' : '',
    !tab.diskState || tab.diskState === 'normal' ? 'text-base-content' : '',
  ].filter(Boolean)
}

function switchTab(tabId: string) {
  appStore.setActiveTab(tabId)
  nextTick(() => {
    scrollActiveTabIntoView()
  })
}

function toRelativePath(absPath: string): string {
  const root = appStore.currentFolder
  if (!root) return absPath
  const nRoot = pathUtils.normalize(root).replace(/[\\/]+$/, '')
  const nPath = pathUtils.normalize(absPath)
  if (nPath === nRoot) return pathUtils.basename(nPath)
  const prefix = nRoot + '/'
  return nPath.startsWith(prefix) ? nPath.slice(prefix.length) : nPath
}

function isTabImportable(tab: FileTab): boolean {
  if (tab.documentType !== DocumentType.OFFICE_VIEWER || !tab.path) return false
  const ext = pathUtils.extension(tab.name).toLowerCase()
  return PANDOC_IMPORT_EXTENSIONS.includes(ext)
}

async function handleTabContextMenu(e: MouseEvent, tab: FileTab) {
  const importable = isTabImportable(tab)
  const items: ContextMenuItem[] = [
    { id: 'tab-close', label: t('titlebar.tabMenu.close') },
    { id: 'tab-close-others', label: t('titlebar.tabMenu.closeOthers'), enabled: appStore.tabs.length > 1 },
    { id: 'tab-close-saved', label: t('titlebar.tabMenu.closeSaved') },
    { id: 'tab-close-all', label: t('titlebar.tabMenu.closeAll') },
    { type: 'separator' },
    { id: 'tab-reveal', label: t('titlebar.tabMenu.revealInFolder'), enabled: !!tab.path },
    { type: 'separator' },
    { id: 'tab-copy-path', label: t('titlebar.tabMenu.copyPath'), enabled: !!tab.path },
    { id: 'tab-copy-relative-path', label: t('titlebar.tabMenu.copyRelativePath'), enabled: !!tab.path },
    ...(importable ? [
      { type: 'separator' as const },
      { id: 'tab-import-file', label: t('titlebar.tabMenu.importFile') },
    ] : []),
  ]

  try {
    const action = await window.electronAPI.showContextMenu(items, { x: e.clientX, y: e.clientY })
    switch (action) {
      case 'tab-close':
        await appStore.closeTab(tab.id)
        break
      case 'tab-close-others':
        await appStore.closeOtherTabs(tab.id)
        break
      case 'tab-close-saved':
        await appStore.closeSavedTabs()
        break
      case 'tab-close-all':
        await appStore.closeAllTab()
        break
      case 'tab-reveal':
        if (tab.path) window.electronAPI.revealInFolder(tab.path)
        break
      case 'tab-copy-path':
        if (tab.path) await window.electronAPI.writeClipboardText(tab.path)
        break
      case 'tab-copy-relative-path':
        if (tab.path) await window.electronAPI.writeClipboardText(toRelativePath(tab.path))
        break
      case 'tab-import-file':
        if (tab.path) await appStore.importOfficeToMarkdown(tab.path)
        break
    }
  } catch (error) {
    console.error('Error showing tab context menu:', error)
  }
}

function scrollActiveTabIntoView() {
  if (!tabsContainer.value || !activeTabRef) return

  const container = tabsContainer.value
  const activeTab = activeTabRef

  const containerRect = container.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()

  const isTabVisible = (
    tabRect.left >= containerRect.left &&
    tabRect.right <= containerRect.right
  )

  if (!isTabVisible) {
    const scrollLeft = activeTab.offsetLeft - container.offsetLeft - (container.clientWidth - activeTab.clientWidth) / 2
    container.scrollTo({
      left: scrollLeft,
      behavior: 'smooth'
    })
  }
}

function isPointInsideElement(element: HTMLElement | undefined, clientX: number, clientY: number): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

function isPointInsideTabsDropArea(clientX: number, clientY: number): boolean {
  if (!tabsDropArea.value) return false

  const rect = tabsDropArea.value.getBoundingClientRect()
  const minimumInteractiveWidth = appStore.tabs.length === 0 ? 160 : 0
  const effectiveRight = Math.max(rect.right, rect.left + minimumInteractiveWidth)

  return clientX >= rect.left && clientX <= effectiveRight && clientY >= rect.top && clientY <= rect.bottom
}

function getOrderedTabElements(): HTMLElement[] {
  return appStore.tabs
    .map(tab => {
      const element = tabRefs.value.get(tab.id)
      if (element) {
        element.dataset.tabId = tab.id
      }
      return element
    })
    .filter((element): element is HTMLElement => !!element)
}

function getInsertIndexFromClientX(clientX: number, inFlexibleArea: boolean): number {
  if (inFlexibleArea) {
    return appStore.tabs.length
  }

  const orderedTabs = getOrderedTabElements()
  if (orderedTabs.length === 0) {
    return 0
  }

  for (let index = 0; index < orderedTabs.length; index += 1) {
    const tabElement = orderedTabs[index]
    if (!tabElement) continue
    const rect = tabElement.getBoundingClientRect()
    if (clientX <= rect.right) {
      return clientX < rect.left + rect.width / 2 ? index : index + 1
    }
  }

  return orderedTabs.length
}

function updateDropIndicator(insertIndex: number) {
  if (!tabsContainer.value) return

  const orderedTabs = getOrderedTabElements()
  const container = tabsContainer.value
  const scrollLeft = container.scrollLeft

  let left = 0

  if (orderedTabs.length === 0 || insertIndex <= 0) {
    left = -scrollLeft + 1
  } else if (insertIndex >= orderedTabs.length) {
    const lastTab = orderedTabs[orderedTabs.length - 1]
    left = lastTab ? lastTab.offsetLeft + lastTab.offsetWidth - scrollLeft : -scrollLeft + 1
  } else {
    const targetTab = orderedTabs[insertIndex]
    left = targetTab ? targetTab.offsetLeft - scrollLeft : -scrollLeft + 1
  }

  dropInsertIndex.value = insertIndex
  dropIndicatorLeft.value = left
  dropIndicatorVisible.value = true
}

function clearDragState() {
  dragMode.value = null
  dropIndicatorVisible.value = false
  draggedTabId.value = null
}

function parseJsonData<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function detectDragMode(dataTransfer: DataTransfer | null): DragMode {
  if (!dataTransfer) return null
  const types = Array.from(dataTransfer.types)
  if (types.includes(TAB_DRAG_MIME)) return 'tab-reorder'
  if (types.includes(FILETREE_DRAG_MIME) || types.includes('Files')) return 'file-open'
  return null
}

function updateIndicatorFromPointer(clientX: number, clientY: number, mode: DragMode) {
  const inTabsArea = isPointInsideTabsDropArea(clientX, clientY)
  const inFlexibleArea = isPointInsideElement(flexibleDragArea.value, clientX, clientY)

  if (!inTabsArea && !inFlexibleArea) {
    if (mode !== 'tab-reorder') {
      dropIndicatorVisible.value = false
    }
    return false
  }

  dragMode.value = mode
  updateDropIndicator(getInsertIndexFromClientX(clientX, inFlexibleArea))
  return true
}

function handleTabDragStart(event: DragEvent, tabId: string) {
  if (!event.dataTransfer) return

  const dragData: TabDragData = { tabId }
  event.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(dragData))
  event.dataTransfer.effectAllowed = 'move'
  draggedTabId.value = tabId
  dragMode.value = 'tab-reorder'
  dropIndicatorVisible.value = false
}

async function openDroppedFiles(filePaths: string[], insertIndex: number) {
  let currentInsertIndex = insertIndex
  for (const filePath of filePaths) {
    const didInsert = await appStore.openFileAt(filePath, currentInsertIndex)
    if (didInsert) {
      currentInsertIndex += 1
    }
  }
}

async function resolveExternalDrop(event: DragEvent): Promise<{ filePaths: string[]; folderCount: number }> {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer || !window.electronAPI) {
    return { filePaths: [], folderCount: 0 }
  }

  const filePaths: string[] = []
  let folderCount = 0

  for (const file of Array.from(dataTransfer.files)) {
    const candidatePath = window.electronAPI.getPathForFile(file)
    if (!candidatePath) continue

    const files = await window.electronAPI.getFiles(candidatePath, true)
    if (!files || files.length === 0 || !files[0]) {
      continue
    }

    if (files[0].isDirectory) {
      folderCount += 1
      continue
    }

    filePaths.push(candidatePath)
  }

  return { filePaths, folderCount }
}

async function handleFileOpenDrop(event: DragEvent, insertIndex: number) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  const fileTreeRaw = dataTransfer.getData(FILETREE_DRAG_MIME)
  if (fileTreeRaw) {
    const dragData = parseJsonData<FileTreeDragData>(fileTreeRaw)
    if (dragData?.type === 'folder') {
      notify.warning(t('titlebar.drop.folderUnsupported'))
      return
    }
    if (dragData?.path) {
      await appStore.openFileAt(dragData.path, insertIndex)
    }
    return
  }

  const { filePaths, folderCount } = await resolveExternalDrop(event)
  if (filePaths.length > 0) {
    await openDroppedFiles(filePaths, insertIndex)
  }
  if (folderCount > 0) {
    notify.warning(t('titlebar.drop.folderUnsupported'))
  }
}

function handleTabReorderDrop(event: DragEvent, insertIndex: number) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  const raw = dataTransfer.getData(TAB_DRAG_MIME)
  const dragData = parseJsonData<TabDragData>(raw)
  if (!dragData) return

  const sourceIndex = appStore.tabs.findIndex(tab => tab.id === dragData.tabId)
  if (sourceIndex === -1) return

  const adjustedInsertIndex = sourceIndex < insertIndex ? insertIndex - 1 : insertIndex
  if (adjustedInsertIndex === sourceIndex) return

  appStore.moveTab(dragData.tabId, adjustedInsertIndex)
}

function handleDocumentDragOver(event: DragEvent) {
  const mode = detectDragMode(event.dataTransfer)
  if (!mode) return

  const inTabsArea = isPointInsideTabsDropArea(event.clientX, event.clientY)
  const inFlexibleArea = isPointInsideElement(flexibleDragArea.value, event.clientX, event.clientY)

  if (mode === 'tab-reorder' && draggedTabId.value === null) {
    return
  }

  if (!inTabsArea && !inFlexibleArea) {
    dropIndicatorVisible.value = false
    return
  }

  event.preventDefault()
  updateIndicatorFromPointer(event.clientX, event.clientY, mode)
}

async function handleDocumentDrop(event: DragEvent) {
  const mode = detectDragMode(event.dataTransfer) ?? dragMode.value
  if (!mode) return

  const didHitTitlebar = updateIndicatorFromPointer(event.clientX, event.clientY, mode)
  if (!didHitTitlebar) {
    clearDragState()
    return
  }

  event.preventDefault()

  const insertIndex = dropInsertIndex.value
  try {
    if (mode === 'file-open') {
      await handleFileOpenDrop(event, insertIndex)
    } else if (mode === 'tab-reorder') {
      handleTabReorderDrop(event, insertIndex)
    }
  } finally {
    clearDragState()
  }
}

function handleDocumentDragLeave(event: DragEvent) {
  const mode = detectDragMode(event.dataTransfer) ?? dragMode.value
  if (!mode) return

  const stillInsideTitlebar = isPointInsideTabsDropArea(event.clientX, event.clientY)
    || isPointInsideElement(flexibleDragArea.value, event.clientX, event.clientY)

  if (!stillInsideTitlebar) {
    clearDragState()
  }
}

async function closeTab(tabId: string) {
  await appStore.closeTab(tabId)
}

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

onMounted(() => {
  if (window.electronAPI) {
    if (window.electronAPI.onWindowStateChanged) {
      window.electronAPI.onWindowStateChanged((state: { maximized: boolean }) => {
        isMaximized.value = state.maximized
      })
    }

    window.electronAPI.getWindowMaximized().then(maximized => {
      isMaximized.value = maximized
    }).catch(error => {
      console.warn('Failed to get window maximized state:', error)
      isMaximized.value = false
    })
  }

  checkAndSwitchMode()
})

watch([() => appStore.hasOpenFolder, () => appStore.tabs.length], () => {
  checkAndSwitchMode()
  nextTick(() => {
    if (dropIndicatorVisible.value) {
      updateDropIndicator(Math.min(dropInsertIndex.value, appStore.tabs.length))
    }
  })
})

watch(() => appStore.activeTabId, () => {
  nextTick(() => {
    scrollActiveTabIntoView()
  })
})

</script>

<style scoped>
.titlebar-tabs-viewport {
  position: relative;
}

.titlebar-drop-indicator {
  position: absolute;
  top: 0px;
  bottom: 0px;
  width: 2px;
  border: none;
  background: var(--color-primary, #3b82f6);
  pointer-events: none;
  transform: translateX(-1px);
  z-index: 5;
}
</style>
