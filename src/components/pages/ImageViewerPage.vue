<template>
  <div class="h-full flex flex-col bg-gray-100">
    <!-- Image Toolbar -->
    <div class="flex items-center gap-2 p-2 bg-white border-b border-gray-200">
      <div class="flex items-center gap-1">
        <button
          @click="zoomOut"
          :disabled="zoom <= 0.1"
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
          :disabled="zoom >= 10"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="放大"
        >
          <IconZoomIn class="w-5 h-5" />
        </button>
        
        <button
          @click="zoomToFit"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="适应窗口"
        >
          <IconZoomReset class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-separator" />
      
      <div class="flex items-center gap-1">
        <button
          @click="rotateLeft"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="向左旋转"
        >
          <IconRotate class="w-5 h-5 transform scale-x-[-1]" />
        </button>
        
        <button
          @click="rotateRight"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="向右旋转"
        >
          <IconRotateClockwise class="w-5 h-5" />
        </button>
      </div>
      
      <div class="flex-1" />
      
      <div class="text-sm text-gray-600">
        <span v-if="imageDimensions.width && imageDimensions.height">
          {{ imageDimensions.width }} × {{ imageDimensions.height }}
        </span>
      </div>
    </div>
    
    <!-- Image Display Area -->
    <div 
      ref="imageContainer"
      class="flex-1 overflow-auto flex items-center justify-center p-4"
      @wheel.prevent="handleWheel"
    >
      <div 
        class="relative inline-block"
        :style="{ transform: `scale(${zoom}) rotate(${rotation}deg)` }"
      >
        <img
          ref="imageElement"
          :src="imageUrl"
          @load="onImageLoad"
          @error="onImageError"
          class="max-w-none transition-transform duration-200"
          :alt="tab.name"
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
        <div class="text-lg mb-2">图片加载失败</div>
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
        <div>加载中...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { FileTab } from '@/types'
import { 
  IconZoomIn, 
  IconZoomOut, 
  IconZoomReset,
  IconRotateClockwise,
  IconRotate,
  IconAlertCircle
} from '@tabler/icons-vue'

// Props
interface Props {
  tab: FileTab
}

const props = defineProps<Props>()

// State
const imageElement = ref<HTMLImageElement>()
const imageContainer = ref<HTMLElement>()
const zoom = ref(1)
const rotation = ref(0)
const imageDimensions = ref({ width: 0, height: 0 })
const loading = ref(false)
const error = ref<string | null>(null)

// Computed
const imageUrl = computed(() => {
  if (props.tab.path) {
    return `file://${props.tab.path}`
  }
  return props.tab.content || ''
})

// Methods
function zoomIn() {
  zoom.value = Math.min(zoom.value * 1.2, 10)
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / 1.2, 0.1)
}

function zoomToFit() {
  if (!imageElement.value || !imageContainer.value) return
  
  const containerRect = imageContainer.value.getBoundingClientRect()
  const imageRect = imageElement.value.getBoundingClientRect()
  
  const containerWidth = containerRect.width - 32 // padding
  const containerHeight = containerRect.height - 32 // padding
  
  const scaleX = containerWidth / imageDimensions.value.width
  const scaleY = containerHeight / imageDimensions.value.height
  
  zoom.value = Math.min(scaleX, scaleY, 1) // Don't zoom beyond 100%
}

function rotateLeft() {
  rotation.value = (rotation.value - 90) % 360
}

function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
}

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    // Zoom with Ctrl+scroll
    if (event.deltaY < 0) {
      zoomIn()
    } else {
      zoomOut()
    }
  }
}

function onImageLoad() {
  loading.value = false
  error.value = null
  
  if (imageElement.value) {
    imageDimensions.value = {
      width: imageElement.value.naturalWidth,
      height: imageElement.value.naturalHeight
    }
    
    // Auto-fit on first load
    nextTick(() => {
      zoomToFit()
    })
  }
}

function onImageError() {
  loading.value = false
  error.value = '无法加载图片文件'
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
    case 'rotate-left':
      rotateLeft()
      return true
    case 'rotate-right':
      rotateRight()
      return true
    default:
      return false
  }
}

// Focus handling
function focusViewer() {
  imageContainer.value?.focus()
}

// Keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  if (event.target !== imageContainer.value) return
  
  switch (event.key) {
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
  loading.value = true
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

.transition-transform {
  transition: transform 0.2s ease-in-out;
}
</style>