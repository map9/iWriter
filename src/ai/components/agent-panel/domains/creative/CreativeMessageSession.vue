<template>
  <CreativeSessionCard
    v-if="creativeSession"
    :session="creativeSession"
    :is-streaming="aiStore.isStreaming"
    class="mt-1.5"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AiToolCall, ThreadMessage } from '@/ai/types'
import { buildCreativeSessionViewModel } from '@/ai/review/domains/creative/creativeSelectors'
import { useAiStore } from '@/ai/state/aiStore'
import CreativeSessionCard from '../../chat-area/views/CreativeSessionCard.vue'

const props = defineProps<{
  message: ThreadMessage
  editToolCalls: AiToolCall[]
  creativeReviewToolCalls?: AiToolCall[]
  isLatestAssistantMessage: boolean
}>()

const aiStore = useAiStore()

const creativeSession = computed(() =>
  buildCreativeSessionViewModel({
    message: props.message,
    mode: aiStore.activeThread?.mode,
    persistedMessages: aiStore.persistedMessages,
    pendingCreativeReviews: aiStore.pendingCreativeReviews,
    isInterrupted: aiStore.isInterrupted,
    interruptedTurnId: aiStore.interruptedTurnId,
    isLatestAssistantMessage: props.isLatestAssistantMessage,
    assistantMessageIds: aiStore.persistedAssistantMessageIds,
  })
)
</script>
