import type { EditProposal } from '@/ai/types'
import type { ProposalDecisionKind, ReviewBatchSource, ReviewBatchState } from './types'

export function createReviewBatchState(
  threadId: string,
  turnId: string | null,
  proposals: EditProposal[],
  options: {
    source?: ReviewBatchSource
    novelSessionId?: string
  } = {},
): ReviewBatchState {
  return {
    source: options.source ?? 'agent',
    novelSessionId: options.novelSessionId,
    threadId,
    turnId,
    total: proposals.length,
    order: proposals.map(proposal => proposal.id),
    proposalsById: Object.fromEntries(proposals.map(proposal => [proposal.id, proposal])),
    decisionsById: {},
  }
}

export function getProposalDecision(batch: ReviewBatchState | null, proposalId: string) {
  return batch?.decisionsById[proposalId]
}

export function getProposalIndex(batch: ReviewBatchState | null, proposalId: string): number {
  return batch?.order.indexOf(proposalId) ?? -1
}

export function findProposalInBatch(batch: ReviewBatchState | null, proposalId: string): EditProposal | undefined {
  return batch?.proposalsById[proposalId]
}

export function setProposalDecisionInBatch(
  batch: ReviewBatchState | null,
  proposalId: string,
  kind: ProposalDecisionKind,
  options?: {
    editedArgs?: Record<string, unknown>
    message?: string
  },
): ReviewBatchState | null {
  if (!batch) return batch
  return {
    ...batch,
    decisionsById: {
      ...batch.decisionsById,
      [proposalId]: {
        proposalId,
        kind,
        editedArgs: options?.editedArgs,
        message: options?.message,
      },
    },
  }
}
