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
      <!-- Left: Preview area (caller fills this slot) -->
      <div class="relative flex flex-1 flex-col overflow-hidden bg-base-300">
        <slot name="preview" />
      </div>

      <!-- Right: Settings panel -->
      <div class="flex w-80 shrink-0 flex-col border-l border-base-300">
        <!-- Header -->
        <div class="flex shrink-0 items-center justify-between border-b border-base-300 px-5 py-4">
          <h2 class="text-base font-semibold max-w-48 whitespace-nowrap overflow-hidden text-ellipsis">{{ title }}</h2>
          <span class="text-sm text-base-content/50">{{ sheetCountLabel }}</span>
        </div>

        <!-- Settings body -->
        <div class="flex-1 overflow-y-auto">
          <slot name="settings" />
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 items-center justify-end gap-3 border-t border-base-300 px-5 py-3">
          <button class="iw-btn btn-ghost h-9" @click="emit('close')">
            {{ t('dialog.printDialog.actions.cancel') }}
          </button>
          <button
            class="iw-btn btn-primary h-9"
            :disabled="submitDisabled"
            @click="emit('submit')"
          >
            {{ submitLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  visible: boolean
  title: string
  sheetCount: number
  submitLabel: string
  submitDisabled?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: []
}>()

const { t } = useI18n()

const sheetCountLabel = computed(() =>
  props.sheetCount > 0
    ? t('dialog.printDialog.sheets', { count: props.sheetCount })
    : ''
)
</script>
