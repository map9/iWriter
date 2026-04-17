<template>
  <div
    class="overflow-hidden rounded-box text-xs border transition-colors"
    :class="[containerClass]"
  >
    <div
      class="group flex items-center gap-2.5 px-2 py-0.5 cursor-pointer select-none"
      @click="expanded = !expanded"
    >
      <div class="w-3.5 shrink-0 flex items-center justify-center">
        <span>✏️</span>
      </div>
      <div class="shrink-0 font-semibold text-xs leading-4 whitespace-nowrap">
        {{ summaryLabel }}
      </div>
      <div class="min-w-0 flex-1 flex flex-col justify-center">
      </div>
      <button
        class="iw-toolbar-btn btn-xs opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-transparent"
        :title="expanded ? 'Collapse' : 'Expand Details'"
        @click="expanded = !expanded"
      >
        <IconChevronDown v-if="expanded" class="icon-2xs" />
        <IconChevronUp v-else class="icon-2xs" />
      </button>
    </div>

    <div v-if="expanded" class="bg-base-100 px-2 py-1.5" :class="bodyClass">
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
import {
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-vue'
import type { AiToolCall } from '@/ai/types'

const props = defineProps<{ toolCalls: AiToolCall[] }>()

const expanded = ref(false)

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
  if (pendingCount.value > 0) return 'border-warning/30 bg-warning/20 text-warning-content hover:bg-warning/35'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'border-base-300 bg-base-100 text-base-content hover:bg-base-300'
  if (completedCount.value > 0 && failedCount.value === 0) return 'border-success/30 bg-success/20 text-success-content hover:bg-success/35'
  if (failedCount.value > 0 && completedCount.value === 0) return 'border-error/30 bg-error/20 text-error-content hover:bg-error/35'
  return 'border-base-300 bg-base-100 text-base-content hover:bg-base-300'
})

const bodyClass = computed(() => {
  if (pendingCount.value > 0) return 'border-t border-warning/30'
  if (rejectedCount.value > 0 && completedCount.value === 0 && failedCount.value === 0) return 'border-t border-base-300'
  if (completedCount.value > 0 && failedCount.value === 0) return 'border-t border-success/30'
  if (failedCount.value > 0 && completedCount.value === 0) return 'border-t border-error/30'
  return 'border-t border-base-300'
})

function itemClass(tc: AiToolCall): string {
  if (tc.status === 'rejected') return 'text-base-content line-through opacity-75'
  if (tc.status === 'failed' || tc.isError) return 'text-error-content line-through opacity-75'
  if (tc.status === 'completed') return 'text-success-content'
  return 'text-warning-content'
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
