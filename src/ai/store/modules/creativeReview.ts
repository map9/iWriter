import { ref, type ComputedRef, type Ref } from 'vue'
import type { AiThread, CreativeReviewItem, CreativeRoundResult, ThreadMessage } from '@/ai/types'
import type { ResumeDecision } from '@/ai/ipc'
import { buildCreativeRoundResult, mergeCreativeRoundResults, type CreativeReviewBatch } from '@/ai/review/creativeSelectors'
import { createCreativeThreadSync } from '@/ai/review/creativeThreadSync'
import type { ToolCallStatusOverrides } from '@/ai/message/display-normalizer'
import type { LiveTurn, ThreadRunState } from './runtimeState'

interface CreativeReviewModuleDeps {
  activeThread: ComputedRef<AiThread | null>
  pendingCreativeReviews: ComputedRef<CreativeReviewItem[]>
  interruptedThreadId: Ref<string | null>
  interruptedTurnId: Ref<string | null>
  threadRunState: Ref<ThreadRunState>
  currentThreadId: Ref<string | null>
  currentTurnId: Ref<string | null>
  liveTurnRef: Ref<LiveTurn | null>
  ensureLiveTurn: (params?: {
    threadId?: string | null
    turnId?: string | null
    state?: 'streaming' | 'interrupted' | 'resuming'
    startedAt?: number
  }) => LiveTurn | null
  updateThread: (thread: AiThread) => void
  normalizeMessagesForDisplay: (messages: ThreadMessage[]) => ThreadMessage[]
}

function argsForReview(review: CreativeReviewItem, editedArgs?: Record<string, unknown>): Record<string, unknown> {
  if (editedArgs) return editedArgs
  if (review.kind === 'creative_plan') {
    return {
      plan: review.plan,
      rationale: review.rationale,
      alternatives: review.alternatives,
      logicAudit: review.logicAudit,
    }
  }
  if (review.kind === 'creative_write') {
    return {
      filename: review.filename,
      mode: review.mode,
      content: review.newContent,
      approved_plan: review.approvedPlan,
      ...(review.insertAnchor !== undefined && { insert_anchor: review.insertAnchor }),
      ...(review.replaceStartAnchor !== undefined && { replace_start_anchor: review.replaceStartAnchor }),
      ...(review.replaceEndAnchor !== undefined && { replace_end_anchor: review.replaceEndAnchor }),
    }
  }
  if (review.kind === 'creative_chapter_structure') {
    if (review.toolName === 'create_chapter') {
      return {
        filename: review.filename,
        ...(review.afterFilename !== undefined && { after_filename: review.afterFilename }),
      }
    }
    if (review.toolName === 'delete_chapter') {
      return {
        filename: review.filename,
        ...(review.cascadeRenumber !== undefined && { cascade_renumber: review.cascadeRenumber }),
      }
    }
    if (review.toolName === 'rename_chapter') {
      return {
        filename: review.filename,
        new_filename: review.newFilename,
      }
    }
    return {
      order: review.order ?? [],
    }
  }
  if (review.toolName === 'resolve_open_question') {
    return {
      question: review.question,
      resolution: review.newContent,
      target_section: review.targetSection ?? review.section,
    }
  }
  if (review.toolName === 'replace_storybible_section') {
    return {
      section: review.section,
      content: review.newContent,
    }
  }
  return {
    content: review.newContent,
  }
}

function defaultRejectMessage(review: CreativeReviewItem): string {
  if (review.kind === 'creative_plan') {
    return 'The user rejected this writing plan. Do not write, do not call confirm_writing_plan again in this run, and do not automatically propose a replacement plan. Briefly acknowledge the rejection and ask what direction the user wants next.'
  }
  if (review.kind === 'creative_write') {
    return 'The user rejected this draft. Do not write to the chapter, do not retry the same draft, and do not automatically propose another draft. Briefly acknowledge the rejection and ask what should change.'
  }
  if (review.toolName === 'rebuild_storybible') {
    return 'The user rejected the StoryBible rebuild. Do not modify storybible.md and do not retry the rebuild. Briefly acknowledge the rejection.'
  }
  if (review.kind === 'creative_chapter_structure') {
    return 'The user rejected this chapter structure change. Do not modify draft chapter files or retry the same structure change automatically. Briefly acknowledge the rejection.'
  }
  return 'The user rejected this Creative tool call. Do not retry the same action automatically. Briefly acknowledge the rejection and wait for the user to redirect.'
}

function turnOutcomeKey(threadId: string, turnId: string | null | undefined): string | null {
  if (!threadId || !turnId) return null
  return `${threadId}:${turnId}`
}

export function createCreativeReviewModule(deps: CreativeReviewModuleDeps) {
  const interruptActionCount = ref(0)
  const isResumingCreativeReview = ref(false)
  const reviewBatch = ref<CreativeReviewBatch | null>(null)
  const pendingApplyBatch = ref<CreativeReviewBatch | null>(null)
  const completedRoundResults = ref<Record<string, CreativeRoundResult[]>>({})

  const threadSync = createCreativeThreadSync({
    activeThread: deps.activeThread,
    normalizeMessagesForDisplay: deps.normalizeMessagesForDisplay,
    updateThread: deps.updateThread,
    findReview: (reviewId: string) => findReview(reviewId),
  })

  function displayOverrides(): ToolCallStatusOverrides {
    return threadSync.displayOverrides()
  }

  function findReview(reviewId: string): CreativeReviewItem | undefined {
    const pending = deps.pendingCreativeReviews.value.find(r => r.id === reviewId)
    if (pending) return pending
    return reviewBatch.value?.reviewsById[reviewId]
  }

  function resetReviewState(options?: { clearLiveTurnReviews?: boolean }) {
    deps.interruptedThreadId.value = null
    deps.interruptedTurnId.value = null
    interruptActionCount.value = 0
    isResumingCreativeReview.value = false
    reviewBatch.value = null
    if (options?.clearLiveTurnReviews) {
      const liveTurn = deps.ensureLiveTurn()
      if (liveTurn) {
        liveTurn.creativeReviews = []
        deps.liveTurnRef.value = { ...liveTurn }
      }
    }
  }

  function rememberCompletedRoundResult(batch: CreativeReviewBatch | null) {
    if (!batch) return
    const key = turnOutcomeKey(batch.threadId, batch.turnId)
    const result = buildCreativeRoundResult(batch)
    if (!key || !result) return
    completedRoundResults.value = {
      ...completedRoundResults.value,
      [key]: [...(completedRoundResults.value[key] ?? []), result],
    }
  }

  function getCompletedCreativeRoundResult(
    threadId: string | null | undefined,
    turnId: string | null | undefined,
  ): CreativeRoundResult | null {
    const key = turnOutcomeKey(threadId ?? '', turnId)
    if (!key) return null
    return mergeCreativeRoundResults(completedRoundResults.value[key] ?? [])
  }

  function rejectAllPendingReviews() {
    if (!deps.pendingCreativeReviews.value.length && !interruptActionCount.value) return
    const threadId = deps.interruptedThreadId.value
    if (threadId && interruptActionCount.value > 0) {
      const decisions: ResumeDecision[] = Array.from(
        { length: interruptActionCount.value },
        () => ({ type: 'rejected' as const, message: 'User sent a new message' }),
      )
      window.electronAPI.aiResume?.({ threadId, decisions })
    }
    deps.threadRunState.value = 'idle'
    resetReviewState({ clearLiveTurnReviews: true })
  }

  function handleInterrupt(params: {
    threadId: string
    turnId: string | null
    reviews: CreativeReviewItem[]
  }) {
    deps.interruptedThreadId.value = params.threadId
    deps.interruptedTurnId.value = params.turnId ?? deps.currentTurnId.value
    interruptActionCount.value = params.reviews.length
    isResumingCreativeReview.value = false

    const liveTurn = deps.ensureLiveTurn({
      threadId: params.threadId,
      turnId: params.turnId,
      state: 'interrupted',
    })
    if (liveTurn) {
      liveTurn.creativeReviews = params.reviews
      deps.liveTurnRef.value = { ...liveTurn }
    }

    reviewBatch.value = {
      threadId: params.threadId,
      turnId: params.turnId ?? deps.currentTurnId.value,
      total: params.reviews.length,
      order: params.reviews.map(review => review.id),
      reviewsById: Object.fromEntries(params.reviews.map(review => [review.id, review])),
      decisionsById: {},
    }
  }

  function removePendingReview(reviewId: string) {
    const liveTurn = deps.ensureLiveTurn()
    if (!liveTurn) return
    liveTurn.creativeReviews = liveTurn.creativeReviews.filter(review => review.id !== reviewId)
    deps.liveTurnRef.value = { ...liveTurn }
  }

  async function maybeFlushResume() {
    const threadId = deps.interruptedThreadId.value
    const count = interruptActionCount.value
    const batch = reviewBatch.value
    if (!threadId || count === 0 || !batch || Object.keys(batch.decisionsById).length < count) return

    const decisions: ResumeDecision[] = batch.order.map(reviewId => {
      const review = batch.reviewsById[reviewId]
      const decision = batch.decisionsById[reviewId]
      if (!review || !decision) return { type: 'rejected', message: 'User rejected.' }
      if (decision.kind === 'approved') return { type: 'approved' }
      if (decision.kind === 'edited') {
        return {
          type: 'edited',
          editedArgs: argsForReview(review, decision.editedArgs),
        }
      }
      return {
        type: 'rejected',
        message: decision.message ?? defaultRejectMessage(review),
      }
    })

    deps.threadRunState.value = 'streaming'
    isResumingCreativeReview.value = true
    deps.currentThreadId.value = threadId
    deps.currentTurnId.value = deps.interruptedTurnId.value
    deps.ensureLiveTurn({
      threadId,
      turnId: deps.interruptedTurnId.value,
      state: 'resuming',
      startedAt: deps.liveTurnRef.value?.startedAt,
    })

    deps.interruptedThreadId.value = null
    deps.interruptedTurnId.value = null
    interruptActionCount.value = 0
    reviewBatch.value = null
    pendingApplyBatch.value = batch

    window.electronAPI.aiResume?.({ threadId, decisions })

    const liveTurn = deps.ensureLiveTurn({ threadId, state: 'resuming' })
    if (liveTurn) {
      liveTurn.creativeReviews = []
      deps.liveTurnRef.value = { ...liveTurn }
    }
  }

  async function approveCreativeReview(reviewId: string) {
    const review = findReview(reviewId)
    if (reviewBatch.value?.reviewsById[reviewId]) {
      reviewBatch.value.decisionsById[reviewId] = { kind: 'approved' }
    }
    if (review) threadSync.updateLocalCreativeToolCall(review, 'completed')
    removePendingReview(reviewId)
    await maybeFlushResume()
  }

  async function editAndApproveCreativeReview(reviewId: string, editedArgs: Record<string, unknown>) {
    const review = findReview(reviewId)
    if (reviewBatch.value?.reviewsById[reviewId]) {
      reviewBatch.value.decisionsById[reviewId] = { kind: 'edited', editedArgs }
    }
    if (review) threadSync.updateLocalCreativeToolCall(review, 'completed')
    removePendingReview(reviewId)
    await maybeFlushResume()
  }

  async function rejectCreativeReview(reviewId: string, message?: string) {
    const batch = reviewBatch.value
    const review = batch?.reviewsById[reviewId]
    if (review) {
      batch.decisionsById[reviewId] = { kind: 'rejected', message: message ?? defaultRejectMessage(review) }
      threadSync.updateLocalCreativeToolCall(review, 'rejected')
    }
    removePendingReview(reviewId)
    await maybeFlushResume()
  }

  async function approveAllCreativeReviews() {
    const ids = deps.pendingCreativeReviews.value.map(review => review.id)
    for (const id of ids) await approveCreativeReview(id)
  }

  function notifyCreativeToolResult(toolName: string, isError: boolean): void {
    if (!isError) return
    const batch = pendingApplyBatch.value
    if (!batch) return
    const reviewId = batch.order.find(id => {
      const review = batch.reviewsById[id]
      const decision = batch.decisionsById[id]
      return review?.toolName === toolName
        && decision?.kind !== 'rejected'
        && decision?.kind !== 'failed_to_apply'
    })
    if (!reviewId) return
    pendingApplyBatch.value = {
      ...batch,
      decisionsById: {
        ...batch.decisionsById,
        [reviewId]: { kind: 'failed_to_apply', message: 'The tool returned an error.' },
      },
    }
  }

  function finalizePendingCreativeApply(): void {
    if (!pendingApplyBatch.value) return
    rememberCompletedRoundResult(pendingApplyBatch.value)
    pendingApplyBatch.value = null
  }

  return {
    interruptActionCount,
    isResumingCreativeReview,
    completedRoundResults,
    getCompletedCreativeRoundResult,
    displayOverrides,
    handleInterrupt,
    resetReviewState,
    rejectAllPendingReviews,
    approveCreativeReview,
    editAndApproveCreativeReview,
    rejectCreativeReview,
    approveAllCreativeReviews,
    notifyCreativeToolResult,
    finalizePendingCreativeApply,
  }
}
