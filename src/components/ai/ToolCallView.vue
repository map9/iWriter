<template>
  <div
    class="rounded overflow-hidden text-xs"
    :class="containerClass"
  >
    <!-- Header row (also acts as expand toggle when result exists and has more lines) -->
    <div
      class="flex items-center gap-2 px-2 py-1.5"
      :class="(showResult && hasMoreLines && !alwaysExpanded) ? 'cursor-pointer select-none' : ''"
      @click="showResult && hasMoreLines && !alwaysExpanded && (expanded = !expanded)"
    >
      <IconLoader2 v-if="isSpinning" class="flex-shrink-0 w-3 h-3 animate-spin" />
      <span v-else class="flex-shrink-0 leading-none">{{ statusIcon }}</span>

      <span class="flex-shrink-0 leading-none">{{ kindIcon }}</span>
      <span class="font-bold truncate">{{ displayTitle }}</span>
      <span v-if="paramsDisplay" class="truncate opacity-60 font-mono">{{ paramsDisplay }}</span>
      <span v-if="showResult && hasMoreLines && !alwaysExpanded" class="ml-auto flex-shrink-0 opacity-50 text-[10px]">
        {{ expanded ? '▲' : '▼' }}
      </span>
    </div>

    <!-- Result content: write_todos always shows full content; others show 3 lines by default -->
    <div
      v-if="showResult"
      class="px-2.5 py-2 bg-white border-t border-gray-200 text-gray-700"
      :class="alwaysExpanded ? 'overflow-visible max-h-none' : expanded ? 'overflow-auto max-h-52' : 'overflow-hidden'"
    >
      <MarkdownContentView :content="visibleResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconLoader2 } from '@tabler/icons-vue'
import type { AiToolCall } from '@/ai/types'
import MarkdownContentView from './MarkdownContentView.vue'

const props = defineProps<{
  toolCall: AiToolCall
}>()

const KIND_ICONS: Record<string, string> = {
  read: '📖', edit: '✏️', delete: '🗑️', move: '↔️',
  search: '🔍', execute: '⚡', think: '💭', fetch: '🌐', other: '🔧',
}

const expanded = ref(false)

const isSpinning = computed(() =>
  props.toolCall.status === 'pending' || props.toolCall.status === 'in_progress'
)

const statusIcon = computed(() => {
  if (props.toolCall.status === 'rejected') return '⊘'
  if (props.toolCall.isError || props.toolCall.status === 'failed') return '✗'
  if (props.toolCall.status === 'completed') return '✓'
  return ''
})

const containerClass = computed(() => {
  const isRunning = props.toolCall.status === 'in_progress' || props.toolCall.status === 'pending'
  const isRejected = props.toolCall.status === 'rejected'
  const isError   = props.toolCall.isError || props.toolCall.status === 'failed'
  if (isError)   return 'bg-red-50 border border-red-200 text-red-700'
  if (isRejected) return 'bg-gray-50 border border-gray-200 text-gray-600'
  if (isRunning) return 'bg-blue-50 border border-blue-200 text-blue-700'
  if (props.toolCall.kind === 'edit' || props.toolCall.kind === 'delete')
    return 'bg-yellow-50 border border-yellow-200 text-yellow-800'
  return 'bg-green-50 border border-green-200 text-green-700'
})

const kindIcon     = computed(() => KIND_ICONS[props.toolCall.kind] ?? '🔧')
const alwaysExpanded = computed(() => props.toolCall.name === 'write_todos')
const displayTitle = computed(() => props.toolCall.title || props.toolCall.name)
const fullResult   = computed(() => props.toolCall.result ?? '')
const paramsDisplay = computed(() => props.toolCall.paramsText ?? '')

const showResult    = computed(() => props.toolCall.status === 'completed' && !!fullResult.value)
const resultLines   = computed(() => fullResult.value.split('\n'))
const hasMoreLines  = computed(() => !alwaysExpanded.value && resultLines.value.length > 3)
const visibleResult = computed(() =>
  alwaysExpanded.value || expanded.value ? fullResult.value : resultLines.value.slice(0, 3).join('\n')
)
</script>
