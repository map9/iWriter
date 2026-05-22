<script setup lang="ts">
import type { AiSubTaskProgress } from '@/ai/types'
import ToolCallCard from './ToolCallCard.vue'

defineProps<{
  subTask: AiSubTaskProgress
}>()

function subTaskLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function statusText(status: AiSubTaskProgress['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'awaiting_approval':
      return 'Awaiting approval'
    case 'cancelled':
      return 'Cancelled'
    default:
      return ''
  }
}
</script>

<template>
  <div class="rounded-field border border-base-300 bg-base-100 px-2.5 py-1.5 text-xs">
    <div class="flex items-center gap-2">
      <span
        v-if="subTask.status === 'pending' || subTask.status === 'running'"
        class="loading loading-spinner loading-xs shrink-0 text-base-content/50"
      />
      <span v-else-if="subTask.status === 'awaiting_approval'" class="shrink-0 text-warning text-sm leading-none">…</span>
      <span v-else-if="subTask.status === 'done'" class="shrink-0 text-success text-sm leading-none">✓</span>
      <span v-else-if="subTask.status === 'cancelled'" class="shrink-0 text-base-content/40 text-sm leading-none">×</span>
      <span v-else class="shrink-0 text-error text-sm leading-none">!</span>
      <span class="font-medium text-base-content/70">{{ subTaskLabel(subTask.name) }}</span>
      <span v-if="statusText(subTask.status)" class="text-base-content/40">{{ statusText(subTask.status) }}</span>
    </div>
    <div
      v-if="subTask.thinkingText"
      class="mt-1 truncate text-base-content/40 italic"
    >{{ subTask.thinkingText.slice(0, 120) }}</div>
    <ToolCallCard
      v-for="tc in subTask.toolCalls"
      :key="tc.id"
      :tool-call="tc"
      group-position="single"
      class="mt-1 w-full"
    />
    <div
      v-if="subTask.text"
      class="mt-1 truncate text-base-content/40"
    >{{ subTask.text.slice(0, 100) }}</div>
    <div
      v-if="subTask.status === 'error' && subTask.errorText"
      class="mt-1 truncate text-error/70"
    >{{ subTask.errorText.slice(0, 120) }}</div>
  </div>
</template>
