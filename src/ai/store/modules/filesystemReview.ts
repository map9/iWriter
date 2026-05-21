import { ref, type ComputedRef, type Ref } from 'vue'
import type { FilesystemReviewItem } from '@/ai/types'
import type { DomainReviewItem, ResumeDecision } from '@/ai/ipc'
import type { LiveTurn, ThreadRunState } from './runtimeState'

interface FilesystemReviewModuleDeps {
  pendingFilesystemReviews: ComputedRef<FilesystemReviewItem[]>
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
}

interface FilesystemReviewBatch {
  threadId: string
  turnId: string | null
  total: number
  order: string[]
  filesystemIds: Set<string>
  reviewsById: Record<string, FilesystemReviewItem>
  decisionsById: Record<string, ResumeDecision>
}

function reviewIdAt(index: number, review: DomainReviewItem): string {
  if (review.kind === 'filesystem') return review.payload.id
  return `non-filesystem-${index}`
}

export function createFilesystemReviewModule(deps: FilesystemReviewModuleDeps) {
  const interruptActionCount = ref(0)
  const isResumingFilesystemReview = ref(false)
  const reviewBatch = ref<FilesystemReviewBatch | null>(null)

  function resetReviewState(options?: { clearLiveTurnReviews?: boolean }) {
    deps.interruptedThreadId.value = null
    deps.interruptedTurnId.value = null
    interruptActionCount.value = 0
    isResumingFilesystemReview.value = false
    reviewBatch.value = null
    if (options?.clearLiveTurnReviews) {
      const liveTurn = deps.ensureLiveTurn()
      if (liveTurn) {
        liveTurn.reviews = liveTurn.reviews.filter(r => r.kind !== 'filesystem')
        deps.liveTurnRef.value = { ...liveTurn }
      }
    }
  }

  function rejectAllPendingReviews() {
    if (!deps.pendingFilesystemReviews.value.length && !interruptActionCount.value) return
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
    reviews: DomainReviewItem[]
  }) {
    const filesystemReviews = params.reviews
      .filter((r): r is Extract<DomainReviewItem, { kind: 'filesystem' }> => r.kind === 'filesystem')
      .map(r => r.payload)

    deps.interruptedThreadId.value = params.threadId
    deps.interruptedTurnId.value = params.turnId ?? deps.currentTurnId.value
    interruptActionCount.value = params.reviews.length
    isResumingFilesystemReview.value = false

    const liveTurn = deps.ensureLiveTurn({
      threadId: params.threadId,
      turnId: params.turnId,
      state: 'interrupted',
    })
    if (liveTurn) {
      liveTurn.reviews = params.reviews
      deps.liveTurnRef.value = { ...liveTurn }
    }

    reviewBatch.value = {
      threadId: params.threadId,
      turnId: params.turnId ?? deps.currentTurnId.value,
      total: params.reviews.length,
      order: params.reviews.map((review, index) => reviewIdAt(index, review)),
      filesystemIds: new Set(filesystemReviews.map(review => review.id)),
      reviewsById: Object.fromEntries(filesystemReviews.map(review => [review.id, review])),
      decisionsById: {},
    }
  }

  function removePendingReview(reviewId: string) {
    const liveTurn = deps.ensureLiveTurn()
    if (!liveTurn) return
    liveTurn.reviews = liveTurn.reviews.filter(r => r.kind !== 'filesystem' || r.payload.id !== reviewId)
    deps.liveTurnRef.value = { ...liveTurn }
  }

  async function maybeFlushResume() {
    const threadId = deps.interruptedThreadId.value
    const batch = reviewBatch.value
    if (!threadId || !batch) return
    const reviewedCount = Object.keys(batch.decisionsById).length
    if (reviewedCount < batch.filesystemIds.size) return

    const decisions: ResumeDecision[] = batch.order.map(id => {
      if (!batch.filesystemIds.has(id)) {
        return { type: 'rejected', message: 'User reviewed only the filesystem operation in this mixed approval batch.' }
      }
      const decision = batch.decisionsById[id]
      if (!decision) return { type: 'rejected', message: 'User rejected this file operation.' }
      if (decision.type === 'approved') return { type: 'approved' }
      return {
        type: 'rejected',
        message: decision.message ?? 'User rejected this file operation.',
      }
    })

    deps.threadRunState.value = 'streaming'
    isResumingFilesystemReview.value = true
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

    await window.electronAPI.aiResume?.({ threadId, decisions })

    const liveTurn = deps.ensureLiveTurn({ threadId, state: 'resuming' })
    if (liveTurn) {
      liveTurn.reviews = liveTurn.reviews.filter(r => r.kind !== 'filesystem')
      deps.liveTurnRef.value = { ...liveTurn }
    }
  }

  async function approveFilesystemReview(reviewId: string) {
    if (reviewBatch.value?.reviewsById[reviewId]) {
      reviewBatch.value.decisionsById[reviewId] = { type: 'approved' }
    }
    removePendingReview(reviewId)
    await maybeFlushResume()
  }

  async function rejectFilesystemReview(reviewId: string, message?: string) {
    if (reviewBatch.value?.reviewsById[reviewId]) {
      reviewBatch.value.decisionsById[reviewId] = {
        type: 'rejected',
        message: message ?? 'User rejected this file operation.',
      }
    }
    removePendingReview(reviewId)
    await maybeFlushResume()
  }

  return {
    interruptActionCount,
    isResumingFilesystemReview,
    handleInterrupt,
    resetReviewState,
    rejectAllPendingReviews,
    approveFilesystemReview,
    rejectFilesystemReview,
  }
}
