<template>
  <div class="space-y-1.5">
    <div class="px-0.5">
      <div class="text-xs font-medium" :class="phaseTextClass">
        {{ phaseTitle }}
      </div>
      <div v-if="phaseSubtitle" class="mt-0.5 text-xs text-text-secondary">
        {{ phaseSubtitle }}
      </div>
    </div>

    <ProposalNavigator
      v-if="session.phase === 'review_ready' && session.proposals?.length"
      :proposals="session.proposals"
      :reviewed-entries="reviewedEntries"
      :review-summary="reviewSummary"
      :is-streaming="isStreaming"
      :session-mode="session.mode"
      @approve="$emit('approve', $event)"
      @edit-approve="$emit('editApprove', $event)"
      @approve-all="$emit('approveAll')"
      @rework="$emit('rework', $event)"
      @end-round="$emit('endRound', $event)"
    />

    <EditSummaryCard
      v-else-if="session.toolCalls?.length"
      :tool-calls="session.toolCalls"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EditSessionViewModel } from '@/ai/edit-session'
import type { ProposalReviewEntry, ProposalReviewSummary } from '@/ai/store/ai'
import EditSummaryCard from './EditSummaryCard.vue'
import ProposalNavigator from '../ProposalNavigator.vue'

const props = defineProps<{
  session: EditSessionViewModel
  isStreaming?: boolean
  reviewedEntries?: ProposalReviewEntry[]
  reviewSummary?: ProposalReviewSummary | null
}>()

defineEmits<{
  approve: [id: string]
  editApprove: [payload: { id: string; editedArgs: Record<string, unknown> }]
  approveAll: []
  rework: [payload: { id: string; reason: string }]
  endRound: [payload?: { id?: string }]
}>()

const phaseTitle = computed(() => {
  switch (props.session.phase) {
    case 'review_ready':
      if (props.session.mode === 'quick_fix') return '修正建议已就绪'
      if (props.session.mode === 'delete_review') return '删除建议已就绪'
      return '修改建议已就绪'
    case 'completed':
      if (props.session.mode === 'quick_fix') return '修正已应用'
      if (props.session.mode === 'delete_review') return '删除已应用'
      return '修改已应用'
    case 'cancelled':
      if (props.session.mode === 'quick_fix') return '修正已跳过'
      if (props.session.mode === 'delete_review') return '删除已跳过'
      return '修改已跳过'
    case 'failed':
      if (props.session.mode === 'quick_fix') return '修正应用失败'
      if (props.session.mode === 'delete_review') return '删除应用失败'
      return '修改应用失败'
    default:
      if (props.session.mode === 'quick_fix') return '修正已处理'
      if (props.session.mode === 'delete_review') return '删除已处理'
      return '修改已处理'
  }
})

const phaseSubtitle = computed(() => {
  if (props.session.phase === 'review_ready') {
    const total = props.session.proposals?.length ?? 0
    if (props.session.mode === 'quick_fix') {
      return total > 1 ? `请确认这 ${total} 处修正。` : '请确认当前修正。'
    }
    if (props.session.mode === 'delete_review') {
      return total > 1 ? `请确认这批 ${total} 处删除建议。` : '请确认当前删除建议。'
    }
    return total > 1 ? `请确认这批 ${total} 处修改建议。` : '请确认当前修改建议。'
  }

  const total = props.session.toolCalls?.length ?? 0
  if (!total) return ''

  switch (props.session.phase) {
    case 'completed':
      return total > 1 ? `本轮共应用 ${total} 处修改。` : '本轮修改已应用。'
    case 'cancelled':
      return total > 1 ? `本轮共跳过 ${total} 处修改。` : '本轮修改已跳过。'
    case 'failed':
      return total > 1 ? `本轮有 ${total} 处修改未成功应用。` : '本轮修改未成功应用。'
    default:
      return total > 1 ? `本轮共处理 ${total} 处修改。` : '本轮修改已处理。'
  }
})

const phaseTextClass = computed(() => {
  switch (props.session.phase) {
    case 'review_ready':
      return 'text-status-warning'
    case 'completed':
      return 'text-status-success'
    case 'cancelled':
      return 'text-text-primary'
    case 'failed':
      return 'text-status-error'
    default:
      return 'text-text-primary'
  }
})
</script>
