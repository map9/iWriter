<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
    tabindex="-1"
  >
    <div
      class="flex h-[80vh] w-[80vw] max-w-7xl overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      @click.stop
    >
      <!-- Left: Preview Area -->
      <div class="relative flex flex-1 flex-col overflow-hidden bg-neutral/20">
        <div v-if="isRendering" class="absolute inset-0 z-10 flex items-center justify-center bg-base-200/70">
          <span class="loading loading-spinner loading-md text-base-content/50" />
        </div>
        <div ref="previewScroll" class="flex-1 overflow-y-auto overflow-x-hidden">
          <!-- wrapper sets the scrollable height = natural height × scale -->
          <div :style="previewWrapperStyle">
            <iframe ref="previewFrame" :style="previewFrameStyle" />
          </div>
        </div>
        <!-- Zoom badge — click to reset to fit-page -->
        <button
          v-if="!isRendering && totalPages > 0"
          class="absolute bottom-3 right-3 z-10 rounded-md bg-base-200/80 px-2 py-1 text-xs text-base-content/60 backdrop-blur-sm hover:bg-base-300 hover:text-base-content"
          :title="t('dialog.printPreviewDialog.preview.zoomResetTitle')"
          @click="computeFitScale"
        >
          {{ Math.round(previewScale * 100) }}%
        </button>
      </div>

      <!-- Right: Settings Panel -->
      <div class="flex w-80 shrink-0 flex-col border-l border-base-300">
        <!-- Header -->
        <div class="flex shrink-0 items-center justify-between border-b border-base-300 px-5 py-4">
          <h2 class="text-base font-semibold">{{ t('dialog.printPreviewDialog.title') }}</h2>
          <span class="text-sm text-base-content/50">{{ t('dialog.printPreviewDialog.sheets', { count: physicalSheets }) }}</span>
        </div>

        <!-- Settings -->
        <div class="flex-1 overflow-y-auto">
          <div class="divide-y divide-base-300">

            <!-- Printer -->
            <div class="flex items-center justify-between px-5 py-3">
              <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.printer.label') }}</label>
              <select v-model="selectedPrinter" class="iw-select ml-3 w-44 text-sm">
                <option :value="PDF_PRINTER">{{ t('dialog.printPreviewDialog.printer.saveAsPdf') }}</option>
                <option v-for="p in printers" :key="p.name" :value="p.name">
                  {{ p.displayName || p.name }}
                </option>
              </select>
            </div>

            <!-- Page range -->
            <div class="flex flex-col gap-2 px-5 py-3">
              <div class="flex items-center justify-between">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.pageRange.label') }}</label>
                <select v-model="pageRange" class="iw-select ml-3 w-44 text-sm">
                  <option value="all">{{ t('dialog.printPreviewDialog.pageRange.options.all') }}</option>
                  <option value="odd">{{ t('dialog.printPreviewDialog.pageRange.options.odd') }}</option>
                  <option value="even">{{ t('dialog.printPreviewDialog.pageRange.options.even') }}</option>
                  <option value="custom">{{ t('dialog.printPreviewDialog.pageRange.options.custom') }}</option>
                </select>
              </div>
              <input
                v-if="pageRange === 'custom'"
                v-model="customPageRange"
                class="iw-input w-full text-sm"
                :placeholder="t('dialog.printPreviewDialog.pageRange.placeholder')"
              />
              <p v-if="pageRange === 'custom' && customPageRangeError" class="text-xs text-error">
                {{ customPageRangeError }}
              </p>
            </div>

            <!-- Copies (hidden for PDF printer) -->
            <div v-if="!isPdfPrinter" class="flex items-center justify-between px-5 py-3">
              <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.copies.label') }}</label>
              <input
                v-model.number="copies"
                type="number"
                min="1"
                max="999"
                class="iw-input ml-3 w-44 text-sm"
              />
            </div>

            <!-- More Settings Toggle -->
            <button
              class="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-base-200"
              @click="showMoreSettings = !showMoreSettings"
            >
              <span class="text-sm font-medium">{{ t('dialog.printPreviewDialog.moreSettings') }}</span>
              <IconChevronUp v-if="showMoreSettings" class="icon-xs shrink-0 text-base-content/60" />
              <IconChevronDown v-else class="icon-xs shrink-0 text-base-content/60" />
            </button>

            <template v-if="showMoreSettings">

            <!-- Print theme -->
            <div class="flex items-center justify-between px-5 py-3">
              <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.printTheme.label') }}</label>
              <select v-model="selectedPrintThemeId" class="iw-select ml-3 w-44 text-sm">
                <option v-for="theme in availablePrintThemes" :key="theme.id" :value="theme.id">
                  {{ theme.name }}
                </option>
              </select>
            </div>

              <!-- Layout / Orientation -->
              <div class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.orientation.label') }}</label>
                <select v-model="orientation" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option value="portrait">{{ t('dialog.printPreviewDialog.orientation.options.portrait') }}</option>
                  <option value="landscape">{{ t('dialog.printPreviewDialog.orientation.options.landscape') }}</option>
                </select>
              </div>

              <!-- Paper Size -->
              <div class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.paperSize.label') }}</label>
                <select v-model="paperSize" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option v-for="s in availablePaperSizes" :key="s.value" :value="s.value">
                    {{ s.label }}
                  </option>
                </select>
              </div>

              <!-- Pages per sheet -->
              <div class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.pagesPerSheet.label') }}</label>
                <select v-model="pagesPerSheet" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="6">6</option>
                  <option value="9">9</option>
                </select>
              </div>

              <!-- Margins -->
              <div class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.margins.label') }}</label>
                <select v-model="margins" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option value="theme">{{ t('dialog.printPreviewDialog.margins.options.theme') }}</option>
                  <option value="default">{{ t('dialog.printPreviewDialog.margins.options.default') }}</option>
                  <option value="none">{{ t('dialog.printPreviewDialog.margins.options.none') }}</option>
                  <option value="minimum">{{ t('dialog.printPreviewDialog.margins.options.minimum') }}</option>
                </select>
              </div>

              <!-- Print Quality (hidden for PDF) -->
              <div v-if="!isPdfPrinter" class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.quality.label') }}</label>
                <select v-model="dpi" class="iw-select ml-3 w-44 text-sm">
                  <option value="150">150 dpi</option>
                  <option value="300">300 dpi</option>
                  <option value="600">600 dpi</option>
                </select>
              </div>

              <!-- Scale -->
              <div class="flex flex-col gap-2 px-5 py-3">
                <div class="flex items-center justify-between">
                  <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.scale.label') }}</label>
                  <select v-model="scaleMode" class="iw-select ml-3 w-44 text-sm">
                    <option value="default">{{ t('dialog.printPreviewDialog.scale.options.default') }}</option>
                    <option value="custom">{{ t('dialog.printPreviewDialog.scale.options.custom') }}</option>
                  </select>
                </div>
                <div v-if="scaleMode === 'custom'" class="flex items-center gap-2">
                  <input
                    v-model.number="customScale"
                    type="number"
                    min="10"
                    max="500"
                    class="iw-input flex-1 text-sm"
                  />
                  <span class="shrink-0 text-sm text-base-content/60">%</span>
                </div>
                <p v-if="scaleMode === 'custom' && customScaleError" class="text-xs text-error">
                  {{ customScaleError }}
                </p>
              </div>

              <!-- Color (only for real printers that support color) -->
              <div v-if="!isPdfPrinter && printerColorSupported" class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.color.label') }}</label>
                <select v-model="colorMode" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option value="color">{{ t('dialog.printPreviewDialog.color.options.color') }}</option>
                  <option value="grayscale">{{ t('dialog.printPreviewDialog.color.options.grayscale') }}</option>
                </select>
              </div>

              <!-- Options -->
              <div class="flex flex-col gap-2 px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printPreviewDialog.options.label') }}</label>
                <label class="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" v-model="printBackground" class="checkbox checkbox-sm" />
                  <span class="text-sm">{{ t('dialog.printPreviewDialog.options.printBackground') }}</span>
                </label>
                <label class="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" v-model="printHeaderFooter" class="checkbox checkbox-sm" @change="renderPreview" />
                  <span class="text-sm">{{ t('dialog.printPreviewDialog.options.printHeaderFooter') }}</span>
                </label>
              </div>

            </template>

            <!-- System dialog link (hidden for PDF) -->
            <button
              v-if="!isPdfPrinter"
              class="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-primary hover:bg-base-200"
              @click="handleSystemPrint"
              :disabled="isPrinting"
            >
              <span>{{ t('dialog.printPreviewDialog.systemDialog') }}</span>
              <IconExternalLink class="icon-xs shrink-0" />
            </button>

          </div>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 items-center justify-end gap-3 border-t border-base-300 px-5 py-3">
          <button class="iw-btn btn-ghost btn-sm" @click="emit('close')">{{ t('dialog.printPreviewDialog.actions.cancel') }}</button>
          <button
            class="iw-btn btn-primary btn-sm"
            :disabled="isPrinting || isRendering || totalPages === 0"
            @click="handlePrint"
          >
            {{ isPdfPrinter ? t('dialog.printPreviewDialog.actions.saveAsPdf') : t('dialog.printPreviewDialog.actions.print') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronUp, IconChevronDown, IconExternalLink } from '@tabler/icons-vue'
import { notify } from '@/utils/notifications'
import { buildPreviewDocumentWithOptions } from './buildPreviewDoc'
import { buildPrintCss } from './buildPrintCss'
import { builtInPrintThemes, getPrintThemeById } from './printThemes'

// Special sentinel value for "Save as PDF" pseudo-printer
const PDF_PRINTER = '__pdf__'

type MarginMode = 'theme' | 'default' | 'none' | 'minimum'

const MARGIN_VALUES: Record<MarginMode, string> = {
  theme: '',
  default: '20mm',
  none:    '0',
  minimum: '5mm',
}

type PaperSpec = {
  value: string
  label: string
  widthMm: number
  heightMm: number
  cupsMediaIds?: string[]
  electronPrintKeyword?: boolean
  showInUi?: boolean
}

const PAPER_SPECS: PaperSpec[] = [
  { value: 'A0', label: 'A0 (841 × 1189 mm)', widthMm: 841, heightMm: 1189, cupsMediaIds: ['iso_a0_841x1189mm'], electronPrintKeyword: true, showInUi: false },
  { value: 'A1', label: 'A1 (594 × 841 mm)', widthMm: 594, heightMm: 841, cupsMediaIds: ['iso_a1_594x841mm'], electronPrintKeyword: true, showInUi: false },
  { value: 'A2', label: 'A2 (420 × 594 mm)', widthMm: 420, heightMm: 594, cupsMediaIds: ['iso_a2_420x594mm'], electronPrintKeyword: true, showInUi: false },
  { value: 'A3', label: 'A3 (297 × 420 mm)', widthMm: 297, heightMm: 420, cupsMediaIds: ['iso_a3_297x420mm'], electronPrintKeyword: true, showInUi: true },
  { value: 'A4', label: 'A4 (210 × 297 mm)', widthMm: 210, heightMm: 297, cupsMediaIds: ['iso_a4_210x297mm'], electronPrintKeyword: true, showInUi: true },
  { value: 'A5', label: 'A5 (148 × 210 mm)', widthMm: 148, heightMm: 210, cupsMediaIds: ['iso_a5_148x210mm'], electronPrintKeyword: true, showInUi: true },
  { value: 'A6', label: 'A6 (105 × 148 mm)', widthMm: 105, heightMm: 148, cupsMediaIds: ['iso_a6_105x148mm'], electronPrintKeyword: true, showInUi: true },
  { value: 'A7', label: 'A7 (74 × 105 mm)', widthMm: 74, heightMm: 105, cupsMediaIds: ['iso_a7_74x105mm'], showInUi: true },
  { value: 'A10', label: 'A10 (26 × 37 mm)', widthMm: 26, heightMm: 37, cupsMediaIds: ['iso_a10_26x37mm'], showInUi: true },
  { value: 'B4', label: 'B4 (250 × 353 mm)', widthMm: 250, heightMm: 353, cupsMediaIds: ['iso_b4_250x353mm'], showInUi: true },
  { value: 'B5', label: 'B5 (176 × 250 mm)', widthMm: 176, heightMm: 250, cupsMediaIds: ['iso_b5_176x250mm'], showInUi: true },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)', widthMm: 215.9, heightMm: 279.4, cupsMediaIds: ['na_letter_8.5x11in'], electronPrintKeyword: true, showInUi: true },
  { value: 'Legal', label: 'Legal (8.5 × 14 in)', widthMm: 215.9, heightMm: 355.6, cupsMediaIds: ['na_legal_8.5x14in'], electronPrintKeyword: true, showInUi: true },
  { value: 'Ledger', label: 'Ledger (11 × 17 in)', widthMm: 279.4, heightMm: 431.8, cupsMediaIds: ['na_ledger_11x17in'], showInUi: true },
]

const STANDARD_PAPER_SIZES = PAPER_SPECS
  .filter(spec => spec.showInUi !== false)
  .map(spec => ({ value: spec.value, label: spec.label }))

const CUPS_MEDIA_MAP: Record<string, string> = Object.fromEntries(
  PAPER_SPECS.flatMap(spec => (spec.cupsMediaIds ?? []).map(mediaId => [mediaId, spec.value])),
)

const PAPER_DIMS_MM: Record<string, { widthMm: number; heightMm: number }> = Object.fromEntries(
  PAPER_SPECS.map(spec => [spec.value, { widthMm: spec.widthMm, heightMm: spec.heightMm }]),
)

const ELECTRON_PRINT_KEYWORDS = new Set(
  PAPER_SPECS.filter(spec => spec.electronPrintKeyword).map(spec => spec.value),
)

function getPaperDimensionsMm(size: string): { widthMm: number; heightMm: number } {
  return PAPER_DIMS_MM[size] ?? PAPER_DIMS_MM.A4 ?? { widthMm: 210, heightMm: 297 }
}

function formatCssLengthMm(mm: number): string {
  return `${Number(mm.toFixed(4))}mm`
}

function getPagesPerSheetNumber(): number {
  return parseInt(pagesPerSheet.value, 10) || 1
}

function getEffectiveSheetOrientation(): 'portrait' | 'landscape' {
  if (getPagesPerSheetNumber() <= 1) return orientation.value
  return orientation.value === 'portrait' ? 'landscape' : 'portrait'
}

function parseCustomPageRangeInput(input: string, pageCount: number): number[] {
  if (pageCount <= 0) return []

  const pages = new Set<number>()
  for (const part of input.split(',')) {
    const token = part.trim()
    if (!token) continue
    if (token.includes('-')) {
      const segs = token.split('-')
      const a = parseInt(segs[0]?.trim() ?? '')
      const b = parseInt(segs[1]?.trim() ?? '')
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      const start = Math.max(Math.min(a, b), 1)
      const end = Math.min(Math.max(a, b), pageCount)
      for (let page = start; page <= end; page += 1) pages.add(page)
      continue
    }

    const page = parseInt(token)
    if (Number.isFinite(page) && page >= 1 && page <= pageCount) {
      pages.add(page)
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
}


const props = defineProps<{
  visible: boolean
  html: string
  title: string
}>()

const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()

const previewFrame  = ref<HTMLIFrameElement>()
const previewScroll = ref<HTMLDivElement>()
let currentBlobUrl = ''
let lastPreviewHtml = ''
let previewRenderTimer: ReturnType<typeof setTimeout> | null = null

const isRendering = ref(false)
const isPrinting  = ref(false)
const totalPages  = ref(0)
const originalTotalPages = ref(0)

// Zoom / fit-page state
const previewScale        = ref(1.0)
const previewPanelWidth  = ref(0)
const previewPanelHeight = ref(0)
const previewZoomMode     = ref<'fit-width' | 'manual'>('fit-width')

const PREVIEW_GUTTER_PX = 80
const PREVIEW_RENDER_DEBOUNCE_MS = 220

// Printer
const printers        = ref<Electron.PrinterInfo[]>([])
const selectedPrinter = ref(PDF_PRINTER)

// Page
const pageRange      = ref<'all' | 'odd' | 'even' | 'custom'>('all')
const customPageRange = ref('')
const copies         = ref(1)
const selectedPrintThemeId = ref('default')

// More settings
const showMoreSettings  = ref(true)
const orientation       = ref<'portrait' | 'landscape'>('portrait')
const paperSize         = ref('A4')
const pagesPerSheet     = ref('1')
const margins           = ref<MarginMode>('theme')
const dpi               = ref('300')
const scaleMode         = ref<'default' | 'custom'>('default')
const customScale       = ref(100)
const colorMode         = ref<'color' | 'grayscale'>('color')
const printBackground   = ref(false)
const printHeaderFooter = ref(true)

type CustomInputValidation<T> = {
  effectiveValue: T
  error: string
}

// ── Computed ──────────────────────────────────────────────────────────────────

const isPdfPrinter = computed(() => selectedPrinter.value === PDF_PRINTER)

const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  printers.value.find(p => p.name === selectedPrinter.value) ?? null
)

const printerColorSupported = computed(() => {
  if (isPdfPrinter.value) return false
  return detectColorSupport(selectedPrinterInfo.value)
})

const availablePaperSizes = computed(() => {
  if (isPdfPrinter.value) return STANDARD_PAPER_SIZES
  return getPrinterPaperSizes(selectedPrinterInfo.value)
})

const effectiveScale = computed(() =>
  scaleMode.value === 'custom' ? customScaleValidation.value.effectiveValue : 100
)

const customScaleValidation = computed<CustomInputValidation<number>>(() => {
  if (scaleMode.value !== 'custom') {
    return { effectiveValue: 100, error: '' }
  }

  const rawValue = customScale.value as number | '' | null | undefined
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { effectiveValue: 100, error: '' }
  }

  const scale = Number(rawValue)
  if (!Number.isFinite(scale) || scale <= 0) {
    return { effectiveValue: 100, error: t('dialog.printPreviewDialog.validation.scalePositive') }
  }

  return { effectiveValue: scale, error: '' }
})

const customScaleError = computed(() => customScaleValidation.value.error)

const customPageRangeValidation = computed<CustomInputValidation<number[] | null>>(() => {
  if (pageRange.value !== 'custom') {
    return { effectiveValue: null, error: '' }
  }

  const rawValue = customPageRange.value.trim()
  if (!rawValue) {
    return { effectiveValue: null, error: '' }
  }

  if (!/^(\d+(\s*-\s*\d+)?)(\s*,\s*\d+(\s*-\s*\d+)?)*$/.test(rawValue)) {
    return { effectiveValue: null, error: t('dialog.printPreviewDialog.validation.pageRangeInvalid') }
  }

  const pages = parseCustomPageRangeInput(rawValue, originalTotalPages.value)
  if (!pages.length) {
    return { effectiveValue: null, error: t('dialog.printPreviewDialog.validation.pageRangeOutOfRange') }
  }

  return { effectiveValue: pages, error: '' }
})

const customPageRangeError = computed(() => customPageRangeValidation.value.error)
const availablePrintThemes = builtInPrintThemes
const selectedPrintTheme = computed(() => getPrintThemeById(selectedPrintThemeId.value) ?? builtInPrintThemes[0]!)

const physicalSheets = computed(() =>
  totalPages.value > 0
    ? Math.ceil(totalPages.value / parseInt(pagesPerSheet.value))
    : 0
)

// ── Preview iframe layout (CSS transform scale approach) ───────────────────────
// The wrapper controls the scrollable height; the iframe renders at natural size
// and is visually scaled via transform so scrollHeight is always reliable.

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
  width: previewPanelWidth.value > 0 ? `${previewPanelWidth.value}px` : '0px',
  height: previewPanelHeight.value > 0 ? `${previewPanelHeight.value}px` : '0px',
  border: 'none',
  display: 'block',
  pointerEvents: 'none' as const,
  transformOrigin: 'top center',
  transform: previewPanelHeight.value > 0 ? `translateX(-50%) scale(${previewScale.value})` : 'none',
}))

// ── Printer capability helpers ─────────────────────────────────────────────────

function detectColorSupport(info: Electron.PrinterInfo | null): boolean {
  if (!info) return true
  const opts = (info.options ?? {}) as Record<string, string>
  // CUPS printer-type bitmask: bit 3 (0x8) = color capability
  const pt = opts['printer-type']
  if (pt) {
    const n = parseInt(pt, pt.toLowerCase().startsWith('0x') ? 16 : 10)
    if (!isNaN(n)) return (n & 0x8) !== 0
  }
  // Explicit CUPS attribute
  const cs = opts['color-supported']
  if (cs !== undefined) return cs !== 'false' && cs !== '0'
  return true
}

function getPrinterPaperSizes(info: Electron.PrinterInfo | null): typeof STANDARD_PAPER_SIZES {
  if (!info) return STANDARD_PAPER_SIZES
  const opts = (info.options ?? {}) as Record<string, string>
  const mediaStr = opts['media-supported']
  if (!mediaStr) return STANDARD_PAPER_SIZES

  const seen = new Set<string>()
  const result: typeof STANDARD_PAPER_SIZES = []

  for (const id of mediaStr.split(/\s+/)) {
    const val = CUPS_MEDIA_MAP[id.trim()]
    if (!val || seen.has(val)) continue
    seen.add(val)
    const entry = STANDARD_PAPER_SIZES.find(s => s.value === val)
    if (entry) result.push(entry)
  }

  return result.length > 0 ? result : STANDARD_PAPER_SIZES
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  window.addEventListener('message', handleFrameMessage)
  window.addEventListener('resize', handlePreviewViewportResize)
  try {
    const list = await window.electronAPI.getPrinters()
    printers.value = list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = list.find((p: any) => p.isDefault)
    if (def) selectedPrinter.value = def.name
  } catch {
    /* no printers API — keep PDF_PRINTER as default */
  }
})

onUnmounted(() => {
  window.removeEventListener('message', handleFrameMessage)
  window.removeEventListener('resize', handlePreviewViewportResize)
  previewScroll.value?.removeEventListener('wheel', handlePreviewWheel)
  if (previewRenderTimer) clearTimeout(previewRenderTimer)
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  lastPreviewHtml = ''
})

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      await nextTick()
      previewScroll.value?.addEventListener('wheel', handlePreviewWheel, { passive: false })
      if (props.html) renderPreview()
    } else {
      previewScroll.value?.removeEventListener('wheel', handlePreviewWheel)
    }
  }
)

watch(
  () => props.html,
  async (val) => { if (props.visible && val) { await nextTick(); renderPreview() } }
)

// When printer switches, validate paper size and re-render
watch(selectedPrinter, () => {
  const sizes = availablePaperSizes.value
  if (!sizes.find(s => s.value === paperSize.value)) {
    paperSize.value = sizes[0]?.value ?? 'A4'
  }
  schedulePreviewRender()
})

// ── Message from iframe ────────────────────────────────────────────────────────

function handleFrameMessage(event: MessageEvent) {
  if (event.source !== previewFrame.value?.contentWindow) return

  if (event.data?.type === 'paged-ready' || event.data?.type === 'paged-metrics') {
    totalPages.value = event.data.total ?? 0
    originalTotalPages.value = event.data.originalTotal ?? event.data.total ?? 0
    previewPanelWidth.value  = event.data.scrollWidth  ?? 0
    previewPanelHeight.value = event.data.scrollHeight ?? 0
    if (previewZoomMode.value === 'fit-width') {
      nextTick(() => requestAnimationFrame(computeFitWidthScale))
    }
    if (event.data?.type === 'paged-ready') {
      isRendering.value = false
    }

  } else if (event.data?.type === 'paged-wheel') {
    const factor = event.data.deltaY > 0 ? 0.9 : 1.1
    previewZoomMode.value = 'manual'
    previewScale.value = Math.min(Math.max(Math.round(previewScale.value * factor * 100) / 100, 0.1), 3.0)

  } else if (event.data?.type === 'paged-error') {
    console.error('[PrintPreview] pagedjs error:', event.data.error)
    notify.error(t('dialog.printPreviewDialog.notifications.previewFailed'))
    isRendering.value = false
  }
}

// ── Zoom / fit-page ────────────────────────────────────────────────────────────

function computeFitWidthScale() {
  if (!previewScroll.value || !previewPanelWidth.value) return
  const containerW = previewScroll.value.clientWidth
  if (!containerW) {
    // Layout not committed yet (first open); retry on next animation frame
    requestAnimationFrame(computeFitWidthScale)
    return
  }
  const availableWidth = Math.max(containerW - PREVIEW_GUTTER_PX, 1)
  const scale = availableWidth / previewPanelWidth.value
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
  if (!event.ctrlKey && !event.metaKey) return   // normal scroll passes through
  event.preventDefault()
  const factor = event.deltaY > 0 ? 0.9 : 1.1
  previewZoomMode.value = 'manual'
  previewScale.value = Math.min(Math.max(Math.round(previewScale.value * factor * 100) / 100, 0.1), 3.0)
}

// ── CSS generation ─────────────────────────────────────────────────────────────

function getPrintDateText(): string {
  return new Intl.DateTimeFormat(locale.value || navigator.language || 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getDialogMarginOverride(): string | null {
  return margins.value === 'theme' ? null : MARGIN_VALUES[margins.value]
}

function generatePrintCSS(): { css: string; enablePageNumberFix: boolean; pageNumberMarginBoxes: string[] } {
  const dims = getPaperDimensionsMm(paperSize.value)
  const pageWidth = orientation.value === 'landscape' ? dims.heightMm : dims.widthMm
  const pageHeight = orientation.value === 'landscape' ? dims.widthMm : dims.heightMm
  const pageSize = `${formatCssLengthMm(pageWidth)} ${formatCssLengthMm(pageHeight)}`
  return buildPrintCss({
    theme: selectedPrintTheme.value,
    documentTitle: props.title || t('dialog.printPreviewDialog.untitled'),
    printDate: getPrintDateText(),
    pageSize,
    margin: getDialogMarginOverride(),
    zoomFactor: effectiveScale.value / 100,
    colorMode: colorMode.value,
    printHeaderFooter: printHeaderFooter.value,
  })
}

// ── Preview render ─────────────────────────────────────────────────────────────

async function renderPreview() {
  if (!props.html) return
  await nextTick()
  if (!previewFrame.value) return

  isRendering.value = true
  previewPanelWidth.value = 0
  previewPanelHeight.value = 0   // resets wrapper + iframe heights via reactive binding
  previewZoomMode.value = 'fit-width'

  lastPreviewHtml = buildPreviewHtml()
  const blob = new Blob([lastPreviewHtml], { type: 'text/html' })

  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl = URL.createObjectURL(blob)

  previewFrame.value.src = currentBlobUrl
}


function buildPreviewHtml(): string {
  const effectivePageSelectionMode = pageRange.value === 'custom' && !customPageRangeValidation.value.effectiveValue
    ? 'all'
    : pageRange.value
  const printCss = generatePrintCSS()
  return buildPreviewDocumentWithOptions(props.html, printCss.css, {
    pagesPerSheet: getPagesPerSheetNumber(),
    orientation: orientation.value,
    pageSelectionMode: effectivePageSelectionMode,
    selectedPages: pageRange.value === 'custom' ? customPageRangeValidation.value.effectiveValue : null,
    contentScale: zoomFactorForPreview(),
    enablePageNumberFix: printCss.enablePageNumberFix,
    pageNumberMarginBoxes: printCss.pageNumberMarginBoxes,
  })
}

function schedulePreviewRender() {
  if (!props.visible || !props.html) return
  if (previewRenderTimer) clearTimeout(previewRenderTimer)
  previewRenderTimer = setTimeout(() => {
    previewRenderTimer = null
    void renderPreview()
  }, PREVIEW_RENDER_DEBOUNCE_MS)
}

function zoomFactorForPreview(): number {
  return customScaleValidation.value.effectiveValue / 100
}

// ── Print helpers ─────────────────────────────────────────────────────────────

function buildElectronPrintPageSize(): Electron.WebContentsPrintOptions['pageSize'] {
  if (ELECTRON_PRINT_KEYWORDS.has(paperSize.value)) {
    return paperSize.value as Electron.WebContentsPrintOptions['pageSize']
  }
  const dims = getPaperDimensionsMm(paperSize.value)
  return {
    width: Math.round(dims.widthMm * 1000),
    height: Math.round(dims.heightMm * 1000),
  }
}


// ── Action handlers ────────────────────────────────────────────────────────────

async function doPrint(silent: boolean) {
  const htmlDoc = lastPreviewHtml || buildPreviewHtml()
  const options: Electron.WebContentsPrintOptions = {
    silent,
    printBackground: printBackground.value,
    color: colorMode.value === 'color',
    deviceName: selectedPrinter.value,
    pageSize: buildElectronPrintPageSize(),
    landscape: getEffectiveSheetOrientation() === 'landscape',
    copies: copies.value,
    margins: { marginType: 'none' },
    dpi: { horizontal: parseInt(dpi.value), vertical: parseInt(dpi.value) },
  }
  let result: { success: boolean; error?: string; cancelled?: boolean }
  try {
    result = await window.electronAPI.printFromHtml(htmlDoc, options)
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printPreviewDialog.notifications.printFailed'))
    return
  }
  if (!result.success && !result.cancelled) {
    notify.error(result.error ?? t('dialog.printPreviewDialog.notifications.printFailed'))
  } else if (result.success) {
    emit('close')
  }
}

async function handleSaveToPDF() {
  isPrinting.value = true
  try {
    const htmlDoc = lastPreviewHtml || buildPreviewHtml()
    const pdfOptions: Electron.PrintToPDFOptions = {
      printBackground: printBackground.value,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    }
    const result = await window.electronAPI.saveToPdfFromHtml(htmlDoc, pdfOptions)
    if (!result.success && !result.cancelled) {
      notify.error(result.error ?? t('dialog.printPreviewDialog.notifications.savePdfFailed'))
    } else if (result.success) {
      notify.success(t('dialog.printPreviewDialog.notifications.pdfSaved'))
    }
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printPreviewDialog.notifications.savePdfFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handlePrint() {
  if (isPdfPrinter.value) {
    await handleSaveToPDF()
    return
  }
  isPrinting.value = true
  try {
    await doPrint(true)
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printPreviewDialog.notifications.printFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handleSystemPrint() {
  isPrinting.value = true
  try {
    await doPrint(false)
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printPreviewDialog.notifications.printFailed'))
  } finally {
    isPrinting.value = false
  }
}

watch(
  [
    orientation,
    paperSize,
    pagesPerSheet,
    margins,
    colorMode,
    printHeaderFooter,
    printBackground,
    pageRange,
    selectedPrintThemeId,
    scaleMode,
  ],
  () => {
    schedulePreviewRender()
  },
)

watch(customScale, () => {
  if (scaleMode.value === 'custom') {
    schedulePreviewRender()
  }
})

watch(customPageRange, () => {
  if (pageRange.value === 'custom') {
    schedulePreviewRender()
  }
})
</script>
