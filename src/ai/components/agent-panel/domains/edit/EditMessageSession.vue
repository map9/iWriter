<template>
  <EditSessionCard
    v-if="editSession"
    :session="editSession"
    :is-streaming="aiStore.isStreaming"
    :review-summary="aiStore.reviewBatchSummary"
    class="mt-1.5"
    @approve="aiStore.approveEditProposal"
    @reject="({ id, message }) => aiStore.rejectEditProposal(id, message)"
    @edit-approve="({ id, editedArgs }) => aiStore.editAndApproveProposal(id, editedArgs)"
    @approve-all="aiStore.approveAllProposals"
    @reject-all="aiStore.rejectAllProposals"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AiToolCall, ThreadMessage } from '@shared/ai/contracts'
import { buildEditSessionViewModel } from '@/ai/review/common/selectors'
import { useAiStore } from '@/ai/state/aiStore'
import EditSessionCard from '../../chat-area/views/EditSessionCard.vue'

const props = defineProps<{
  message: ThreadMessage
  editToolCalls: AiToolCall[]
  isLatestAssistantMessage: boolean
  isPreview?: boolean
}>()

const aiStore = useAiStore()

const editSession = computed(() =>
  props.isPreview
    ? null
    :
  buildEditSessionViewModel({
    message: props.message,
    mode: aiStore.activeThread?.mode,
    persistedMessages: aiStore.persistedMessages,
    pendingProposals: aiStore.pendingEditProposals,
    isInterrupted: aiStore.isInterrupted,
    interruptedTurnId: aiStore.interruptedTurnId,
    isLatestAssistantMessage: props.isLatestAssistantMessage,
    assistantMessageIds: aiStore.persistedAssistantMessageIds,
    editToolCalls: props.editToolCalls,
  })
)
</script>
