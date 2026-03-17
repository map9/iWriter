<template>
  <div class="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
    <div
      v-for="thread in aiStore.threads"
      :key="thread.id"
      @click="$emit('select', thread.id)"
      class="group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors"
      :class="thread.id === aiStore.activeThreadId
        ? 'bg-primary-100 text-primary-800'
        : 'hover:bg-gray-100 text-gray-700'"
    >
      <span class="truncate flex-1 mr-2">{{ thread.title }}</span>
      <button
        @click.stop="aiStore.deleteThread(thread.id)"
        class="p-0.5 rounded hover:bg-red-100 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <IconTrash class="w-3.5 h-3.5 text-red-400" />
      </button>
    </div>
    <div v-if="!aiStore.threads.length" class="text-center py-8 text-xs text-gray-400">
      暂无历史对话
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconTrash } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'

const aiStore = useAiStore()
defineEmits<{ select: [id: string] }>()
</script>
