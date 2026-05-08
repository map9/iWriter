import type { EditProposal, EditRoundResult } from '@/ai/types'

export type ProposalDecisionKind =
  | 'approved'
  | 'edited'
  | 'skipped'
  | 'rework_requested'
  | 'round_ended'
  | 'batch_paused'
  | 'failed_to_apply'

export interface ProposalDecision {
  proposalId: string
  kind: ProposalDecisionKind
  editedArgs?: Record<string, unknown>
  message?: string
}

export interface ReviewBatchState {
  threadId: string
  turnId: string | null
  total: number
  order: string[]
  proposalsById: Record<string, EditProposal>
  decisionsById: Record<string, ProposalDecision>
}

export interface ProposalReviewEntry {
  proposal: EditProposal
  state: 'approved' | 'edited' | 'rework' | 'paused' | 'ended' | 'rejected' | 'failed'
  label: string
  tone: 'green' | 'blue' | 'amber' | 'gray' | 'red'
}

export interface ProposalReviewSummary {
  total: number
  resolved: number
  pending: number
  approved: number
  edited: number
  rework: number
  paused: number
  ended: number
  rejected: number
  failed: number
}

export type EditSessionPhase = 'review_ready' | 'completed' | 'cancelled' | 'failed' | 'mixed'

export type EditSessionViewModel =
  | {
    kind: 'proposal_review'
    messageId: string
    phase: 'review_ready'
    proposals: EditProposal[]
  }
  | {
    kind: 'tool_summary'
    messageId: string
    phase: Exclude<EditSessionPhase, 'review_ready'>
    result: EditRoundResult
  }

export interface ProposalNavigatorViewModel {
  isBatchReview: boolean
  batchTotal: number
  resolvedCount: number
  hasReviewProgress: boolean
  currentTitle: string
  currentLabel: string
  approveButtonLabel: string
  skipButtonLabel: string
  reworkButtonLabel: string
  primaryBatchActionLabel: string
  batchHint: string
  actionHint: string
  batchSummaryLine: string
}
