<template>
  <PrintDialogShell
    :visible="visible"
    :title="dialogTitle"
    :sheet-count="physicalSheets"
    :submit-label="submitLabel"
    :submit-disabled="submitDisabled"
    @close="emit('close')"
    @submit="handlePrint"
  >
    <!-- ── Left: Preview area ─────────────────────────────────────────────── -->
    <template #preview>
      <HtmlPrintPreview
        ref="htmlPreviewRef"
        :document-html="currentDocumentHtml"
        @update:total-pages="totalPages = $event"
        @update:original-total-pages="originalTotalPages = $event"
        @rendering-change="isRendering = $event"
      />
    </template>

    <!-- ── Right: Settings panel ──────────────────────────────────────────── -->
    <template #settings>
      <div class="flex-1 overflow-y-auto">

        <!-- Markdown settings: PrintCommonSettingsForm + PrintSharedSettingsForm -->
        <PrintCommonSettingsForm
          v-if="activeProfile !== 'image'"
          :settings="basePrintSettings"
          :printers="printers"
          :is-print-mode="isPrintMode"
          :is-printing="isPrinting"
          :is-pdf-printer="isPdfPrinter"
          :page-range-error="customPageRangeError"
          :scale-error="customScaleError"
          @system-print="handleSystemPrint"
        >
          <!-- Page Settings section: markdown theme / page layout / header-footer -->
          <template #between>
            <div class="space-y-1 divide-base-300 border-b border-base-300">
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
          </template>
        </PrintCommonSettingsForm>

        <!-- Image settings: ImagePrintSettingsForm (uses PrintCommonSettingsForm internally) -->
        <ImagePrintSettingsForm
          v-else
          ref="imageSettingsFormRef"
          :settings="imagePrintSettings"
          :printers="printers"
          :is-print-mode="isPrintMode"
          :is-printing="isPrinting"
          :is-pdf-printer="isPdfPrinter"
          :page-range-error="customPageRangeError"
          :scale-error="customScaleError"
          @system-print="handleSystemPrint"
        />

      </div>
    </template>
  </PrintDialogShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronUp, IconChevronDown } from '@tabler/icons-vue'
import { notify } from '@/utils/notifications'
import { useAppStore } from '@/stores/app'

// ── Print components ──────────────────────────────────────────────────────────
import PrintDialogShell from './PrintDialogShell.vue'
import HtmlPrintPreview from './HtmlPrintPreview.vue'
import PrintCommonSettingsForm from './PrintCommonSettingsForm.vue'
import PrintSharedSettingsForm from './PrintSharedSettingsForm.vue'
import ImagePrintSettingsForm from './ImagePrintSettingsForm.vue'

// ── Print utilities ───────────────────────────────────────────────────────────
import { buildPreviewDocumentWithOptions } from './buildPreviewDoc'
import { buildPrintCss } from './buildPrintCss'
import { buildImagePrintCss } from './imageAdapter'
import {
  STANDARD_PAPER_SIZES,
  ELECTRON_PRINT_KEYWORDS,
  getPaperDimensionsMm,
  getPageContentHeightPx,
  detectColorSupport,
  getPrinterPaperSizes,
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

// ── Types ─────────────────────────────────────────────────────────────────────
import type { PageSetup, PrintRuntimeOverrides, ResolvedMarkdownPrintSettings } from '@/types'
import type { BasePrintSettings } from '@/types/print-settings'
import type { ImagePrintSettings } from '@/types/image-print'
import { DEFAULT_BASE_PRINT_SETTINGS } from '@/types/print-settings'
import { DEFAULT_IMAGE_PRINT_SETTINGS } from '@/types/image-print'

// ── Sentinel value for the "Save as PDF" pseudo-printer ───────────────────────
const PDF_PRINTER = '__pdf__'

// ── Props / emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  visible: boolean
  html: string
  title: string
  mode?: 'print' | 'export'
  defaultSavePath?: string
  skipSaveDialog?: boolean
  profile?: 'markdown' | 'image'
}>()

const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const appStore = useAppStore()

// ── Active profile helper ─────────────────────────────────────────────────────
const activeProfile = computed(() => props.profile ?? 'markdown')

function activeBaseSettings(): BasePrintSettings {
  return activeProfile.value === 'image' ? imagePrintSettings : basePrintSettings
}

// ── Markdown-specific settings helpers ───────────────────────────────────────
function applyResolvedPrintContentSettings(
  target: ResolvedMarkdownPrintSettings,
  source: ResolvedMarkdownPrintSettings,
) {
  target.pageSetup     = clonePageSetup(source.pageSetup)
  target.pagination    = clonePaginationSetup(source.pagination)
  target.headerFooter  = cloneHeaderFooterSetup(source.headerFooter)
  target.runningTitle  = cloneRunningTitleSetup(source.runningTitle)
}

function applyResolvedPrintSettings(
  target: ResolvedMarkdownPrintSettings,
  source: ResolvedMarkdownPrintSettings,
) {
  target.themeAssignment = { ...source.themeAssignment }
  applyResolvedPrintContentSettings(target, source)
}

// ── Component refs ────────────────────────────────────────────────────────────
const htmlPreviewRef      = ref<InstanceType<typeof HtmlPrintPreview>>()
const imageSettingsFormRef = ref<InstanceType<typeof ImagePrintSettingsForm>>()

// ── Preview / rendering state ─────────────────────────────────────────────────
const currentDocumentHtml = ref('')
const isRendering         = ref(false)
const totalPages          = ref(0)
const originalTotalPages  = ref(0)

// ── Printer state ─────────────────────────────────────────────────────────────
const printers = ref<Electron.PrinterInfo[]>([])
let printerRefreshInterval: ReturnType<typeof setInterval> | null = null

// ── Common print settings (markdown profile) ──────────────────────────────────
const basePrintSettings = reactive<BasePrintSettings>(structuredClone(DEFAULT_BASE_PRINT_SETTINGS))

// ── Image print settings ──────────────────────────────────────────────────────
const imagePrintSettings = reactive<ImagePrintSettings>(structuredClone(DEFAULT_IMAGE_PRINT_SETTINGS))

// ── Markdown-specific settings object ────────────────────────────────────────
const dialogPrintSettings = reactive<ResolvedMarkdownPrintSettings>(
  createResolvedMarkdownPrintSettings(appStore.globalMarkdownPrintSetting.themeAssignment),
)

// ── Debounce / misc state ─────────────────────────────────────────────────────
const showPageSettings  = ref(true)
const isPrinting        = ref(false)
let previewRenderTimer: ReturnType<typeof setTimeout> | null = null
let rebasingThemeAssignment = false
let syncingDialogSettings   = false
const PREVIEW_RENDER_DEBOUNCE_MS = 220

// ── Computed: mode ────────────────────────────────────────────────────────────
const isExportMode = computed(() => props.mode === 'export')
const isPrintMode  = computed(() => !isExportMode.value)
const hasPrinters  = computed(() => printers.value.length > 0)

const isPdfPrinter = computed(() => activeBaseSettings().printer === PDF_PRINTER)

const dialogTitle = computed(() =>
  isExportMode.value ? t('dialog.printDialog.exportTitle') : t('dialog.printDialog.title')
)

// ── Computed: printer info ────────────────────────────────────────────────────
const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  printers.value.find(p => p.name === activeBaseSettings().printer) ?? null
)

const printerColorSupported = computed(() => {
  if (isPdfPrinter.value) return false
  return detectColorSupport(selectedPrinterInfo.value)
})

const effectiveColorMode = computed<'color' | 'grayscale'>(() =>
  printerColorSupported.value ? activeBaseSettings().color : 'color',
)

// ── Computed: paper sizes ─────────────────────────────────────────────────────
const availablePaperSizes = computed(() => {
  if (isPdfPrinter.value) return STANDARD_PAPER_SIZES
  return getPrinterPaperSizes(selectedPrinterInfo.value)
})

// ── Computed: validation ──────────────────────────────────────────────────────
type CustomInputValidation<T> = { effectiveValue: T; error: string }

const customScaleValidation = computed<CustomInputValidation<number>>(() => {
  const base = activeBaseSettings()
  if (base.scaleMode !== 'custom') return { effectiveValue: 100, error: '' }
  const rawValue = base.customScale as number | '' | null | undefined
  if (rawValue === null || rawValue === undefined || rawValue === '') return { effectiveValue: 100, error: '' }
  const scale = Number(rawValue)
  if (!Number.isFinite(scale) || scale <= 0) {
    return { effectiveValue: 100, error: t('dialog.printDialog.validation.scalePositive') }
  }
  return { effectiveValue: scale, error: '' }
})

const customScaleError = computed(() => customScaleValidation.value.error)

const customPageRangeValidation = computed<CustomInputValidation<number[] | null>>(() => {
  const base = activeBaseSettings()
  if (base.pageRange !== 'custom') return { effectiveValue: null, error: '' }
  const rawValue = base.customPageRange.trim()
  if (!rawValue) return { effectiveValue: null, error: '' }
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

// ── Computed: derived settings ────────────────────────────────────────────────
const effectiveScale = computed(() => customScaleValidation.value.effectiveValue)

const effectivePrintThemeId = computed(() => getEffectivePrintThemeId(dialogPrintSettings))
const effectivePrintTheme   = computed(
  () => getMarkdownThemeById(effectivePrintThemeId.value) ?? getAllMarkdownThemes()[0]!,
)

const physicalSheets = computed(() =>
  totalPages.value > 0 ? Math.ceil(totalPages.value / activeBaseSettings().pagesPerSheet) : 0
)

// ── Computed: Shell button state ──────────────────────────────────────────────
const submitLabel = computed(() => {
  if (isExportMode.value || isPdfPrinter.value) return t('dialog.printDialog.actions.saveAsPdf')
  return t('dialog.printDialog.actions.print')
})

const submitDisabled = computed(() => {
  if (isPrinting.value || isRendering.value) return true
  if (totalPages.value === 0) return true
  if (isPrintMode.value && !isPdfPrinter.value && !hasPrinters.value) return true
  return false
})

// ── Printer refresh ───────────────────────────────────────────────────────────
async function refreshPrinters() {
  try {
    const list = await window.electronAPI.getPrinters()
    printers.value = list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = list.find((p: any) => p.isDefault)
    const firstConnectable = list.find(isPrinterConnectable)
    const fallback = def?.name ?? firstConnectable?.name ?? list[0]?.name ?? ''
    const base = activeBaseSettings()
    if (!base.printer || !list.find(p => p.name === base.printer)) {
      base.printer = fallback
    }
  } catch {
    printers.value = []
    activeBaseSettings().printer = ''
  }
}

// ── Open / close watcher ─────────────────────────────────────────────────────
onMounted(() => {
  // nothing needed — HtmlPrintPreview handles its own listeners
})

onUnmounted(() => {
  if (previewRenderTimer) clearTimeout(previewRenderTimer)
  if (printerRefreshInterval) clearInterval(printerRefreshInterval)
})

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      if (activeProfile.value !== 'image') {
        syncingDialogSettings = true
        applyResolvedPrintSettings(dialogPrintSettings, resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting))
        syncingDialogSettings = false
      } else {
        // Inherit current viewer rotation so the preview starts correctly
        imagePrintSettings.rotation = appStore.printPreviewImageRotation
      }

      if (isExportMode.value) {
        activeBaseSettings().printer = PDF_PRINTER
      } else {
        await refreshPrinters()
        printerRefreshInterval = setInterval(refreshPrinters, 8000)
      }

      await nextTick()
      currentDocumentHtml.value = await buildPreviewHtml()
    } else {
      if (printerRefreshInterval) {
        clearInterval(printerRefreshInterval)
        printerRefreshInterval = null
      }
      currentDocumentHtml.value = ''
      totalPages.value = 0
      originalTotalPages.value = 0
      isRendering.value = false
    }
  },
)

watch(
  () => props.html,
  async (val) => {
    if (props.visible && val) {
      await nextTick()
      currentDocumentHtml.value = await buildPreviewHtml()
    }
  },
)

// ── Printer change: validate paper size, reset stale colour ──────────────────
watch(
  () => activeBaseSettings().printer,
  () => {
    if (activeProfile.value !== 'image') {
      const sizes = availablePaperSizes.value
      if (!sizes.find(s => s.value === dialogPrintSettings.pageSetup.size)) {
        dialogPrintSettings.pageSetup.size = (sizes[0]?.value ?? 'A4') as PageSetup['size']
      }
    } else {
      const sizes = getPrinterPaperSizes(selectedPrinterInfo.value)
      if (!sizes.find(s => s.value === imagePrintSettings.paperSize)) {
        imagePrintSettings.paperSize = sizes[0]?.value ?? 'A4'
      }
    }
    if (!printerColorSupported.value && activeBaseSettings().color === 'grayscale') {
      activeBaseSettings().color = 'color'
    }
    schedulePreviewRender()
  },
)

// ── Markdown: theme rebasing watcher ─────────────────────────────────────────
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

// ── Markdown: re-render when page/theme settings change ─────────────────────
watch(dialogPrintSettings, () => {
  if (activeProfile.value !== 'image') schedulePreviewRender()
}, { deep: true })

// ── Common settings → re-render (markdown) ───────────────────────────────────
watch(
  () => [
    basePrintSettings.pagesPerSheet,
    basePrintSettings.color,
    basePrintSettings.pageRange,
    basePrintSettings.scaleMode,
  ],
  () => { if (activeProfile.value !== 'image') schedulePreviewRender() },
)
watch(() => basePrintSettings.customScale, () => {
  if (activeProfile.value !== 'image' && basePrintSettings.scaleMode === 'custom') schedulePreviewRender()
})
watch(() => basePrintSettings.customPageRange, () => {
  if (activeProfile.value !== 'image' && basePrintSettings.pageRange === 'custom') schedulePreviewRender()
})

// ── Image settings → re-render ────────────────────────────────────────────────
watch(
  () => [
    imagePrintSettings.pagesPerSheet,
    imagePrintSettings.color,
    imagePrintSettings.pageRange,
    imagePrintSettings.scaleMode,
    imagePrintSettings.paperSize,
    imagePrintSettings.orientation,
    imagePrintSettings.margins,
    imagePrintSettings.fit,
    imagePrintSettings.rotation,
  ],
  () => { if (activeProfile.value === 'image') schedulePreviewRender() },
)
watch(() => imagePrintSettings.customScale, () => {
  if (activeProfile.value === 'image' && imagePrintSettings.scaleMode === 'custom') schedulePreviewRender()
})
watch(() => imagePrintSettings.customPageRange, () => {
  if (activeProfile.value === 'image' && imagePrintSettings.pageRange === 'custom') schedulePreviewRender()
})

// ── CSS generation ─────────────────────────────────────────────────────────────
function getPrintDateText(): string {
  return new Intl.DateTimeFormat(locale.value || navigator.language || 'zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function getDialogRuntimeOverrides(): PrintRuntimeOverrides {
  const base = resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting)
  return derivePrintRuntimeOverrides(base, dialogPrintSettings)
}

function generatePrintCSS(): { css: string; enablePageNumberFix: boolean; pageNumberTemplatesByBox: Record<string, string> } {
  if (activeProfile.value === 'image') {
    return {
      css: buildImagePrintCss({
        paperSize:   imagePrintSettings.paperSize,
        orientation: imagePrintSettings.orientation,
        margins:     imagePrintSettings.margins,
        fit:         imagePrintSettings.fit,
        rotation:    imagePrintSettings.rotation,
        color:       effectiveColorMode.value,
      }),
      enablePageNumberFix: false,
      pageNumberTemplatesByBox: {},
    }
  }
  const resolvedSettings = resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting, getDialogRuntimeOverrides())
  return buildPrintCss({
    theme:          effectivePrintTheme.value,
    documentTitle:  props.title || t('dialog.printDialog.untitled'),
    printDate:      getPrintDateText(),
    pageSetup:      resolvedSettings.pageSetup,
    pagination:     resolvedSettings.pagination,
    headerFooter:   resolvedSettings.headerFooter,
    runningTitle:   resolvedSettings.runningTitle,
    zoomFactor:     effectiveScale.value / 100,
    colorMode:      effectiveColorMode.value,
  })
}

// ── Preview document builder ──────────────────────────────────────────────────
async function buildPreviewHtml(): Promise<string> {
  if (!props.html) return ''
  const printCss = generatePrintCSS()
  const bgColor  = htmlPreviewRef.value?.getContainerBgColor() ?? ''

  if (activeProfile.value === 'image') {
    return buildPreviewDocumentWithOptions(props.html, printCss.css, {
      pagesPerSheet:     imagePrintSettings.pagesPerSheet,
      orientation:       imagePrintSettings.orientation,
      pageSelectionMode: imagePrintSettings.pageRange === 'custom' && !customPageRangeValidation.value.effectiveValue
        ? 'all'
        : imagePrintSettings.pageRange,
      selectedPages:     imagePrintSettings.pageRange === 'custom' ? customPageRangeValidation.value.effectiveValue : null,
      contentScale:      effectiveScale.value / 100,
      enablePageNumberFix:    false,
      pageNumberTemplatesByBox: {},
      bodyBackground:    bgColor,
    })
  }

  // Markdown path
  const effectivePageSelectionMode = basePrintSettings.pageRange === 'custom' && !customPageRangeValidation.value.effectiveValue
    ? 'all'
    : basePrintSettings.pageRange
  const resolvedSettings = resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting, getDialogRuntimeOverrides())
  return buildPreviewDocumentWithOptions(props.html, printCss.css, {
    pagesPerSheet:     basePrintSettings.pagesPerSheet,
    orientation:       dialogPrintSettings.pageSetup.orientation,
    pageSelectionMode: effectivePageSelectionMode,
    selectedPages:     basePrintSettings.pageRange === 'custom' ? customPageRangeValidation.value.effectiveValue : null,
    contentScale:      effectiveScale.value / 100,
    enablePageNumberFix:     printCss.enablePageNumberFix,
    pageNumberTemplatesByBox: printCss.pageNumberTemplatesByBox,
    bodyBackground:    bgColor,
    pageContentHeightPx: getPageContentHeightPx(resolvedSettings.pageSetup),
    repeatTableHeader: resolvedSettings.pagination.repeatTableHeader,
  })
}

function schedulePreviewRender() {
  if (!props.visible || !props.html) return
  if (previewRenderTimer) clearTimeout(previewRenderTimer)
  previewRenderTimer = setTimeout(() => {
    previewRenderTimer = null
    void buildPreviewHtml().then(html => { currentDocumentHtml.value = html })
  }, PREVIEW_RENDER_DEBOUNCE_MS)
}

// ── Print helpers ─────────────────────────────────────────────────────────────
function getEffectiveDocOrientation(): 'portrait' | 'landscape' {
  if (activeProfile.value === 'image') return imagePrintSettings.orientation
  return dialogPrintSettings.pageSetup.orientation
}

function getEffectiveSheetOrientation(): 'portrait' | 'landscape' {
  const orientation = getEffectiveDocOrientation()
  if (activeBaseSettings().pagesPerSheet <= 1) return orientation
  return orientation === 'portrait' ? 'landscape' : 'portrait'
}

function buildElectronPrintPageSize(): Electron.WebContentsPrintOptions['pageSize'] {
  let size: string
  let orientation: 'portrait' | 'landscape'
  if (activeProfile.value === 'image') {
    size        = imagePrintSettings.paperSize
    orientation = imagePrintSettings.orientation
  } else {
    size        = dialogPrintSettings.pageSetup.size
    orientation = dialogPrintSettings.pageSetup.orientation
  }
  if (ELECTRON_PRINT_KEYWORDS.has(size)) {
    return size as Electron.WebContentsPrintOptions['pageSize']
  }
  const dims = getPaperDimensionsMm(size)
  return orientation === 'landscape'
    ? { width: Math.round(dims.heightMm * 1000), height: Math.round(dims.widthMm * 1000) }
    : { width: Math.round(dims.widthMm * 1000), height: Math.round(dims.heightMm * 1000) }
}

// ── Action handlers ───────────────────────────────────────────────────────────
function buildPrintOptions(silent: boolean): Electron.WebContentsPrintOptions {
  const base = activeBaseSettings()
  return {
    silent,
    printBackground: activeProfile.value === 'image' ? true : dialogPrintSettings.pageSetup.background,
    color:           effectiveColorMode.value === 'color',
    deviceName:      base.printer,
    pageSize:        buildElectronPrintPageSize(),
    landscape:       getEffectiveSheetOrientation() === 'landscape',
    copies:          base.copies,
    margins:         { marginType: 'none' },
    dpi:             { horizontal: base.dpi, vertical: base.dpi },
  }
}

async function doPrint(silent: boolean) {
  const htmlDoc = currentDocumentHtml.value || await buildPreviewHtml()
  const options = buildPrintOptions(silent)
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
    const htmlDoc = currentDocumentHtml.value || await buildPreviewHtml()
    const pdfOptions: Electron.PrintToPDFOptions = {
      printBackground: activeProfile.value === 'image' ? true : dialogPrintSettings.pageSetup.background,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    }
    const result = await window.electronAPI.saveToPdfFromHtml(htmlDoc, pdfOptions, {
      defaultPath: props.defaultSavePath,
      skipDialog:  props.skipSaveDialog,
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
  // Capture document and options now — both go stale once the dialog closes
  // (currentDocumentHtml is reset by the visible watcher; props.html is cleared by the store).
  const htmlDoc  = currentDocumentHtml.value || await buildPreviewHtml()
  const options  = buildPrintOptions(false)
  // Close the print dialog so the OS system print dialog has the user's full attention.
  emit('close')
  try {
    const result = await window.electronAPI.printFromHtml(htmlDoc, options)
    if (!result.success && !result.cancelled) {
      notify.error(result.error ?? t('dialog.printDialog.notifications.printFailed'))
    }
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.printDialog.notifications.printFailed'))
  }
}

async function handlePostExportAction(filePath: string) {
  const actions = appStore.globalExportSetting.common.afterExportActions
  if (!actions.reveal && !actions.open) return
  try {
    if (actions.reveal) await window.electronAPI.revealInFolder(filePath)
    if (actions.open)   await window.electronAPI.openWithShell(filePath)
  } catch (error) {
    console.warn('Failed to run post-export action for PDF:', error)
  }
}
</script>
