<template>
  <div class="w-full rounded overflow-hidden text-xs" :class="containerClass">
    <div
      class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
      :class="headerClass"
      @click="expanded = !expanded"
    >
      <span>✏️</span>
      <span class="font-bold">{{ summaryLabel }}</span>
      <span class="ml-auto opacity-60 text-2xs">{{ expanded ? '▲' : '▼' }}</span>
    </div>
    <div v-if="expanded" class="bg-background-content px-2 py-1.5" :class="bodyClass">
      <span
        v-for="(tc, idx) in toolCalls"
        :key="tc.id"
        class="font-mono"
        :class="itemClass(tc)"
      >{{ editOpDisplay(tc).label }}<template v-if="idx < toolCalls.length - 1">；</template></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AiToolCall } from '@/ai/types'

const props = defineProps<{ toolCalls: AiToolCall[] }>()

const expanded = ref(true)
watch(
  () => props.toolCalls.length,
  (len, oldLen) => { if (oldLen === 0 && len > 0) expanded.value = len <= 5 }
)

const completedCount = computed(() =>
  props.toolCalls.filter(tc => tc.status === 'completed').length
)
const pendingCount = computed(() =>
  props.toolCalls.filter(tc => tc.status === 'pending' || tc.status === 'in_progress').length
)
const rejectedCount = computed(() =>
  props.toolCalls.filter(tc => tc.status === 'rejected').length
)
const failedCount = computed(() =>
  props.toolCalls.filter(tc => tc.status === 'failed' || tc.isError).length
)

const summaryLabel = computed(() => {
  const total = props.toolCalls.length
  if (pendingCount.value > 0) return `待确认 ${total} 处修改`
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return `已跳过 ${total} 处修改`
  if (completedCount.value > 0 && failedCount.value === 0) return `已应用 ${total} 处修改`
  if (failedCount.value > 0 && completedCount.value === 0) return `未应用 ${total} 处修改`
  return `已处理 ${total} 处修改`
})

const containerClass = computed(() => {
  if (pendingCount.value > 0) return 'border border-status-warning/30'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'border border-border-separator'
  if (completedCount.value > 0 && failedCount.value === 0) return 'border border-status-success/30'
  if (failedCount.value > 0 && completedCount.value === 0) return 'border border-status-error/30'
  return 'border border-border-separator'
})

const headerClass = computed(() => {
  if (pendingCount.value > 0) return 'bg-status-warning/10 text-status-warning'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'bg-background-window text-text-primary'
  if (completedCount.value > 0 && failedCount.value === 0) return 'bg-status-success/10 text-status-success'
  if (failedCount.value > 0 && completedCount.value === 0) return 'bg-status-error/10 text-status-error'
  return 'bg-background-window text-text-primary'
})

const bodyClass = computed(() => {
  if (pendingCount.value > 0) return 'border-t border-status-warning/20'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'border-t border-border-separator'
  if (completedCount.value > 0 && failedCount.value === 0) return 'border-t border-status-success/20'
  if (failedCount.value > 0 && completedCount.value === 0) return 'border-t border-status-error/20'
  return 'border-t border-border-separator'
})

function itemClass(tc: AiToolCall): string {
  if (tc.status === 'rejected') return 'text-text-secondary line-through opacity-75'
  if (tc.status === 'failed' || tc.isError) return 'text-status-error line-through opacity-70'
  if (tc.status === 'completed') return 'text-status-success'
  return 'text-status-warning'
}

function editOpDisplay(tc: AiToolCall): { label: string } {
  const args = tc.arguments
  const bid  = (v: unknown) => v !== undefined && v !== null ? `{b:${v}}` : '?'
  const fname = (fp: unknown) =>
    typeof fp === 'string' && fp ? (fp.split('/').pop() ?? fp) : ''
  switch (tc.name) {
    case 'edit_block':     return { label: `编辑块 ${bid(args.block_id)}` }
    case 'insert_block': {
      const ref = args.after_block_id !== undefined ? `块 ${bid(args.after_block_id)} 之后`
        : args.end_block_id !== undefined ? `尾部 ${bid(args.end_block_id)}` : ''
      return { label: `插入块${ref ? ` (${ref})` : ''}` }
    }
    case 'delete_block':   return { label: `删除块 ${bid(args.block_id)}` }
    case 'replace_range':  return { label: `替换块 ${bid(args.start_block_id)}–${bid(args.end_block_id)}` }
    case 'create_document': {
      const name = fname(args.file_path) || (typeof args.filename === 'string' ? args.filename : '')
      return { label: `创建文档${name ? `: ${name}` : ''}` }
    }
    default:               return { label: tc.title || tc.name }
  }
}
</script>
