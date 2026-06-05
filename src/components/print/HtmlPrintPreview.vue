<template>
  <div ref="rootEl" class="relative flex flex-1 flex-col overflow-hidden bg-base-300">
    <!-- Loading overlay while pagedjs renders -->
    <div v-if="isRendering" class="absolute inset-0 z-10 flex items-center justify-center bg-base-200/70">
      <span class="loading loading-spinner loading-md text-base-content/50" />
    </div>

    <!-- Scroll area containing scaled iframe -->
    <div ref="previewScroll" class="flex-1 overflow-y-auto overflow-x-hidden">
      <!-- wrapper sets the scrollable height = natural height × scale -->
      <div :style="previewWrapperStyle">
        <iframe ref="previewFrame" :style="previewFrameStyle" />
      </div>
    </div>

    <!-- Zoom badge — click to reset to fit-width -->
    <button
      v-if="!isRendering && totalPages > 0"
      class="absolute bottom-3 right-3 z-10 rounded-md bg-base-200/80 px-2 py-1 text-xs text-base-content/70 backdrop-blur-sm hover:bg-base-300 hover:text-base-content"
      :title="t('dialog.printDialog.preview.zoomResetTitle')"
      @click="computeFitScale"
    >
      {{ Math.round(previewScale * 100) }}%
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { notify } from '@/utils/notifications'

const props = defineProps<{
  /** Full HTML document to display in the iframe (built by parent). */
  documentHtml: string
}>()

const emit = defineEmits<{
  'update:totalPages': [count: number]
  'update:originalTotalPages': [count: number]
  /** Fired when the pagedjs rendering starts (true) or finishes (false). */
  renderingChange: [isRendering: boolean]
}>()

const { t } = useI18n()

// ── DOM refs ───────────────────────────────────────────────────────────────────
const rootEl      = ref<HTMLDivElement>()
const previewFrame = ref<HTMLIFrameElement>()
const previewScroll = ref<HTMLDivElement>()

// ── State ───────────────────────────────────────────────────────────────────────
const isRendering      = ref(false)
const totalPages       = ref(0)
const previewScale     = ref(1.0)
const previewPanelWidth  = ref(0)
const previewPanelHeight = ref(0)
const previewZoomMode  = ref<'fit-width' | 'manual'>('fit-width')

let currentBlobUrl = ''
const PREVIEW_GUTTER_PX = 80

// ── Computed styles ─────────────────────────────────────────────────────────────
const previewWrapperStyle = computed(() => ({
  position: 'relative' as const,
  width: '100%',
  height: previewPanelHeight.value > 0
    ? `${Math.ceil(previewPanelHeight.value * previewScale.value)}px`
    : '0px',
  margin: '0 auto',
  overflow: 'hidden',
}))

const previewFrameStyle = computed(() => ({
  position: 'absolute' as const,
  top: '0',
  left: '50%',
  width:  previewPanelWidth.value  > 0 ? `${previewPanelWidth.value}px`  : '0px',
  height: previewPanelHeight.value > 0 ? `${previewPanelHeight.value}px` : '0px',
  border: 'none',
  display: 'block',
  pointerEvents: 'none' as const,
  transformOrigin: 'top center',
  transform: previewPanelHeight.value > 0
    ? `translateX(-50%) scale(${previewScale.value})`
    : 'none',
}))

// ── postMessage from iframe ──────────────────────────────────────────────────────
function handleFrameMessage(event: MessageEvent) {
  if (event.source !== previewFrame.value?.contentWindow) return

  if (event.data?.type === 'paged-ready' || event.data?.type === 'paged-metrics') {
    const newTotal = event.data.total ?? 0
    totalPages.value = newTotal
    emit('update:totalPages', newTotal)
    emit('update:originalTotalPages', event.data.originalTotal ?? newTotal)
    previewPanelWidth.value  = event.data.scrollWidth  ?? 0
    previewPanelHeight.value = event.data.scrollHeight ?? 0
    if (previewZoomMode.value === 'fit-width') {
      nextTick(() => requestAnimationFrame(computeFitWidthScale))
    }
    if (event.data.type === 'paged-ready') {
      isRendering.value = false
      emit('renderingChange', false)
    }
  } else if (event.data?.type === 'paged-wheel') {
    const factor = event.data.deltaY > 0 ? 0.9 : 1.1
    previewZoomMode.value = 'manual'
    previewScale.value = Math.min(Math.max(Math.round(previewScale.value * factor * 100) / 100, 0.1), 3.0)
  } else if (event.data?.type === 'paged-error') {
    console.error('[HtmlPrintPreview] pagedjs error:', event.data.error)
    notify.error(t('dialog.printDialog.notifications.previewFailed'))
    isRendering.value = false
    emit('renderingChange', false)
  }
}

// ── Zoom helpers ────────────────────────────────────────────────────────────────
function computeFitWidthScale() {
  if (!previewScroll.value || !previewPanelWidth.value) return
  const containerW = previewScroll.value.clientWidth
  if (!containerW) {
    requestAnimationFrame(computeFitWidthScale)
    return
  }
  const available = Math.max(containerW - PREVIEW_GUTTER_PX, 1)
  const scale = available / previewPanelWidth.value
  previewScale.value = Math.min(Math.max(Math.round(scale * 100) / 100, 0.1), 3.0)
}

function computeFitScale() {
  previewZoomMode.value = 'fit-width'
  computeFitWidthScale()
}

function handlePreviewViewportResize() {
  if (previewZoomMode.value !== 'fit-width') return
  computeFitWidthScale()
}

function handlePreviewWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  const factor = event.deltaY > 0 ? 0.9 : 1.1
  previewZoomMode.value = 'manual'
  previewScale.value = Math.min(Math.max(Math.round(previewScale.value * factor * 100) / 100, 0.1), 3.0)
}

// ── Render when documentHtml changes ──────────────────────────────────────────────
watch(() => props.documentHtml, async (html) => {
  if (!html) return
  await nextTick()
  if (!previewFrame.value) return

  isRendering.value = true
  emit('renderingChange', true)
  previewPanelWidth.value  = 0
  previewPanelHeight.value = 0
  previewZoomMode.value = 'fit-width'

  const blob = new Blob([html], { type: 'text/html' })
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl = URL.createObjectURL(blob)
  previewFrame.value.src = currentBlobUrl
}, { immediate: true })

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(() => {
  window.addEventListener('message', handleFrameMessage)
  window.addEventListener('resize', handlePreviewViewportResize)
  // passive:false needed to call preventDefault() on Ctrl+Wheel
  previewScroll.value?.addEventListener('wheel', handlePreviewWheel, { passive: false })
  nextTick(() => requestAnimationFrame(computeFitWidthScale))
})

onUnmounted(() => {
  window.removeEventListener('message', handleFrameMessage)
  window.removeEventListener('resize', handlePreviewViewportResize)
  previewScroll.value?.removeEventListener('wheel', handlePreviewWheel)
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
})

// ── Exposed API ────────────────────────────────────────────────────────────────
/** Returns the computed background color of the preview container (for bodyBackground in pagedjs). */
function getContainerBgColor(): string {
  if (!rootEl.value) return ''
  return window.getComputedStyle(rootEl.value).backgroundColor
}

defineExpose({ getContainerBgColor })
</script>
