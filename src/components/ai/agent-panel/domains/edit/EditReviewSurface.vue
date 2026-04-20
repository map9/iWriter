<template>
  <ProposalNavigator
    v-if="showFallbackProposalNavigator"
    :proposals="aiStore.pendingEditProposals"
    :review-summary="aiStore.reviewBatchSummary"
    :is-streaming="aiStore.isStreaming"
    @approve="aiStore.approveEditProposal"
    @reject="({ id, message }) => aiStore.rejectEditProposal(id, message)"
    @edit-approve="({ id, editedArgs }) => aiStore.editAndApproveProposal(id, editedArgs)"
    @approve-all="aiStore.approveAllProposals"
    @skip-remaining="aiStore.skipRemainingProposalsAndContinue"
    @rework="({ id, reason }) => aiStore.requestProposalRework(id, reason)"
    @end-round="payload => aiStore.endReviewRound(payload?.id)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildEditSessionViewModel } from '@/ai/review/selectors'
import { useAiStore } from '@/ai/store/ai'
import ProposalNavigator from '../../chat-area/ProposalNavigator.vue'

const aiStore = useAiStore()

const showFallbackProposalNavigator = computed(() => {
  if (!aiStore.pendingEditProposals.length) return false

  const hasInlineReviewSurface = aiStore.displayMessages.some(entry => {
    if (entry.message.role !== 'assistant') return false
    const session = buildEditSessionViewModel({
      message: entry.message,
      mode: aiStore.activeThread?.mode,
      pendingProposals: aiStore.pendingEditProposals,
      isInterrupted: aiStore.isInterrupted,
      interruptedTurnId: aiStore.interruptedTurnId,
      isLatestAssistantMessage: aiStore.latestPersistedAssistantMessageId === entry.message.id,
      assistantMessageIds: aiStore.persistedAssistantMessageIds,
      editToolCalls: entry.message.toolCalls?.filter(toolCall => toolCall.kind === 'edit') ?? [],
    })
    return session?.kind === 'proposal_review'
  })

  return !hasInlineReviewSurface
})
</script>
