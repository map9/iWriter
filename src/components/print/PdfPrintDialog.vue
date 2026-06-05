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
  parseCustomPageRangeInput,
} from './paperSpecs'
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

// ── Native print options ──────────────────────────────────────────────────────
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
    pagesPerSheet: settings.pagesPerSheet,
    scaleFactor: settings.scaleMode === 'custom' ? settings.customScale : 100,
    duplexMode: settings.duplex,
    margins: { marginType: buildMarginType() },
    dpi: { horizontal: settings.dpi, vertical: settings.dpi },
    ...(pageRanges ? { pageRanges } : {}),
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
    await doPrint(true)
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.pdfPrintDialog.notifications.printFailed'))
  } finally {
    isPrinting.value = false
  }
}

async function handleSystemPrint() {
  // Capture before closing — props become stale once the dialog unmounts.
  const options  = buildNativePrintOptions(false)
  const filePath = props.filePath
  // Close the print dialog so the OS system print dialog has the user's full attention.
  emit('close')
  try {
    const result = await window.electronAPI.printPdfFile(filePath, options)
    if (!result.success && !result.cancelled) {
      notify.error(result.error ?? t('dialog.pdfPrintDialog.notifications.printFailed'))
    }
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : t('dialog.pdfPrintDialog.notifications.printFailed'))
  }
}
</script>
