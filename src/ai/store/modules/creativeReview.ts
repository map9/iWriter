import { ref, toRaw, type ComputedRef, type Ref } from 'vue'
import type { AiThread, CreativeReviewItem, CreativeRoundResult, ThreadMessage } from '@/ai/types'
import type { ResumeDecision, DomainReviewItem } from '@/ai/ipc'
import { buildCreativeRoundResult, mergeCreativeRoundResults, type CreativeReviewBatch } from '@/ai/review/domains/creative/creativeSelectors'
import { createCreativeThreadSync } from '@/ai/review/domains/creative/creativeThreadSync'
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
    return { plan: review.plan }
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
  if (review.kind === 'creative_git_commit') {
    return {
      message: review.message,
      files: review.files,
    }
  }
  if (review.kind === 'creative_git_tag') {
    return {
      name: review.name,
      ...(review.message !== undefined && { message: review.message }),
    }
  }
  if (review.kind === 'creative_git_init') {
    return {}
  }
  if (review.kind === 'creative_git_restore') {
    return {
      files: review.files,
      ...(review.ref !== undefined && { ref: review.ref }),
    }
  }
  if (review.kind === 'creative_exploration_start') {
    return {
      context: review.context,
      directions: review.directions,
    }
  }
  if (review.kind === 'creative_exploration_compare') {
    return {
      comparison_report: review.comparisonReport,
      ...(review.directionSummaries !== undefined && {
        direction_summaries: review.directionSummaries.map(direction => ({
          name: direction.name,
          summary: direction.summary,
          narrative_consequences: direction.narrativeConsequences,
        })),
      }),
    }
  }
  if (review.kind === 'creative_exploration_merge') {
    return {
      direction_name: review.directionName,
      target_chapter: review.targetChapter,
      mode: review.mode,
      ...(review.newContent !== undefined && { content: review.newContent }),
    }
  }
  if (review.kind === 'creative_exploration_delete') {
    return {
      direction_name: review.directionName,
    }
  }
  if (review.kind === 'creative_compress') {
    return {
      completed_chapters: review.completedChapters,
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
  if (review.kind === 'creative_git_commit' || review.kind === 'creative_git_tag') {
    return 'The user rejected this git checkpoint. Do not commit or tag, and do not retry the same git action automatically. Briefly acknowledge the rejection.'
  }
  if (review.kind === 'creative_git_init') {
    return 'The user declined to initialize a git repository. Do not call git_init again automatically. Continue without version tracking and briefly acknowledge.'
  }
  if (review.kind === 'creative_git_restore') {
    return 'The user rejected this git restore. Do not restore files or retry the same restore automatically. Briefly acknowledge the rejection.'
  }
  if (review.kind.startsWith('creative_exploration')) {
    return 'The user rejected this exploration action. Do not modify exploration or draft files, and do not retry the same action automatically. Briefly acknowledge the rejection.'
  }
  if (review.kind === 'creative_compress') {
    return 'The user rejected StoryBible compression. Do not modify storybible.md and do not retry compression automatically. Briefly acknowledge the rejection.'
  }
  return 'The user rejected this Creative tool call. Do not retry the same action automatically. Briefly acknowledge the rejection and wait for the user to redirect.'
}

function turnOutcomeKey(threadId: string, turnId: string | null | undefined): string | null {
  if (!threadId || !turnId) return null
  return `${threadId}:${turnId}`
}

function toIpcCloneableValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  const raw = toRaw(value)
  if (raw === null || typeof raw !== 'object') return raw

  if (seen.has(raw)) return seen.get(raw)

  if (Array.isArray(raw)) {
    const copy: unknown[] = []
    seen.set(raw, copy)
    for (const item of raw) copy.push(toIpcCloneableValue(item, seen))
    return copy
  }

  if (raw instanceof Date) return new Date(raw)

  if (raw instanceof Map) {
    const copy: Record<string, unknown> = {}
    seen.set(raw, copy)
    for (const [key, child] of raw.entries()) {
      copy[String(key)] = toIpcCloneableValue(child, seen)
    }
    return copy
  }

  if (raw instanceof Set) {
    const copy: unknown[] = []
    seen.set(raw, copy)
    for (const item of raw.values()) copy.push(toIpcCloneableValue(item, seen))
    return copy
  }

  const copy: Record<string, unknown> = {}
  seen.set(raw, copy)
  for (const [key, child] of Object.entries(raw)) {
    copy[key] = toIpcCloneableValue(child, seen)
  }
  return copy
}

function toIpcCloneableArgs(args: Record<string, unknown>): Record<string, unknown> {
  return toIpcCloneableValue(args) as Record<string, unknown>
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
        liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'creative')
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
      liveTurn.reviews = params.reviews.map((r): DomainReviewItem => ({ kind: 'creative', payload: r }))
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
    liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'creative' || r.payload.id !== reviewId)
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
          editedArgs: toIpcCloneableArgs(argsForReview(review, decision.editedArgs)),
        }
      }
      if (decision.kind === 'responded') {
        return { type: 'responded', message: decision.message }
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
      liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'creative')
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
      reviewBatch.value.decisionsById[reviewId] = { kind: 'edited', editedArgs: toIpcCloneableArgs(editedArgs) }
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

  async function respondCreativeReview(reviewId: string, message: string) {
    const batch = reviewBatch.value
    const review = batch?.reviewsById[reviewId]
    if (!review || !message.trim()) return
    batch.decisionsById[reviewId] = { kind: 'responded', message: message.trim() }
    threadSync.updateLocalCreativeToolCall(review, 'rejected')
    removePendingReview(reviewId)
    await maybeFlushResume()
  }

  async function approveAllCreativeReviews() {
    const ids = deps.pendingCreativeReviews.value.map(review => review.id)
    for (const id of ids) await approveCreativeReview(id)
  }

  function notifyCreativeToolResult(toolName: string, isError: boolean, toolCallId?: string): void {
    if (!isError) return
    const batch = pendingApplyBatch.value
    if (!batch) return
    const isUnsettled = (id: string) => {
      const decision = batch.decisionsById[id]
      return decision?.kind !== 'rejected' && decision?.kind !== 'responded' && decision?.kind !== 'failed_to_apply'
    }
    // Two-pass: exact toolCallId first, then toolName fallback.
    const reviewId =
      (toolCallId && batch.order.find(id => isUnsettled(id) && batch.reviewsById[id]?.toolCallId === toolCallId)) ||
      batch.order.find(id => isUnsettled(id) && batch.reviewsById[id]?.toolName === toolName)
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
    respondCreativeReview,
    approveAllCreativeReviews,
    notifyCreativeToolResult,
    finalizePendingCreativeApply,
  }
}
