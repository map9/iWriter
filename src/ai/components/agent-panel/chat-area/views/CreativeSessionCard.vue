<template>
  <div class="space-y-1.5">
    <CreativeReviewSurface
      v-if="session.kind === 'review_ready'"
      class="mx-0"
    />
    <CreativeSummaryCard
      v-else-if="session.kind === 'tool_summary'"
      :result="session.result"
    />
  </div>
</template>

<script setup lang="ts">
import type { CreativeSessionViewModel } from '@/ai/review/domains/creative/creativeSelectors'
import CreativeReviewSurface from '../../domains/creative/CreativeReviewSurface.vue'
import CreativeSummaryCard from './CreativeSummaryCard.vue'

defineProps<{
  session: CreativeSessionViewModel
  isStreaming?: boolean
}>()
</script>
