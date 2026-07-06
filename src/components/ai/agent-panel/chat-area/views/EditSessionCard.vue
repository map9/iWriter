<template>
  <div class="space-y-1.5">
    <BlockEditReviewSurface
      v-if="session.kind === 'proposal_review' && session.proposals.length"
      :proposals="session.proposals"
      :review-summary="reviewSummary"
      :is-streaming="isStreaming"
      @approve="$emit('approve', $event)"
      @reject="$emit('reject', $event)"
      @edit-approve="$emit('editApprove', $event)"
      @approve-all="$emit('approveAll')"
      @reject-all="$emit('rejectAll')"
    />

    <EditSummaryCard
      v-else-if="session.kind === 'tool_summary'"
      :result="session.result"
    />
  </div>
</template>

<script setup lang="ts">
import type { EditSessionViewModel } from '@/ai/review/common/types'
import type { ProposalReviewSummary } from '@/ai/store/ai'
import EditSummaryCard from './EditSummaryCard.vue'
import BlockEditReviewSurface from '../BlockEditReviewSurface.vue'

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
  rejectAll: []
}>()

</script>
