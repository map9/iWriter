<template>
  <div class="relative flex flex-1 flex-col overflow-hidden bg-base-200">
    <!-- PDF Toolbar -->
    <div v-if="!appStore.isCleanMode" class="flex h-10 w-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-base-300 bg-base-100 px-3 scrollbar-hide min-inline-0" @click.capture="handleToolbarClick">

      <!-- Group 1: Zoom -->
      <div class="flex shrink-0 items-center gap-1">
        <select
          class="input input-sm h-7 w-full text-xs"
          :disabled="isPresentationMode"
          :value="zoomSelectValue"
          @change="onZoomSelectChange"
          :title="t('pdfViewer.toolbar.zoomPageWidth')"
        >
          <option value="auto">{{ t('pdfViewer.toolbar.zoomAuto') }}</option>
          <option value="page-actual">{{ t('pdfViewer.toolbar.zoomActual') }}</option>
          <option value="page-fit">{{ t('pdfViewer.toolbar.zoomPageFit') }}</option>
          <option value="page-width">{{ t('pdfViewer.toolbar.zoomPageWidth') }}</option>
          <option disabled>─</option>
          <option value="custom">{{ Math.round(zoom * 100) }}%</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
          <option value="3">300%</option>
          <option value="4">400%</option>
        </select>

        <button
          @click="zoomOut"
          :disabled="zoom <= 0.25 || isPresentationMode"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.zoomOut')"
        >
          <IconZoomOut class="icon-sm" />
        </button>

        <button
          @click="zoomIn"
          :disabled="zoom >= 5 || isPresentationMode"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.zoomIn')"
        >
          <IconZoomIn class="icon-sm" />
        </button>
      </div>

      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>

      <!-- Group 1b: Rotation -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          @click="rotateLeft"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.rotateLeft')"
        >
          <IconRotate class="icon-sm" />
        </button>
        <button
          @click="rotateRight"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.rotateRight')"
        >
          <IconRotateClockwise class="icon-sm" />
        </button>
      </div>

      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>

      <!-- Group 2: Scroll mode (5 buttons) -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-for="sm in scrollModeOptions"
          :key="sm.value"
          @click="applyScrollMode(sm.scrollMode, sm.presentation)"
          :class="{ 'btn-active': isScrollModeActive(sm) }"
          class="btn btn-ghost btn-square btn-sm"
          :title="t(sm.labelKey)"
        >
          <component :is="sm.icon" class="icon-sm" />
        </button>
      </div>

      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>

      <!-- Group 3: Spread mode (3 buttons) -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          @click="applySpreadMode(SpreadMode.NONE)"
          :class="{ 'btn-active': spreadMode === SpreadMode.NONE }"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.spreadNone')"
        >
          <IconSquare class="icon-sm" />
        </button>
        <button
          @click="applySpreadMode(SpreadMode.ODD)"
          :class="{ 'btn-active': spreadMode === SpreadMode.ODD }"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.spreadOdd')"
        >
          <IconLayout2 class="icon-sm" />
        </button>
        <button
          @click="applySpreadMode(SpreadMode.EVEN)"
          :class="{ 'btn-active': spreadMode === SpreadMode.EVEN }"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.spreadEven')"
        >
          <IconBook class="icon-sm" />
        </button>
      </div>

      <div class="flex h-10 w-4 items-center justify-center">
        <div class="h-1/2 w-px bg-base-300"></div>
      </div>

      <!-- Group 4: Page navigation -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          @click="previousPageCommand"
          :disabled="currentPage <= 1"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.previousPage')"
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
            class="input input-sm h-7 w-16 text-center"
          />
          <span class="text-sm text-base-content/50">/ {{ totalPages }}</span>
        </div>

        <button
          @click="nextPageCommand"
          :disabled="currentPage >= totalPages"
          class="btn btn-ghost btn-square btn-sm"
          :title="t('pdfViewer.toolbar.nextPage')"
        >
          <IconChevronRight class="icon-sm" />
        </button>
      </div>

      <div class="min-w-4 flex-1" />
    </div>

    <!-- PDF Display Area -->
    <div
      ref="pdfContainer"
      class="absolute bottom-0 left-0 right-0 overflow-auto outline-none bg-base-200"
      :style="{ top: appStore.isCleanMode ? '0' : '2.5rem' }"
      tabindex="0"
      @wheel="handleWheel"
      @keydown="handleKeydown"
      @mousedown="focusViewer"
      @contextmenu.prevent.stop="handleContextMenu"
    >
      <div ref="pdfViewerEl" class="pdfViewer"></div>
    </div>

    <!-- Error State -->
    <div
      v-if="error"
      class="flex flex-1 items-center justify-center text-error-content"
    >
      <div class="text-center">
        <IconAlertCircle class="w-12 h-12 mx-auto mb-2" />
        <div class="text-lg mb-2">{{ t('pdfViewer.loadFailed') }}</div>
        <div class="text-sm text-base-content/50">{{ error }}</div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-base-100/70 backdrop-blur-sm"
    >
      <div class="text-center">
        <span class="loading loading-spinner loading-lg mb-2"></span>
        <div>{{ t('pdfViewer.loading') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContextMenuItem, FileTab } from '@/types'
import { useAppStore } from '@/stores/app'
import { PdfJsPageRenderProvider } from '@/services/pdf-render/PdfJsPageRenderProvider'
import {
  EventBus as PDFEventBus,
  PDFViewer,
  PDFLinkService,
  ScrollMode,
  SpreadMode,
} from 'pdfjs-dist/web/pdf_viewer.mjs'
import {
  IconZoomIn,
  IconZoomOut,
  IconChevronLeft,
  IconChevronRight,
  IconAlertCircle,
  IconArrowsVertical,
  IconArrowsHorizontal,
  IconLayoutGrid,
  IconFile,
  IconPresentation,
  IconSquare,
  IconLayout2,
  IconBook,
  IconRotate,
  IconRotateClockwise,
} from '@tabler/icons-vue'

interface Props {
  tab: FileTab
}

const props = defineProps<Props>()
const appStore = useAppStore()
const { t } = useI18n()

// ── Scroll mode option definitions ────────────────────────────────────────────
type ScrollModeOption = {
  value: string
  scrollMode: number
  presentation: boolean
  icon: unknown
  labelKey: string
}

const scrollModeOptions: ScrollModeOption[] = [
  {
    value: 'vertical',
    scrollMode: ScrollMode.VERTICAL,
    presentation: false,
    icon: IconArrowsVertical,
    labelKey: 'pdfViewer.toolbar.scrollVertical',
  },
  {
    value: 'horizontal',
    scrollMode: ScrollMode.HORIZONTAL,
    presentation: false,
    icon: IconArrowsHorizontal,
    labelKey: 'pdfViewer.toolbar.scrollHorizontal',
  },
  {
    value: 'wrapped',
    scrollMode: ScrollMode.WRAPPED,
    presentation: false,
    icon: IconLayoutGrid,
    labelKey: 'pdfViewer.toolbar.scrollWrapped',
  },
  {
    value: 'page',
    scrollMode: ScrollMode.PAGE,
    presentation: false,
    icon: IconFile,
    labelKey: 'pdfViewer.toolbar.scrollPage',
  },
  {
    value: 'presentation',
    scrollMode: ScrollMode.PAGE,
    presentation: true,
    icon: IconPresentation,
    labelKey: 'pdfViewer.toolbar.scrollPresentation',
  },
]

// ── Zoom presets (for select value matching) ──────────────────────────────────
const ZOOM_PRESETS = new Set([
  'auto', 'page-actual', 'page-fit', 'page-width',
  '0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4',
])

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pdfContainer = ref<HTMLDivElement>()
const pdfViewerEl = ref<HTMLDivElement>()

// ── UI state ──────────────────────────────────────────────────────────────────
const zoom = ref(1)
const currentPage = ref(1)
const totalPages = ref(1)
const pageInput = ref(1)
const loading = ref(false)
const error = ref<string | null>(null)
const scrollMode = ref<number>(ScrollMode.VERTICAL)
const spreadMode = ref<number>(SpreadMode.NONE)
const isPresentationMode = ref(false)
const rotation = ref(0)
const zoomScaleValue = ref<string>('page-width') // tracks currentScaleValue preset

// ── PDFViewer instances (non-reactive) ────────────────────────────────────────
let pdfViewerInstance: PDFViewer | null = null
let pdfEventBus: PDFEventBus | null = null
let pdfProvider: PdfJsPageRenderProvider | null = null
let isUnmounted = false
let resizeObserver: ResizeObserver | null = null
let resizeRaf = 0
let pendingScaleValue: string | null = null
let pendingScaleRefresh = false
let visibleRefreshScheduled = false
let visibleRefreshRaf = 0

const pdfUrl = computed(() => props.tab.path ?? '')
const isActiveTab = computed(() => appStore.activeTabId === props.tab.id)

// ── Zoom select computed value ─────────────────────────────────────────────────
const zoomSelectValue = computed(() => {
  if (ZOOM_PRESETS.has(zoomScaleValue.value)) return zoomScaleValue.value
  return 'custom'
})

// ── Helpers ────────────────────────────────────────────────────────────────────
function syncTocActivePage(pageNum: number) {
  const provider = props.tab.tocProvider as { updateActivePage?: (page: number) => void } | undefined
  provider?.updateActivePage?.(pageNum)
}

function isScrollModeActive(sm: ScrollModeOption): boolean {
  if (sm.presentation) return isPresentationMode.value
  return scrollMode.value === sm.scrollMode && !isPresentationMode.value
}

function isViewerVisible(): boolean {
  return isActiveTab.value && !!pdfContainer.value?.offsetParent
}

function scheduleVisibleScaleRefresh() {
  pendingScaleRefresh = true
  if (!isActiveTab.value || visibleRefreshScheduled) return

  visibleRefreshScheduled = true
  void nextTick(() => {
    if (isUnmounted) {
      visibleRefreshScheduled = false
      return
    }
    visibleRefreshRaf = requestAnimationFrame(() => {
      visibleRefreshRaf = 0
      visibleRefreshScheduled = false
      flushPendingScale()
    })
  })
}

function setViewerScaleValue(value: string) {
  pendingScaleValue = value
  if (!pdfViewerInstance) return
  if (!isViewerVisible()) {
    scheduleVisibleScaleRefresh()
    return
  }

  pendingScaleValue = null
  pendingScaleRefresh = false
  pdfViewerInstance.currentScaleValue = value
}

function flushPendingScale() {
  if (!pdfViewerInstance || !isViewerVisible()) return

  if (pendingScaleValue) {
    const scaleValue = pendingScaleValue
    pendingScaleValue = null
    pendingScaleRefresh = false
    pdfViewerInstance.currentScaleValue = scaleValue
    return
  }

  if (pendingScaleRefresh && pdfViewerInstance.currentScaleValue) {
    pendingScaleRefresh = false
    pdfViewerInstance.currentScaleValue = pdfViewerInstance.currentScaleValue
  }
}

// ── Zoom ───────────────────────────────────────────────────────────────────────
function setZoomValue(value: string) {
  if (isPresentationMode.value) return
  if (!pdfViewerInstance) return
  setViewerScaleValue(value)
}

function onZoomSelectChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value && value !== 'custom') setZoomValue(value)
}

function zoomIn() {
  if (isPresentationMode.value || !pdfViewerInstance) return
  pdfViewerInstance.currentScaleValue = String(
    Math.min(pdfViewerInstance.currentScale * 1.2, 5)
  )
}

function zoomOut() {
  if (isPresentationMode.value || !pdfViewerInstance) return
  pdfViewerInstance.currentScaleValue = String(
    Math.max(pdfViewerInstance.currentScale / 1.2, 0.25)
  )
}

function rotateLeft() {
  if (!pdfViewerInstance) return
  rotation.value = (rotation.value - 90 + 360) % 360
  pdfViewerInstance.pagesRotation = rotation.value
  sendPdfViewState()
}

function rotateRight() {
  if (!pdfViewerInstance) return
  rotation.value = (rotation.value + 90) % 360
  pdfViewerInstance.pagesRotation = rotation.value
  sendPdfViewState()
}

function applyDefaultZoom() {
  if (!pdfViewerInstance) return
  if (isPresentationMode.value) {
    setViewerScaleValue('page-fit')
    return
  }
  switch (scrollMode.value) {
    case ScrollMode.HORIZONTAL:
      setViewerScaleValue('page-height')
      break
    case ScrollMode.VERTICAL:
    case ScrollMode.WRAPPED:
      setViewerScaleValue('page-width')
      break
    default: // PAGE
      setViewerScaleValue('page-fit')
  }
}

// ── PDF view state → main process ─────────────────────────────────────────────
function sendPdfViewState() {
  if (!props.tab.isActive) return   // ← 新增：非活动标签不发送菜单状态
  window.electronAPI?.windowContentChange?.({
    pdf: {
      scrollMode: scrollMode.value,
      spreadMode: spreadMode.value,
      isPresentationMode: isPresentationMode.value,
      rotation: rotation.value,
    },
  })
}

// ── Scroll / Spread mode ──────────────────────────────────────────────────────
function applyScrollMode(mode: number, presentation = false) {
  isPresentationMode.value = presentation
  scrollMode.value = mode
  if (pdfViewerInstance) {
    pdfViewerInstance.scrollMode = mode
  }
  applyDefaultZoom()
  sendPdfViewState()
}

function applySpreadMode(mode: number) {
  spreadMode.value = mode
  if (pdfViewerInstance) {
    pdfViewerInstance.spreadMode = mode
  }
  sendPdfViewState()
}

// ── Pages init ─────────────────────────────────────────────────────────────────
function onPagesInit() {
  if (isUnmounted || !pdfViewerInstance) return
  loading.value = false
  totalPages.value = pdfViewerInstance.pagesCount
  currentPage.value = 1
  pageInput.value = 1
  pdfViewerInstance.scrollMode = scrollMode.value
  pdfViewerInstance.spreadMode = spreadMode.value
  applyDefaultZoom()
  syncTocActivePage(1)
  sendPdfViewState()
  focusViewer()
}

// ── Load / Destroy ─────────────────────────────────────────────────────────────
async function loadPDF() {
  if (!pdfUrl.value) {
    error.value = '无效的PDF文件路径'
    return
  }
  loading.value = true
  error.value = null
  rotation.value = 0

  try {
    await destroyViewer()

    pdfProvider = new PdfJsPageRenderProvider()
    await pdfProvider.load(pdfUrl.value)
    const pdfDoc = pdfProvider.pdfDocument!

    pdfEventBus = new PDFEventBus()
    const linkService = new PDFLinkService({ eventBus: pdfEventBus })

    pdfViewerInstance = new PDFViewer({
      container: pdfContainer.value!,
      viewer: pdfViewerEl.value!,
      eventBus: pdfEventBus,
      linkService,
      textLayerMode: 1, // TextLayerMode.ENABLE
    })
    linkService.setDocument(pdfDoc)
    linkService.setViewer(pdfViewerInstance)

    pdfEventBus.on('pagesinit', onPagesInit)
    pdfEventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      if (isUnmounted) return
      currentPage.value = pageNumber
      pageInput.value = pageNumber
      syncTocActivePage(pageNumber)
    })
    pdfEventBus.on('scalechanging', ({
      scale,
      presetValue,
    }: {
      scale: number
      presetValue?: string
    }) => {
      if (isUnmounted) return
      zoom.value = scale
      zoomScaleValue.value = presetValue ?? ''
    })

    pdfViewerInstance.setDocument(pdfDoc)

    const tocProvider = pdfProvider.createTocProvider?.(pageNumber => {
      if (pdfViewerInstance) pdfViewerInstance.currentPageNumber = pageNumber
      focusViewer()
    }) ?? undefined
    appStore.updateTabState(props.tab.id, { tocProvider })
    void (tocProvider as { load?: () => Promise<void> })?.load?.()

    // loading.value = false is set in onPagesInit
  } catch (err) {
    error.value = `PDF loading failed: ${err instanceof Error ? err.message : String(err)}`
    console.error('PDF loading error:', err)
    loading.value = false
  }
}

async function destroyViewer() {
  if (pdfEventBus) {
    pdfEventBus.off('pagesinit', onPagesInit)
  }
  pdfViewerInstance = null
  pdfEventBus = null
  await pdfProvider?.destroy()
  pdfProvider = null
  if (pdfViewerEl.value) {
    pdfViewerEl.value.innerHTML = ''
  }
}

// ── Page navigation ───────────────────────────────────────────────────────────
function getSpreadStart(pageNum: number): number {
  if (pageNum <= 1) return 1
  return pageNum % 2 === 0 ? pageNum - 1 : pageNum
}

function previousPage() {
  if (!pdfViewerInstance) return
  const isSpread = spreadMode.value !== SpreadMode.NONE && scrollMode.value === ScrollMode.PAGE
  const target = isSpread
    ? Math.max(1, getSpreadStart(currentPage.value) - 2)
    : Math.max(1, currentPage.value - 1)
  pdfViewerInstance.currentPageNumber = target
}

function nextPage() {
  if (!pdfViewerInstance) return
  const isSpread = spreadMode.value !== SpreadMode.NONE && scrollMode.value === ScrollMode.PAGE
  const target = isSpread
    ? Math.min(totalPages.value, getSpreadStart(currentPage.value) + 2)
    : Math.min(totalPages.value, currentPage.value + 1)
  pdfViewerInstance.currentPageNumber = target
}

function previousPageCommand() { previousPage() }
function nextPageCommand() { nextPage() }

function goToPage() {
  const page = Math.max(1, Math.min(pageInput.value, totalPages.value))
  pageInput.value = page
  currentPage.value = page
  if (pdfViewerInstance) pdfViewerInstance.currentPageNumber = page
}

// ── Focus / click ─────────────────────────────────────────────────────────────
function focusViewer() {
  if (!isViewerVisible()) return
  pdfContainer.value?.focus()
}

function handleToolbarClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('button')) return
  focusViewer()
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

  const isPageMode = scrollMode.value === ScrollMode.PAGE || isPresentationMode.value

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      if (isPageMode) { event.preventDefault(); previousPage() }
      break
    case 'ArrowRight':
    case 'ArrowDown':
      if (isPageMode) { event.preventDefault(); nextPage() }
      break
    case 'PageUp':
      event.preventDefault(); previousPage(); break
    case 'PageDown':
    case ' ':
      event.preventDefault(); nextPage(); break
    case 'Home':
      event.preventDefault()
      if (pdfViewerInstance) pdfViewerInstance.currentPageNumber = 1
      break
    case 'End':
      event.preventDefault()
      if (pdfViewerInstance) {
        pdfViewerInstance.currentPageNumber =
          spreadMode.value !== SpreadMode.NONE && scrollMode.value === ScrollMode.PAGE
            ? getSpreadStart(totalPages.value)
            : totalPages.value
      }
      break
    case '+':
    case '=':
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoomIn() }
      break
    case '-':
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoomOut() }
      break
    case '0':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        setZoomValue(scrollMode.value === ScrollMode.VERTICAL || scrollMode.value === ScrollMode.WRAPPED
          ? 'page-width' : 'page-fit')
      }
      break
  }
}

// ── Wheel ─────────────────────────────────────────────────────────────────────
function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (event.deltaY < 0) zoomIn(); else zoomOut()
    return
  }
  const isPageMode = scrollMode.value === ScrollMode.PAGE || isPresentationMode.value
  if (isPageMode) {
    event.preventDefault()
    if (event.deltaY > 0) nextPage()
    else if (event.deltaY < 0) previousPage()
  }
}

// ── Menu action ───────────────────────────────────────────────────────────────
async function handleContextMenu(event: MouseEvent) {
  if (!window.electronAPI?.showContextMenu) return

  focusViewer()

  const menuItems: ContextMenuItem[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { type: 'separator' },
    { role: 'selectAll' },
  ]

  await window.electronAPI.showContextMenu(menuItems, {
    x: event.clientX,
    y: event.clientY,
  })
}

function handleMenuAction(action: string): boolean {
  switch (action) {
    case 'zoom-in':                  zoomIn(); return true
    case 'zoom-out':                 zoomOut(); return true
    case 'zoom-to-fit':              setZoomValue('page-fit'); return true
    case 'zoom-to-width':            setZoomValue('page-width'); return true
    case 'zoom-actual':              setZoomValue('page-actual'); return true
    case 'zoom-auto':                setZoomValue('auto'); return true
    case 'previous-page':            previousPage(); return true
    case 'next-page':                nextPage(); return true
    case 'go-to-page':               return true
    case 'pdf-scroll-vertical':      applyScrollMode(ScrollMode.VERTICAL); return true
    case 'pdf-scroll-horizontal':    applyScrollMode(ScrollMode.HORIZONTAL); return true
    case 'pdf-scroll-wrapped':       applyScrollMode(ScrollMode.WRAPPED); return true
    case 'pdf-scroll-page':          applyScrollMode(ScrollMode.PAGE); return true
    case 'pdf-scroll-presentation':  applyScrollMode(ScrollMode.PAGE, true); return true
    case 'pdf-spread-none':          applySpreadMode(SpreadMode.NONE); return true
    case 'pdf-spread-odd':           applySpreadMode(SpreadMode.ODD); return true
    case 'pdf-spread-even':          applySpreadMode(SpreadMode.EVEN); return true
    case 'pdf-rotate-left':          rotateLeft(); return true
    case 'pdf-rotate-right':         rotateRight(); return true
    case 'print':
      appStore.openPdfPrintPreview(props.tab.path ?? '', totalPages.value, props.tab.name)
      return true
    default:                         return false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  isUnmounted = false
  if (pdfUrl.value) void loadPDF()

  if (typeof ResizeObserver !== 'undefined' && pdfContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        if (pdfViewerInstance?.currentScaleValue) {
          if (isViewerVisible()) {
            pdfViewerInstance.currentScaleValue = pdfViewerInstance.currentScaleValue
          } else {
            scheduleVisibleScaleRefresh()
          }
        }
      })
    })
    resizeObserver.observe(pdfContainer.value)
  }
})

watch(isActiveTab, active => {
  if (active) scheduleVisibleScaleRefresh()
})

onBeforeUnmount(async () => {
  isUnmounted = true
  visibleRefreshScheduled = false
  if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0 }
  if (visibleRefreshRaf) { cancelAnimationFrame(visibleRefreshRaf); visibleRefreshRaf = 0 }
  resizeObserver?.disconnect()
  resizeObserver = null
  await destroyViewer()
  if (props.tab.tocProvider) {
    appStore.updateTabState(props.tab.id, { tocProvider: undefined })
  }
})

defineExpose({
  tab: toRef(props, 'tab'),
  handleMenuAction,
  focusViewer,
})
</script>

<style>
@import "pdfjs-dist/web/pdf_viewer.css";

.pdfViewer .page .canvasWrapper {
  box-shadow: 0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.08);
}

.pdfViewer .textLayer ::selection {
  background: oklch(var(--p) / 0.25);
}
</style>
