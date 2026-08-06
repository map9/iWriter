<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconLoader2,
} from '@tabler/icons-vue'
import type { AiContextCompressionEvent } from '@/ai/types'
import MarkdownContentView from './MarkdownContentView.vue'

const props = withDefaults(defineProps<{
  event: AiContextCompressionEvent
  showTimestamp?: boolean
}>(), {
  showTimestamp: false,
})

const { t, locale } = useI18n()
const expanded = ref(false)

const isExpandable = computed(() => props.event.status !== 'compressing')

const title = computed(() => {
  switch (props.event.status) {
    case 'completed': return t('agentPanel.chatArea.contextCompressionCompleted')
    case 'failed': return t('agentPanel.chatArea.contextCompressionFailed')
    default: return t('agentPanel.chatArea.contextCompressing')
  }
})

const displayTimestamp = computed(() =>
  props.event.status === 'compressing' ? props.event.startedAt : props.event.timestamp,
)

const formattedTime = computed(() => new Date(displayTimestamp.value).toLocaleTimeString(
  locale.value,
  { hour: '2-digit', minute: '2-digit' },
))

function toggleExpanded() {
  if (!isExpandable.value) return
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="min-w-0">
    <div
      data-testid="context-compression-card"
      class="overflow-hidden rounded-box border border-base-300 bg-base-100 text-xs text-base-content"
      role="status"
    >
      <button
        type="button"
        class="group flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        :class="isExpandable ? 'cursor-pointer' : 'cursor-default'"
        :aria-expanded="isExpandable ? expanded : undefined"
        @click="toggleExpanded"
      >
        <span class="flex w-3.5 shrink-0 items-center justify-center">
          <IconLoader2
            v-if="event.status === 'compressing'"
            class="icon-2xs animate-spin"
          />
          <IconCheck
            v-else-if="event.status === 'completed'"
            class="icon-2xs text-success"
          />
          <IconAlertCircle v-else class="icon-2xs text-error" />
        </span>

        <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/60">
          {{ title }}
        </span>

        <span
          v-if="isExpandable"
          class="btn btn-ghost btn-square btn-xs pointer-events-none opacity-0 transition-opacity group-hover:opacity-100"
        >
          <IconChevronUp v-if="expanded" class="icon-2xs" />
          <IconChevronDown v-else class="icon-2xs" />
        </span>
      </button>

      <div
        v-if="expanded && isExpandable"
        data-testid="context-compression-details"
        class="space-y-2 border-t border-base-300 bg-base-100 px-2.5 py-2"
      >
        <div v-if="event.summary" class="space-y-1">
          <div class="text-2xs font-medium text-base-content/55">
            {{ t('agentPanel.chatArea.contextCompressionSummary') }}
          </div>
          <MarkdownContentView
            :content="event.summary"
            mode="markdown"
            size="xs"
            class="text-base-content/90"
          />
        </div>

        <div v-if="event.filePath" class="space-y-1">
          <div class="text-2xs font-medium text-base-content/55">
            {{ t('agentPanel.chatArea.contextCompressionFilePath') }}
          </div>
          <code class="block break-all rounded-field bg-base-200 px-2 py-1 text-2xs">
            {{ event.filePath }}
          </code>
        </div>

        <div v-if="event.error" class="rounded-field bg-error/10 px-2 py-1 text-error-content">
          {{ event.error }}
        </div>

        <div class="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-base-content/50">
          <span v-if="!showTimestamp">
            {{ t('agentPanel.chatArea.contextCompressionTime', { time: formattedTime }) }}
          </span>
          <span v-if="event.compressedMessageCount !== undefined">
            {{ t('agentPanel.chatArea.contextCompressionMessageCount', { count: event.compressedMessageCount }) }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="showTimestamp"
      data-testid="context-compression-timestamp"
      class="h-5 mt-1 flex items-center justify-start"
    >
      <div class="text-xs text-base-content whitespace-nowrap">
        {{ formattedTime }}
      </div>
    </div>
  </div>
</template>
