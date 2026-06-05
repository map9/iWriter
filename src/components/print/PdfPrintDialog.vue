<template>
  <PrintDialogShell
    :visible="visible"
    :title="dialogTitle"
    :sheet-count="sheetCount"
    :submit-label="t('dialog.printDialog.actions.print')"
    :submit-disabled="isPrinting || !hasPrinters"
    @close="emit('close')"
    @submit="handlePrint"
  >
    <template #preview>
      <PdfPrintPreview
        v-if="visible"
        :file-path="filePath"
        :num-pages="numPages"
        :settings="settings"
        @update:sheet-count="sheetCount = $event"
      />
    </template>

    <template #settings>
      <PdfPrintSettingsForm
        :settings="settings"
        :printers="printers"
        :is-printing="isPrinting"
        @system-print="handleSystemPrint"
      />
    </template>
  </PrintDialogShell>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { notify } from '@/utils/notifications'
import PrintDialogShell from './PrintDialogShell.vue'
import PdfPrintPreview from './PdfPrintPreview.vue'
import PdfPrintSettingsForm from './PdfPrintSettingsForm.vue'
import {
  ELECTRON_PRINT_KEYWORDS,
  getPaperDimensionsMm,
  getPrinterPaperSizes,
  isPrinterConnectable,
  getNUpGrid,
  getSheetDimsMm,
  parseCustomPageRangeInput,
} from './paperSpecs'
import * as pdfjsLib from 'pdfjs-dist'
import { DEFAULT_PDF_PRINT_SETTINGS } from '@/types/pdf-print'
import type { PdfPrintSettings } from '@/types/pdf-print'

const props = defineProps<{
  visible: boolean
  filePath: string
  numPages: number
  title: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

// ── State ──────────────────────────────────────────────────────────────────────
const settings = reactive<PdfPrintSettings>(structuredClone(DEFAULT_PDF_PRINT_SETTINGS))
const printers = ref<Electron.PrinterInfo[]>([])
const isPrinting = ref(false)
const sheetCount = ref(0)

// ── Computed ───────────────────────────────────────────────────────────────────
const hasPrinters = computed(() => printers.value.length > 0)
const dialogTitle = computed(() => t('dialog.printDialog.title'))

const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  printers.value.find(p => p.name === settings.printer) ?? null
)

// ── Printer refresh ────────────────────────────────────────────────────────────
async function refreshPrinters() {
  try {
    const list = await window.electronAPI.getPrinters()
    printers.value = list
    // Select system default → first connectable → first in list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = list.find((p: any) => p.isDefault)
    const firstConnectable = list.find(isPrinterConnectable)
    if (!settings.printer || !list.find(p => p.name === settings.printer)) {
      settings.printer = def?.name ?? firstConnectable?.name ?? list[0]?.name ?? ''
    }
  } catch {
    printers.value = []
    settings.printer = ''
  }
}

let printerRefreshInterval: ReturnType<typeof setInterval> | null = null

// ── Open / close ───────────────────────────────────────────────────────────────
// Use immediate:true so refreshPrinters fires on first mount (visible is already true
// when this component is created via v-if="source.kind==='pdf'").
watch(() => props.visible, async (val) => {
  if (val) {
    await refreshPrinters()
    // Poll every 8 seconds to pick up printer connection changes while dialog is open
    printerRefreshInterval = setInterval(refreshPrinters, 8000)
  } else {
    if (printerRefreshInterval) {
      clearInterval(printerRefreshInterval)
      printerRefreshInterval = null
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (printerRefreshInterval) {
    clearInterval(printerRefreshInterval)
    printerRefreshInterval = null
  }
})

// Keep paper size valid when printer/paper changes
watch(
  () => settings.printer,
  () => {
    const sizes = getPrinterPaperSizes(selectedPrinterInfo.value)
    if (!sizes.find(s => s.value === settings.paperSize)) {
      settings.paperSize = sizes[0]?.value ?? 'A4'
    }
  }
)

// ── Selected pages helper ──────────────────────────────────────────────────────
function getSelectedPageNumbers(): number[] {
  const total = props.numPages
  if (total <= 0) return []
  switch (settings.pageRange) {
    case 'odd':   return Array.from({ length: total }, (_, i) => i + 1).filter(p => p % 2 === 1)
    case 'even':  return Array.from({ length: total }, (_, i) => i + 1).filter(p => p % 2 === 0)
    case 'custom': {
      const parsed = parseCustomPageRangeInput(settings.customPageRange, total)
      return parsed.length > 0 ? parsed : Array.from({ length: total }, (_, i) => i + 1)
    }
    default: return Array.from({ length: total }, (_, i) => i + 1)
  }
}

// ── Margin type helper ─────────────────────────────────────────────────────────
function buildMarginType(): 'default' | 'none' | 'printableArea' {
  if (settings.margins === 'none') return 'none'
  if (settings.margins === 'minimum') return 'printableArea'
  return 'default'
}

// ── Native print options (N-up=1 path) ────────────────────────────────────────
function buildNativePrintOptions(silent: boolean): Electron.WebContentsPrintOptions {
  const paperSizeValue: Electron.WebContentsPrintOptions['pageSize'] =
    ELECTRON_PRINT_KEYWORDS.has(settings.paperSize)
      ? (settings.paperSize as Electron.WebContentsPrintOptions['pageSize'])
      : (() => {
          const d = getPaperDimensionsMm(settings.paperSize)
          return { width: Math.round(d.widthMm * 1000), height: Math.round(d.heightMm * 1000) }
        })()

  const landscape = settings.orientation === 'landscape'

  // Page ranges (0-indexed for Electron)
  let pageRanges: Array<{ from: number; to: number }> | undefined
  if (settings.pageRange !== 'all') {
    const pages = getSelectedPageNumbers()
    pageRanges = pages.map(p => ({ from: p - 1, to: p - 1 }))
  }

  return {
    silent,
    color: settings.color === 'color',
    deviceName: settings.printer,
    pageSize: paperSizeValue,
    landscape,
    copies: settings.copies,
    scaleFactor: settings.scaleMode === 'custom' ? settings.customScale : 100,
    duplexMode: settings.duplex,
    margins: { marginType: buildMarginType() },
    dpi: { horizontal: settings.dpi, vertical: settings.dpi },
    ...(pageRanges ? { pageRanges } : {}),
  }
}

// ── N-up HTML print (pps > 1) ──────────────────────────────────────────────────
// Renders each PDF page to a canvas and arranges them in an HTML sheet grid,
// matching buildPreviewDoc.ts buildNUpLayout logic exactly.

async function buildNUpHtml(): Promise<string> {
  // Load the PDF in the renderer (separate from the preview instance)
  const base64Content = await window.electronAPI.readFileBinary(props.filePath)
  if (!base64Content) throw new Error('Cannot read PDF file')
  const bin = atob(base64Content)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const resolveUrl = (p: string) => new URL(p, window.location.href).href
  const pdfDoc = await pdfjsLib.getDocument({
    data: bytes.buffer,
    cMapUrl: resolveUrl('./cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: resolveUrl('./standard_fonts/'),
    wasmUrl: resolveUrl('./wasm/'),
  }).promise

  try {
    const pps   = settings.pagesPerSheet
    const ori   = settings.orientation
    const grid  = getNUpGrid(pps, ori)
    const dims  = getSheetDimsMm(pps, ori, settings.paperSize)
    const MM_TO_PT = 2.8346
    const sheetWPt = dims.w * MM_TO_PT
    const sheetHPt = dims.h * MM_TO_PT
    const cellWPt  = sheetWPt / grid.cols
    const cellHPt  = sheetHPt / grid.rows

    // 1pt = 1/72in; render PDF pages at the selected print quality.
    const PT_TO_PX = settings.dpi / 72

    const scaleMultiplier = settings.scaleMode === 'custom' ? settings.customScale / 100 : 1
    const grayscaleStyle  = settings.color === 'grayscale' ? 'filter:grayscale(1);' : ''

    const pageNums = getSelectedPageNumbers()
    // Render all pages to base64 PNG images
    const images: string[] = []
    for (const pageNum of pageNums) {
      const page = await pdfDoc.getPage(pageNum)
      const base = page.getViewport({ scale: 1.0 })  // natural rotation preserved
      // Fit the page into its cell, then apply user scale
      const fitScale = Math.min(cellWPt / base.width, cellHPt / base.height) * PT_TO_PX
      const renderScale = fitScale * scaleMultiplier
      const viewport = page.getViewport({ scale: renderScale })
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.92))
      page.cleanup()
    }

    // Build sheets HTML — same structure as buildPreviewDoc.ts pps_pages_sheet
    let sheetsHtml = ''
    for (let i = 0; i < images.length; i += pps) {
      const isLast = i + pps >= images.length
      const breakStyle = isLast ? '' : 'break-after:page;page-break-after:always;'
      let cells = ''
      for (let j = 0; j < pps; j++) {
        const img = images[i + j]
        const imgTag = img
          ? `<img src="${img}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;${grayscaleStyle}">`
          : ''
        cells += `<div class="cell">${imgTag}</div>`
      }
      sheetsHtml += `<div class="sheet" style="${breakStyle}">${cells}</div>`
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;}html,body{margin:0;padding:0;}
@page{size:${sheetWPt}pt ${sheetHPt}pt;margin:0;}
.sheet{
  width:${sheetWPt}pt;height:${sheetHPt}pt;
  display:grid;
  grid-template-columns:repeat(${grid.cols},1fr);
  grid-template-rows:repeat(${grid.rows},1fr);
}
.cell{overflow:hidden;display:flex;align-items:center;justify-content:center;}
</style></head><body data-iw-pdf-nup-ready="true">${sheetsHtml}</body></html>`
  } finally {
    await pdfDoc.destroy()
  }
}

// ── Print actions ─────────────────────────────────────────────────────────────

async function doPrint(silent: boolean) {
  const options = buildNativePrintOptions(silent)
  try {
    const result = await window.electronAPI.printPdfFile(props.filePath, options)
    if (!result.success && !result.cancelled) {
      notify.error(result.error ?? t('dialog.pdfPrintDialog.notifications.printFailed'))
    } else if (result.success) {
      emit('close')
    }
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.pdfPrintDialog.notifications.printFailed'))
  }
}

async function handlePrint() {
  isPrinting.value = true
  try {
    if (settings.pagesPerSheet > 1) {
      // N-up: render pages to canvas → HTML → printFromHtml (correct page grouping)
      const html = await buildNUpHtml()
      const basePrintOpts: Electron.WebContentsPrintOptions = {
        silent: true,
        color: settings.color === 'color',
        deviceName: settings.printer,
        copies: settings.copies,
        duplexMode: settings.duplex,
        margins: { marginType: buildMarginType() },
      }
      const result = await window.electronAPI.printFromHtml(html, basePrintOpts, {
        strategy: 'selector',
        selector: '[data-iw-pdf-nup-ready="true"]',
      })
      if (!result.success && !result.cancelled) {
        notify.error(result.error ?? t('dialog.pdfPrintDialog.notifications.printFailed'))
      } else if (result.success) {
        emit('close')
      }
    } else {
      // N-up=1: native PDF print preserves vector quality
      await doPrint(true)
    }
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.pdfPrintDialog.notifications.printFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handleSystemPrint() {
  isPrinting.value = true
  try {
    await doPrint(false)  // always native path for system dialog
  } finally {
    isPrinting.value = false
  }
}
</script>
