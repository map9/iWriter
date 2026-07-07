import { ref, type ComputedRef } from 'vue'
import type { AiThread, AiToolCall, CreativeReviewItem, ThreadMessage } from '@/ai/types'
import { stableStringify, toolCallSignature, type ToolCallStatusOverrides } from '@/ai/message/display-normalizer'

interface CreativeThreadSyncDeps {
  activeThread: ComputedRef<AiThread | null>
  normalizeMessagesForDisplay: (messages: ThreadMessage[]) => ThreadMessage[]
  updateThread: (thread: AiThread) => void
  findReview: (reviewId: string) => CreativeReviewItem | undefined
}

function creativeToolSignature(review: CreativeReviewItem): string {
  if (review.kind === 'creative_plan') {
    return `confirm_writing_plan:${stableStringify({ plan: review.plan })}`
  }
  if (review.kind === 'creative_git_commit') {
    return `git_commit:${stableStringify({ message: review.message, files: review.files })}`
  }
  if (review.kind === 'creative_git_tag') {
    return `git_tag:${stableStringify({ name: review.name })}`
  }
  if (review.kind === 'creative_git_init') {
    return `git_init:${stableStringify({})}`
  }
  return `git_restore:${stableStringify({ files: review.files, ref: review.ref ?? null })}`
}

function reviewMatchesToolCall(review: CreativeReviewItem, toolCall: AiToolCall): boolean {
  if (toolCall.id === review.toolCallId) return true
  if (toolCall.name !== review.toolName) return false

  const args = toolCall.arguments
  if (review.kind === 'creative_git_tag') {
    return String(args.name ?? '') === String(review.name ?? '')
  }
  return true
}

export function createCreativeThreadSync(deps: CreativeThreadSyncDeps) {
  const reviewedCreativeToolCallStatuses = ref<Record<string, AiToolCall['status']>>({})
  const reviewedCreativeSignatures = ref<Record<string, AiToolCall['status']>>({})

  function displayOverrides(): ToolCallStatusOverrides {
    return {
      byId: reviewedCreativeToolCallStatuses.value,
      bySignature: reviewedCreativeSignatures.value,
    }
  }

  function updateLocalCreativeToolCall(
    reviewOrId: CreativeReviewItem | string,
    status: AiToolCall['status'],
  ) {
    const review = typeof reviewOrId === 'string'
      ? deps.findReview(reviewOrId)
      : reviewOrId
    if (!review) return

    const signature = creativeToolSignature(review)
    const toolCallId = review.toolCallId

    if (toolCallId && reviewedCreativeToolCallStatuses.value[toolCallId] !== status) {
      reviewedCreativeToolCallStatuses.value = {
        ...reviewedCreativeToolCallStatuses.value,
        [toolCallId]: status,
      }
    }
    if (reviewedCreativeSignatures.value[signature] !== status) {
      reviewedCreativeSignatures.value = {
        ...reviewedCreativeSignatures.value,
        [signature]: status,
      }
    }

    const thread = deps.activeThread.value
    if (!thread?.messages?.length) return

    const hasSourceMessage = !!review.sourceMessageId
      && thread.messages.some(m => m.id === review.sourceMessageId)

    const messages = thread.messages.map(message => {
      if (hasSourceMessage && message.id !== review.sourceMessageId) return message
      if (!message.toolCalls?.length) return message
      return {
        ...message,
        toolCalls: message.toolCalls.map(tc => {
          const isMatch =
            tc.id === toolCallId
            || toolCallSignature(tc) === signature
            || reviewMatchesToolCall(review, tc)
          return isMatch ? { ...tc, status } : tc
        }),
      }
    })
    deps.updateThread({ ...thread, messages: deps.normalizeMessagesForDisplay(messages) })
  }

  return {
    reviewedCreativeToolCallStatuses,
    reviewedCreativeSignatures,
    displayOverrides,
    updateLocalCreativeToolCall,
  }
}
