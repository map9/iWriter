<template>
  <div class="document-viewer-wrapper">
    <!-- PDF Toolbar -->
    <div class="toolbar" @click.capture="handleToolbarClick">
      <div class="toolbar-group">
        <button
          @click="zoomOut"
          :disabled="zoom <= 0.25"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="缩小"
        >
          <IconZoomOut class="w-5 h-5" />
        </button>
        
        <div class="px-3 py-1 text-sm bg-gray-100 rounded min-w-[80px] text-center">
          {{ Math.round(zoom * 100) }}%
        </div>
        
        <button
          @click="zoomIn"
          :disabled="zoom >= 5"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="放大"
        >
          <IconZoomIn class="w-5 h-5" />
        </button>
        
        <button
          @click="zoomToFit"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="适应页面"
        >
          <IconZoomReset class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <div class="toolbar-group">
        <button
          @click="setDisplayMode('continuous')"
          class="px-2.5 py-1 text-sm rounded hover:bg-gray-200 transition-colors shrink-0 whitespace-nowrap leading-none"
          :class="{ 'bg-gray-200 font-medium': displayMode === 'continuous' }"
          title="连续滚动"
        >
          连续
        </button>
        <button
          @click="setDisplayMode('single')"
          class="px-2.5 py-1 text-sm rounded hover:bg-gray-200 transition-colors shrink-0 whitespace-nowrap leading-none"
          :class="{ 'bg-gray-200 font-medium': displayMode === 'single' }"
          title="单页显示"
        >
          单页
        </button>
        <button
          @click="setDisplayMode('double')"
          class="px-2.5 py-1 text-sm rounded hover:bg-gray-200 transition-colors shrink-0 whitespace-nowrap leading-none"
          :class="{ 'bg-gray-200 font-medium': displayMode === 'double' }"
          title="双页显示"
        >
          双页
        </button>
      </div>

      <div class="toolbar-separator" />

      <div class="toolbar-group">
        <button
          @click="previousPage"
          :disabled="currentPage <= 1"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="上一页"
        >
          <IconChevronLeft class="w-5 h-5" />
        </button>
        
        <div class="flex items-center gap-2">
          <input
            v-model.number="pageInput"
            @keydown.enter="goToPage"
            @blur="goToPage"
            type="number"
            :min="1"
            :max="totalPages"
            class="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span class="text-sm text-gray-600">/ {{ totalPages }}</span>
        </div>
        
        <button
          @click="nextPage"
          :disabled="currentPage >= totalPages"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="下一页"
        >
          <IconChevronRight class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-spacer" />
    </div>
    
    <!-- PDF Display Area -->
    <div
      ref="pdfContainer"
      class="flex-1 overflow-auto bg-gray-200 outline-none focus:outline-none"
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
              class="shadow-lg bg-white"
              :class="{ 'ring-2 ring-blue-500': highlightedPages.has(pageNum) }"
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
                class="shadow-lg bg-white"
                :class="{ 'ring-2 ring-blue-500': highlightedPages.has(pageNum) }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Error State -->
    <div 
      v-if="error"
      class="flex-1 flex items-center justify-center text-red-500"
    >
      <div class="text-center">
        <IconAlertCircle class="w-12 h-12 mx-auto mb-2" />
        <div class="text-lg mb-2">PDF 加载失败</div>
        <div class="text-sm text-gray-600">{{ error }}</div>
      </div>
    </div>
    
    <!-- Loading State -->
    <div 
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50"
    >
      <div class="text-center">
        <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
        <div>加载 PDF...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { FileTab } from '@/types'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useAppStore } from '@/stores/app'
import { PDFTocProvider } from '@/services/toc/PDFTocProvider'
import { 
  IconZoomIn, 
  IconZoomOut, 
  IconZoomReset,
  IconChevronLeft,
  IconChevronRight,
  IconAlertCircle
} from '@tabler/icons-vue'

// 设置PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

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
let pdfDocumentInstance: pdfjsLib.PDFDocumentProxy | null = null
let pdfTocProvider: PDFTocProvider | null = null
const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map())
const renderedCanvasCache = new Map<number, HTMLCanvasElement>()
const renderedPages = ref<number[]>([])
const renderScale = ref(window.devicePixelRatio || 1)
const activeRenderTasks = new Map<number, pdfjsLib.RenderTask>()
let isUnmounted = false
let preloadInFlight: Promise<void> | null = null
let resizeObserver: ResizeObserver | null = null
let resizeRaf = 0
let lastContainerSize: { width: number, height: number } | null = null
let lastPagedBoundaryNavigationAt = 0
const PAGE_PRELOAD_RANGE = 2
const PAGE_UNLOAD_RANGE = 6
const PAGED_GAP = 16
const VIEWER_PADDING = 32
const PAGED_KEYBOARD_SCROLL_STEP = 48
const PAGED_BOUNDARY_NAV_COOLDOWN = 220

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

function isRenderCancelled(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'RenderingCancelledException' ||
    error.message.includes('Rendering cancelled')
  )
}

async function cancelRenderTask(pageNum: number) {
  const existingTask = activeRenderTasks.get(pageNum)
  if (!existingTask) return

  existingTask.cancel()
  activeRenderTasks.delete(pageNum)

  try {
    await existingTask.promise
  } catch (err) {
    if (!isRenderCancelled(err)) {
      console.warn(`Unexpected error while cancelling page ${pageNum} render:`, err)
    }
  }
}

// Helper function to set canvas ref
function setCanvasRef(el: Element | null, pageNum: number) {
  if (el instanceof HTMLCanvasElement) {
    canvasRefs.value.set(pageNum, el)
    copyCachedCanvasToVisible(pageNum, el)
  }
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

function previousPage() {
  const step = displayMode.value === 'double' ? 2 : 1
  const nextPageNum = displayMode.value === 'double'
    ? Math.max(1, getSpreadStart(currentPage.value) - step)
    : Math.max(1, currentPage.value - step)

  if (nextPageNum === currentPage.value) return
  setCurrentPage(nextPageNum)
}

function nextPage() {
  const step = displayMode.value === 'double' ? 2 : 1
  const nextPageNum = displayMode.value === 'double'
    ? Math.min(totalPages.value, getSpreadStart(currentPage.value) + step)
    : Math.min(totalPages.value, currentPage.value + step)

  if (nextPageNum === currentPage.value) return
  setCurrentPage(nextPageNum)
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

function setCurrentPage(pageNum: number, options?: { behavior?: ScrollBehavior }) {
  currentPage.value = pageNum
  pageInput.value = pageNum
  pdfTocProvider?.updateActivePage(pageNum)

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
    let pdfData: ArrayBuffer
    
    // 检查是否是本地文件路径
    if (pdfUrl.value.startsWith('/') || pdfUrl.value.match(/^[A-Z]:\\/)) {
      // 本地文件路径，通过Electron读取文件
      if (window.electronAPI) {
        const base64Content = await window.electronAPI.readFileBinary(pdfUrl.value)
        if (!base64Content) {
          throw new Error('无法读取PDF文件')
        }
        // 将base64字符串转换为ArrayBuffer
        const binaryString = atob(base64Content)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        pdfData = bytes.buffer
      } else {
        throw new Error('Electron API 不可用')
      }
    } else {
      // 网络URL，直接获取
      const response = await fetch(pdfUrl.value)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      pdfData = await response.arrayBuffer()
    }
    
    // 加载PDF文档
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: '/cmaps/',
      cMapPacked: true
    })
    
    const pdf = await loadingTask.promise
    
    // 验证PDF文档
    if (!pdf || pdf.numPages === 0) {
      throw new Error('无效的PDF文档')
    }
    
    pdfDocumentInstance = pdf
    totalPages.value = pdf.numPages
    currentPage.value = 1
    pageInput.value = 1
    const referenceViewport = await getReferenceViewport()
    if (referenceViewport) {
      referencePageSize.value = {
        width: referenceViewport.width,
        height: referenceViewport.height
      }
    }

    pdfTocProvider?.destroy()
    pdfTocProvider = new PDFTocProvider(pdf, pageNumber => {
      setCurrentPage(pageNumber, { behavior: 'smooth' })
      focusViewer()
    })
    appStore.updateTabState(props.tab.id, { tocProvider: pdfTocProvider })
    void pdfTocProvider.load()

    await applyDefaultZoomForDisplayMode(displayMode.value)
    await syncDisplayPages()
    pdfTocProvider.updateActivePage(1)
    focusViewer()
    
  } catch (err) {
    error.value = `PDF文件加载失败: ${err instanceof Error ? err.message : String(err)}`
    console.error('PDF loading error:', err)
  } finally {
    loading.value = false
  }
}

async function renderPage(pageNum: number) {
  if (!pdfDocumentInstance || isUnmounted) {
    console.warn('PDF document not available')
    return
  }
  
  // Check if page number is valid
  if (pageNum < 1 || pageNum > totalPages.value) {
    console.warn(`Invalid page number: ${pageNum}`)
    return
  }
  
  try {
    await cancelRenderTask(pageNum)

    const page = await pdfDocumentInstance.getPage(pageNum)
    if (isUnmounted) return
    
    // 计算视口
    const viewport = page.getViewport({ scale: zoom.value * renderScale.value })

    const bufferCanvas = document.createElement('canvas')
    bufferCanvas.width = viewport.width
    bufferCanvas.height = viewport.height
    const bufferContext = bufferCanvas.getContext('2d', { willReadFrequently: true })
    if (!bufferContext) {
      return
    }

    const renderContext = {
      canvasContext: bufferContext,
      canvas: bufferCanvas,
      viewport: viewport
    }
    
    // 使用 Promise 方式渲染，增加错误处理
    const renderTask = page.render(renderContext)
    activeRenderTasks.set(pageNum, renderTask)
    
    // 添加渲染超时机制
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Page render timeout')), 10000)
    })
    
    await Promise.race([renderTask.promise, timeoutPromise])
    renderedCanvasCache.set(pageNum, bufferCanvas)
    copyCachedCanvasToVisible(pageNum)
    page.cleanup()
    
  } catch (err) {
    if (!isRenderCancelled(err)) {
      console.error(`Error rendering page ${pageNum}:`, err)
    }
  } finally {
    const activeTask = activeRenderTasks.get(pageNum)
    if (activeTask) {
      activeRenderTasks.delete(pageNum)
    }
  }
}

async function renderCurrentPage() {
  await syncDisplayPages({ preserveScroll: true })
}

// 预加载附近页面
async function preloadNearbyPages() {
  if (!pdfDocumentInstance || totalPages.value === 0) {
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
    pdfTocProvider?.updateActivePage(nearestPage)
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
  if (displayMode.value !== 'continuous') return
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

function canTriggerPagedBoundaryNavigation() {
  const now = Date.now()
  if (now - lastPagedBoundaryNavigationAt < PAGED_BOUNDARY_NAV_COOLDOWN) {
    return false
  }
  lastPagedBoundaryNavigationAt = now
  return true
}

function handlePagedBoundaryNavigation(deltaX: number, deltaY: number): boolean {
  if (displayMode.value === 'continuous' || !pdfContainer.value) {
    return false
  }

  const container = pdfContainer.value
  const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0)
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)

  const horizontalIntent = Math.abs(deltaX) > Math.abs(deltaY)
  if (horizontalIntent && deltaX !== 0) {
    if (deltaX < 0) {
      if (container.scrollLeft > 0) {
        container.scrollLeft = Math.max(0, container.scrollLeft + deltaX)
        return true
      }
      if (canTriggerPagedBoundaryNavigation()) {
        previousPage()
      }
      return true
    }

    if (container.scrollLeft < maxScrollLeft) {
      container.scrollLeft = Math.min(maxScrollLeft, container.scrollLeft + deltaX)
      return true
    }
    if (canTriggerPagedBoundaryNavigation()) {
      nextPage()
    }
    return true
  }

  if (deltaY !== 0) {
    if (deltaY < 0) {
      if (container.scrollTop > 0) {
        container.scrollTop = Math.max(0, container.scrollTop + deltaY)
        return true
      }
      if (canTriggerPagedBoundaryNavigation()) {
        previousPage()
      }
      return true
    }

    if (container.scrollTop < maxScrollTop) {
      container.scrollTop = Math.min(maxScrollTop, container.scrollTop + deltaY)
      return true
    }
    if (canTriggerPagedBoundaryNavigation()) {
      nextPage()
    }
    return true
  }

  return false
}

function copyCachedCanvasToVisible(pageNum: number, explicitCanvas?: HTMLCanvasElement) {
  const source = renderedCanvasCache.get(pageNum)
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
  renderedCanvasCache.clear()
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
      if (!handlePagedBoundaryNavigation(-PAGED_KEYBOARD_SCROLL_STEP, 0)) {
        previousPage()
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      if (!handlePagedBoundaryNavigation(0, -PAGED_KEYBOARD_SCROLL_STEP)) {
        previousPage()
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (!handlePagedBoundaryNavigation(PAGED_KEYBOARD_SCROLL_STEP, 0)) {
        nextPage()
      }
      break
    case 'ArrowDown':
      event.preventDefault()
      if (!handlePagedBoundaryNavigation(0, PAGED_KEYBOARD_SCROLL_STEP)) {
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
    const handled = handlePagedBoundaryNavigation(event.deltaX, event.deltaY)
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
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = 0
  }
  resizeObserver?.disconnect()
  resizeObserver = null

  const pendingPages = Array.from(activeRenderTasks.keys())
  await Promise.allSettled(pendingPages.map(cancelRenderTask))
  
  // 清理PDF文档资源
  if (pdfDocumentInstance) {
    try {
      pdfDocumentInstance.destroy()
    } catch (err) {
      console.warn('Error destroying PDF document:', err)
    } finally {
      pdfDocumentInstance = null
    }
  }
  
  // 清理canvas引用
  canvasRefs.value.clear()
  renderedCanvasCache.clear()
  renderedPages.value = []

  if (pdfTocProvider && props.tab.tocProvider === pdfTocProvider) {
    appStore.updateTabState(props.tab.id, { tocProvider: undefined })
  }
  pdfTocProvider?.destroy()
  pdfTocProvider = null
})

async function getReferenceViewport() {
  if (!pdfDocumentInstance || !pdfContainer.value) return null
  const page = await pdfDocumentInstance.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  return viewport
}

async function applyDefaultZoomForDisplayMode(mode: DisplayMode) {
  const viewport = await getReferenceViewport()
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
