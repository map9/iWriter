<template>
  <div v-if="files.length" class="flex flex-wrap gap-1 px-3 pt-2 pb-0">
    <span
      v-for="(f, i) in files"
      :key="i"
      class="inline-flex items-center gap-1 px-2 py-0.5 text-2xs bg-base-100 border border-base-300 text-base-content rounded-selector select-none"
    >
      <IconFolder v-if="isFolder(f)" class="icon-2xs shrink-0" />
      <IconFile v-else class="icon-2xs shrink-0" />
      <span class="truncate max-w-30">{{ fileName(f) }}</span>
      <button @click="$emit('remove', i)" class="shrink-0 p-0.5 hover:bg-base-300 hover:rounded-field">
        <IconX class="icon-2xs" />
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { IconFile, IconFolder, IconX } from '@tabler/icons-vue'
import pathUtils from '@/utils/pathUtils'

defineProps<{ files: string[] }>()
defineEmits<{ remove: [index: number] }>()

function fileName(path: string): string {
  return pathUtils.basename(path)
}

function isFolder(path: string): boolean {
  const name = pathUtils.basename(path)
  return !name.includes('.')
}
</script>
