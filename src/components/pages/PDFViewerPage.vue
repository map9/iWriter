<template>
  <div class="document-viewer-wrapper">
    <!-- PDF Toolbar -->
    <div class="iw-toolbar" @click.capture="handleToolbarClick">
      <div class="iw-toolbar-group">
        <button
          @click="zoomOut"
          :disabled="zoom <= 0.25"
          class="iw-toolbar-btn btn-sm"
          title="Zoom In (⌘+)"
        >
          <IconZoomOut class="icon-sm" />
        </button>
        
        <div class="iw-stat">
          {{ Math.round(zoom * 100) }}%
        </div>
        
        <button
          @click="zoomIn"
          :disabled="zoom >= 5"
          class="iw-toolbar-btn btn-sm"
          title="Zoom Out (⌘-)"
        >
          <IconZoomIn class="icon-sm" />
        </button>
        
        <button
          @click="zoomToFit"
          class="iw-toolbar-btn btn-sm"
          title="Fit to Page"
        >
          <IconZoomReset class="icon-sm" />
        </button>
      </div>
      
      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>
           
      <div class="iw-toolbar-group">
        <button
          @click="setDisplayMode('continuous')"
          class="btn btn-ghost btn-sm rounded-field px-3 normal-case"
          :class="{ 'btn-active': displayMode === 'continuous' }"
          title="Continuous"
        >
          Continuous
        </button>
        <button
          @click="setDisplayMode('single')"
          class="btn btn-ghost btn-sm field-box px-3 normal-case"
          :class="{ 'btn-active': displayMode === 'single' }"
          title="Single Page"
        >
          Single Page
        </button>
        <button
          @click="setDisplayMode('double')"
          class="btn btn-ghost btn-sm rounded-field px-3 normal-case"
          :class="{ 'btn-active': displayMode === 'double' }"
          title="Double Page"
        >
          Double Page
        </button>
      </div>

      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>
           
      <div class="iw-toolbar-group">
        <button
          @click="previousPageCommand"
          :disabled="currentPage <= 1"
          class="iw-toolbar-btn btn-sm"
          title="Last Page"
        >
          <IconChevronLeft class="icon-sm" />
        </button>
        
        <div class="flex items-center gap-2">
          <input
            v-model.number="pageInput"
            @keydown.enter="goToPage"
            @blur="goToPage"
            type="number"
            :min="1"
            :max="totalPages"
            class="iw-input w-16 text-center"
          />
          <span class="text-sm text-base-content/55">/ {{ totalPages }}</span>
        </div>
        
        <button
          @click="nextPageCommand"
          :disabled="currentPage >= totalPages"
          class="iw-toolbar-btn btn-sm"
          title="Next Page"
        >
          <IconChevronRight class="icon-sm" />
        </button>
      </div>
      
      <div class="iw-toolbar-spacer" />
    </div>
    
    <!-- PDF Display Area -->
    <div
      ref="pdfContainer"
      class="iw-viewer-stage"
      tabindex="0"
      @wheel="handleWheel"
      @scroll.passive="handleScroll"
      @keydown="handleKeydown"
      @mousedown="focusViewer"
    >
      <div
        v-if="displayMode === 'continuous'"
        class="min-h-full w-max min-w-full px-4 py-4"
      >
        <div
          ref="pdfViewer"
          class="flex flex-col gap-4"
        >
          <div
            v-for="row in displayRows"
            :key="row.key"
            class="flex w-full items-center justify-center gap-4"
          >
            <canvas
              v-for="pageNum in row.pages"
              :key="pageNum"
              :ref="el => setCanvasRef(el as Element, pageNum)"
              class="bg-white shadow-sm"
              :class="{ 'ring-2 ring-primary': highlightedPages.has(pageNum) }"
            />
          </div>
        </div>
      </div>

      <div
        v-else
        class="min-h-full w-max min-w-full px-4 py-4"
      >
        <div
          class="flex items-center justify-center"
          :style="pagedStageStyle"
        >
          <div
            ref="pdfViewer"
            class="flex flex-col gap-4"
            :style="pagedViewerStyle"
          >
            <div
              v-for="row in displayRows"
              :key="row.key"
              class="flex items-center justify-center gap-4"
            >
              <canvas
                v-for="pageNum in row.pages"
                :key="pageNum"
                :ref="el => setCanvasRef(el as Element, pageNum)"
                class="bg-white shadow-sm"
                :class="{ 'ring-2 ring-primary': highlightedPages.has(pageNum) }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Error State -->
    <div 
      v-if="error"
      class="flex flex-1 items-center justify-center text-error-content"
    >
      <div class="text-center">
        <IconAlertCircle class="w-12 h-12 mx-auto mb-2" />
        <div class="text-lg mb-2">PDF Loading Failed</div>
        <div class="text-sm text-base-content/55">{{ error }}</div>
      </div>
    </div>
    
    <!-- Loading State -->
    <div 
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-base-100/70 backdrop-blur-sm"
    >
      <div class="text-center">
        <span class="loading loading-spinner loading-lg mb-2"></span>
        <div>Loading PDF...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { FileTab } from '@/types'
import { useAppStore } from '@/stores/app'
import { PdfJsPageRenderProvider } from '@/services/pdf-render/PdfJsPageRenderProvider'
import type { PageRenderProvider } from '@/services/pdf-render/types'
import { 
  IconZoomIn, 
  IconZoomOut, 
  IconZoomReset,
  IconChevronLeft,
  IconChevronRight,
  IconAlertCircle
} from '@tabler/icons-vue'

// Props
interface Props {
  tab: FileTab
}

const props = defineProps<Props>()
const appStore = useAppStore()

type DisplayMode = 'continuous' | 'single' | 'double'

// State
const pdfContainer = ref<HTMLElement>()
const pdfViewer = ref<HTMLElement>()
const zoom = ref(1)
const currentPage = ref(1)
const totalPages = ref(1)
const pageInput = ref(1)
const loading = ref(false)
const error = ref<string | null>(null)
const displayMode = ref<DisplayMode>('continuous')
const containerSize = ref({ width: 0, height: 0 })
const referencePageSize = ref({ width: 0, height: 0 })

// PDF.js references (use non-reactive to avoid proxy issues)
let renderProvider: PageRenderProvider | null = null
const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map())
const visiblePageCache = new Map<number, HTMLCanvasElement>()
const renderedPages = ref<number[]>([])
const renderScale = ref(window.devicePixelRatio || 1)
let isUnmounted = false
let preloadInFlight: Promise<void> | null = null
let resizeObserver: ResizeObserver | null = null
let resizeRaf = 0
let lastContainerSize: { width: number, height: number } | null = null
let pagedGestureAxis: 'x' | 'y' | null = null
let pagedGestureAccumX = 0
let pagedGestureAccumY = 0
let pagedGestureOverscroll = 0
let pagedGestureNavigated = false
let pagedGestureNavigatedAt = 0
let pagedGestureResetTimer: ReturnType<typeof setTimeout> | null = null
const PAGE_PRELOAD_RANGE = 2
const PAGE_UNLOAD_RANGE = 6
const PAGED_GAP = 16
const VIEWER_PADDING = 32
const PAGED_KEYBOARD_SCROLL_STEP = 48
const PAGED_GESTURE_IDLE_MS = 120
const PAGED_GESTURE_AXIS_THRESHOLD = 10
const PAGED_GESTURE_NAV_THRESHOLD = 72
const PAGED_GESTURE_POST_NAV_LOCK_MS = 90

const pageDisplaySize = computed(() => ({
  width: referencePageSize.value.width * zoom.value,
  height: referencePageSize.value.height * zoom.value
}))

const pagedContentSize = computed(() => {
  if (displayMode.value === 'double') {
    return {
      width: pageDisplaySize.value.width * 2 + PAGED_GAP,
      height: pageDisplaySize.value.height
    }
  }

  return {
    width: pageDisplaySize.value.width,
    height: pageDisplaySize.value.height
  }
})

const pagedStageStyle = computed(() => {
  const availableWidth = Math.max(containerSize.value.width - VIEWER_PADDING, 0)
  const availableHeight = Math.max(containerSize.value.height - VIEWER_PADDING, 0)

  return {
    width: `${Math.max(availableWidth, pagedContentSize.value.width)}px`,
    height: `${Math.max(availableHeight, pagedContentSize.value.height)}px`
  }
})

const pagedViewerStyle = computed(() => {
  return {
    width: `${pagedContentSize.value.width}px`,
    minHeight: `${pagedContentSize.value.height}px`,
    justifyContent: 'center'
  }
})

const highlightedPages = computed(() => {
  if (displayMode.value === 'double') {
    const start = getSpreadStart(currentPage.value)
    return new Set([start, Math.min(start + 1, totalPages.value)].filter(page => page >= 1 && page <= totalPages.value))
  }
  return new Set([currentPage.value])
})

const displayRows = computed(() => {
  const pages = getSortedRenderedPages()

  if (displayMode.value !== 'double') {
    return pages.map(pageNum => ({
      key: `page-${pageNum}`,
      pages: [pageNum]
    }))
  }

  const rows: Array<{ key: string, pages: number[] }> = []
  for (let index = 0; index < pages.length; index += 2) {
    const rowPages = pages.slice(index, index + 2)
    rows.push({
      key: `spread-${rowPages.join('-')}`,
      pages: rowPages
    })
  }
  return rows
})

// Helper function to set canvas ref
function setCanvasRef(el: Element | null, pageNum: number) {
  if (el instanceof HTMLCanvasElement) {
    canvasRefs.value.set(pageNum, el)
    copyCachedCanvasToVisible(pageNum, el)
  }
}

function syncTocActivePage(pageNum: number) {
  const provider = props.tab.tocProvider as { updateActivePage?: (page: number) => void } | undefined
  provider?.updateActivePage?.(pageNum)
}

// Computed
const pdfUrl = computed(() => {
  if (props.tab.path) {
    return props.tab.path
  }
  return ''
})

// Methods
function zoomIn() {
  zoom.value = Math.min(zoom.value * 1.2, 5)
  void rerenderAllPages()
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / 1.2, 0.25)
  void rerenderAllPages()
}

function zoomToFit() {
  void applyDefaultZoomForDisplayMode(displayMode.value)
}

// 重新渲染所有已加载的页面
async function rerenderAllPages() {
  await nextTick()
  for (const pageNum of renderedPages.value) {
    await renderPage(pageNum)
  }
}

function getSortedRenderedPages(): number[] {
  return [...renderedPages.value].sort((a, b) => a - b)
}

async function ensurePagesRendered(pageNums: number[]) {
  const uniquePageNums = [...new Set(pageNums)]
    .filter(pageNum => pageNum >= 1 && pageNum <= totalPages.value)
    .sort((a, b) => a - b)

  if (uniquePageNums.length === 0) return

  const pagesToAdd = uniquePageNums.filter(pageNum => !renderedPages.value.includes(pageNum))
  if (pagesToAdd.length > 0) {
    renderedPages.value = [...getSortedRenderedPages(), ...pagesToAdd].sort((a, b) => a - b)
    await nextTick()
  }

  for (const pageNum of uniquePageNums) {
    await renderPage(pageNum)
  }
}

function unloadRenderedPages(keepPages: number[]) {
  const keepSet = new Set(keepPages)
  const pagesToRemove = renderedPages.value.filter(pageNum => !keepSet.has(pageNum))

  if (pagesToRemove.length === 0) return

  for (const pageNum of pagesToRemove) {
    const canvas = canvasRefs.value.get(pageNum)
    if (canvas) {
      const context = canvas.getContext('2d')
      context?.clearRect(0, 0, canvas.width, canvas.height)
      canvas.width = 0
      canvas.height = 0
      canvas.style.width = '0px'
      canvas.style.height = '0px'
    }
    canvasRefs.value.delete(pageNum)
    visiblePageCache.delete(pageNum)
  }

  renderedPages.value = renderedPages.value.filter(pageNum => keepSet.has(pageNum))
}

function trimRenderedPages(anchorPage = currentPage.value) {
  if (displayMode.value !== 'continuous') return
  if (renderedPages.value.length === 0) return

  const keepPages: number[] = []
  const start = Math.max(1, anchorPage - PAGE_UNLOAD_RANGE)
  const end = Math.min(totalPages.value, anchorPage + PAGE_UNLOAD_RANGE)

  for (let pageNum = start; pageNum <= end; pageNum++) {
    keepPages.push(pageNum)
  }
  unloadRenderedPages(keepPages)
}

function previousPage(options?: { preservePagedGesture?: boolean }) {
  const step = displayMode.value === 'double' ? 2 : 1
  const nextPageNum = displayMode.value === 'double'
    ? Math.max(1, getSpreadStart(currentPage.value) - step)
    : Math.max(1, currentPage.value - step)

  if (nextPageNum === currentPage.value) return
  setCurrentPage(nextPageNum, { preservePagedGesture: options?.preservePagedGesture })
}

function nextPage(options?: { preservePagedGesture?: boolean }) {
  const step = displayMode.value === 'double' ? 2 : 1
  const nextPageNum = displayMode.value === 'double'
    ? Math.min(totalPages.value, getSpreadStart(currentPage.value) + step)
    : Math.min(totalPages.value, currentPage.value + step)

  if (nextPageNum === currentPage.value) return
  setCurrentPage(nextPageNum, { preservePagedGesture: options?.preservePagedGesture })
}

function previousPageCommand() {
  previousPage()
}

function nextPageCommand() {
  nextPage()
}

function goToPage() {
  const page = Math.max(1, Math.min(pageInput.value, totalPages.value))
  setCurrentPage(page)
}

// 滚动到指定页面
function scrollToPage(pageNum: number, behavior: ScrollBehavior = 'auto') {
  const canvas = canvasRefs.value.get(pageNum)
  if (canvas && pdfContainer.value) {
    canvas.scrollIntoView({
      behavior,
      block: displayMode.value === 'continuous' ? 'start' : 'center',
      inline: 'center'
    })
  } else if (pdfContainer.value) {
    pdfContainer.value.scrollTop = 0
    pdfContainer.value.scrollLeft = 0
  }
}

function getSpreadStart(pageNum: number): number {
  if (pageNum <= 1) return 1
  return pageNum % 2 === 0 ? pageNum - 1 : pageNum
}

function getDisplayPageSet(pageNum = currentPage.value): number[] {
  if (displayMode.value === 'single') {
    return [pageNum]
  }

  if (displayMode.value === 'double') {
    const start = getSpreadStart(pageNum)
    return [start, start + 1].filter(page => page >= 1 && page <= totalPages.value)
  }

  const pages: number[] = []
  const start = Math.max(1, pageNum - PAGE_PRELOAD_RANGE)
  const end = Math.min(totalPages.value, pageNum + PAGE_PRELOAD_RANGE)
  for (let page = start; page <= end; page++) {
    pages.push(page)
  }
  return pages
}

function getPreloadPageSet(pageNum = currentPage.value): number[] {
  if (displayMode.value === 'continuous') {
    return getDisplayPageSet(pageNum)
  }

  const pages = new Set<number>(getDisplayPageSet(pageNum))

  if (displayMode.value === 'single') {
    for (const page of [pageNum - 1, pageNum + 1]) {
      if (page >= 1 && page <= totalPages.value) {
        pages.add(page)
      }
    }
  } else {
    const spreadStart = getSpreadStart(pageNum)
    for (const adjacentStart of [spreadStart - 2, spreadStart + 2]) {
      for (const page of [adjacentStart, adjacentStart + 1]) {
        if (page >= 1 && page <= totalPages.value) {
          pages.add(page)
        }
      }
    }
  }

  return [...pages].sort((a, b) => a - b)
}

async function syncDisplayPages(options?: { preserveScroll?: boolean, behavior?: ScrollBehavior, targetPage?: number }) {
  const pages = getDisplayPageSet(currentPage.value)
  await ensurePagesRendered(pages)
  const targetPage = options?.targetPage ?? currentPage.value

  if (displayMode.value === 'continuous') {
    trimRenderedPages(currentPage.value)
    if (!options?.preserveScroll) {
      scrollToPage(targetPage, options?.behavior ?? 'auto')
    }
  } else {
    unloadRenderedPages(pages)
    if (!options?.preserveScroll) {
      await nextTick()
      scrollToPage(targetPage, options?.behavior ?? 'auto')
    }
  }
}

function setCurrentPage(pageNum: number, options?: { behavior?: ScrollBehavior, preservePagedGesture?: boolean }) {
  if (!options?.preservePagedGesture) {
    resetPagedGesture()
  }
  currentPage.value = pageNum
  pageInput.value = pageNum
  syncTocActivePage(pageNum)

  void syncDisplayPages({
    behavior: options?.behavior,
    targetPage: pageNum
  }).then(() => {
    void preloadNearbyPages()
  })
}

async function setDisplayMode(mode: DisplayMode) {
  if (displayMode.value === mode) return

  displayMode.value = mode
  await nextTick()

  if (mode === 'double') {
    currentPage.value = getSpreadStart(currentPage.value)
    pageInput.value = currentPage.value
  }

  await applyDefaultZoomForDisplayMode(mode)
  await syncDisplayPages()
  void preloadNearbyPages()
}

async function loadPDF() {
  if (!pdfUrl.value) {
    error.value = '无效的PDF文件路径'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    renderProvider = new PdfJsPageRenderProvider()
    await renderProvider.load(pdfUrl.value)
    totalPages.value = renderProvider.getPageCount()
    currentPage.value = 1
    pageInput.value = 1
    const referenceViewport = await renderProvider.getReferencePageSize()
    if (referenceViewport) {
      referencePageSize.value = {
        width: referenceViewport.width,
        height: referenceViewport.height
      }
    }

    const tocProvider = renderProvider.createTocProvider?.(pageNumber => {
      setCurrentPage(pageNumber, { behavior: 'smooth' })
      focusViewer()
    }) ?? undefined
    appStore.updateTabState(props.tab.id, { tocProvider })
    void (tocProvider as { load?: () => Promise<void> })?.load?.()

    await applyDefaultZoomForDisplayMode(displayMode.value)
    await syncDisplayPages()
    syncTocActivePage(1)
    focusViewer()
    
  } catch (err) {
    error.value = `PDF loading failed: ${err instanceof Error ? err.message : String(err)}`
    console.error('PDF loading error:', err)
  } finally {
    loading.value = false
  }
}

async function renderPage(pageNum: number) {
  if (!renderProvider || isUnmounted) return
  if (pageNum < 1 || pageNum > totalPages.value) return

  const renderedCanvas = await renderProvider.renderPage(pageNum, zoom.value, renderScale.value)
  if (!renderedCanvas) return

  visiblePageCache.set(pageNum, renderedCanvas)
  copyCachedCanvasToVisible(pageNum)
}

async function renderCurrentPage() {
  await syncDisplayPages({ preserveScroll: true })
}

// 预加载附近页面
async function preloadNearbyPages() {
  if (!renderProvider || totalPages.value === 0) {
    console.warn('PDF document not ready for preloading')
    return
  }

  try {
    const pageNums = getPreloadPageSet(currentPage.value)
    if (displayMode.value === 'continuous') {
      await ensurePagesRendered(pageNums)
      trimRenderedPages(currentPage.value)
    } else {
      for (const pageNum of pageNums) {
        await renderPage(pageNum)
      }
    }
  } catch (err) {
    console.error('Failed to preload nearby PDF pages:', err)
  }
}

function updateCurrentPageFromScroll() {
  if (displayMode.value !== 'continuous') return
  if (!pdfContainer.value) return

  const containerRect = pdfContainer.value.getBoundingClientRect()
  const viewportCenterY = containerRect.top + containerRect.height / 2
  let nearestPage = currentPage.value
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const pageNum of getSortedRenderedPages()) {
    const canvas = canvasRefs.value.get(pageNum)
    if (!canvas) continue

    const rect = canvas.getBoundingClientRect()
    const pageCenterY = rect.top + rect.height / 2
    const distance = Math.abs(pageCenterY - viewportCenterY)

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestPage = pageNum
    }
  }

  if (nearestPage !== currentPage.value) {
    currentPage.value = nearestPage
    pageInput.value = nearestPage
    syncTocActivePage(nearestPage)
  }
}

function queueScrollPreload() {
  if (displayMode.value !== 'continuous') return
  if (preloadInFlight) return

  const task = (async () => {
    const sortedPages = getSortedRenderedPages()
    if (!pdfContainer.value || sortedPages.length === 0 || totalPages.value === 0) return

    const firstPage = sortedPages[0]
    const lastPage = sortedPages[sortedPages.length - 1]
    if (firstPage == null || lastPage == null) return

    const container = pdfContainer.value
    const threshold = Math.max(container.clientHeight * 0.75, 400)
    const pagesToLoad: number[] = []
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const distanceToTop = container.scrollTop

    if (distanceToBottom < threshold) {
      for (let pageNum = lastPage + 1; pageNum <= Math.min(lastPage + PAGE_PRELOAD_RANGE, totalPages.value); pageNum++) {
        pagesToLoad.push(pageNum)
      }
    }

    if (distanceToTop < threshold) {
      for (let pageNum = Math.max(1, firstPage - PAGE_PRELOAD_RANGE); pageNum < firstPage; pageNum++) {
        pagesToLoad.push(pageNum)
      }
    }

    if (pagesToLoad.length > 0) {
      await ensurePagesRendered(pagesToLoad)
    }

    trimRenderedPages(currentPage.value)
  })()

  preloadInFlight = task
  task.finally(() => {
    if (preloadInFlight === task) {
      preloadInFlight = null
    }
  })
}

function handleScroll() {
  if (!pdfContainer.value) return
  if (displayMode.value !== 'continuous') {
    return
  }
  updateCurrentPageFromScroll()
  queueScrollPreload()
}

// Handle menu actions
function handleMenuAction(action: string): boolean {
  switch (action) {
    case 'zoom-in':
      zoomIn()
      return true
    case 'zoom-out':
      zoomOut()
      return true
    case 'zoom-to-fit':
      zoomToFit()
      return true
    case 'previous-page':
      previousPage()
      return true
    case 'next-page':
      nextPage()
      return true
    case 'go-to-page':
      // This would need page number parameter
      return true
    default:
      return false
  }
}

// Focus handling
function focusViewer() {
  pdfContainer.value?.focus()
}

function handleToolbarClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('button')) return
  focusViewer()
}

function resetPagedGesture() {
  pagedGestureAxis = null
  pagedGestureAccumX = 0
  pagedGestureAccumY = 0
  pagedGestureOverscroll = 0
  pagedGestureNavigated = false
  pagedGestureNavigatedAt = 0
  if (pagedGestureResetTimer) {
    clearTimeout(pagedGestureResetTimer)
    pagedGestureResetTimer = null
  }
}

function schedulePagedGestureReset() {
  if (pagedGestureResetTimer) {
    clearTimeout(pagedGestureResetTimer)
  }

  pagedGestureResetTimer = setTimeout(() => {
    resetPagedGesture()
  }, PAGED_GESTURE_IDLE_MS)
}

function clampScroll(value: number, max: number) {
  return Math.max(0, Math.min(max, value))
}

function handlePagedWheelGesture(deltaX: number, deltaY: number): boolean {
  if (displayMode.value === 'continuous' || !pdfContainer.value) {
    return false
  }

  schedulePagedGestureReset()
  const now = Date.now()

  if (pagedGestureNavigated) {
    const sameDirectionAsAccumulated = (
      (Math.abs(deltaX) >= Math.abs(deltaY) && Math.sign(deltaX) === Math.sign(pagedGestureAccumX)) ||
      (Math.abs(deltaY) > Math.abs(deltaX) && Math.sign(deltaY) === Math.sign(pagedGestureAccumY))
    )

    if (!sameDirectionAsAccumulated || now - pagedGestureNavigatedAt > PAGED_GESTURE_POST_NAV_LOCK_MS) {
      resetPagedGesture()
      schedulePagedGestureReset()
    }
  }

  const container = pdfContainer.value
  const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0)
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  pagedGestureAccumX += deltaX
  pagedGestureAccumY += deltaY

  if (!pagedGestureAxis) {
    const absX = Math.abs(pagedGestureAccumX)
    const absY = Math.abs(pagedGestureAccumY)
    if (Math.max(absX, absY) < PAGED_GESTURE_AXIS_THRESHOLD) {
      return true
    }

    pagedGestureAxis = absX > absY ? 'x' : 'y'
  }

  if (pagedGestureNavigated) {
    return true
  }

  const axis = pagedGestureAxis
  const delta = axis === 'x' ? deltaX : deltaY
  if (delta === 0) {
    return true
  }

  const isBackward = delta < 0
  const currentScroll = axis === 'x' ? container.scrollLeft : container.scrollTop
  const maxScroll = axis === 'x' ? maxScrollLeft : maxScrollTop
  const nextScroll = clampScroll(currentScroll + delta, maxScroll)
  const moved = nextScroll !== currentScroll

  if (axis === 'x') {
    container.scrollLeft = nextScroll
  } else {
    container.scrollTop = nextScroll
  }

  if (moved) {
    pagedGestureOverscroll = 0
    return true
  }

  const atBoundary = isBackward ? currentScroll <= 0 : currentScroll >= maxScroll
  if (!atBoundary) {
    pagedGestureOverscroll = 0
    return true
  }

  pagedGestureOverscroll += Math.abs(delta)
  if (pagedGestureOverscroll < PAGED_GESTURE_NAV_THRESHOLD) {
    return true
  }

  pagedGestureNavigated = true
  pagedGestureNavigatedAt = now
  pagedGestureOverscroll = 0
  if (isBackward) {
    previousPage({ preservePagedGesture: true })
  } else {
    nextPage({ preservePagedGesture: true })
  }
  return true
}

function handlePagedKeyboardNavigation(direction: 'left' | 'right' | 'up' | 'down'): boolean {
  if (displayMode.value === 'continuous' || !pdfContainer.value) {
    return false
  }

  const container = pdfContainer.value
  const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0)
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)

  switch (direction) {
    case 'left': {
      if (container.scrollLeft > 0) {
        container.scrollLeft = clampScroll(container.scrollLeft - PAGED_KEYBOARD_SCROLL_STEP, maxScrollLeft)
      } else {
        previousPage()
      }
      return true
    }
    case 'right': {
      if (container.scrollLeft < maxScrollLeft) {
        container.scrollLeft = clampScroll(container.scrollLeft + PAGED_KEYBOARD_SCROLL_STEP, maxScrollLeft)
      } else {
        nextPage()
      }
      return true
    }
    case 'up': {
      if (container.scrollTop > 0) {
        container.scrollTop = clampScroll(container.scrollTop - PAGED_KEYBOARD_SCROLL_STEP, maxScrollTop)
      } else {
        previousPage()
      }
      return true
    }
    case 'down': {
      if (container.scrollTop < maxScrollTop) {
        container.scrollTop = clampScroll(container.scrollTop + PAGED_KEYBOARD_SCROLL_STEP, maxScrollTop)
      } else {
        nextPage()
      }
      return true
    }
  }
}

function copyCachedCanvasToVisible(pageNum: number, explicitCanvas?: HTMLCanvasElement) {
  const source = visiblePageCache.get(pageNum)
  const target = explicitCanvas ?? canvasRefs.value.get(pageNum)
  if (!source || !target) return

  target.width = source.width
  target.height = source.height
  target.style.width = `${source.width / renderScale.value}px`
  target.style.height = `${source.height / renderScale.value}px`

  const targetContext = target.getContext('2d', { willReadFrequently: true })
  if (!targetContext) return
  targetContext.clearRect(0, 0, target.width, target.height)
  targetContext.drawImage(source, 0, 0)
}

function scheduleResizeHandling() {
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf)
  }

  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    handleContainerResize()
  })
}

function handleContainerResize() {
  if (!pdfContainer.value) return

  const nextSize = {
    width: pdfContainer.value.clientWidth,
    height: pdfContainer.value.clientHeight
  }
  containerSize.value = nextSize

  if (nextSize.width <= 0 || nextSize.height <= 0) return

  if (!lastContainerSize) {
    lastContainerSize = nextSize
    return
  }

  const widthRatio = nextSize.width / lastContainerSize.width
  const heightRatio = nextSize.height / lastContainerSize.height
  const prevSize = lastContainerSize
  lastContainerSize = nextSize

  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio)) return
  if (!referencePageSize.value.width || !referencePageSize.value.height) return

  const prevAvailableWidth = Math.max(prevSize.width - 48, 200)
  const prevAvailableHeight = Math.max(prevSize.height - 48, 200)
  const nextAvailableWidth = Math.max(nextSize.width - 48, 200)
  const nextAvailableHeight = Math.max(nextSize.height - 48, 200)

  let prevFit = 1
  let nextFit = 1

  if (displayMode.value === 'continuous') {
    prevFit = prevAvailableWidth / referencePageSize.value.width
    nextFit = nextAvailableWidth / referencePageSize.value.width
  } else if (displayMode.value === 'single') {
    prevFit = Math.min(
      prevAvailableWidth / referencePageSize.value.width,
      prevAvailableHeight / referencePageSize.value.height
    )
    nextFit = Math.min(
      nextAvailableWidth / referencePageSize.value.width,
      nextAvailableHeight / referencePageSize.value.height
    )
  } else {
    prevFit = Math.min(
      (prevAvailableWidth - PAGED_GAP) / (referencePageSize.value.width * 2),
      prevAvailableHeight / referencePageSize.value.height
    )
    nextFit = Math.min(
      (nextAvailableWidth - PAGED_GAP) / (referencePageSize.value.width * 2),
      nextAvailableHeight / referencePageSize.value.height
    )
  }

  if (!Number.isFinite(prevFit) || !Number.isFinite(nextFit) || prevFit <= 0 || nextFit <= 0) return

  const ratio = nextFit / prevFit

  if (Math.abs(ratio - 1) < 0.01) return

  zoom.value = Math.min(Math.max(zoom.value * ratio, 0.25), 5)
  visiblePageCache.clear()
  void rerenderAllPages().then(() => {
    void preloadNearbyPages()
  })
}

// Keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  
  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (!handlePagedKeyboardNavigation('left')) {
        previousPage()
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      if (!handlePagedKeyboardNavigation('up')) {
        previousPage()
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (!handlePagedKeyboardNavigation('right')) {
        nextPage()
      }
      break
    case 'ArrowDown':
      event.preventDefault()
      if (!handlePagedKeyboardNavigation('down')) {
        nextPage()
      }
      break
    case 'PageUp':
      event.preventDefault()
      previousPage()
      break
    case 'PageDown':
    case ' ':
      event.preventDefault()
      nextPage()
      break
    case 'Home':
      event.preventDefault()
      setCurrentPage(1)
      break
    case 'End':
      event.preventDefault()
      setCurrentPage(displayMode.value === 'double' ? getSpreadStart(totalPages.value) : totalPages.value)
      break
    case '+':
    case '=':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomIn()
      }
      break
    case '-':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomOut()
      }
      break
    case '0':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomToFit()
      }
      break
  }
}

// 鼠标滚轮缩放
function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (event.deltaY < 0) {
      zoomIn()
    } else {
      zoomOut()
    }
    return
  }

  if (displayMode.value !== 'continuous') {
    const handled = handlePagedWheelGesture(event.deltaX, event.deltaY)
    if (handled) {
      event.preventDefault()
    }
  }
}

onMounted(() => {
  isUnmounted = false
  if (pdfUrl.value) {
    void loadPDF()
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      scheduleResizeHandling()
    })

    if (pdfContainer.value) {
      resizeObserver.observe(pdfContainer.value)
      const initialSize = {
        width: pdfContainer.value.clientWidth,
        height: pdfContainer.value.clientHeight
      }
      containerSize.value = initialSize
      lastContainerSize = initialSize
    }
  }
})

onBeforeUnmount(async () => {
  isUnmounted = true
  resetPagedGesture()
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = 0
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  await renderProvider?.destroy()
  renderProvider = null
  
  // 清理canvas引用
  canvasRefs.value.clear()
  visiblePageCache.clear()
  renderedPages.value = []

  if (props.tab.tocProvider) {
    appStore.updateTabState(props.tab.id, { tocProvider: undefined })
  }
})

async function applyDefaultZoomForDisplayMode(mode: DisplayMode) {
  const viewport = await renderProvider?.getReferencePageSize()
  if (!viewport || !pdfContainer.value) return
  referencePageSize.value = {
    width: viewport.width,
    height: viewport.height
  }

  const horizontalPadding = 48
  const verticalPadding = 48
  const availableWidth = Math.max((containerSize.value.width || pdfContainer.value.clientWidth) - horizontalPadding, 200)
  const availableHeight = Math.max((containerSize.value.height || pdfContainer.value.clientHeight) - verticalPadding, 200)

  if (mode === 'continuous') {
    zoom.value = Math.min(availableWidth / viewport.width, 4)
  } else if (mode === 'single') {
    zoom.value = Math.min(availableWidth / viewport.width, availableHeight / viewport.height, 4)
  } else {
    const spreadGap = 16
    zoom.value = Math.min((availableWidth - spreadGap) / (viewport.width * 2), availableHeight / viewport.height, 4)
  }

  await rerenderAllPages()
}

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
  focusViewer
})
</script>
