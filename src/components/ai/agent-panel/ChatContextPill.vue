<template>
  <div v-if="text" class="sticky top-1 z-10 flex justify-center pointer-events-none">
    <div class="px-3 py-1 rounded-full bg-white/90 shadow-md ring-1 ring-black/5 text-[10px] leading-4 text-gray-500 backdrop-blur-sm max-w-[85%] truncate">
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
    return `会话基于 ${originLabel} · 当前文档 ${currentLabel}`
  }
  if (currentLabel) {
    return `当前文档 ${currentLabel}`
  }
  if (originLabel) {
    return `会话基于 ${originLabel}`
  }
  return ''
})
</script>
