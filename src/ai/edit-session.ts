import type { AiAgentMode, AiToolCall, EditProposal, ThreadMessage } from '@/ai/types'

export type EditSessionPhase = 'review_ready' | 'completed' | 'cancelled' | 'failed' | 'mixed'
export type EditSessionMode = 'quick_fix' | 'standard' | 'delete_review'

export interface EditSessionViewModel {
  messageId: string
  mode: EditSessionMode
  phase: EditSessionPhase
  proposals?: EditProposal[]
  toolCalls?: AiToolCall[]
}

interface BuildEditSessionOptions {
  message: ThreadMessage
  mode?: AiAgentMode
  pendingProposals?: EditProposal[]
  isInterrupted?: boolean
  interruptedTurnId?: string | null
  isLatestAssistantMessage?: boolean
  assistantMessageIds?: string[]
  editToolCalls?: AiToolCall[]
}

export function buildEditSessionForMessage(
  options: BuildEditSessionOptions,
): EditSessionViewModel | null {
  const {
    message,
    mode,
    pendingProposals = [],
    isInterrupted = false,
    interruptedTurnId = null,
    isLatestAssistantMessage = false,
    assistantMessageIds = [],
    editToolCalls = [],
  } = options

  if (mode !== 'edit') return null
  if (message.role !== 'assistant') return null
  if (isInterrupted && pendingProposals.length) {
    const turnMatches = interruptedTurnId
      && pendingProposals.some(proposal => proposal.sourceTurnId === interruptedTurnId)
      && message.turnId === interruptedTurnId
    if (turnMatches && isLatestAssistantMessage) {
      return {
        messageId: message.id,
        mode: inferEditSessionMode({ proposals: pendingProposals }),
        phase: 'review_ready',
        proposals: pendingProposals,
      }
    }

    const directMatches = pendingProposals.filter(proposal => proposal.sourceMessageId === message.id)
    if (directMatches.length) {
      return {
        messageId: message.id,
        mode: inferEditSessionMode({ proposals: directMatches }),
        phase: 'review_ready',
        proposals: directMatches,
      }
    }

    const hasLiveSourceMessage = pendingProposals.some(proposal =>
      !!proposal.sourceMessageId && assistantMessageIds.includes(proposal.sourceMessageId)
    )

    if (isLatestAssistantMessage) {
      if (!hasLiveSourceMessage) {
        return {
          messageId: message.id,
          mode: inferEditSessionMode({ proposals: pendingProposals }),
          phase: 'review_ready',
          proposals: pendingProposals,
        }
      }
    }
  }

  if (!editToolCalls.length) return null

  const hasPending = editToolCalls.some(tc => tc.status === 'pending' || tc.status === 'in_progress')
  const hasCompleted = editToolCalls.some(tc => tc.status === 'completed')
  const hasRejected = editToolCalls.some(tc => tc.status === 'rejected')
  const hasFailed = editToolCalls.some(tc => tc.status === 'failed' || tc.isError)

  let phase: EditSessionPhase = 'mixed'
  if (hasPending) phase = 'review_ready'
  else if (hasFailed && !hasCompleted && !hasRejected) phase = 'failed'
  else if (hasRejected && !hasCompleted && !hasFailed) phase = 'cancelled'
  else if (hasCompleted && !hasRejected && !hasFailed) phase = 'completed'

  return {
    messageId: message.id,
    mode: inferEditSessionMode({ toolCalls: editToolCalls }),
    phase,
    toolCalls: editToolCalls,
  }
}

function inferEditSessionMode(input: {
  proposals?: EditProposal[]
  toolCalls?: AiToolCall[]
}): EditSessionMode {
  const { proposals = [], toolCalls = [] } = input

  const hasDeleteProposal = proposals.some(proposal =>
    proposal.kind === 'block' && proposal.type === 'delete'
  )
  if (hasDeleteProposal) return 'delete_review'

  const hasDeleteTool = toolCalls.some(toolCall => toolCall.name === 'delete_block')
  if (hasDeleteTool) return 'delete_review'

  const proposalCount = proposals.length
  const toolCount = toolCalls.length

  const allQuickFixProposals = proposalCount > 0 && proposals.every(proposal => {
    if (proposal.kind !== 'block') return false
    return proposal.type === 'edit'
  })

  const allQuickFixTools = toolCount > 0 && toolCalls.every(toolCall => toolCall.name === 'edit_block')

  if ((allQuickFixProposals && proposalCount <= 3) || (allQuickFixTools && toolCount <= 3)) {
    return 'quick_fix'
  }

  return 'standard'
}
