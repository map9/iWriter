<template>
  <div
    class="rounded overflow-hidden text-xs"
    :class="containerClass"
  >
    <!-- Header row (also acts as expand toggle when result exists and has more lines) -->
    <div
      class="flex items-center gap-2 px-2 py-1.5"
      :class="(showResult && hasMoreLines) ? 'cursor-pointer select-none' : ''"
      @click="showResult && hasMoreLines && (expanded = !expanded)"
    >
      <IconLoader2 v-if="isSpinning" class="flex-shrink-0 w-3 h-3 animate-spin" />
      <span v-else class="flex-shrink-0 leading-none">{{ statusIcon }}</span>

      <span class="flex-shrink-0 leading-none">{{ kindIcon }}</span>
      <span class="font-bold truncate">{{ displayTitle }}</span>
      <span v-if="paramsDisplay" class="truncate opacity-60 font-mono">{{ paramsDisplay }}</span>
      <span v-if="showResult && hasMoreLines" class="ml-auto flex-shrink-0 opacity-50 text-[10px]">
        {{ expanded ? '▲' : '▼' }}
      </span>
    </div>

    <!-- Result content: always shows up to 3 lines, expandable if more -->
    <div
      v-if="showResult"
      class="px-2.5 py-2 bg-white border-t border-gray-200 text-gray-700"
      :class="expanded ? 'overflow-auto max-h-52' : 'overflow-hidden'"
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
  if (props.toolCall.isError || props.toolCall.status === 'failed') return '✗'
  if (props.toolCall.status === 'completed') return '✓'
  return ''
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
const displayTitle = computed(() => {
  if (props.toolCall.name === 'execute') {
    const cmd = props.toolCall.arguments.command
    if (typeof cmd === 'string' && cmd) {
      return cmd.trimStart().split(/\s+/)[0]
    }
    return props.toolCall.name
  }
  return props.toolCall.title || props.toolCall.name
})
const fullResult   = computed(() => props.toolCall.result ?? '')

const paramsDisplay = computed((): string => {
  const args = props.toolCall.arguments
  const name = props.toolCall.name

  // filename from explicit arg, falling back to tc.file (snapshot-resolved path)
  const fname = (fp: unknown): string => {
    const path = (typeof fp === 'string' && fp) ? fp : (props.toolCall.file?.path ?? '')
    if (!path) return ''
    return path.split('/').pop() ?? path
  }
  // block id — returns empty string when value is undefined (e.g. during streaming)
  const bid = (val: unknown): string => val !== undefined && val !== null ? `{b:${val}}` : ''

  switch (name) {
    case 'execute': {
      const cmd = typeof args.command === 'string' ? args.command.trim() : ''
      const spaceIdx = cmd.search(/\s/)
      return spaceIdx >= 0 ? cmd.slice(spaceIdx + 1) : ''
    }
    case 'get_document_outline':
      return fname(args.file_path)
    case 'get_section':
      return [fname(args.file_path), bid(args.heading_block_id)].filter(Boolean).join(' ')
    case 'get_blocks': {
      const ids = Array.isArray(args.block_ids) ? args.block_ids : []
      return [fname(args.file_path), ids.map((id: unknown) => bid(id)).join(', ')].filter(Boolean).join(' ')
    }
    case 'get_block_context':
      return [fname(args.file_path), bid(args.block_id)].filter(Boolean).join(' ')
    case 'edit_block':
      return [fname(args.file_path), bid(args.block_id)].filter(Boolean).join(' ')
    case 'insert_block': {
      const f   = fname(args.file_path)
      const ref = args.after_block_id !== undefined ? `after ${bid(args.after_block_id)}`
        : args.end_block_id !== undefined ? `end ${bid(args.end_block_id)}` : ''
      return [f, ref].filter(Boolean).join(' ')
    }
    case 'delete_block':
      return [fname(args.file_path), bid(args.block_id)].filter(Boolean).join(' ')
    case 'replace_range': {
      const range = (args.start_block_id !== undefined && args.end_block_id !== undefined)
        ? `${bid(args.start_block_id)}–${bid(args.end_block_id)}`
        : ''
      return [fname(args.file_path), range].filter(Boolean).join(' ')
    }
    case 'create_document': return fname(args.file_path) || (typeof args.filename === 'string' ? args.filename : '')
    default: return ''
  }
})

const showResult    = computed(() => props.toolCall.status === 'completed' && !!fullResult.value)
const resultLines   = computed(() => fullResult.value.split('\n'))
const hasMoreLines  = computed(() => resultLines.value.length > 3)
const visibleResult = computed(() =>
  expanded.value ? fullResult.value : resultLines.value.slice(0, 3).join('\n')
)
</script>
