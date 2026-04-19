<template>
  <ProposalNavigator
    v-if="showFallbackProposalNavigator"
    :proposals="aiStore.pendingEditProposals"
    :reviewed-entries="aiStore.reviewedBatchEntries"
    :review-summary="aiStore.reviewBatchSummary"
    :is-streaming="aiStore.isStreaming"
    @approve="aiStore.approveEditProposal"
    @edit-approve="({ id, editedArgs }) => aiStore.editAndApproveProposal(id, editedArgs)"
    @approve-all="aiStore.approveAllProposals"
    @rework="({ id, reason }) => aiStore.requestProposalRework(id, reason)"
    @end-round="payload => aiStore.endReviewRound(payload?.id)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import { buildEditSessionForMessage } from '@/ai/edit-session'
import ProposalNavigator from '../../chat-area/ProposalNavigator.vue'

const aiStore = useAiStore()

const showFallbackProposalNavigator = computed(() => {
  if (!aiStore.pendingEditProposals.length) return false

  const hasInlineReviewSurface = aiStore.displayMessages.some(entry => {
    if (entry.message.role !== 'assistant') return false
    const session = buildEditSessionForMessage({
      message: entry.message,
      mode: aiStore.activeThread?.mode,
      pendingProposals: aiStore.pendingEditProposals,
      isInterrupted: aiStore.isInterrupted,
      interruptedTurnId: aiStore.interruptedTurnId,
      isLatestAssistantMessage: aiStore.latestPersistedAssistantMessageId === entry.message.id,
      assistantMessageIds: aiStore.persistedAssistantMessageIds,
      editToolCalls: entry.message.toolCalls?.filter(toolCall => toolCall.kind === 'edit') ?? [],
    })
    return session?.phase === 'review_ready'
  })

  return !hasInlineReviewSurface
})
</script>
