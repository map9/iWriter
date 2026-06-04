<template>
  <div class="document-viewer-wrapper">
    <!-- PDF Toolbar -->
    <div class="iw-toolbar" @click.capture="handleToolbarClick">
      <div class="iw-toolbar-group">
        <button
          @click="zoomOut"
          :disabled="zoom <= 0.25"
          class="iw-toolbar-btn btn-sm"
          :title="t('pdfViewer.toolbar.zoomOut')"
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
          :title="t('pdfViewer.toolbar.zoomIn')"
        >
          <IconZoomIn class="icon-sm" />
        </button>

        <button
          @click="zoomToFit"
          class="iw-toolbar-btn btn-sm"
          :title="t('pdfViewer.toolbar.fitToPage')"
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
          class="iw-btn btn-ghost btn-sm px-3 normal-case"
          :class="{ 'btn-active': displayMode === 'continuous' }"
          :title="t('pdfViewer.toolbar.continuous')"
        >
          {{ t('pdfViewer.toolbar.continuous') }}
        </button>
        <button
          @click="setDisplayMode('single')"
          class="iw-btn btn-ghost btn-sm px-3 normal-case"
          :class="{ 'btn-active': displayMode === 'single' }"
          :title="t('pdfViewer.toolbar.singlePage')"
        >
          {{ t('pdfViewer.toolbar.singlePage') }}
        </button>
        <button
          @click="setDisplayMode('double')"
          class="iw-btn btn-ghost btn-sm px-3 normal-case"
          :class="{ 'btn-active': displayMode === 'double' }"
          :title="t('pdfViewer.toolbar.doublePage')"
        >
          {{ t('pdfViewer.toolbar.doublePage') }}
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
            class="iw-input w-16 text-center"
          />
          <span class="text-sm text-base-content/50">/ {{ totalPages }}</span>
        </div>

        <button
          @click="nextPageCommand"
          :disabled="currentPage >= totalPages"
          class="iw-toolbar-btn btn-sm"
          :title="t('pdfViewer.toolbar.nextPage')"
        >
          <IconChevronRight class="icon-sm" />
        </button>
      </div>

      <div class="iw-toolbar-spacer" />
    </div>

    <!-- PDF Display Area: PDFViewer requires position:absolute container + inner viewer div -->
    <div
      ref="pdfContainer"
      class="absolute bottom-0 left-0 right-0 overflow-auto outline-none bg-base-200"
      style="top: 2.5rem"
      tabindex="0"
      @wheel="handleWheel"
      @keydown="handleKeydown"
      @mousedown="focusViewer"
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
import { ref, toRef, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileTab } from '@/types'
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
  IconZoomReset,
  IconChevronLeft,
  IconChevronRight,
  IconAlertCircle
} from '@tabler/icons-vue'

interface Props {
  tab: FileTab
}

const props = defineProps<Props>()
const appStore = useAppStore()
const { t } = useI18n()

type DisplayMode = 'continuous' | 'single' | 'double'

// DOM refs
const pdfContainer = ref<HTMLDivElement>()
const pdfViewerEl = ref<HTMLDivElement>()

// UI state
const zoom = ref(1)
const currentPage = ref(1)
const totalPages = ref(1)
const pageInput = ref(1)
const loading = ref(false)
const error = ref<string | null>(null)
const displayMode = ref<DisplayMode>('continuous')

// PDFViewer instances (non-reactive to avoid Vue proxy issues)
let pdfViewerInstance: PDFViewer | null = null
let pdfEventBus: PDFEventBus | null = null
let pdfProvider: PdfJsPageRenderProvider | null = null
let isUnmounted = false
let resizeObserver: ResizeObserver | null = null
let resizeRaf = 0

const pdfUrl = computed(() => props.tab.path ?? '')

function syncTocActivePage(pageNum: number) {
  const provider = props.tab.tocProvider as { updateActivePage?: (page: number) => void } | undefined
  provider?.updateActivePage?.(pageNum)
}

function applyScrollMode(mode: DisplayMode) {
  if (!pdfViewerInstance) return
  if (mode === 'continuous') {
    pdfViewerInstance.scrollMode = ScrollMode.VERTICAL
    pdfViewerInstance.spreadMode = SpreadMode.NONE
  } else if (mode === 'single') {
    pdfViewerInstance.scrollMode = ScrollMode.PAGE
    pdfViewerInstance.spreadMode = SpreadMode.NONE
  } else {
    pdfViewerInstance.scrollMode = ScrollMode.PAGE
    pdfViewerInstance.spreadMode = SpreadMode.ODD
  }
}

function applyDefaultZoom() {
  if (!pdfViewerInstance) return
  pdfViewerInstance.currentScaleValue = displayMode.value === 'continuous' ? 'page-width' : 'page-fit'
}

function onPagesInit() {
  if (isUnmounted || !pdfViewerInstance) return
  loading.value = false
  totalPages.value = pdfViewerInstance.pagesCount
  currentPage.value = 1
  pageInput.value = 1
  applyScrollMode(displayMode.value)
  applyDefaultZoom()
  syncTocActivePage(1)
  focusViewer()

}

async function loadPDF() {
  if (!pdfUrl.value) {
    error.value = '无效的PDF文件路径'
    return
  }
  loading.value = true
  error.value = null

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
    pdfEventBus.on('scalechanging', ({ scale }: { scale: number }) => {
      if (isUnmounted) return
      zoom.value = scale
    })

    pdfViewerInstance.setDocument(pdfDoc)

    const tocProvider = pdfProvider.createTocProvider?.(pageNumber => {
      if (pdfViewerInstance) pdfViewerInstance.currentPageNumber = pageNumber
      focusViewer()
    }) ?? undefined
    appStore.updateTabState(props.tab.id, { tocProvider })
    void (tocProvider as { load?: () => Promise<void> })?.load?.()

    // loading.value = false is handled in onPagesInit
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
  // Clear stale page elements so PDFViewer starts clean on next load
  if (pdfViewerEl.value) {
    pdfViewerEl.value.innerHTML = ''
  }
}

function zoomIn() {
  if (!pdfViewerInstance) return
  pdfViewerInstance.currentScaleValue = String(Math.min(pdfViewerInstance.currentScale * 1.2, 5))
}

function zoomOut() {
  if (!pdfViewerInstance) return
  pdfViewerInstance.currentScaleValue = String(Math.max(pdfViewerInstance.currentScale / 1.2, 0.25))
}

function zoomToFit() {
  if (!pdfViewerInstance) return
  pdfViewerInstance.currentScaleValue = displayMode.value === 'continuous' ? 'page-width' : 'page-fit'
}

function setDisplayMode(mode: DisplayMode) {
  displayMode.value = mode
  applyScrollMode(mode)
  applyDefaultZoom()
}

function getSpreadStart(pageNum: number): number {
  if (pageNum <= 1) return 1
  return pageNum % 2 === 0 ? pageNum - 1 : pageNum
}

function previousPage() {
  if (!pdfViewerInstance) return
  const target = displayMode.value === 'double'
    ? Math.max(1, getSpreadStart(currentPage.value) - 2)
    : Math.max(1, currentPage.value - 1)
  pdfViewerInstance.currentPageNumber = target
}

function nextPage() {
  if (!pdfViewerInstance) return
  const target = displayMode.value === 'double'
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

function focusViewer() {
  pdfContainer.value?.focus()
}

function handleToolbarClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('button')) return
  focusViewer()
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      if (displayMode.value !== 'continuous') {
        event.preventDefault()
        previousPage()
      }
      break
    case 'ArrowRight':
    case 'ArrowDown':
      if (displayMode.value !== 'continuous') {
        event.preventDefault()
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
      if (pdfViewerInstance) pdfViewerInstance.currentPageNumber = 1
      break
    case 'End':
      event.preventDefault()
      if (pdfViewerInstance) {
        pdfViewerInstance.currentPageNumber = displayMode.value === 'double'
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
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoomToFit() }
      break
  }
}

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (event.deltaY < 0) zoomIn(); else zoomOut()
    return
  }
  // In page modes, use wheel to navigate pages
  if (displayMode.value !== 'continuous') {
    event.preventDefault()
    if (event.deltaY > 0) nextPage()
    else if (event.deltaY < 0) previousPage()
  }
}

function handleMenuAction(action: string): boolean {
  switch (action) {
    case 'zoom-in': zoomIn(); return true
    case 'zoom-out': zoomOut(); return true
    case 'zoom-to-fit': zoomToFit(); return true
    case 'previous-page': previousPage(); return true
    case 'next-page': nextPage(); return true
    case 'go-to-page': return true
    default: return false
  }
}

onMounted(() => {
  isUnmounted = false
  if (pdfUrl.value) void loadPDF()

  if (typeof ResizeObserver !== 'undefined' && pdfContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        if (pdfViewerInstance?.currentScaleValue) {
          pdfViewerInstance.currentScaleValue = pdfViewerInstance.currentScaleValue
        }
      })
    })
    resizeObserver.observe(pdfContainer.value)
  }
})

onBeforeUnmount(async () => {
  isUnmounted = true
  if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0 }
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
  focusViewer
})
</script>
