<template>
  <template v-if="activeDomain === 'editing'">
    <EditMessageSession
      :message="message"
      :edit-tool-calls="editToolCalls"
      :is-latest-assistant-message="isLatestAssistantMessage"
      :is-preview="isPreview"
    />
  </template>
  <template v-else>
    <CreativeMessageSession
      :message="message"
      :edit-tool-calls="editToolCalls"
      :creative-review-tool-calls="creativeReviewToolCalls"
      :is-latest-assistant-message="isLatestAssistantMessage"
    />
    <EditMessageSession
      :message="message"
      :edit-tool-calls="editToolCalls"
      :is-latest-assistant-message="isLatestAssistantMessage"
    />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AiAgentDomain, AiToolCall, ThreadMessage } from '@shared/ai/contracts'
import { useAiStore } from '@/ai/state/aiStore'
import EditMessageSession from './edit/EditMessageSession.vue'
import CreativeMessageSession from './creative/CreativeMessageSession.vue'

defineProps<{
  message: ThreadMessage
  editToolCalls: AiToolCall[]
  creativeReviewToolCalls?: AiToolCall[]
  isLatestAssistantMessage: boolean
  isPreview?: boolean
}>()

const aiStore = useAiStore()

const activeDomain = computed<AiAgentDomain>(() => aiStore.activeThread?.domain ?? 'editing')
</script>
