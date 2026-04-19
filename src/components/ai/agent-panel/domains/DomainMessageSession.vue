<template>
  <EditMessageSession
    v-if="activeDomain === 'editing'"
    :message="message"
    :edit-tool-calls="editToolCalls"
    :is-latest-assistant-message="isLatestAssistantMessage"
  />
  <CreativeMessageSession
    v-else
    :message="message"
    :edit-tool-calls="editToolCalls"
    :is-latest-assistant-message="isLatestAssistantMessage"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AiAgentDomain, AiToolCall, ThreadMessage } from '@/ai/types'
import { useAiStore } from '@/ai/store/ai'
import EditMessageSession from './edit/EditMessageSession.vue'
import CreativeMessageSession from './creative/CreativeMessageSession.vue'

defineProps<{
  message: ThreadMessage
  editToolCalls: AiToolCall[]
  isLatestAssistantMessage: boolean
}>()

const aiStore = useAiStore()

const activeDomain = computed<AiAgentDomain>(() => aiStore.activeThread?.domain ?? 'editing')
</script>
