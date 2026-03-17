<template>
  <div class="border border-yellow-300 bg-yellow-50 rounded-lg overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-yellow-100 border-b border-yellow-200">
      <div class="flex items-center gap-2">
        <IconPencil class="w-4 h-4 text-yellow-700" />
        <span class="text-xs font-medium text-yellow-800">编辑建议</span>
      </div>
      <span class="text-xs text-yellow-600 max-w-[180px] truncate" :title="proposal.description">
        {{ proposal.description }}
      </span>
    </div>

    <!-- Diff panels -->
    <div class="grid grid-cols-2 divide-x divide-yellow-200 text-xs">
      <!-- Old text -->
      <div class="p-2">
        <div class="text-red-600 font-medium mb-1 flex items-center gap-1">
          <IconX class="w-3 h-3" />
          <span>原文</span>
        </div>
        <pre class="whitespace-pre-wrap break-words text-red-700 bg-red-50 rounded p-1.5 max-h-32 overflow-auto font-mono leading-relaxed">{{ proposal.oldText }}</pre>
      </div>
      <!-- New text -->
      <div class="p-2">
        <div class="text-green-600 font-medium mb-1 flex items-center gap-1">
          <IconCheck class="w-3 h-3" />
          <span>修改后</span>
        </div>
        <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-32 overflow-auto font-mono leading-relaxed">{{ proposal.newText }}</pre>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 px-3 py-2 bg-yellow-50 border-t border-yellow-200">
      <button
        @click="$emit('approve', proposal.id)"
        class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
      >
        <IconCheck class="w-3.5 h-3.5" />
        应用
      </button>
      <button
        @click="$emit('reject', proposal.id)"
        class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        <IconX class="w-3.5 h-3.5" />
        忽略
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconPencil, IconCheck, IconX } from '@tabler/icons-vue'
import type { EditProposal } from '@/types/ai'

defineProps<{ proposal: EditProposal }>()
defineEmits<{
  approve: [id: string]
  reject: [id: string]
}>()
</script>
