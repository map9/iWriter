<!-- eslint-disable vue/no-mutating-props -->
<template>
  <div class="space-y-1 divide-base-300 border-b border-base-300">
    <!-- Printer -->
    <div class="flex items-center justify-between px-5 py-3">
      <label class="shrink-0 text-sm">{{ t('dialog.printDialog.printer.label') }}</label>
      <div class="ml-3 flex w-44 flex-col gap-1">
        <select v-model="settings.printer" class="iw-select w-full text-sm" :disabled="!hasPrinters">
          <option v-if="!hasPrinters" value="" disabled>
            {{ t('dialog.printDialog.printer.noPrinter') }}
          </option>
          <option v-for="p in printers" :key="p.name" :value="p.name">
            {{ p.displayName || p.name }}
          </option>
        </select>
        <!-- Printer connection status -->
        <div v-if="hasPrinters" class="flex items-center gap-1.5 text-xs text-base-content/50">
          <div class="h-2 w-2 rounded-full" :class="printerStatusDotClass" />
          <span>{{ printerStatusText }}</span>
        </div>
      </div>
    </div>

    <!-- Page range -->
    <div class="flex flex-col gap-2 px-5 py-3">
      <div class="flex items-center justify-between">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.pageRange.label') }}</label>
        <select v-model="settings.pageRange" class="iw-select ml-3 w-44 text-sm">
          <option value="all">{{ t('dialog.printDialog.pageRange.options.all') }}</option>
          <option value="odd">{{ t('dialog.printDialog.pageRange.options.odd') }}</option>
          <option value="even">{{ t('dialog.printDialog.pageRange.options.even') }}</option>
          <option value="custom">{{ t('dialog.printDialog.pageRange.options.custom') }}</option>
        </select>
      </div>
      <input
        v-if="settings.pageRange === 'custom'"
        v-model="settings.customPageRange"
        class="iw-input w-full text-sm"
        :placeholder="t('dialog.printDialog.pageRange.placeholder')"
      />
    </div>

    <!-- Copies -->
    <div class="flex items-center justify-between px-5 py-3">
      <label class="shrink-0 text-sm">{{ t('dialog.printDialog.copies.label') }}</label>
      <input
        v-model.number="settings.copies"
        type="number"
        min="1"
        max="999"
        class="iw-input ml-3 w-44 text-sm"
      />
    </div>
  </div>

  <!-- Page settings section (collapsible) -->
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
      <!-- Paper size -->
      <div class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.paperSize.label') }}</label>
        <select v-model="settings.paperSize" class="iw-select ml-3 w-44 text-sm">
          <option v-for="sz in availablePaperSizes" :key="sz.value" :value="sz.value">
            {{ sz.label }}
          </option>
        </select>
      </div>

      <!-- Orientation -->
      <div class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.orientation.label') }}</label>
        <select v-model="settings.orientation" class="iw-select ml-3 w-44 text-sm">
          <option value="portrait">{{ t('dialog.printDialog.orientation.options.portrait') }}</option>
          <option value="landscape">{{ t('dialog.printDialog.orientation.options.landscape') }}</option>
        </select>
      </div>

      <!-- Margins -->
      <div class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.margins.label') }}</label>
        <select v-model="settings.margins" class="iw-select ml-3 w-44 text-sm">
          <option value="default">{{ t('dialog.printDialog.margins.options.default') }}</option>
          <option value="none">{{ t('dialog.printDialog.margins.options.none') }}</option>
          <option value="minimum">{{ t('dialog.printDialog.margins.options.minimum') }}</option>
        </select>
      </div>
    </template>
  </div>

  <!-- More settings section (collapsible) -->
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
        <select v-model.number="settings.pagesPerSheet" class="iw-select ml-3 w-44 text-sm">
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
          <select v-model="settings.scaleMode" class="iw-select ml-3 w-44 text-sm">
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
            class="iw-input flex-1 text-sm"
          />
          <span class="shrink-0 text-sm text-base-content/70">%</span>
        </div>
      </div>

      <!-- Print Quality -->
      <div class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.quality.label') }}</label>
        <select v-model.number="settings.dpi" class="iw-select ml-3 w-44 text-sm">
          <option :value="150">150 dpi</option>
          <option :value="300">300 dpi</option>
          <option :value="600">600 dpi</option>
        </select>
      </div>

      <!-- Color (only if printer supports color) -->
      <div v-if="printerColorSupported" class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.printDialog.color.label') }}</label>
        <select v-model="settings.color" class="iw-select ml-3 w-44 text-sm">
          <option value="color">{{ t('dialog.printDialog.color.options.color') }}</option>
          <option value="grayscale">{{ t('dialog.printDialog.color.options.grayscale') }}</option>
        </select>
      </div>

      <!-- Duplex -->
      <div class="flex items-center justify-between px-5 py-3">
        <label class="shrink-0 text-sm">{{ t('dialog.pdfPrintDialog.duplex.label') }}</label>
        <select v-model="settings.duplex" class="iw-select ml-3 w-44 text-sm">
          <option value="simplex">{{ t('dialog.pdfPrintDialog.duplex.options.simplex') }}</option>
          <option value="longEdge">{{ t('dialog.pdfPrintDialog.duplex.options.longEdge') }}</option>
          <option value="shortEdge">{{ t('dialog.pdfPrintDialog.duplex.options.shortEdge') }}</option>
        </select>
      </div>
    </template>
  </div>

  <!-- System dialog link -->
  <div class="space-y-1 divide-base-300">
    <button
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
import { detectColorSupport, getPrinterPaperSizes, getPrinterState } from './paperSpecs'
import type { PdfPrintSettings } from '@/types/pdf-print'

const props = defineProps<{
  settings: PdfPrintSettings
  printers: Electron.PrinterInfo[]
  isPrinting?: boolean
}>()

const emit = defineEmits<{
  'system-print': []
}>()

const { t } = useI18n()

const showPageSettings = ref(true)
const showMoreSettings = ref(false)

const hasPrinters = computed(() => props.printers.length > 0)

const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  props.printers.find(p => p.name === props.settings.printer) ?? null
)

const printerColorSupported = computed(() => detectColorSupport(selectedPrinterInfo.value))

const availablePaperSizes = computed(() =>
  getPrinterPaperSizes(selectedPrinterInfo.value)
)

const printerState = computed(() => getPrinterState(selectedPrinterInfo.value))

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
</script>
