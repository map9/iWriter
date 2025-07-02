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
    >
      <!-- PDF.js will render here -->
      <div 
        ref="pdfViewer"
        class="flex flex-col items-center space-y-4"
      >
        <!-- Placeholder for now -->
        <div class="bg-white shadow-lg p-8 text-center max-w-md">
          <IconFile class="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 class="text-lg font-semibold text-gray-700 mb-2">PDF 查看器</h3>
          <p class="text-gray-500 mb-4">PDF.js 集成开发中</p>
          <div class="text-sm text-gray-400">
            文件: {{ tab.name }}
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
import { ref, toRef, computed, onMounted, onBeforeUnmount } from 'vue'
import type { FileTab } from '@/types'
import { 
  IconZoomIn, 
  IconZoomOut, 
  IconZoomReset,
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconAlertCircle
} from '@tabler/icons-vue'

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

// PDF document reference (will be used when PDF.js is integrated)
const pdfDocument = ref<any>(null)

// Computed
const pdfUrl = computed(() => {
  if (props.tab.path) {
    return `file://${props.tab.path}`
  }
  return props.tab.content || ''
})

// Methods
function zoomIn() {
  zoom.value = Math.min(zoom.value * 1.2, 5)
  renderCurrentPage()
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / 1.2, 0.25)
  renderCurrentPage()
}

function zoomToFit() {
  // This will be implemented when PDF.js is integrated
  zoom.value = 1
  renderCurrentPage()
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    pageInput.value = currentPage.value
    renderCurrentPage()
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    pageInput.value = currentPage.value
    renderCurrentPage()
  }
}

function goToPage() {
  const page = Math.max(1, Math.min(pageInput.value, totalPages.value))
  currentPage.value = page
  pageInput.value = page
  renderCurrentPage()
}

async function loadPDF() {
  if (!props.tab.path) return
  
  loading.value = true
  error.value = null
  
  try {
    // TODO: Integrate PDF.js here
    // For now, just simulate loading
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Simulate PDF loaded
    totalPages.value = 10 // This should come from actual PDF
    currentPage.value = 1
    pageInput.value = 1
    
    renderCurrentPage()
  } catch (err) {
    error.value = 'PDF 文件加载失败'
    console.error('PDF loading error:', err)
  } finally {
    loading.value = false
  }
}

function renderCurrentPage() {
  // TODO: Implement actual PDF page rendering with PDF.js
  console.log(`Rendering page ${currentPage.value} at ${zoom.value * 100}% zoom`)
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

onMounted(() => {
  if (props.tab.path) {
    loadPDF()
  }
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
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