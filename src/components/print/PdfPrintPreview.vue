<template>
  <!-- Loading overlay -->
  <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-base-200/70">
    <span class="loading loading-spinner loading-md text-base-content/50" />
  </div>

  <!-- Error state -->
  <div v-else-if="loadError" class="absolute inset-0 flex items-center justify-center p-6">
    <p class="text-center text-sm text-error">{{ loadError }}</p>
  </div>

  <!-- Sheets scroll area -->
  <div
    v-else
    ref="previewScroll"
    class="flex-1 overflow-x-auto overflow-y-auto px-6 py-6"
    @wheel="handlePreviewWheel"
  >
    <div :style="previewWrapperStyle">
      <div class="flex flex-col items-center gap-6" :style="previewContentStyle">

        <div v-for="(sheet, si) in sheets" :key="si">
          <!-- Sheet card: fixed width, height derived from paper aspect ratio -->
          <div
            class="overflow-hidden rounded bg-white shadow-md"
            :style="sheetCardStyle"
            :class="{ grayscale: settings.color === 'grayscale' }"
          >
            <!-- N-up grid: each cell holds one page -->
            <div class="grid h-full w-full" :style="gridStyle">
              <!-- Rendered page cells -->
              <div
                v-for="(pageNum, pi) in sheet"
                :key="pi"
                class="flex items-center justify-center overflow-hidden bg-white"
              >
                <canvas
                  :ref="el => setCanvasRef(si, pi, el as HTMLCanvasElement | null)"
                  class="block max-h-full max-w-full"
                />
              </div>
              <!-- Empty filler cells when the last sheet has fewer pages than nUp -->
              <div
                v-for="i in (nUp - sheet.length)"
                :key="`e${i}`"
                class="bg-white"
              />
            </div>
          </div>
        </div>

        <p v-if="sheets.length === 0 && !isLoading" class="text-sm text-base-content/40">
          {{ t('dialog.pdfPrintDialog.preview.noPages') }}
        </p>
      </div>
    </div>

    <button
      v-if="sheets.length > 0"
      class="absolute bottom-3 right-3 z-10 rounded-md bg-base-200/80 px-2 py-1 text-xs text-base-content/70 backdrop-blur-sm hover:bg-base-300 hover:text-base-content"
      :title="t('dialog.printDialog.preview.zoomResetTitle')"
      @click="computeFitScale"
    >
      {{ Math.round(previewScale * 100) }}%
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import * as pdfjsLib from 'pdfjs-dist'
import { getNUpGrid, getSheetDimsMm, parseCustomPageRangeInput } from './paperSpecs'
import type { PdfPrintSettings } from '@/types/pdf-print'

const props = defineProps<{
  filePath: string
  numPages: number
  settings: PdfPrintSettings
}>()

const emit = defineEmits<{
  'update:sheetCount': [count: number]
}>()

const { t } = useI18n()

// ── State ──────────────────────────────────────────────────────────────────────
const isLoading = ref(true)
const loadError = ref('')
const previewScroll = ref<HTMLDivElement>()

let pdfDoc: PDFDocumentProxy | null = null
const canvasRefs = ref<Map<string, HTMLCanvasElement>>(new Map())
const activeRenderTasks = new Map<string, RenderTask>()
let activeRenderJobId = 0
let renderSchedulePending = false
let scheduledRenderFrame: number | null = null

// ── Fixed-width rendering ──────────────────────────────────────────────────────
// The sheet card is rendered at a fixed CSS width to decouple rendering from
// the actual container layout (which is unknown at canvas-render time).
// Chosen to match the ~500px available in the preview panel at 80vw.
const SHEET_W_PX = 480
const SHEET_GAP_PX = 24
const PREVIEW_GUTTER_PX = 80

const previewScale = ref(1.0)
const previewZoomMode = ref<'fit-width' | 'manual'>('fit-width')

const nUp = computed(() => props.settings.pagesPerSheet || 1)

// Matches buildPreviewDoc.ts getGrid + sheetLandscape logic exactly
const nUpLayout = computed(() => getNUpGrid(nUp.value, props.settings.orientation))

const paperDims = computed(() => {
  const d = getSheetDimsMm(nUp.value, props.settings.orientation, props.settings.paperSize)
  return { w: d.w, h: d.h }
})

// Derived pixel dimensions of the sheet card
const sheetHPx = computed(() =>
  Math.round(SHEET_W_PX * paperDims.value.h / paperDims.value.w)
)

// Slot size within the sheet
const slotWPx = computed(() => Math.floor(SHEET_W_PX / nUpLayout.value.cols))
const slotHPx = computed(() => Math.floor(sheetHPx.value / nUpLayout.value.rows))

const effectiveScale = computed(() =>
  props.settings.scaleMode === 'custom' ? (props.settings.customScale / 100) : 1
)

const naturalContentHeight = computed(() => {
  const count = sheets.value.length
  if (count <= 0) return 0
  return count * sheetHPx.value + (count - 1) * SHEET_GAP_PX
})

const scaledContentWidth = computed(() =>
  Math.ceil(SHEET_W_PX * previewScale.value)
)

// ── CSS styles ─────────────────────────────────────────────────────────────────
const previewWrapperStyle = computed(() => ({
  position: 'relative' as const,
  width: `max(100%, ${scaledContentWidth.value}px)`,
  height: naturalContentHeight.value > 0
    ? `${Math.ceil(naturalContentHeight.value * previewScale.value)}px`
    : '0px',
}))

const previewContentStyle = computed(() => ({
  position: 'absolute' as const,
  top: '0',
  left: '50%',
  width: `${SHEET_W_PX}px`,
  transformOrigin: 'top center',
  transform: `translateX(-50%) scale(${previewScale.value})`,
}))

const sheetCardStyle = computed(() => ({
  width: `${SHEET_W_PX}px`,
  height: `${sheetHPx.value}px`,
}))

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${nUpLayout.value.cols}, ${slotWPx.value}px)`,
  gridTemplateRows: `repeat(${nUpLayout.value.rows}, ${slotHPx.value}px)`,
}))

// ── Selected pages ─────────────────────────────────────────────────────────────
const selectedPages = computed((): number[] => {
  const total = props.numPages
  if (total <= 0) return []
  switch (props.settings.pageRange) {
    case 'odd':
      return Array.from({ length: total }, (_, i) => i + 1).filter(p => p % 2 === 1)
    case 'even':
      return Array.from({ length: total }, (_, i) => i + 1).filter(p => p % 2 === 0)
    case 'custom': {
      const parsed = parseCustomPageRangeInput(props.settings.customPageRange, total)
      return parsed.length > 0
        ? parsed
        : Array.from({ length: total }, (_, i) => i + 1)
    }
    default:
      return Array.from({ length: total }, (_, i) => i + 1)
  }
})

const sheets = computed((): number[][] => {
  const n = nUp.value
  const pages = selectedPages.value
  const result: number[][] = []
  for (let i = 0; i < pages.length; i += n) result.push(pages.slice(i, i + n))
  return result
})

watch(
  () => sheets.value.length,
  count => emit('update:sheetCount', count),
  { immediate: true }
)

// ── Canvas ref management ──────────────────────────────────────────────────────
function canvasKey(si: number, pi: number): string { return `${si}-${pi}` }

function setCanvasRef(si: number, pi: number, el: HTMLCanvasElement | null) {
  const key = canvasKey(si, pi)
  if (el) canvasRefs.value.set(key, el)
  else canvasRefs.value.delete(key)
}

function cancelScheduledRender() {
  renderSchedulePending = false
  if (scheduledRenderFrame !== null) {
    cancelAnimationFrame(scheduledRenderFrame)
    scheduledRenderFrame = null
  }
}

async function cancelActiveRenderTasks() {
  const tasks = [...activeRenderTasks.values()]
  activeRenderTasks.clear()
  for (const task of tasks) {
    try { task.cancel(0) } catch { /* ignore */ }
  }
  await Promise.allSettled(tasks.map(task => task.promise))
}

function isCurrentRenderJob(jobId: number): boolean {
  return activeRenderJobId === jobId && !isLoading.value && !!pdfDoc
}

function isRenderCancelError(err: unknown): boolean {
  return err instanceof Error && /cancel/i.test(err.name)
}

// ── PDF loading ────────────────────────────────────────────────────────────────
async function loadPdf() {
  if (!props.filePath) return
  isLoading.value = true
  loadError.value = ''
  // Invalidate any in-flight renders for the old document
  ++activeRenderJobId
  cancelScheduledRender()
  await cancelActiveRenderTasks()
  if (pdfDoc) {
    try { await pdfDoc.destroy() } catch { /* ignore */ }
    pdfDoc = null
  }
  try {
    const base64Content = await window.electronAPI.readFileBinary(props.filePath)
    if (!base64Content) throw new Error('Cannot read PDF file')
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
    const resolveUrl = (p: string) => new URL(p, window.location.href).href
    pdfDoc = await pdfjsLib.getDocument({
      data: bytes.buffer,
      cMapUrl: resolveUrl('./cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: resolveUrl('./standard_fonts/'),
      wasmUrl: resolveUrl('./wasm/'),
    }).promise
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load PDF'
  } finally {
    isLoading.value = false
  }
}

// ── Page rendering ─────────────────────────────────────────────────────────────

/** Render one PDF page into its canvas. Returns false if this render job was superseded. */
async function renderPage(jobId: number, pageNum: number, si: number, pi: number): Promise<boolean> {
  if (!isCurrentRenderJob(jobId) || !pdfDoc) return false
  const key = canvasKey(si, pi)
  const canvas = canvasRefs.value.get(key)
  if (!canvas) return false

  let page: PDFPageProxy | null = null
  let renderTask: RenderTask | null = null
  try {
    page = await pdfDoc.getPage(pageNum)
    if (!isCurrentRenderJob(jobId)) return false

    // Use the page's natural rotation (do NOT override with rotation: 0)
    const baseViewport = page.getViewport({ scale: 1.0 })
    if (!isCurrentRenderJob(jobId)) return false

    // Fit the page into its slot, maintaining the page's own aspect ratio
    const fitScale = Math.min(
      slotWPx.value / baseViewport.width,
      slotHPx.value / baseViewport.height,
    ) * effectiveScale.value

    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: fitScale * dpr })
    if (!isCurrentRenderJob(jobId)) return false

    // Size the canvas to the rendered pixel dimensions
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    // CSS display size = physical / dpr (crisp on HiDPI)
    canvas.style.width  = `${Math.round(viewport.width  / dpr)}px`
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    if (!isCurrentRenderJob(jobId)) return false

    renderTask = page.render({ canvasContext: ctx, canvas, viewport })
    activeRenderTasks.set(key, renderTask)
    await renderTask.promise
    return isCurrentRenderJob(jobId)
  } catch (err: unknown) {
    if (isCurrentRenderJob(jobId) && !isRenderCancelError(err)) {
      console.warn('[PdfPrintPreview] page render failed:', err)
    }
    return false  // page render error or dialog closed mid-render
  } finally {
    if (renderTask && activeRenderTasks.get(key) === renderTask) {
      activeRenderTasks.delete(key)
    }
    page?.cleanup()
  }
}

/** Re-render all pages for the current sheets layout.
 *  Each run owns a job id and cancels existing PDF.js render tasks before
 *  reusing canvases, so superseded renders cannot write stale pixels.
 */
async function renderAllPages() {
  if (!pdfDoc || isLoading.value) return
  const jobId = ++activeRenderJobId
  await cancelActiveRenderTasks()

  // Wait for Vue to finish updating the DOM (new canvas elements must be mounted first)
  await nextTick()
  if (!isCurrentRenderJob(jobId)) return  // superseded — a newer render is running

  const sheetsSnapshot = sheets.value.map(sheet => [...sheet])
  for (let si = 0; si < sheetsSnapshot.length; si++) {
    if (!isCurrentRenderJob(jobId)) return  // superseded mid-render
    const sheet = sheetsSnapshot[si]
    if (!sheet) continue
    for (let pi = 0; pi < sheet.length; pi++) {
      if (!isCurrentRenderJob(jobId)) return
      const pageNum = sheet[pi]
      if (pageNum !== undefined) await renderPage(jobId, pageNum, si, pi)
    }
  }
}

function scheduleRenderAllPages() {
  if (isLoading.value || !pdfDoc) return
  if (renderSchedulePending) return

  renderSchedulePending = true
  void nextTick(() => {
    if (scheduledRenderFrame !== null) {
      cancelAnimationFrame(scheduledRenderFrame)
    }
    scheduledRenderFrame = requestAnimationFrame(() => {
      scheduledRenderFrame = null
      renderSchedulePending = false
      void renderAllPages()
    })
  })
}

// ── Watchers ───────────────────────────────────────────────────────────────────
watch(() => props.filePath, loadPdf, { immediate: true })

watch([isLoading, () => props.settings], async () => {
  if (!isLoading.value) {
    if (previewZoomMode.value === 'fit-width') {
      await nextTick()
      requestAnimationFrame(computeFitWidthScale)
    }
    scheduleRenderAllPages()
  }
}, { deep: true })

watch(sheets, async () => {
  if (previewZoomMode.value === 'fit-width') {
    await nextTick()
    requestAnimationFrame(computeFitWidthScale)
  }
  scheduleRenderAllPages()
})

// ── Preview zoom ───────────────────────────────────────────────────────────────
function computeFitWidthScale() {
  if (!previewScroll.value || !SHEET_W_PX) return
  const containerW = previewScroll.value.clientWidth
  if (!containerW) {
    requestAnimationFrame(computeFitWidthScale)
    return
  }
  const availableWidth = Math.max(containerW - PREVIEW_GUTTER_PX, 1)
  const scale = availableWidth / SHEET_W_PX
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

onMounted(() => {
  window.addEventListener('resize', handlePreviewViewportResize)
  nextTick(() => requestAnimationFrame(computeFitWidthScale))
})

// ── Cleanup ────────────────────────────────────────────────────────────────────
onBeforeUnmount(async () => {
  window.removeEventListener('resize', handlePreviewViewportResize)
  ++activeRenderJobId
  cancelScheduledRender()
  await cancelActiveRenderTasks()
  if (pdfDoc) {
    try { await pdfDoc.destroy() } catch { /* ignore */ }
    pdfDoc = null
  }
})
</script>
