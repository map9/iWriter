<template>
  <div class="space-y-1.5">
    <ProposalNavigator
      v-if="session.kind === 'proposal_review' && session.proposals.length"
      :proposals="session.proposals"
      :review-summary="reviewSummary"
      :is-streaming="isStreaming"
      @approve="$emit('approve', $event)"
      @reject="$emit('reject', $event)"
      @edit-approve="$emit('editApprove', $event)"
      @approve-all="$emit('approveAll')"
      @skip-remaining="$emit('skipRemaining')"
      @rework="$emit('rework', $event)"
      @end-round="$emit('endRound', $event)"
    />

    <EditSummaryCard
      v-else-if="session.kind === 'tool_summary'"
      :result="session.result"
    />
  </div>
</template>

<script setup lang="ts">
import type { EditSessionViewModel } from '@/ai/review/types'
import type { ProposalReviewSummary } from '@/ai/store/ai'
import EditSummaryCard from './EditSummaryCard.vue'
import ProposalNavigator from '../ProposalNavigator.vue'

defineProps<{
  session: EditSessionViewModel
  isStreaming?: boolean
  reviewSummary?: ProposalReviewSummary | null
}>()

defineEmits<{
  approve: [id: string]
  reject: [payload: { id: string; message?: string }]
  editApprove: [payload: { id: string; editedArgs: Record<string, unknown> }]
  approveAll: []
  skipRemaining: []
  rework: [payload: { id: string; reason: string }]
  endRound: [payload?: { id?: string }]
}>()

</script>
