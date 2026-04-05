<template>
  <div class="document-viewer-wrapper">
    <!-- PDF Toolbar -->
    <div class="toolbar">
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
      
      <div class="text-sm text-gray-600">
        PDF 文档
      </div>
    </div>
    
    <!-- PDF Display Area -->
    <div
      ref="pdfContainer"
      class="flex-1 overflow-auto bg-gray-200"
      tabindex="0"
      @wheel="handleWheel"
      @scroll.passive="handleScroll"
    >
      <div class="min-h-full w-max min-w-full px-4 py-4">
        <!-- PDF.js will render here -->
        <div
          ref="pdfViewer"
          class="flex w-max min-w-full flex-col items-center space-y-4"
        >
          <!-- PDF Pages will be rendered here -->
          <canvas
            v-for="pageNum in renderedPages"
            :key="pageNum"
            :ref="el => setCanvasRef(el as Element, pageNum)"
            class="shadow-lg bg-white"
            :class="{ 'ring-2 ring-blue-500': pageNum === currentPage }"
          />
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

// State
const pdfContainer = ref<HTMLElement>()
const pdfViewer = ref<HTMLElement>()
const zoom = ref(1)
const currentPage = ref(1)
const totalPages = ref(1)
const pageInput = ref(1)
const loading = ref(false)
const error = ref<string | null>(null)

// PDF.js references (use non-reactive to avoid proxy issues)
let pdfDocumentInstance: pdfjsLib.PDFDocumentProxy | null = null
const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map())
const renderedPages = ref<number[]>([])
const renderScale = ref(window.devicePixelRatio || 1)
const activeRenderTasks = new Map<number, pdfjsLib.RenderTask>()
let isUnmounted = false
let preloadInFlight: Promise<void> | null = null
const PAGE_PRELOAD_RANGE = 2
const PAGE_UNLOAD_RANGE = 6

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
  rerenderAllPages()
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / 1.2, 0.25)
  rerenderAllPages()
}

function zoomToFit() {
  if (!pdfContainer.value || !pdfDocumentInstance) return
  
  // 计算适合的缩放比例
  const viewerWidth = pdfViewer.value?.clientWidth ?? pdfContainer.value.clientWidth
  const horizontalPadding = 32
  const verticalPadding = 48
  const containerWidth = Math.max(viewerWidth - horizontalPadding, 200)
  const containerHeight = Math.max(pdfContainer.value.clientHeight - verticalPadding, 200)
  
  // 获取第一页的尺寸作为参考
  pdfDocumentInstance.getPage(1).then(page => {
    const viewport = page.getViewport({ scale: 1 })
    const widthScale = containerWidth / viewport.width
    const heightScale = containerHeight / viewport.height
    zoom.value = Math.min(widthScale, heightScale, 2) // 最大不超过200%
    
    rerenderAllPages()
  })
}

// 重新渲染所有已加载的页面
async function rerenderAllPages() {
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
  if (currentPage.value > 1) {
    currentPage.value--
    pageInput.value = currentPage.value
    scrollToPage(currentPage.value)
    preloadNearbyPages()
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    pageInput.value = currentPage.value
    scrollToPage(currentPage.value)
    preloadNearbyPages()
  }
}

function goToPage() {
  const page = Math.max(1, Math.min(pageInput.value, totalPages.value))
  currentPage.value = page
  pageInput.value = page
  scrollToPage(currentPage.value)
  preloadNearbyPages()
}

// 滚动到指定页面
function scrollToPage(pageNum: number) {
  const canvas = canvasRefs.value.get(pageNum)
  if (canvas && pdfContainer.value) {
    canvas.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
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
    
    // 初始化可见页面列表
    renderedPages.value = [1]
    
    // 等待DOM更新后渲染页面
    await nextTick()
    
    // 渲染第一页
    try {
      await renderPage(1)
    } catch (err) {
      console.error('Failed to render first page:', err)
      error.value = '无法渲染PDF页面'
      return
    }
    
    // 预加载附近页面（延迟执行，避免阻塞首页渲染）
    setTimeout(() => {
      preloadNearbyPages()
    }, 100)
    
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

    const canvas = canvasRefs.value.get(pageNum)
    
    if (!canvas) {
      console.warn(`Canvas for page ${pageNum} not found`)
      return
    }
    
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      console.warn(`Canvas context not available for page ${pageNum}`)
      return
    }
    
    // 计算视口
    const viewport = page.getViewport({ scale: zoom.value * renderScale.value })
    
    // 设置canvas尺寸
    canvas.height = viewport.height
    canvas.width = viewport.width
    canvas.style.width = `${viewport.width / renderScale.value}px`
    canvas.style.height = `${viewport.height / renderScale.value}px`
    
    // 清除之前的内容
    context.clearRect(0, 0, canvas.width, canvas.height)
    
    // 渲染页面
    const renderContext = {
      canvasContext: context,
      canvas: canvas,
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
  await ensurePagesRendered([currentPage.value])
}

// 预加载附近页面
async function preloadNearbyPages() {
  if (!pdfDocumentInstance || totalPages.value === 0) {
    console.warn('PDF document not ready for preloading')
    return
  }
  
  const start = Math.max(1, currentPage.value - PAGE_PRELOAD_RANGE)
  const end = Math.min(totalPages.value, currentPage.value + PAGE_PRELOAD_RANGE)

  const pageNums: number[] = []
  for (let pageNum = start; pageNum <= end; pageNum++) {
    pageNums.push(pageNum)
  }

  try {
    await ensurePagesRendered(pageNums)
    trimRenderedPages(currentPage.value)
  } catch (err) {
    console.error('Failed to preload nearby PDF pages:', err)
  }
}

function updateCurrentPageFromScroll() {
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
  }
}

function queueScrollPreload() {
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

// Keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  if (event.target !== pdfContainer.value) return
  
  switch (event.key) {
    case 'ArrowLeft':
    case 'PageUp':
      event.preventDefault()
      previousPage()
      break
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      event.preventDefault()
      nextPage()
      break
    case 'Home':
      event.preventDefault()
      currentPage.value = 1
      pageInput.value = 1
      renderCurrentPage()
      break
    case 'End':
      event.preventDefault()
      currentPage.value = totalPages.value
      pageInput.value = totalPages.value
      renderCurrentPage()
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
  }
}

onMounted(() => {
  isUnmounted = false
  if (pdfUrl.value) {
    loadPDF()
  }
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(async () => {
  isUnmounted = true
  document.removeEventListener('keydown', handleKeydown)

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
  renderedPages.value = []
})

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
  focusViewer
})
</script>
