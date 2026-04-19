<template>
  <div v-if="false" />
</template>

<script setup lang="ts">
import type { AiToolCall, ThreadMessage } from '@/ai/types'

defineProps<{
  message: ThreadMessage
  editToolCalls: AiToolCall[]
  isLatestAssistantMessage: boolean
}>()
</script>
