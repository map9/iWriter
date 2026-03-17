<template>
  <div class="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
    <IconLoader2
      v-if="isRunning"
      class="w-3.5 h-3.5 animate-spin flex-shrink-0 text-blue-500"
    />
    <IconCheck
      v-else-if="!isError"
      class="w-3.5 h-3.5 flex-shrink-0 text-green-600"
    />
    <IconX
      v-else
      class="w-3.5 h-3.5 flex-shrink-0 text-red-500"
    />
    <span class="font-mono">{{ toolName }}</span>
    <span v-if="!isRunning && summary" class="text-blue-500 truncate">— {{ summary }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconLoader2, IconCheck, IconX } from '@tabler/icons-vue'

const props = defineProps<{
  toolName: string
  isRunning?: boolean
  result?: string
  isError?: boolean
}>()

const summary = computed(() => {
  if (!props.result) return ''
  const first = props.result.split('\n')[0] ?? ''
  return first.length > 60 ? `${first.slice(0, 57)}...` : first
})
</script>
