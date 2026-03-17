<template>
  <div v-if="files.length" class="flex flex-wrap gap-1 px-3 pt-2 pb-0">
    <span
      v-for="(f, i) in files"
      :key="i"
      class="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-full"
    >
      <IconFile class="w-3 h-3 flex-shrink-0" />
      <span class="truncate max-w-[120px]">{{ fileName(f) }}</span>
      <button @click="$emit('remove', i)" class="flex-shrink-0 hover:text-red-500">
        <IconX class="w-3 h-3" />
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { IconFile, IconX } from '@tabler/icons-vue'

defineProps<{ files: string[] }>()
defineEmits<{ remove: [index: number] }>()

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}
</script>
