<template>
  <div
    :data-theme="themeId"
    class="overflow-hidden rounded-field border border-base-300 bg-base-200"
  >
    <div class="flex h-28">
      <div class="w-7 shrink-0 border-r border-base-300 bg-base-200" />
      <div class="flex flex-1 flex-col gap-2 bg-base-100 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="h-3 w-2/3 rounded-full bg-primary" />
          <div class="badge badge-primary badge-xs border-0">Aa</div>
        </div>
        <div class="h-2.5 w-full rounded-full bg-base-300" />
        <div class="h-2.5 w-3/5 rounded-full bg-base-300/80" />
        <div class="mt-auto flex items-center gap-2">
          <span class="btn btn-xs btn-primary pointer-events-none min-h-0 h-6 px-2">
            {{ t('themePreview.save') }}
          </span>
          <span class="btn btn-xs btn-ghost pointer-events-none min-h-0 h-6 px-2">
            {{ t('themePreview.share') }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  themeId: string
}>()
const { t } = useI18n()
</script>
