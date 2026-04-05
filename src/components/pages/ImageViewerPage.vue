<template>
  <div class="document-viewer-wrapper">
    <!-- Image Toolbar -->
    <div class="toolbar">
      <div class="toolbar-group">
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
      
      <div class="toolbar-group">
        <button
          @click="rotateLeft"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="向左旋转"
        >
          <IconRotate class="w-5 h-5" />
        </button>
        
        <button
          @click="rotateRight"
          class="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="向右旋转"
        >
          <IconRotateClockwise class="w-5 h-5" />
        </button>
      </div>
      
      <div class="toolbar-spacer" />
      
      <div class="text-sm text-gray-600">
        <span v-if="imageDimensions.width && imageDimensions.height">
          {{ imageDimensions.width }} × {{ imageDimensions.height }}
        </span>
      </div>
    </div>
    
    <!-- Image Display Area -->
    <div 
      ref="imageContainer"
      class="flex-1 bg-gray-100 p-4 outline-none"
      :class="containerInteractionClass"
      :style="{ overflow: shouldShowScrollbars ? 'auto' : 'hidden' }"
      tabindex="0"
      @wheel="handleWheel"
      @mousedown="startDrag"
      @keydown="handleKeydown"
    >
      <div
        class="flex min-h-full min-w-full"
        :class="imageViewportClass"
      >
        <div 
          class="relative shrink-0"
          :style="imageWrapperStyle"
        >
          <img
            ref="imageElement"
            :src="imageUrl"
            @load="onImageLoad"
            @error="onImageError"
            class="absolute left-1/2 top-1/2 max-w-none select-none transition-transform duration-200"
            :style="imageTransformStyle"
            :alt="tab.name"
            draggable="false"
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
const containerSize = ref({ width: 0, height: 0 })
const loading = ref(false)
const error = ref<string | null>(null)
const isDragging = ref(false)

let resizeObserver: ResizeObserver | null = null
let dragStartX = 0
let dragStartY = 0
let dragStartScrollLeft = 0
let dragStartScrollTop = 0

// Computed
const imageUrl = computed(() => {
  if (props.tab.path) {
    return `file://${props.tab.path}`
  }
  return ''
})

const normalizedRotation = computed(() => {
  const value = rotation.value % 360
  return value < 0 ? value + 360 : value
})

const isQuarterTurn = computed(() => normalizedRotation.value % 180 !== 0)

const transformedImageSize = computed(() => {
  const baseWidth = imageDimensions.value.width * zoom.value
  const baseHeight = imageDimensions.value.height * zoom.value

  return isQuarterTurn.value
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight }
})

const shouldShowScrollbars = computed(() => {
  if (!containerSize.value.width || !containerSize.value.height) return false

  return (
    transformedImageSize.value.width > containerSize.value.width ||
    transformedImageSize.value.height > containerSize.value.height
  )
})

const hasHorizontalOverflow = computed(() => (
  !!containerSize.value.width &&
  transformedImageSize.value.width > containerSize.value.width
))

const hasVerticalOverflow = computed(() => (
  !!containerSize.value.height &&
  transformedImageSize.value.height > containerSize.value.height
))

const canPan = computed(() => shouldShowScrollbars.value)

const imageWrapperStyle = computed(() => ({
  width: `${transformedImageSize.value.width}px`,
  height: `${transformedImageSize.value.height}px`
}))

const imageTransformStyle = computed(() => ({
  width: `${imageDimensions.value.width}px`,
  height: `${imageDimensions.value.height}px`,
  transform: `translate(-50%, -50%) scale(${zoom.value}) rotate(${rotation.value}deg)`,
  transformOrigin: 'center center'
}))

const containerInteractionClass = computed(() => {
  if (isDragging.value) return 'cursor-grabbing'
  if (canPan.value) return 'cursor-grab'
  return 'cursor-default'
})

const imageViewportClass = computed(() => ({
  'items-center': !hasVerticalOverflow.value,
  'items-start': hasVerticalOverflow.value,
  'justify-center': !hasHorizontalOverflow.value,
  'justify-start': hasHorizontalOverflow.value
}))

// Methods
function zoomIn() {
  zoom.value = Math.min(zoom.value * 1.2, 10)
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / 1.2, 0.1)
}

function zoomToFit() {
  if (!imageElement.value || !imageContainer.value || !imageDimensions.value.width || !imageDimensions.value.height) return

  const containerRect = imageContainer.value.getBoundingClientRect()
  const containerWidth = containerRect.width - 32
  const containerHeight = containerRect.height - 32
  const rotatedWidth = isQuarterTurn.value ? imageDimensions.value.height : imageDimensions.value.width
  const rotatedHeight = isQuarterTurn.value ? imageDimensions.value.width : imageDimensions.value.height
  const scaleX = containerWidth / rotatedWidth
  const scaleY = containerHeight / rotatedHeight

  zoom.value = Math.min(scaleX, scaleY, 1)
}

function rotateLeft() {
  rotation.value = (rotation.value - 90) % 360
}

function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
}

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

function updateContainerSize() {
  if (!imageContainer.value) return

  containerSize.value = {
    width: Math.max(imageContainer.value.clientWidth - 32, 0),
    height: Math.max(imageContainer.value.clientHeight - 32, 0)
  }
}

function startDrag(event: MouseEvent) {
  if (!imageContainer.value || !canPan.value) return
  if (event.button !== 0) return

  isDragging.value = true
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragStartScrollLeft = imageContainer.value.scrollLeft
  dragStartScrollTop = imageContainer.value.scrollTop
  imageContainer.value.focus()
  event.preventDefault()
}

function handleDrag(event: MouseEvent) {
  if (!imageContainer.value || !isDragging.value) return

  const deltaX = event.clientX - dragStartX
  const deltaY = event.clientY - dragStartY

  imageContainer.value.scrollLeft = dragStartScrollLeft - deltaX
  imageContainer.value.scrollTop = dragStartScrollTop - deltaY
}

function stopDrag() {
  isDragging.value = false
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
      updateContainerSize()
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
    case 'ArrowLeft':
      if (canPan.value && imageContainer.value) {
        event.preventDefault()
        imageContainer.value.scrollLeft -= 40
      }
      break
    case 'ArrowRight':
      if (canPan.value && imageContainer.value) {
        event.preventDefault()
        imageContainer.value.scrollLeft += 40
      }
      break
    case 'ArrowUp':
      if (imageContainer.value) {
        event.preventDefault()
        imageContainer.value.scrollTop -= 40
      }
      break
    case 'ArrowDown':
      if (imageContainer.value) {
        event.preventDefault()
        imageContainer.value.scrollTop += 40
      }
      break
  }
}

onMounted(() => {
  loading.value = true
  nextTick(() => {
    updateContainerSize()
  })

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateContainerSize()
    })

    if (imageContainer.value) {
      resizeObserver.observe(imageContainer.value)
    }
  }

  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', stopDrag)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
})

// Expose methods to parent
defineExpose({
  tab: toRef(props, 'tab'), // 不暴露属性值，在MainView中无法访问到
  handleMenuAction,
  focusViewer
})
</script>

<style scoped>
.transition-transform {
  transition: transform 0.2s ease-in-out;
}
</style>
