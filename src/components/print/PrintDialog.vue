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
      <div ref="previewArea" class="relative flex flex-1 flex-col overflow-hidden bg-base-300">
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
          class="absolute bottom-3 right-3 z-10 rounded-md bg-base-200/80 px-2 py-1 text-xs text-base-content/70 backdrop-blur-sm hover:bg-base-300 hover:text-base-content"
          :title="t('dialog.printDialog.preview.zoomResetTitle')"
          @click="computeFitScale"
        >
          {{ Math.round(previewScale * 100) }}%
        </button>
      </div>

      <!-- Right: Settings Panel -->
      <div class="flex w-80 shrink-0 flex-col border-l border-base-300">
        <!-- Header -->
        <div class="flex shrink-0 items-center justify-between border-b border-base-300 px-5 py-4">
          <h2 class="text-base font-semibold max-w-48 whitespace-nowrap overflow-hidden text-ellipsis">{{ dialogTitle }}</h2>
          <span class="text-sm text-base-content/50">{{ t('dialog.printDialog.sheets', { count: physicalSheets }) }}</span>
        </div>

        <!-- Settings -->
        <div class="flex-1 overflow-y-auto">
          <div class="space-y-1 divide-base-300 border-b border-base-300">

            <!-- Printer -->
            <div v-if="isPrintMode" class="flex items-center justify-between px-5 py-3">
              <label class="shrink-0 text-sm">{{ t('dialog.printDialog.printer.label') }}</label>
              <div class="ml-3 flex w-44 flex-col gap-1">
                <select v-model="selectedPrinter" class="iw-select w-full text-sm" :disabled="!hasPrinters">
                  <option v-if="!hasPrinters" :value="''" disabled>
                    {{ t('dialog.printDialog.printer.noPrinter') }}
                  </option>
                  <option v-for="p in printers" :key="p.name" :value="p.name">
                    {{ p.displayName || p.name }}
                  </option>
                </select>
                <!-- Printer status indicator -->
                <div v-if="hasPrinters && !isPdfPrinter" class="flex items-center gap-1.5 text-xs text-base-content/50">
                  <div class="h-2 w-2 rounded-full" :class="printerStatusDotClass" />
                  <span>{{ printerStatusText }}</span>
                </div>
              </div>
            </div>

            <!-- Page range -->
            <div class="flex flex-col gap-2 px-5 py-3">
              <div class="flex items-center justify-between">
                <label class="shrink-0 text-sm">{{ t('dialog.printDialog.pageRange.label') }}</label>
                <select v-model="pageRange" class="iw-select ml-3 w-44 text-sm">
                  <option value="all">{{ t('dialog.printDialog.pageRange.options.all') }}</option>
                  <option value="odd">{{ t('dialog.printDialog.pageRange.options.odd') }}</option>
                  <option value="even">{{ t('dialog.printDialog.pageRange.options.even') }}</option>
                  <option value="custom">{{ t('dialog.printDialog.pageRange.options.custom') }}</option>
                </select>
              </div>
              <input
                v-if="pageRange === 'custom'"
                v-model="customPageRange"
                class="iw-input w-full text-sm"
                :placeholder="t('dialog.printDialog.pageRange.placeholder')"
              />
              <p v-if="pageRange === 'custom' && customPageRangeError" class="text-xs text-error">
                {{ customPageRangeError }}
              </p>
            </div>

            <!-- Copies (hidden for PDF printer) -->
            <div v-if="!isPdfPrinter" class="flex items-center justify-between px-5 py-3">
              <label class="shrink-0 text-sm">{{ t('dialog.printDialog.copies.label') }}</label>
              <input
                v-model.number="copies"
                type="number"
                min="1"
                max="999"
                class="iw-input ml-3 w-44 text-sm"
              />
            </div>

          </div>

          <div class="space-y-1 divide-base-300 border-b border-base-300">
            <!-- More Settings Toggle -->
            <button
              class="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-base-200"
              @click="showPageSettings = !showPageSettings"
            >
              <span class="text-sm font-medium">{{ t('dialog.printDialog.pageSettings') }}</span>
              <IconChevronUp v-if="showPageSettings" class="icon-xs shrink-0 text-base-content/70" />
              <IconChevronDown v-else class="icon-xs shrink-0 text-base-content/70" />
            </button>

            <template v-if="showPageSettings">
              <PrintSharedSettingsForm
                :settings="dialogPrintSettings"
                :paper-sizes="availablePaperSizes"
                container-class="px-5 py-3"
                section-gap-class="mt-6"
              />

            </template>
          
          </div>

          <div class="space-y-1 divide-base-300 border-b border-base-300">
            <!-- More Settings Toggle -->
            <button
              class="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-base-200"
              @click="showMoreSettings = !showMoreSettings"
            >
              <span class="text-sm font-medium">{{ t('dialog.printDialog.moreSettings') }}</span>
              <IconChevronUp v-if="showMoreSettings" class="icon-xs shrink-0 text-base-content/70" />
              <IconChevronDown v-else class="icon-xs shrink-0 text-base-content/70" />
            </button>

            <template v-if="showMoreSettings">
              <div class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printDialog.pagesPerSheet.label') }}</label>
                <select v-model="pagesPerSheet" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="6">6</option>
                  <option value="9">9</option>
                </select>
              </div>
              
              <!-- Print Quality (hidden for PDF) -->
              <div v-if="!isPdfPrinter" class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printDialog.quality.label') }}</label>
                <select v-model="dpi" class="iw-select ml-3 w-44 text-sm">
                  <option value="150">150 dpi</option>
                  <option value="300">300 dpi</option>
                  <option value="600">600 dpi</option>
                </select>
              </div>

              <!-- Scale -->
              <div class="flex flex-col gap-2 px-5 py-3">
                <div class="flex items-center justify-between">
                  <label class="shrink-0 text-sm">{{ t('dialog.printDialog.scale.label') }}</label>
                  <select v-model="scaleMode" class="iw-select ml-3 w-44 text-sm">
                    <option value="default">{{ t('dialog.printDialog.scale.options.default') }}</option>
                    <option value="custom">{{ t('dialog.printDialog.scale.options.custom') }}</option>
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
                  <span class="shrink-0 text-sm text-base-content/70">%</span>
                </div>
                <p v-if="scaleMode === 'custom' && customScaleError" class="text-xs text-error">
                  {{ customScaleError }}
                </p>
              </div>

              <!-- Color (only for real printers that support color) -->
              <div v-if="!isPdfPrinter && printerColorSupported" class="flex items-center justify-between px-5 py-3">
                <label class="shrink-0 text-sm">{{ t('dialog.printDialog.color.label') }}</label>
                <select v-model="colorMode" class="iw-select ml-3 w-44 text-sm" @change="renderPreview">
                  <option value="color">{{ t('dialog.printDialog.color.options.color') }}</option>
                  <option value="grayscale">{{ t('dialog.printDialog.color.options.grayscale') }}</option>
                </select>
              </div>

            </template>
          
          </div>
          
          <div class="space-y-1 divide-base-300">
            <!-- System dialog link (hidden for PDF) -->
            <button
              v-if="isPrintMode && !isPdfPrinter"
              class="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-primary hover:bg-base-200 disabled:cursor-not-allowed disabled:text-base-content/30"
              @click="handleSystemPrint"
              :disabled="isPrinting || !hasPrinters"
            >
              <span>{{ t('dialog.printDialog.systemDialog') }}</span>
              <IconExternalLink class="icon-xs shrink-0" />
            </button>

          </div>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 items-center justify-end gap-3 border-t border-base-300 px-5 py-3">
          <button class="iw-btn btn-ghost btn-sm" @click="emit('close')">{{ t('dialog.printDialog.actions.cancel') }}</button>
          <button
            class="iw-btn btn-primary btn-sm"
            :disabled="isPrinting || isRendering || totalPages === 0 || (isPrintMode && !isPdfPrinter && !hasPrinters)"
            @click="handlePrint"
          >
            {{ isPdfPrinter ? t('dialog.printDialog.actions.saveAsPdf') : t('dialog.printDialog.actions.print') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronUp, IconChevronDown, IconExternalLink } from '@tabler/icons-vue'
import { notify } from '@/utils/notifications'
import { useAppStore } from '@/stores/app'
import { buildPreviewDocumentWithOptions } from './buildPreviewDoc'
import { buildPrintCss } from './buildPrintCss'
import PrintSharedSettingsForm from './PrintSharedSettingsForm.vue'
import {
  STANDARD_PAPER_SIZES,
  ELECTRON_PRINT_KEYWORDS,
  getPaperDimensionsMm,
  detectColorSupport,
  getPrinterPaperSizes,
  getPrinterState,
  isPrinterConnectable,
  parseCustomPageRangeInput,
} from './paperSpecs'
import {
  getAllMarkdownThemes,
  cloneHeaderFooterSetup,
  clonePageSetup,
  clonePaginationSetup,
  cloneRunningTitleSetup,
  createResolvedMarkdownPrintSettings,
  derivePrintRuntimeOverrides,
  getEffectivePrintThemeId,
  getMarkdownThemeById,
  rebaseResolvedSettingsOnThemeChange,
  resolveMarkdownPrintSettings,
} from './markdownThemes'
import type { PageSetup, PrintRuntimeOverrides, ResolvedMarkdownPrintSettings } from '@/types'

// Special sentinel value for "Save as PDF" pseudo-printer
const PDF_PRINTER = '__pdf__'

function getPagesPerSheetNumber(): number {
  return parseInt(pagesPerSheet.value, 10) || 1
}

function getEffectiveSheetOrientation(): 'portrait' | 'landscape' {
  const orientation = dialogPrintSettings.pageSetup.orientation
  if (getPagesPerSheetNumber() <= 1) return orientation
  return orientation === 'portrait' ? 'landscape' : 'portrait'
}

const props = defineProps<{
  visible: boolean
  html: string
  title: string
  mode?: 'print' | 'export'
  defaultSavePath?: string
  skipSaveDialog?: boolean
}>()

const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const appStore = useAppStore()

function applyResolvedPrintContentSettings(
  target: ResolvedMarkdownPrintSettings,
  source: ResolvedMarkdownPrintSettings,
) {
  target.pageSetup = clonePageSetup(source.pageSetup)
  target.pagination = clonePaginationSetup(source.pagination)
  target.headerFooter = cloneHeaderFooterSetup(source.headerFooter)
  target.runningTitle = cloneRunningTitleSetup(source.runningTitle)
}

function applyResolvedPrintSettings(
  target: ResolvedMarkdownPrintSettings,
  source: ResolvedMarkdownPrintSettings,
) {
  target.themeAssignment = { ...source.themeAssignment }
  applyResolvedPrintContentSettings(target, source)
}

const previewFrame  = ref<HTMLIFrameElement>()
const previewScroll = ref<HTMLDivElement>()
const previewArea   = ref<HTMLDivElement>()
let currentBlobUrl = ''
let lastPreviewHtml = ''
let previewRenderTimer: ReturnType<typeof setTimeout> | null = null
let rebasingThemeAssignment = false
let syncingDialogSettings = false

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
const selectedPrinter = ref('')

// Page
const pageRange      = ref<'all' | 'odd' | 'even' | 'custom'>('all')
const customPageRange = ref('')
const copies         = ref(1)
const dialogPrintSettings = reactive<ResolvedMarkdownPrintSettings>(
  createResolvedMarkdownPrintSettings(appStore.globalMarkdownPrintSetting.themeAssignment),
)

// More settings
const showPageSettings  = ref(true)
const showMoreSettings  = ref(false)
const pagesPerSheet     = ref('1')
const dpi               = ref('300')
const scaleMode         = ref<'default' | 'custom'>('default')
const customScale       = ref(100)
const colorMode         = ref<'color' | 'grayscale'>('color')

type CustomInputValidation<T> = {
  effectiveValue: T
  error: string
}

// ── Computed ──────────────────────────────────────────────────────────────────

const isPdfPrinter = computed(() => selectedPrinter.value === PDF_PRINTER)
const isExportMode = computed(() => props.mode === 'export')
const isPrintMode = computed(() => !isExportMode.value)
const hasPrinters = computed(() => printers.value.length > 0)
const dialogTitle = computed(() =>
  isExportMode.value ? t('dialog.printDialog.exportTitle') : t('dialog.printDialog.title')
)

const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  printers.value.find(p => p.name === selectedPrinter.value) ?? null
)

const printerColorSupported = computed(() => {
  if (isPdfPrinter.value) return false
  return detectColorSupport(selectedPrinterInfo.value)
})

// Printer status indicator
const printerState = computed(() =>
  isPdfPrinter.value ? 'unknown' : getPrinterState(selectedPrinterInfo.value)
)

const printerStatusDotClass = computed(() => {
  switch (printerState.value) {
    case 'ready':    return 'bg-success'
    case 'printing': return 'bg-success'
    case 'offline':  return 'bg-error'
    default:         return 'bg-base-content/20'
  }
})

const printerStatusText = computed(() => {
  switch (printerState.value) {
    case 'ready':    return t('dialog.pdfPrintDialog.printer.ready')
    case 'printing': return t('dialog.pdfPrintDialog.printer.printing')
    case 'offline':  return t('dialog.pdfPrintDialog.printer.offline')
    default:         return t('dialog.pdfPrintDialog.printer.unknown')
  }
})

// Whether the effective output (PDF or selected printer) honors a color choice.
// PDF always renders in color; physical printers depend on capability.
const effectiveColorSupported = computed(() => isPdfPrinter.value || printerColorSupported.value)
const effectiveColorMode = computed<'color' | 'grayscale'>(() =>
  effectiveColorSupported.value ? colorMode.value : 'color',
)

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
    return { effectiveValue: 100, error: t('dialog.printDialog.validation.scalePositive') }
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
    return { effectiveValue: null, error: t('dialog.printDialog.validation.pageRangeInvalid') }
  }

  const pages = parseCustomPageRangeInput(rawValue, originalTotalPages.value)
  if (!pages.length) {
    return { effectiveValue: null, error: t('dialog.printDialog.validation.pageRangeOutOfRange') }
  }

  return { effectiveValue: pages, error: '' }
})

const customPageRangeError = computed(() => customPageRangeValidation.value.error)
const effectivePrintThemeId = computed(() => getEffectivePrintThemeId(dialogPrintSettings))
const effectivePrintTheme = computed(() => getMarkdownThemeById(effectivePrintThemeId.value) ?? getAllMarkdownThemes()[0]!)

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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

async function refreshPrinters() {
  try {
    const list = await window.electronAPI.getPrinters()
    printers.value = list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = list.find((p: any) => p.isDefault)
    const firstConnectable = list.find(isPrinterConnectable)
    if (!selectedPrinter.value || !list.find(p => p.name === selectedPrinter.value)) {
      selectedPrinter.value = def?.name ?? firstConnectable?.name ?? list[0]?.name ?? ''
    }
  } catch {
    printers.value = []
    selectedPrinter.value = ''
  }
}

let printerRefreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  window.addEventListener('message', handleFrameMessage)
  window.addEventListener('resize', handlePreviewViewportResize)
})

onUnmounted(() => {
  window.removeEventListener('message', handleFrameMessage)
  window.removeEventListener('resize', handlePreviewViewportResize)
  previewScroll.value?.removeEventListener('wheel', handlePreviewWheel)
  if (previewRenderTimer) clearTimeout(previewRenderTimer)
  if (printerRefreshInterval) clearInterval(printerRefreshInterval)
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  lastPreviewHtml = ''
})

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      syncingDialogSettings = true
      applyResolvedPrintSettings(dialogPrintSettings, resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting))
      syncingDialogSettings = false
      if (isExportMode.value) {
        selectedPrinter.value = PDF_PRINTER
      } else {
        await refreshPrinters()
        printerRefreshInterval = setInterval(refreshPrinters, 8000)
      }
      await nextTick()
      previewScroll.value?.addEventListener('wheel', handlePreviewWheel, { passive: false })
      if (props.html) renderPreview()
    } else {
      previewScroll.value?.removeEventListener('wheel', handlePreviewWheel)
      if (printerRefreshInterval) {
        clearInterval(printerRefreshInterval)
        printerRefreshInterval = null
      }
    }
  }
)

watch(
  () => props.html,
  async (val) => { if (props.visible && val) { await nextTick(); renderPreview() } }
)

watch(
  () => [
    dialogPrintSettings.themeAssignment.screenThemeId,
    dialogPrintSettings.themeAssignment.printThemeId,
    dialogPrintSettings.themeAssignment.printUsesScreenTheme,
  ] as const,
  ([nextScreen, nextPrint, nextUses], [prevScreen, prevPrint, prevUses]) => {
    if (rebasingThemeAssignment || syncingDialogSettings) return
    if (prevScreen === undefined || prevPrint === undefined || prevUses === undefined) return
    const rebased = rebaseResolvedSettingsOnThemeChange(
      dialogPrintSettings,
      { screenThemeId: prevScreen, printThemeId: prevPrint, printUsesScreenTheme: prevUses },
      { screenThemeId: nextScreen, printThemeId: nextPrint, printUsesScreenTheme: nextUses },
    )
    rebasingThemeAssignment = true
    applyResolvedPrintContentSettings(dialogPrintSettings, rebased)
    rebasingThemeAssignment = false
  },
)

// When printer switches, validate paper size, reset stale color preference, re-render
watch(selectedPrinter, () => {
  const sizes = availablePaperSizes.value
  if (!sizes.find(s => s.value === dialogPrintSettings.pageSetup.size)) {
    dialogPrintSettings.pageSetup.size = (sizes[0]?.value ?? 'A4') as PageSetup['size']
  }
  if (!effectiveColorSupported.value && colorMode.value === 'grayscale') {
    colorMode.value = 'color'
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
    notify.error(t('dialog.printDialog.notifications.previewFailed'))
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

function getDialogRuntimeOverrides(): PrintRuntimeOverrides {
  const base = resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting)
  return derivePrintRuntimeOverrides(base, dialogPrintSettings)
}

function generatePrintCSS(): { css: string; enablePageNumberFix: boolean; pageNumberTemplatesByBox: Record<string, string> } {
  const resolvedSettings = resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting, getDialogRuntimeOverrides())
  return buildPrintCss({
    theme: effectivePrintTheme.value,
    documentTitle: props.title || t('dialog.printDialog.untitled'),
    printDate: getPrintDateText(),
    pageSetup: resolvedSettings.pageSetup,
    pagination: resolvedSettings.pagination,
    headerFooter: resolvedSettings.headerFooter,
    runningTitle: resolvedSettings.runningTitle,
    zoomFactor: effectiveScale.value / 100,
    colorMode: effectiveColorMode.value,
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

function getPreviewAreaBackgroundColor(): string {
  const el = previewArea.value
  if (!el) return ''
  const color = window.getComputedStyle(el).backgroundColor
  return color ? color : ''
}

function buildPreviewHtml(): string {
  const effectivePageSelectionMode = pageRange.value === 'custom' && !customPageRangeValidation.value.effectiveValue
    ? 'all'
    : pageRange.value
  const printCss = generatePrintCSS()
  return buildPreviewDocumentWithOptions(props.html, printCss.css, {
    pagesPerSheet: getPagesPerSheetNumber(),
    orientation: dialogPrintSettings.pageSetup.orientation,
    pageSelectionMode: effectivePageSelectionMode,
    selectedPages: pageRange.value === 'custom' ? customPageRangeValidation.value.effectiveValue : null,
    contentScale: zoomFactorForPreview(),
    enablePageNumberFix: printCss.enablePageNumberFix,
    pageNumberTemplatesByBox: printCss.pageNumberTemplatesByBox,
    bodyBackground: getPreviewAreaBackgroundColor(),
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
  if (ELECTRON_PRINT_KEYWORDS.has(dialogPrintSettings.pageSetup.size)) {
    return dialogPrintSettings.pageSetup.size as Electron.WebContentsPrintOptions['pageSize']
  }
  const dims = getPaperDimensionsMm(dialogPrintSettings.pageSetup.size)
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
    printBackground: dialogPrintSettings.pageSetup.background,
    color: effectiveColorMode.value === 'color',
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
    notify.error(err instanceof Error ? err.message : t('dialog.printDialog.notifications.printFailed'))
    return
  }
  if (!result.success && !result.cancelled) {
    notify.error(result.error ?? t('dialog.printDialog.notifications.printFailed'))
  } else if (result.success) {
    emit('close')
  }
}

async function handleSaveToPDF() {
  isPrinting.value = true
  try {
    const htmlDoc = lastPreviewHtml || buildPreviewHtml()
    const pdfOptions: Electron.PrintToPDFOptions = {
      printBackground: dialogPrintSettings.pageSetup.background,
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
    const result = await window.electronAPI.saveToPdfFromHtml(htmlDoc, pdfOptions, {
      defaultPath: props.defaultSavePath,
      skipDialog: props.skipSaveDialog,
    })
    if (!result.success && !result.cancelled) {
      notify.error(result.error ?? t('dialog.printDialog.notifications.savePdfFailed'))
    } else if (result.success) {
      notify.success(t('dialog.printDialog.notifications.pdfSaved'))
      if (result.filePath && isExportMode.value) {
        await handlePostExportAction(result.filePath)
      }
      emit('close')
    }
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printDialog.notifications.savePdfFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handlePrint() {
  if (isExportMode.value || isPdfPrinter.value) {
    await handleSaveToPDF()
    return
  }
  isPrinting.value = true
  try {
    await doPrint(true)
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printDialog.notifications.printFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handleSystemPrint() {
  isPrinting.value = true
  try {
    await doPrint(false)
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printDialog.notifications.printFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handlePostExportAction(filePath: string) {
  const actions = appStore.globalExportSetting.common.afterExportActions
  if (!actions.reveal && !actions.open) return

  try {
    if (actions.reveal) {
      await window.electronAPI.revealInFolder(filePath)
    }
    if (actions.open) {
      await window.electronAPI.openWithShell(filePath)
    }
  } catch (error) {
    console.warn('Failed to run post-export action for PDF:', error)
  }
}

watch(dialogPrintSettings, () => {
  schedulePreviewRender()
}, { deep: true })

watch(
  [pagesPerSheet, colorMode, pageRange, scaleMode],
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
