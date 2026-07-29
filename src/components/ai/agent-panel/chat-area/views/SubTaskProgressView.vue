<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconLoader2, IconChevronDown, IconChevronUp, IconUsers } from '@tabler/icons-vue'
import type { AiSubTaskProgress, MessageContentBlock } from '@/ai/types'
import ToolCallCard from './ToolCallCard.vue'
import MarkdownContentView from './MarkdownContentView.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import { toolGroupPosition } from './toolGroupPosition'
import { kindToIcon } from './toolKindIcon'
import { normalizeToolCallForDisplay } from '@/ai/message/display-normalizer'

const props = defineProps<{
  subTask: AiSubTaskProgress
  groupPosition?: 'single' | 'start' | 'middle' | 'end'
}>()

const { t, te } = useI18n()
const expanded = ref(false)

const groupContainerClass = computed(() => {
  switch (props.groupPosition) {
    case 'start': return 'rounded-t-box rounded-b-none border-b-0'
    case 'middle': return 'rounded-none border-t-0 border-b-0'
    case 'end': return 'rounded-b-box rounded-t-none border-t-0 shadow-sm'
    default: return 'rounded-box'
  }
})

const isSpinning = computed(() =>
  props.subTask.status === 'pending' || props.subTask.status === 'running',
)

const statusIcon = computed(() => {
  switch (props.subTask.status) {
    case 'done': return '✓'
    case 'error': return '!'
    case 'cancelled': return '×'
    case 'awaiting_approval': return '…'
    default: return ''
  }
})

const statusText = computed(() => {
  return t(`agentPanel.subTask.status.${props.subTask.status}`)
})

const subTaskLabel = computed(() => {
  const name = props.subTask.name
  const key = `agentPanel.subTask.names.${name}`
  if (te(key)) return t(key)
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
})

const activeToolCall = computed(() => {
  const tools = props.subTask.toolCalls ?? []
  return tools.find(tc => tc.status === 'in_progress')
    ?? tools.find(tc => tc.status === 'pending')
    ?? null
})

const normalizedActiveToolCall = computed(() =>
  activeToolCall.value ? normalizeToolCallForDisplay(activeToolCall.value) : null,
)

const activeKindIcon = computed(() =>
  normalizedActiveToolCall.value ? kindToIcon(normalizedActiveToolCall.value.kind) : null,
)

const activeActionLabel = computed(() => {
  const tc = normalizedActiveToolCall.value
  if (!tc) return ''
  return tc.display?.actionLabel || tc.title || tc.name
})

const activeTargetLabel = computed(() => normalizedActiveToolCall.value?.display?.targetLabel ?? '')

const hasBody = computed(() =>
  !!(
    props.subTask.contentBlocks?.length ||
    props.subTask.toolCalls?.length ||
    props.subTask.text ||
    props.subTask.thinkingText ||
    (props.subTask.status === 'error' && props.subTask.errorText)
  ),
)

const visibleBlocks = computed(() => props.subTask.contentBlocks ?? [])

function toolCallForId(id: string) {
  return props.subTask.toolCalls.find(tc => tc.id === id)
}

function isToolBlock(block: MessageContentBlock | undefined): boolean {
  return block?.type === 'tool_call'
}

function blockToolPosition(idx: number): 'single' | 'start' | 'middle' | 'end' {
  return toolGroupPosition(
    isToolBlock(visibleBlocks.value[idx - 1]),
    isToolBlock(visibleBlocks.value[idx + 1]),
  )
}

function blockMarginClass(idx: number): string {
  return isToolBlock(visibleBlocks.value[idx - 1]) ? 'mt-0' : idx > 0 ? 'mt-1' : ''
}

function fallbackToolPosition(idx: number): 'single' | 'start' | 'middle' | 'end' {
  return toolGroupPosition(idx > 0, idx < props.subTask.toolCalls.length - 1)
}
</script>

<template>
  <div class="overflow-hidden text-xs border border-base-300 bg-base-100 text-base-content transition-colors" :class="groupContainerClass">
    <!-- Header -->
    <div
      class="group flex items-center gap-2.5 px-2 py-0.5 cursor-pointer select-none"
      @click="expanded = !expanded"
    >
      <div class="w-3.5 shrink-0 flex items-center justify-center">
        <IconLoader2 v-if="isSpinning" class="icon-2xs animate-spin" />
        <span v-else class="leading-none">{{ statusIcon }}</span>
      </div>

      <IconUsers class="icon-2xs shrink-0 opacity-70" />

      <div class="shrink-0 font-semibold text-xs leading-4 whitespace-nowrap">
        {{ subTaskLabel }}
      </div>

      <template v-if="activeToolCall">
        <component :is="activeKindIcon" class="icon-2xs shrink-0 opacity-70" />
        <div class="shrink-0 text-xs leading-4 whitespace-nowrap">
          {{ activeActionLabel }}
        </div>
        <div class="min-w-0 flex-1 text-2xs leading-4 truncate text-base-content/50">
          {{ activeTargetLabel }}
        </div>
      </template>
      <template v-else>
        <div class="min-w-0 flex-1 text-2xs leading-4 truncate text-base-content/50">
          {{ statusText }}
        </div>
      </template>

      <button
        v-if="hasBody"
        class="btn btn-ghost btn-square btn-xs opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-transparent"
        :title="expanded ? t('agentPanel.common.collapse') : t('agentPanel.common.expandDetails')"
        @click.stop="expanded = !expanded"
      >
        <IconChevronDown v-if="expanded" class="icon-2xs" />
        <IconChevronUp v-else class="icon-2xs" />
      </button>
    </div>

    <!-- Body -->
    <div
      v-if="expanded && hasBody"
      class="border-t border-base-300 px-2.5 py-2"
    >
      <!-- contentBlocks path: interleaved text + tool_calls in stream order -->
      <template v-if="visibleBlocks.length">
        <template v-for="(block, idx) in visibleBlocks" :key="idx">
          <MarkdownContentView
            v-if="block.type === 'text' && block.text"
            :content="block.text"
            mode="markdown"
            size="xs"
            class="text-base-content/90"
            :class="idx > 0 ? 'mt-1' : ''"
          />
          <ToolCallCard
            v-else-if="block.type === 'tool_call' && block.toolCallId && toolCallForId(block.toolCallId)"
            :tool-call="toolCallForId(block.toolCallId)!"
            :group-position="blockToolPosition(idx)"
            class="w-full"
            :class="blockMarginClass(idx)"
          />
        </template>
      </template>

      <!-- Fallback: flat text then grouped tool_calls -->
      <template v-else>
        <MarkdownContentView
          v-if="subTask.text"
          :content="subTask.text"
          mode="markdown"
          size="xs"
          class="text-base-content/90"
        />
        <ToolCallCard
          v-for="(tc, idx) in subTask.toolCalls"
          :key="tc.id"
          :tool-call="tc"
          :group-position="fallbackToolPosition(idx)"
          class="w-full"
          :class="idx > 0 ? 'mt-0' : subTask.text ? 'mt-1' : ''"
        />
      </template>

      <!-- Thinking -->
      <ThinkingBlock
        v-if="subTask.thinkingText"
        :content="subTask.thinkingText"
        size="xs"
        class="mt-1"
      />

      <!-- Error -->
      <div
        v-if="subTask.status === 'error' && subTask.errorText"
        class="mt-1 text-xs text-error-content/80"
      >{{ subTask.errorText }}</div>
    </div>
  </div>
</template>
