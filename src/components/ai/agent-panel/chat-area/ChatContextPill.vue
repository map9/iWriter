<template>
  <div v-if="text" class="sticky top-0 z-10 flex justify-center pointer-events-none select-none">
    <div class="px-3 py-1 rounded-selector bg-base-100 shadow-sm ring-1 ring-base-300 text-2xs leading-4 text-base-content backdrop-blur-sm max-w-[85%] truncate">
      {{ text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import { useAppStore } from '@/stores/app'
import { pathUtils } from '@/utils/pathUtils'

const aiStore = useAiStore()
const appStore = useAppStore()

const text = computed(() => {
  const currentPath = appStore.activeTab?.path ?? null
  const originPath = aiStore.activeThread?.originFilePath ?? null
  const currentLabel = currentPath ? pathUtils.basename(currentPath) : null
  const originLabel = originPath ? pathUtils.basename(originPath) : null

  if (originLabel && currentLabel && originPath !== currentPath) {
    return `Session @ ${originLabel} · Current @ ${currentLabel}`
  }
  if (currentLabel) {
    return `Current @ ${currentLabel}`
  }
  if (originLabel) {
    return `Session @ ${originLabel}`
  }
  return ''
})
</script>
