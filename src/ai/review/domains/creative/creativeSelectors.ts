import type {
  AiAgentMode,
  CreativeReviewItem,
  CreativeRoundResult,
  CreativeRoundResultItem,
  CreativeRoundResultState,
  ThreadMessage,
} from '@/ai/types'

// ── Types ─────────────────────────────────────────────────────────────────

export type CreativeSessionPhase = 'review_ready' | 'tool_summary' | 'failed' | 'cancelled' | 'completed'

export interface CreativeSessionViewModelReview {
  kind: 'review_ready'
  messageId: string
  phase: 'review_ready'
  reviews: CreativeReviewItem[]
}

export interface CreativeSessionViewModelSummary {
  kind: 'tool_summary'
  messageId: string
  phase: CreativeSessionPhase
  result: CreativeRoundResult
}

export type CreativeSessionViewModel =
  | CreativeSessionViewModelReview
  | CreativeSessionViewModelSummary

// Internal CreativeReviewBatch shape (mirrors creativeReview.ts)
interface CreativeDecision {
  kind: 'approved' | 'edited' | 'rejected' | 'responded' | 'failed_to_apply'
  editedArgs?: Record<string, unknown>
  message?: string
}

export interface CreativeReviewBatch {
  threadId: string
  turnId: string | null
  total: number
  order: string[]
  reviewsById: Record<string, CreativeReviewItem>
  decisionsById: Record<string, CreativeDecision>
}

// ── Round result ───────────────────────────────────────────────────────────

function reviewLabel(review: CreativeReviewItem): string {
  if (review.kind === 'creative_plan') return 'writing plan'
  if (review.kind === 'creative_git_commit') return `git commit · ${review.message}`
  if (review.kind === 'creative_git_tag') return `git tag · ${review.name}`
  if (review.kind === 'creative_git_init') return 'git init'
  if (review.kind === 'creative_git_restore') return `git restore · ${review.files.join(', ')}`
  return `finalize · ${review.chapter}`
}

function stateForDecision(kind: CreativeDecision['kind']): CreativeRoundResultState {
  if (kind === 'approved') return 'applied'
  if (kind === 'edited') return 'applied_edited'
  if (kind === 'failed_to_apply') return 'failed_to_apply'
  return 'skipped'
}

function finalContent(review: CreativeReviewItem, decision: CreativeDecision): string | undefined {
  if (decision.kind === 'edited' && decision.editedArgs) {
    const content = decision.editedArgs.content
    if (typeof content === 'string') return content
    const plan = decision.editedArgs.plan
    if (typeof plan === 'string') return plan
  }
  if (review.kind === 'creative_plan') return review.plan
  if (review.kind === 'creative_git_commit') return review.message
  if (review.kind === 'creative_git_tag') return review.message ?? review.name
  if (review.kind === 'creative_git_init') return undefined
  if (review.kind === 'creative_git_restore') return review.files.join('\n')
  return review.summary ?? review.chapter
}

export function buildCreativeRoundResult(batch: CreativeReviewBatch | null): CreativeRoundResult | null {
  if (!batch) return null

  const items: CreativeRoundResultItem[] = []
  const summary: CreativeRoundResult = {
    total: batch.total,
    applied: 0,
    appliedEdited: 0,
    skipped: 0,
    failedToApply: 0,
    items,
  }

  for (const reviewId of batch.order) {
    const review = batch.reviewsById[reviewId]
    const decision = batch.decisionsById[reviewId]
    if (!review || !decision) continue

    const state = stateForDecision(decision.kind)
    items.push({
      reviewId,
      state,
      kind: review.kind,
      toolName: review.toolName,
      label: reviewLabel(review),
      finalContent: finalContent(review, decision),
    })

    switch (state) {
      case 'applied': summary.applied += 1; break
      case 'applied_edited': summary.appliedEdited += 1; break
      case 'skipped': summary.skipped += 1; break
      case 'failed_to_apply': summary.failedToApply += 1; break
    }
  }

  return summary
}

export function mergeCreativeRoundResults(
  results: Array<CreativeRoundResult | null | undefined>,
): CreativeRoundResult | null {
  const resolved = results.filter((r): r is CreativeRoundResult => !!r)
  if (!resolved.length) return null

  return resolved.reduce<CreativeRoundResult>((merged, result) => {
    merged.total += result.total
    merged.applied += result.applied
    merged.appliedEdited += result.appliedEdited
    merged.skipped += result.skipped
    merged.failedToApply += result.failedToApply
    merged.items.push(...result.items)
    return merged
  }, { total: 0, applied: 0, appliedEdited: 0, skipped: 0, failedToApply: 0, items: [] })
}

// ── Session ViewModel ──────────────────────────────────────────────────────

interface BuildCreativeSessionOptions {
  message: ThreadMessage
  mode?: AiAgentMode
  persistedMessages?: ThreadMessage[]
  pendingCreativeReviews?: CreativeReviewItem[]
  isInterrupted?: boolean
  interruptedTurnId?: string | null
  isLatestAssistantMessage?: boolean
  assistantMessageIds?: string[]
}

function resolveCreativeHostMessageId(input: {
  persistedMessages: ThreadMessage[]
  pendingReviews: CreativeReviewItem[]
  interruptedTurnId: string | null
}): string | null {
  const { persistedMessages, pendingReviews, interruptedTurnId } = input
  const assistants = persistedMessages.filter(m => m.role === 'assistant')
  if (!assistants.length) return null

  const byId = new Map(assistants.map(m => [m.id, m]))

  const directHost = pendingReviews
    .map(r => r.sourceMessageId)
    .find((id): id is string => !!id && byId.has(id))
  if (directHost) return directHost

  if (interruptedTurnId) {
    const turnMatches = assistants.filter(m => m.turnId === interruptedTurnId)
    if (turnMatches.length) return turnMatches[turnMatches.length - 1]?.id ?? null
  }

  return assistants[assistants.length - 1]?.id ?? null
}

export function buildCreativeSessionViewModel(
  options: BuildCreativeSessionOptions,
): CreativeSessionViewModel | null {
  const {
    message,
    mode,
    persistedMessages = [],
    pendingCreativeReviews = [],
    isInterrupted = false,
    interruptedTurnId = null,
    isLatestAssistantMessage = false,
    assistantMessageIds = [],
  } = options

  if (mode !== 'creative' || message.role !== 'assistant') return null

  if (isInterrupted && pendingCreativeReviews.length) {
    const hostId = resolveCreativeHostMessageId({
      persistedMessages,
      pendingReviews: pendingCreativeReviews,
      interruptedTurnId,
    })

    if (hostId) {
      if (message.id === hostId) {
        return { kind: 'review_ready', messageId: message.id, phase: 'review_ready', reviews: pendingCreativeReviews }
      }
      return null
    }

    const turnMatches = interruptedTurnId
      && pendingCreativeReviews.some(r => r.sourceTurnId === interruptedTurnId)
      && message.turnId === interruptedTurnId

    if (turnMatches && isLatestAssistantMessage) {
      return { kind: 'review_ready', messageId: message.id, phase: 'review_ready', reviews: pendingCreativeReviews }
    }

    const directMatches = pendingCreativeReviews.filter(r => r.sourceMessageId === message.id)
    if (directMatches.length) {
      return { kind: 'review_ready', messageId: message.id, phase: 'review_ready', reviews: directMatches }
    }

    const hasLiveSource = pendingCreativeReviews.some(
      r => !!r.sourceMessageId && assistantMessageIds.includes(r.sourceMessageId),
    )
    if (isLatestAssistantMessage && !hasLiveSource) {
      return { kind: 'review_ready', messageId: message.id, phase: 'review_ready', reviews: pendingCreativeReviews }
    }
  }

  if (!message.creativeRoundResult) return null

  return {
    kind: 'tool_summary',
    messageId: message.id,
    phase: 'tool_summary',
    result: message.creativeRoundResult,
  }
}
