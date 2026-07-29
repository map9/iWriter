<!-- eslint-disable vue/no-mutating-props -->
<template>
  <PrintCommonSettingsForm
    ref="commonFormRef"
    :settings="settings"
    :printers="printers"
    :is-print-mode="isPrintMode"
    :is-printing="isPrinting"
    :is-pdf-printer="isPdfPrinter"
    :page-range-error="pageRangeError"
    :scale-error="scaleError"
    @system-print="emit('system-print')"
  >
    <!-- ── Page settings section ────────────────────────────────────────── -->
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
          <!-- Paper size -->
          <div class="flex items-center justify-between px-5 py-3">
            <label class="shrink-0 text-sm">{{ t('dialog.printDialog.paperSize.label') }}</label>
            <select v-model="settings.paperSize" class="select select-sm ml-3 w-44 text-sm">
              <option v-for="sz in availablePaperSizes" :key="sz.value" :value="sz.value">
                {{ sz.label }}
              </option>
            </select>
          </div>

          <!-- Orientation -->
          <div class="flex items-center justify-between px-5 py-3">
            <label class="shrink-0 text-sm">{{ t('dialog.printDialog.orientation.label') }}</label>
            <select v-model="settings.orientation" class="select select-sm ml-3 w-44 text-sm">
              <option value="portrait">{{ t('dialog.printDialog.orientation.options.portrait') }}</option>
              <option value="landscape">{{ t('dialog.printDialog.orientation.options.landscape') }}</option>
            </select>
          </div>

          <!-- Margins -->
          <div class="flex items-center justify-between px-5 py-3">
            <label class="shrink-0 text-sm">{{ t('dialog.printDialog.margins.label') }}</label>
            <select v-model="settings.margins" class="select select-sm ml-3 w-44 text-sm">
              <option value="default">{{ t('dialog.printDialog.margins.options.default') }}</option>
              <option value="none">{{ t('dialog.printDialog.margins.options.none') }}</option>
              <option value="minimum">{{ t('dialog.printDialog.margins.options.minimum') }}</option>
            </select>
          </div>

          <!-- Image fit mode -->
          <div class="flex items-center justify-between px-5 py-3">
            <label class="shrink-0 text-sm">{{ t('dialog.imagePrintDialog.fit.label') }}</label>
            <select v-model="settings.fit" class="select select-sm ml-3 w-44 text-sm">
              <option value="contain">{{ t('dialog.imagePrintDialog.fit.options.contain') }}</option>
              <option value="cover">{{ t('dialog.imagePrintDialog.fit.options.cover') }}</option>
              <option value="actual">{{ t('dialog.imagePrintDialog.fit.options.actual') }}</option>
            </select>
          </div>
        </template>
      </div>
    </template>
  </PrintCommonSettingsForm>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronUp, IconChevronDown } from '@tabler/icons-vue'
import PrintCommonSettingsForm from './PrintCommonSettingsForm.vue'
import { getPrinterPaperSizes, STANDARD_PAPER_SIZES } from './paperSpecs'
import type { ImagePrintSettings } from '@/types/image-print'

const props = defineProps<{
  settings: ImagePrintSettings
  printers: Electron.PrinterInfo[]
  isPrintMode?: boolean
  isPrinting?: boolean
  isPdfPrinter?: boolean
  pageRangeError?: string
  scaleError?: string
}>()

const emit = defineEmits<{ 'system-print': [] }>()

const { t } = useI18n()

const commonFormRef = ref<InstanceType<typeof PrintCommonSettingsForm>>()
const showPageSettings = ref(true)

const selectedPrinterInfo = computed<Electron.PrinterInfo | null>(() =>
  props.printers.find(p => p.name === props.settings.printer) ?? null
)

const availablePaperSizes = computed(() =>
  props.isPdfPrinter
    ? STANDARD_PAPER_SIZES
    : getPrinterPaperSizes(selectedPrinterInfo.value)
)

// Proxy the autoSelectPrinter helper from the inner common form
function autoSelectPrinter() {
  commonFormRef.value?.autoSelectPrinter()
}

defineExpose({ autoSelectPrinter })
</script>
