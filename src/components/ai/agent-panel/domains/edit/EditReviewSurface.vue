<template>
  <BlockEditReviewSurface
    v-if="showFallbackBlockEditReviewSurface"
    :proposals="aiStore.pendingEditProposals"
    :review-summary="aiStore.reviewBatchSummary"
    :is-streaming="aiStore.isStreaming"
    @approve="aiStore.approveEditProposal"
    @reject="({ id, message }) => aiStore.rejectEditProposal(id, message)"
    @edit-approve="({ id, editedArgs }) => aiStore.editAndApproveProposal(id, editedArgs)"
    @approve-all="aiStore.approveAllProposals"
    @reject-all="aiStore.rejectAllProposals"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { resolveProposalHostMessageId } from '@/ai/review/common/selectors'
import { useAiStore } from '@/ai/store/ai'
import BlockEditReviewSurface from '../../chat-area/BlockEditReviewSurface.vue'

const aiStore = useAiStore()

const showFallbackBlockEditReviewSurface = computed(() => {
  if (!aiStore.pendingEditProposals.length) return false

  const hostMessageId = resolveProposalHostMessageId({
    mode: aiStore.activeThread?.mode,
    persistedMessages: aiStore.persistedMessages,
    pendingProposals: aiStore.pendingEditProposals,
    isInterrupted: aiStore.isInterrupted,
    interruptedTurnId: aiStore.interruptedTurnId,
  })

  return !hostMessageId
})
</script>
