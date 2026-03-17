<template>
  <div>
    <!-- Tool call chip row -->
    <div
      class="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
      :class="[containerClass, canExpand ? 'cursor-pointer select-none' : '']"
      @click="canExpand && (expanded = !expanded)"
    >
      <span class="flex-shrink-0 leading-none">{{ statusIcon }}</span>
      <span class="flex-shrink-0 leading-none">{{ kindIcon }}</span>
      <span class="font-medium truncate">{{ displayTitle }}</span>
      <span v-if="!expanded && summary" class="truncate opacity-70">— {{ summary }}</span>
      <span v-if="canExpand" class="ml-auto flex-shrink-0 opacity-50 text-[10px]">
        {{ expanded ? '▲' : '▼' }}
      </span>
    </div>

    <!-- Expanded result panel -->
    <div
      v-if="expanded"
      class="mt-0.5 px-2.5 py-2 bg-white border border-gray-200 rounded text-xs font-mono
             text-gray-700 whitespace-pre-wrap overflow-auto max-h-52 leading-relaxed"
    >{{ fullResult }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AiToolCall } from '@/types/ai'

const props = defineProps<{
  toolCall: AiToolCall
}>()

const KIND_ICONS: Record<string, string> = {
  read: '📖', edit: '✏️', delete: '🗑️', move: '↔️',
  search: '🔍', execute: '⚡', think: '💭', fetch: '🌐', other: '🔧',
}

const expanded = ref(false)

const statusIcon = computed(() => {
  switch (props.toolCall.status) {
    case 'in_progress': return '⟳'
    case 'completed':   return props.toolCall.isError ? '✗' : '✓'
    case 'failed':      return '✗'
    default:            return '⏸'
  }
})

const containerClass = computed(() => {
  const isRunning = props.toolCall.status === 'in_progress' || props.toolCall.status === 'pending'
  const isError   = props.toolCall.isError || props.toolCall.status === 'failed'
  if (isError)   return 'bg-red-50 border border-red-200 text-red-700'
  if (isRunning) return 'bg-blue-50 border border-blue-200 text-blue-700'
  if (props.toolCall.kind === 'edit' || props.toolCall.kind === 'delete')
    return 'bg-yellow-50 border border-yellow-200 text-yellow-800'
  return 'bg-green-50 border border-green-200 text-green-700'
})

const kindIcon     = computed(() => KIND_ICONS[props.toolCall.kind] ?? '🔧')
const displayTitle = computed(() => props.toolCall.title || props.toolCall.name)
const fullResult   = computed(() => props.toolCall.result ?? '')

// Only read tools with non-empty results can be expanded
const canExpand = computed(() =>
  props.toolCall.status === 'completed' &&
  props.toolCall.kind === 'read' &&
  !!fullResult.value
)

const summary = computed(() => {
  if (expanded.value) return ''
  const first = fullResult.value.split('\n')[0] ?? ''
  return first.length > 60 ? `${first.slice(0, 57)}...` : first
})
</script>
