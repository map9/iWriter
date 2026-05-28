<template>
  <FilesystemReviewSurface v-if="aiStore.pendingFilesystemReviews.length" />
  <EditReviewSurface v-else-if="aiStore.pendingEditProposals.length" />
  <CreativeReviewSurface v-else-if="showFallbackCreativeReview" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import { buildCreativeSessionViewModel } from '@/ai/review/creativeSelectors'
import EditReviewSurface from './edit/EditReviewSurface.vue'
import CreativeReviewSurface from './creative/CreativeReviewSurface.vue'
import FilesystemReviewSurface from './FilesystemReviewSurface.vue'

const aiStore = useAiStore()

const showFallbackCreativeReview = computed(() => {
  if (!aiStore.pendingCreativeReviews.length) return false

  const hasHostMessage = aiStore.persistedMessages.some(message =>
    buildCreativeSessionViewModel({
      message,
      mode: aiStore.activeThread?.mode,
      persistedMessages: aiStore.persistedMessages,
      pendingCreativeReviews: aiStore.pendingCreativeReviews,
      isInterrupted: aiStore.isInterrupted,
      interruptedTurnId: aiStore.interruptedTurnId,
      isLatestAssistantMessage: aiStore.latestPersistedAssistantMessageId === message.id,
      assistantMessageIds: aiStore.persistedAssistantMessageIds,
    })?.kind === 'review_ready',
  )

  return !hasHostMessage
})
</script>
