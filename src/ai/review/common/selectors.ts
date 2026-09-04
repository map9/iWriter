import type { AiAgentMode, AiToolCall, EditProposal, EditRoundResult, EditRoundResultItem, EditRoundResultState, ThreadMessage } from '@shared/ai/contracts'
import { pathUtils } from '@/utils/pathUtils'
import type {
  EditSessionPhase,
  EditSessionViewModel,
  ProposalDecision,
  BlockEditReviewSurfaceViewModel,
  ProposalReviewEntry,
  ProposalReviewSummary,
  ReviewBatchState,
} from './types'

function hasRenderableContentBlocks(message: ThreadMessage): boolean {
  return (message.contentBlocks ?? []).some(block => {
    if (block.type === 'text') return !!block.text?.trim()
    if (block.type === 'thinking') return false
    if (block.type === 'agent_event') return !!(block.text?.trim() || block.agentName)
    return true
  })
}

export function isRenderableAssistantMessage(message: ThreadMessage): boolean {
  if (message.role !== 'assistant') return false
  if (hasRenderableContentBlocks(message)) return true
  if (!!message.editRoundResult) return true
  return !!message.creativeRoundResult
}

export function resolveProposalHostMessageId(input: {
  mode?: AiAgentMode
  persistedMessages?: ThreadMessage[]
  pendingProposals?: EditProposal[]
  isInterrupted?: boolean
  interruptedTurnId?: string | null
}): string | null {
  const {
    mode,
    persistedMessages = [],
    pendingProposals = [],
    isInterrupted = false,
    interruptedTurnId = null,
  } = input

  if (mode !== 'edit' || !isInterrupted || !pendingProposals.length) return null

  const renderableAssistants = persistedMessages.filter(isRenderableAssistantMessage)
  if (!renderableAssistants.length) return null

  const byId = new Map(renderableAssistants.map(message => [message.id, message]))
  const directHost = pendingProposals
    .map(proposal => proposal.sourceMessageId)
    .find((messageId): messageId is string => !!messageId && byId.has(messageId))
  if (directHost) return directHost

  const proposalTurnId = interruptedTurnId
    ?? pendingProposals.find(proposal => proposal.sourceTurnId)?.sourceTurnId
    ?? null
  if (!proposalTurnId) return renderableAssistants[renderableAssistants.length - 1]?.id ?? null

  const turnMatches = renderableAssistants.filter(message => message.turnId === proposalTurnId)
  if (turnMatches.length) return turnMatches[turnMatches.length - 1]?.id ?? null

  return null
}

function reviewEntryForDecision(
  proposal: EditProposal,
  decision: ProposalDecision,
): ProposalReviewEntry {
  switch (decision.kind) {
    case 'approved':
      return { proposal, state: 'approved', label: '已确认应用', tone: 'green' }
    case 'edited':
      return { proposal, state: 'edited', label: '已确认编辑后应用', tone: 'blue' }
    case 'rework_requested':
      return { proposal, state: 'rework', label: '已退回重做', tone: 'amber' }
    case 'round_ended':
      return { proposal, state: 'ended', label: '本轮已结束', tone: 'gray' }
    case 'batch_paused':
      return { proposal, state: 'paused', label: '后续已暂停', tone: 'gray' }
    case 'failed_to_apply':
      return { proposal, state: 'failed', label: '应用失败', tone: 'red' }
    default:
      return { proposal, state: 'rejected', label: '已跳过', tone: 'gray' }
  }
}

export function buildProposalReviewEntries(batch: ReviewBatchState | null): ProposalReviewEntry[] {
  if (!batch) return []
  return batch.order.flatMap(proposalId => {
    const decision = batch.decisionsById[proposalId]
    const proposal = batch.proposalsById[proposalId]
    if (!decision || !proposal) return []
    return [reviewEntryForDecision(proposal, decision)]
  })
}

export function buildProposalReviewSummary(batch: ReviewBatchState | null): ProposalReviewSummary | null {
  if (!batch) return null

  const entries = buildProposalReviewEntries(batch)
  const summary: ProposalReviewSummary = {
    total: batch.total,
    resolved: entries.length,
    pending: batch.total - entries.length,
    approved: 0,
    edited: 0,
    rework: 0,
    paused: 0,
    ended: 0,
    rejected: 0,
    failed: 0,
  }
  for (const entry of entries) {
    summary[entry.state] += 1
  }
  return summary
}

export function proposalSummaryLabel(proposal: EditProposal): string {
  if (proposal.kind === 'create_file') {
    return `新建文档：${proposal.filename || '未命名文档'}`
  }

  const fileLabel = pathUtils.basename(proposal.filePath)
  switch (proposal.type) {
    case 'edit':
      return `${fileLabel} · 编辑块 {b:${proposal.displayBlockId ?? '?'}}`
    case 'insert':
      return `${fileLabel} · 插入到 {b:${proposal.displayBlockId ?? 0}} 之后`
    case 'replace_range':
      return `${fileLabel} · 替换 {b:${proposal.startDisplayBlockId ?? '?'}}–{b:${proposal.endDisplayBlockId ?? '?'}}`
    case 'delete':
      return `${fileLabel} · 删除块 {b:${proposal.displayBlockId ?? '?'}}`
    default:
      return `${fileLabel} · 未知操作`
  }
}

function outcomeStateForDecision(decision: ProposalDecision): EditRoundResultState {
  switch (decision.kind) {
    case 'approved':
      return 'applied'
    case 'edited':
      return 'applied_edited'
    case 'rework_requested':
      return 'rework_requested'
    case 'round_ended':
    case 'batch_paused':
      return 'ended'
    case 'failed_to_apply':
      return 'failed_to_apply'
    default:
      return 'skipped'
  }
}

export function buildEditRoundResult(batch: ReviewBatchState | null): EditRoundResult | null {
  if (!batch) return null

  const items: EditRoundResultItem[] = []
  const summary: EditRoundResult = {
    total: batch.total,
    applied: 0,
    appliedEdited: 0,
    skipped: 0,
    reworkRequested: 0,
    ended: 0,
    failedToApply: 0,
    items,
  }

  for (const proposalId of batch.order) {
    const decision = batch.decisionsById[proposalId]
    const proposal = batch.proposalsById[proposalId]
    if (!decision || !proposal) continue

    const state = outcomeStateForDecision(decision)
    items.push({
      proposalId,
      label: proposalSummaryLabel(proposal),
      state,
      kind: proposal.kind === 'create_file' ? 'create_file' : proposal.type,
      filePath: proposal.kind === 'block' ? proposal.filePath : undefined,
      description: proposal.description,
      oldContent: proposal.kind === 'block' ? proposal.oldContent : undefined,
      newContent: proposal.kind === 'create_file' ? proposal.content : proposal.newContent,
      finalAppliedContent: state === 'applied_edited'
        ? decision.editedArgs?.new_content as string ?? (proposal.kind === 'create_file' ? proposal.content : proposal.newContent)
        : (proposal.kind === 'create_file' ? proposal.content : proposal.newContent),
      failureMessage: state === 'failed_to_apply' ? decision.message : undefined,
      blockInfo: proposal.kind === 'block'
        ? {
          displayBlockId: proposal.displayBlockId,
          startDisplayBlockId: proposal.startDisplayBlockId,
          endDisplayBlockId: proposal.endDisplayBlockId,
        }
        : undefined,
    })

    switch (state) {
      case 'applied':
        summary.applied += 1
        break
      case 'applied_edited':
        summary.appliedEdited += 1
        break
      case 'rework_requested':
        summary.reworkRequested += 1
        break
      case 'ended':
        summary.ended += 1
        break
      case 'failed_to_apply':
        summary.failedToApply += 1
        break
      default:
        summary.skipped += 1
        break
    }
  }

  return summary
}

export function mergeEditRoundResults(
  results: Array<EditRoundResult | null | undefined>,
): EditRoundResult | null {
  const resolved = results.filter((result): result is EditRoundResult => !!result)
  if (!resolved.length) return null

  return resolved.reduce<EditRoundResult>((merged, result) => {
    merged.total += result.total
    merged.applied += result.applied
    merged.appliedEdited += result.appliedEdited
    merged.skipped += result.skipped
    merged.reworkRequested += result.reworkRequested
    merged.ended += result.ended
    merged.failedToApply += result.failedToApply
    merged.items.push(...result.items)
    return merged
  }, {
    total: 0,
    applied: 0,
    appliedEdited: 0,
    skipped: 0,
    reworkRequested: 0,
    ended: 0,
    failedToApply: 0,
    items: [],
  })
}

export function buildBlockEditReviewSurfaceViewModel(input: {
  proposals: EditProposal[]
  reviewSummary?: ProposalReviewSummary | null
  currentIndex: number
  current: EditProposal | null
  isStreaming?: boolean
  hasEditedContent: boolean
}): BlockEditReviewSurfaceViewModel {
  const {
    proposals,
    reviewSummary = null,
    currentIndex,
    current,
    isStreaming = false,
    hasEditedContent,
  } = input

  const batchTotal = reviewSummary?.total ?? proposals.length
  const isBatchReview = batchTotal > 1
  const resolvedCount = reviewSummary?.resolved ?? 0
  const currentIsDelete = current?.kind === 'block' && current.type === 'delete'
  const currentTitle = isBatchReview
    ? `[${Math.min(resolvedCount + currentIndex + 1, batchTotal)} / ${batchTotal}] 当前建议`
    : '当前建议'

  const approveButtonLabel = !isBatchReview
    ? currentIsDelete
      ? '接受删除'
      : hasEditedContent ? '修改后接受' : '接受'
    : currentIsDelete
      ? '接受本条删除'
      : hasEditedContent ? '修改后接受本条' : '接受本条'

  const rejectButtonLabel = isBatchReview ? '拒绝本条' : '拒绝'
  const approveAllButtonLabel = '全部接受'
  const rejectAllButtonLabel = '全部拒绝'
  const batchHint = isStreaming
    ? `正在生成建议，当前已有 ${proposals.length} 条。`
    : '你现在在审核这一批建议。全部接受/全部拒绝会覆盖整批建议；当前建议的接受、拒绝只影响这一条。'
  const actionHint = isBatchReview
    ? '接受、拒绝都只影响当前这条建议；左右箭头只负责切换查看。'
    : '接受会采纳当前建议，拒绝会保留原文不变。'

  const accepted = (reviewSummary?.approved ?? 0) + (reviewSummary?.edited ?? 0)
  const skipped = (reviewSummary?.rejected ?? 0) + (reviewSummary?.ended ?? 0)
  const rework = reviewSummary?.rework ?? 0
  const currentFileLabel = current?.kind === 'create_file'
    ? current.filename
    : current ? pathUtils.basename(current.filePath) : '当前文档'
  const batchSummaryParts = [currentFileLabel || '当前文档', `共 ${batchTotal} 条建议`, `待审核 ${proposals.length} 条`]
  if (skipped > 0) batchSummaryParts.push(`拒绝 ${skipped} 条`)
  if (accepted > 0) batchSummaryParts.push(`将修改 ${accepted} 条`)
  if (rework > 0) batchSummaryParts.push(`重做 ${rework} 条`)

  return {
    isBatchReview,
    batchTotal,
    resolvedCount,
    currentTitle,
    currentLabel: current ? proposalSummaryLabel(current) : '',
    approveButtonLabel,
    rejectButtonLabel,
    approveAllButtonLabel,
    rejectAllButtonLabel,
    batchHint,
    actionHint,
    batchSummaryLine: batchSummaryParts.join(' · '),
  }
}

interface BuildEditSessionOptions {
  message: ThreadMessage
  mode?: AiAgentMode
  persistedMessages?: ThreadMessage[]
  pendingProposals?: EditProposal[]
  isInterrupted?: boolean
  interruptedTurnId?: string | null
  isLatestAssistantMessage?: boolean
  assistantMessageIds?: string[]
  editToolCalls?: AiToolCall[]
}

export function buildEditSessionViewModel(
  options: BuildEditSessionOptions,
): EditSessionViewModel | null {
  const {
    message,
    mode,
    persistedMessages = [],
    pendingProposals = [],
    isInterrupted = false,
    interruptedTurnId = null,
    isLatestAssistantMessage = false,
    assistantMessageIds = [],
    editToolCalls = [],
  } = options

  if (mode !== 'edit' || message.role !== 'assistant') return null

  if (isInterrupted && pendingProposals.length) {
    const hostMessageId = resolveProposalHostMessageId({
      mode,
      persistedMessages,
      pendingProposals,
      isInterrupted,
      interruptedTurnId,
    })
    if (hostMessageId) {
      if (message.id === hostMessageId) {
        return {
          kind: 'proposal_review',
          messageId: message.id,
          phase: 'review_ready',
          proposals: pendingProposals,
        }
      }
      return null
    }

    const turnMatches = interruptedTurnId
      && pendingProposals.some(proposal => proposal.sourceTurnId === interruptedTurnId)
      && message.turnId === interruptedTurnId

    if (turnMatches && isLatestAssistantMessage) {
      return {
        kind: 'proposal_review',
        messageId: message.id,
        phase: 'review_ready',
        proposals: pendingProposals,
      }
    }

    const directMatches = pendingProposals.filter(proposal => proposal.sourceMessageId === message.id)
    if (directMatches.length) {
      return {
        kind: 'proposal_review',
        messageId: message.id,
        phase: 'review_ready',
        proposals: directMatches,
      }
    }

    const hasLiveSourceMessage = pendingProposals.some(proposal =>
      !!proposal.sourceMessageId && assistantMessageIds.includes(proposal.sourceMessageId)
    )

    if (isLatestAssistantMessage && !hasLiveSourceMessage) {
      return {
        kind: 'proposal_review',
        messageId: message.id,
        phase: 'review_ready',
        proposals: pendingProposals,
      }
    }
  }

  if (!message.editRoundResult) return null

  const hasPending = editToolCalls.some(tc => tc.status === 'pending' || tc.status === 'in_progress')
  const hasCompleted = editToolCalls.some(tc => tc.status === 'completed')
  const hasRejected = editToolCalls.some(tc => tc.status === 'rejected')
  const hasFailed = editToolCalls.some(tc => tc.status === 'failed' || tc.isError)

  let phase: EditSessionPhase = 'mixed'
  if (hasPending) phase = 'review_ready'
  else if (hasFailed && !hasCompleted && !hasRejected) phase = 'failed'
  else if (hasRejected && !hasCompleted && !hasFailed) phase = 'cancelled'
  else if (hasCompleted && !hasRejected && !hasFailed) phase = 'completed'

  if (phase === 'review_ready') {
    return {
      kind: 'proposal_review',
      messageId: message.id,
      phase,
      proposals: pendingProposals,
    }
  }

  return {
    kind: 'tool_summary',
    messageId: message.id,
    phase,
    result: message.editRoundResult,
  }
}
