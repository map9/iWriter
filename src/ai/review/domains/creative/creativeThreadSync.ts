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
  if (review.kind === 'creative_write') {
    return `write_to_chapter:${stableStringify({ filename: review.filename, mode: review.mode })}`
  }
  if (review.kind === 'creative_chapter_structure') {
    return `${review.toolName}:${stableStringify({ filename: review.filename ?? null, order: review.order ?? null })}`
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
  if (review.kind === 'creative_git_restore') {
    return `git_restore:${stableStringify({ files: review.files, ref: review.ref ?? null })}`
  }
  if (review.kind === 'creative_exploration_start') {
    return `start_exploration:${stableStringify({ context: review.context })}`
  }
  if (review.kind === 'creative_exploration_compare') {
    return `finish_exploration:${stableStringify({})}`
  }
  if (review.kind === 'creative_exploration_merge') {
    return `promote_exploration:${stableStringify({ direction_name: review.directionName, target_chapter: review.targetChapter, mode: review.mode })}`
  }
  if (review.kind === 'creative_exploration_delete') {
    return `delete_exploration:${stableStringify({ direction_name: review.directionName })}`
  }
  if (review.kind === 'creative_compress') {
    return `compress_storybible_history:${stableStringify({ completed_chapters: review.completedChapters })}`
  }
  if (review.toolName === 'replace_storybible_section') {
    return `replace_storybible_section:${stableStringify({ section: review.section ?? null })}`
  }
  return `rebuild_storybible:${stableStringify({})}`
}

function reviewMatchesToolCall(review: CreativeReviewItem, toolCall: AiToolCall): boolean {
  if (toolCall.id === review.toolCallId) return true
  if (toolCall.name !== review.toolName) return false

  const args = toolCall.arguments
  if (review.kind === 'creative_write') {
    return String(args.filename ?? '') === String(review.filename ?? '')
      && String(args.mode ?? '') === String(review.mode ?? '')
  }
  if (review.kind === 'creative_storybible' && review.toolName === 'replace_storybible_section') {
    return String(args.section ?? '') === String(review.section ?? '')
  }
  if (review.kind === 'creative_git_tag') {
    return String(args.name ?? '') === String(review.name ?? '')
  }
  if (review.kind === 'creative_exploration_merge') {
    return String(args.direction_name ?? '') === String(review.directionName ?? '')
      && String(args.target_chapter ?? '') === String(review.targetChapter ?? '')
  }
  if (review.kind === 'creative_exploration_delete') {
    return String(args.direction_name ?? '') === String(review.directionName ?? '')
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
