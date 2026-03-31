<template>
  <div class="w-full rounded overflow-hidden text-xs" :class="containerClass">
    <div
      class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
      :class="headerClass"
      @click="expanded = !expanded"
    >
      <span>✏️</span>
      <span class="font-bold">{{ summaryLabel }}</span>
      <span class="ml-auto opacity-60 text-[10px]">{{ expanded ? '▲' : '▼' }}</span>
    </div>
    <div v-if="expanded" class="bg-white px-2 py-1.5" :class="bodyClass">
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
  if (pendingCount.value > 0) return 'border border-yellow-200'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'border border-gray-200'
  if (completedCount.value > 0 && failedCount.value === 0) return 'border border-green-200'
  if (failedCount.value > 0 && completedCount.value === 0) return 'border border-red-200'
  return 'border border-gray-200'
})

const headerClass = computed(() => {
  if (pendingCount.value > 0) return 'bg-yellow-50 text-yellow-800'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'bg-gray-50 text-gray-700'
  if (completedCount.value > 0 && failedCount.value === 0) return 'bg-green-50 text-green-800'
  if (failedCount.value > 0 && completedCount.value === 0) return 'bg-red-50 text-red-700'
  return 'bg-gray-50 text-gray-700'
})

const bodyClass = computed(() => {
  if (pendingCount.value > 0) return 'border-t border-yellow-100'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'border-t border-gray-100'
  if (completedCount.value > 0 && failedCount.value === 0) return 'border-t border-green-100'
  if (failedCount.value > 0 && completedCount.value === 0) return 'border-t border-red-100'
  return 'border-t border-gray-100'
})

function itemClass(tc: AiToolCall): string {
  if (tc.status === 'rejected') return 'text-gray-500 line-through opacity-75'
  if (tc.status === 'failed' || tc.isError) return 'text-red-500 line-through opacity-70'
  if (tc.status === 'completed') return 'text-green-700'
  return 'text-yellow-900'
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
