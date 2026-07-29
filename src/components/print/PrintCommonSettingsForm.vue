<!-- eslint-disable vue/no-mutating-props -->
<!--
  Reusable settings form for the common print fields shared by all HTML-engine
  and PDF-engine dialogs: printer, page-range, copies, pages-per-sheet, scale,
  dpi, colour, and the system-dialog shortcut.

  Callers inject profile-specific content via two named slots:
    #between    – page settings section placed BETWEEN the basic section and
                  the "More Settings" collapsible (e.g. paper size / theme).
    #more-extra – extra rows appended INSIDE the "More Settings" collapsible
                  (e.g. duplex for the PDF engine).
-->
<template>
  <!-- ── Section 1: Printer / page range / copies ─────────────────────────── -->
  <div class="space-y-1 divide-base-300 border-b border-base-300">

    <!-- Printer (hidden in export mode) -->
    <div v-if="isPrintMode" class="flex items-center justify-between px-5 py-3">
      <label class="shrink-0 text-sm">{{ t('dialog.printDialog.printer.label') }}</label>
      <div class="ml-3 w-44">
        <select
          v-model="settings.printer"
          class="select select-sm w-full truncate text-sm"
          :class="printerSelectClass"
          :disabled="!hasPrinters"
        >
          <option v-if="!hasPrinters" value="" disabled>
            {{ t('dialog.printDialog.printer.noPrinter') }}
          </option>
          <option
            v-for="p in printers"
            :key="p.name"
            :value="p.name"
            :class="getPrinterOptionTextClass(p)"
          >
            {{ formatPrinterOptionLabel(p) }}
          </option>
        </select>
      </div>
    </div>

    <!-- Page range -->
    <div class="flex flex-col gap-2 px-5 py-3">
      <div class="flex items-center justify-between">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.pageRange.label') }}</label>
        <select v-model="settings.pageRange" class="select select-sm ml-3 w-44 text-sm">
          <option value="all">{{ t('dialog.printDialog.pageRange.options.all') }}</option>
          <option value="odd">{{ t('dialog.printDialog.pageRange.options.odd') }}</option>
          <option value="even">{{ t('dialog.printDialog.pageRange.options.even') }}</option>
          <option value="custom">{{ t('dialog.printDialog.pageRange.options.custom') }}</option>
        </select>
      </div>
      <input
        v-if="settings.pageRange === 'custom'"
        v-model="settings.customPageRange"
        class="input input-sm h-7 w-full text-sm"
        :placeholder="t('dialog.printDialog.pageRange.placeholder')"
      />
      <p v-if="settings.pageRange === 'custom' && pageRangeError" class="text-xs text-error">
        {{ pageRangeError }}
      </p>
    </div>

    <!-- Copies (hidden for PDF pseudo-printer) -->
    <div v-if="!isPdfPrinter" class="flex items-center justify-between px-5 py-3">
      <label class="shrink-0 text-sm">{{ t('dialog.printDialog.copies.label') }}</label>
      <input
        v-model.number="settings.copies"
        type="number"
        min="1"
        max="999"
        class="input input-sm h-7 ml-3 w-44 text-sm"
      />
    </div>
  </div>

  <!-- ── Slot: profile-specific page settings (between section 1 and more) ─── -->
  <slot name="between" />

  <!-- ── Section 3: More settings (collapsible) ───────────────────────────── -->
  <div class="space-y-1 divide-base-300 border-b border-base-300">
    <button
      class="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-base-200"
      @click="showMoreSettings = !showMoreSettings"
    >
      <span class="text-sm font-medium">{{ t('dialog.printDialog.moreSettings') }}</span>
      <IconChevronUp v-if="showMoreSettings" class="icon-xs shrink-0 text-base-content/70" />
      <IconChevronDown v-else class="icon-xs shrink-0 text-base-content/70" />
    </button>

    <template v-if="showMoreSettings">
      <!-- Pages per sheet -->
      <div class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.pagesPerSheet.label') }}</label>
        <select v-model.number="settings.pagesPerSheet" class="select select-sm ml-3 w-44 text-sm">
          <option :value="1">1</option>
          <option :value="2">2</option>
          <option :value="4">4</option>
          <option :value="6">6</option>
          <option :value="9">9</option>
        </select>
      </div>

      <!-- Scale -->
      <div class="flex flex-col gap-2 px-5 py-3">
        <div class="flex items-center justify-between">
          <label class="shrink-0 text-sm">{{ t('dialog.printDialog.scale.label') }}</label>
          <select v-model="settings.scaleMode" class="select select-sm ml-3 w-44 text-sm">
            <option value="default">{{ t('dialog.printDialog.scale.options.default') }}</option>
            <option value="custom">{{ t('dialog.printDialog.scale.options.custom') }}</option>
          </select>
        </div>
        <div v-if="settings.scaleMode === 'custom'" class="flex items-center gap-2">
          <input
            v-model.number="settings.customScale"
            type="number"
            min="10"
            max="500"
            class="input input-sm h-7 w-full flex-1 text-sm"
          />
          <span class="shrink-0 text-sm text-base-content/70">%</span>
        </div>
        <p v-if="settings.scaleMode === 'custom' && scaleError" class="text-xs text-error">
          {{ scaleError }}
        </p>
      </div>

      <!-- Print Quality (hidden for PDF pseudo-printer) -->
      <div v-if="!isPdfPrinter" class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.quality.label') }}</label>
        <select v-model.number="settings.dpi" class="select select-sm ml-3 w-44 text-sm">
          <option :value="150">150 dpi</option>
          <option :value="300">300 dpi</option>
          <option :value="600">600 dpi</option>
        </select>
      </div>

      <!-- Color (only when printer supports it) -->
      <div v-if="printerColorSupported" class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.color.label') }}</label>
        <select v-model="settings.color" class="select select-sm ml-3 w-44 text-sm">
          <option value="color">{{ t('dialog.printDialog.color.options.color') }}</option>
          <option value="grayscale">{{ t('dialog.printDialog.color.options.grayscale') }}</option>
        </select>
      </div>

      <!-- Slot: engine-specific extras (e.g. duplex for PDF) -->
      <slot name="more-extra" />
    </template>
  </div>

  <!-- ── Section 4: System dialog shortcut (print mode only) ──────────────── -->
  <div class="space-y-1 divide-base-300">
    <button
      v-if="isPrintMode && !isPdfPrinter"
      class="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-primary hover:bg-base-200 disabled:cursor-not-allowed disabled:text-base-content/30"
      :disabled="!hasPrinters || isPrinting"
      @click="emit('system-print')"
    >
      <span>{{ t('dialog.printDialog.systemDialog') }}</span>
      <IconExternalLink class="icon-xs shrink-0" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronUp, IconChevronDown, IconExternalLink } from '@tabler/icons-vue'
import { detectColorSupport, getPrinterState, isPrinterConnectable, type PrinterState } from './paperSpecs'
import type { BasePrintSettings } from '@/types/print-settings'

const props = defineProps<{
  /** Mutable reactive settings object (direct mutation is intentional). */
  settings: BasePrintSettings
  printers: Electron.PrinterInfo[]
  isPrintMode?: boolean
  isPrinting?: boolean
  /** True when the "Save as PDF" pseudo-printer is selected. */
  isPdfPrinter?: boolean
  /** Validation error for the custom page range input. */
  pageRangeError?: string
  /** Validation error for the custom scale input. */
  scaleError?: string
}>()

const emit = defineEmits<{ 'system-print': [] }>()

const { t } = useI18n()

const showMoreSettings = ref(false)

const hasPrinters = computed(() => props.printers.length > 0)

const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  props.printers.find(p => p.name === props.settings.printer) ?? null
)

const printerSelectClass = computed(() => {
  if (!hasPrinters.value || props.isPdfPrinter) return ''
  return getPrinterOptionTextClass(selectedPrinterInfo.value)
})

const printerColorSupported = computed(() => {
  if (props.isPdfPrinter) return false
  return detectColorSupport(selectedPrinterInfo.value)
})

function getPrinterStateIcon(state: PrinterState): string {
  switch (state) {
    case 'ready':    return '●'
    case 'printing': return '●'
    case 'offline':  return '○'
    default:         return '◎'
  }
}

function getPrinterStateText(state: PrinterState): string {
  switch (state) {
    case 'ready':    return t('dialog.pdfPrintDialog.printer.ready')
    case 'printing': return t('dialog.pdfPrintDialog.printer.printing')
    case 'offline':  return t('dialog.pdfPrintDialog.printer.offline')
    default:         return t('dialog.pdfPrintDialog.printer.unknown')
  }
}

function getPrinterOptionTextClass(info: Electron.PrinterInfo | null): string {
  switch (getPrinterState(info)) {
    case 'ready':    return 'text-success'
    case 'printing': return 'text-success'
    case 'offline':  return 'text-error'
    default:         return 'text-base-content/50'
  }
}

function formatPrinterOptionLabel(info: Electron.PrinterInfo): string {
  const state = getPrinterState(info)
  const displayName = info.displayName || info.name
  return `${getPrinterStateIcon(state)} ${getPrinterStateText(state)} - ${displayName}`
}

// Ensure at least one connectable printer is selected when list refreshes.
// Called by the parent dialog when printers change.
 
function autoSelectPrinter() {
  const list = props.printers
  // eslint-disable-next-line vue/no-mutating-props
  if (!list.length) { props.settings.printer = ''; return }
  if (list.find(p => p.name === props.settings.printer)) return   // current is still valid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = list.find((p: any) => p.isDefault)
  const firstConnectable = list.find(isPrinterConnectable)
  // eslint-disable-next-line vue/no-mutating-props
  props.settings.printer = def?.name ?? firstConnectable?.name ?? list[0]?.name ?? ''
}

defineExpose({ autoSelectPrinter })
</script>
