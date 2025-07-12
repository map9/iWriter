<template>
  <div class="h-full flex flex-col bg-gray-100">
    <!-- PDF Toolbar -->
    <div class="flex items-center gap-2 p-2 bg-white border-b border-gray-200">
      <div class="flex items-center gap-1">
        <button
          @click="zoomOut"
          :disabled="zoom <= 0.25"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="缩小"
        >
          <IconZoomOut :size="20" />
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
          <IconZoomIn :size="20" />
        </button>
        
        <button
          @click="zoomToFit"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="适应页面"
        >
          <IconZoomReset :size="20" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <div class="flex items-center gap-1">
        <button
          @click="previousPage"
          :disabled="currentPage <= 1"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="上一页"
        >
          <IconChevronLeft :size="20" />
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
          <IconChevronRight :size="20" />
        </button>
      </div>
      
      <div class="flex-1" />
      
      <div class="text-sm text-gray-600">
        PDF 文档
      </div>
    </div>
    
    <!-- PDF Display Area -->
    <div 
      ref="pdfContainer"
      class="flex-1 overflow-auto bg-gray-200 p-4"
      tabindex="0"
      @wheel="handleWheel"
    >
      <!-- PDF.js will render here -->
      <div 
        ref="pdfViewer"
        class="flex flex-col items-center space-y-4"
      >
        <!-- PDF Pages will be rendered here -->
        <canvas
          v-for="pageNum in renderedPages"
          :key="pageNum"
          :ref="el => setCanvasRef(el, pageNum)"
          class="shadow-lg bg-white"
          :class="{ 'ring-2 ring-blue-500': pageNum === currentPage }"
        />
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
import { 
  IconZoomIn, 
  IconZoomOut, 
  IconZoomReset,
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconAlertCircle
} from '@tabler/icons-vue'

// 设置PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.js'

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
  return props.tab.content || ''
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
  const containerWidth = pdfContainer.value.clientWidth - 40 // 减去内边距
  const containerHeight = pdfContainer.value.clientHeight - 40
  
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
  if (!pdfDocumentInstance) {
    console.warn('PDF document not available')
    return
  }
  
  // Check if page number is valid
  if (pageNum < 1 || pageNum > totalPages.value) {
    console.warn(`Invalid page number: ${pageNum}`)
    return
  }
  
  try {
    // Check if PDF document is still valid
    if (pdfDocumentInstance.destroyed) {
      console.warn('PDF document has been destroyed')
      return
    }
    
    const page = await pdfDocumentInstance.getPage(pageNum)
    const canvas = canvasRefs.value.get(pageNum)
    
    if (!canvas) {
      console.warn(`Canvas for page ${pageNum} not found`)
      return
    }
    
    const context = canvas.getContext('2d')
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
      viewport: viewport
    }
    
    // 使用 Promise 方式渲染，增加错误处理
    const renderTask = page.render(renderContext)
    
    // 添加渲染超时机制
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Page render timeout')), 10000)
    })
    
    await Promise.race([renderTask.promise, timeoutPromise])
    
  } catch (err) {
    console.error(`Error rendering page ${pageNum}:`, err)
  }
}

async function renderCurrentPage() {
  if (!renderedPages.value.includes(currentPage.value)) {
    renderedPages.value.push(currentPage.value)
    await nextTick()
  }
  await renderPage(currentPage.value)
}

// 预加载附近页面
async function preloadNearbyPages() {
  if (!pdfDocumentInstance || totalPages.value === 0) {
    console.warn('PDF document not ready for preloading')
    return
  }
  
  const preloadRange = 2 // 预加载前后2页
  const start = Math.max(1, currentPage.value - preloadRange)
  const end = Math.min(totalPages.value, currentPage.value + preloadRange)
  
  // 添加需要渲染的页面到列表
  const pagesToAdd = []
  for (let pageNum = start; pageNum <= end; pageNum++) {
    if (!renderedPages.value.includes(pageNum)) {
      pagesToAdd.push(pageNum)
      renderedPages.value.push(pageNum)
    }
  }
  
  if (pagesToAdd.length === 0) {
    return // 没有新页面需要加载
  }
  
  await nextTick()
  
  // 渲染新页面（一次一个，避免并发问题）
  for (const pageNum of pagesToAdd) {
    try {
      await renderPage(pageNum)
    } catch (err) {
      console.error(`Failed to preload page ${pageNum}:`, err)
      // 从已渲染页面列表中移除失败的页面
      const index = renderedPages.value.indexOf(pageNum)
      if (index !== -1) {
        renderedPages.value.splice(index, 1)
      }
    }
  }
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
  if (pdfUrl.value) {
    loadPDF()
  }
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  
  // 清理PDF文档资源
  if (pdfDocumentInstance) {
    try {
      if (!pdfDocumentInstance.destroyed) {
        pdfDocumentInstance.destroy()
      }
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

<style scoped>
.toolbar-separator {
  @apply w-px h-6 bg-gray-300 mx-2;
}
</style>