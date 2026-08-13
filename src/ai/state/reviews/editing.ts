import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  AiThread,
  EditProposal,
  EditRoundResult,
  ThreadMessage,
} from '@shared/ai/contracts'
import type { ToolCallStatusOverrides } from '@/ai/message/display-normalizer'
import type { ResumeDecision, DomainReviewItem } from '@shared/ai/contracts'
import { agentClient } from '@/ai/client/AgentClient'
import {
  flushReviewedBatch,
  normalizeEditedArgsForProposal,
  type ReviewExecutorAppStoreLike,
} from '@/ai/review/common/executor'
import {
  buildEditRoundResult,
  mergeEditRoundResults,
  buildProposalReviewEntries,
  buildProposalReviewSummary,
} from '@/ai/review/common/selectors'
import {
  createReviewBatchState,
  findProposalInBatch,
  getProposalIndex as getProposalIndexFromBatch,
  setProposalDecisionInBatch,
} from '@/ai/review/common/state'
import { createReviewThreadSync } from '@/ai/review/common/threadSync'
import type { LiveTurn } from '../run'
import type {
  ProposalDecisionKind,
  ProposalReviewEntry,
  ProposalReviewSummary,
  ReviewBatchState,
} from '@/ai/review/common/types'

const EDIT_REJECTION_MESSAGE = 'The user rejected this proposal. Do not retry or automatically propose a replacement. Briefly acknowledge and ask what the user wants changed.'
const EDIT_BATCH_REJECTION_MESSAGE = 'The user rejected all proposals in this batch. Do not retry or automatically propose replacements. Briefly acknowledge and ask what the user wants changed.'

interface EditReviewModuleDeps {
  appStore: ReviewExecutorAppStoreLike
  saveFile?: (content: string, absolutePath: string) => Promise<unknown>
  activeThread: ComputedRef<AiThread | null>
  pendingEditProposals: ComputedRef<EditProposal[]>
  interruptedThreadId: Ref<string | null>
  interruptedTurnId: Ref<string | null>
  threadRunState: Ref<'idle' | 'streaming' | 'interrupted'>
  currentThreadId: Ref<string | null>
  currentTurnId: Ref<string | null>
  liveTurnRef: Ref<LiveTurn | null>
  ensureLiveTurn: (params?: {
    threadId?: string | null
    turnId?: string | null
    state?: 'streaming' | 'interrupted' | 'resuming'
    startedAt?: number
  }) => LiveTurn | null
  normalizeMessagesForDisplay: (messages: ThreadMessage[]) => ThreadMessage[]
  updateThread: (thread: AiThread) => void
}

export function createEditReviewModule(deps: EditReviewModuleDeps) {
  const interruptActionCount = ref(0)
  const isResumingReviewedEdits = ref(false)
  const reviewBatch = ref<ReviewBatchState | null>(null)
  const completedRoundResults = ref<Record<string, EditRoundResult[]>>({})

  function turnOutcomeKey(threadId: string, turnId: string | null | undefined): string | null {
    if (!threadId || !turnId) return null
    return `${threadId}:${turnId}`
  }

  const threadSync = createReviewThreadSync({
    activeThread: deps.activeThread,
    normalizeMessagesForDisplay: deps.normalizeMessagesForDisplay,
    updateThread: deps.updateThread,
    findProposal: proposalId => findProposal(proposalId),
  })

  function displayOverrides(): ToolCallStatusOverrides {
    return threadSync.displayOverrides()
  }

  function getReviewBatch(): ReviewBatchState | null {
    return reviewBatch.value
  }

  function setReviewBatch(batch: ReviewBatchState | null) {
    reviewBatch.value = batch
  }

  function getProposalIndex(proposalId: string): number {
    return getProposalIndexFromBatch(getReviewBatch(), proposalId)
  }

  function setProposalDecision(
    proposalId: string,
    kind: ProposalDecisionKind,
    options?: {
      editedArgs?: Record<string, unknown>
      message?: string
    },
  ) {
    setReviewBatch(setProposalDecisionInBatch(getReviewBatch(), proposalId, kind, options))
  }

  function resetReviewState(options?: { clearLiveTurnProposals?: boolean }) {
    deps.interruptedThreadId.value = null
    deps.interruptedTurnId.value = null
    interruptActionCount.value = 0
    isResumingReviewedEdits.value = false
    setReviewBatch(null)
    if (options?.clearLiveTurnProposals) {
      const liveTurn = deps.ensureLiveTurn()
      if (liveTurn) {
        liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'edit')
        deps.liveTurnRef.value = { ...liveTurn }
      }
    }
  }

  function rememberCompletedRoundResult(batch: ReviewBatchState | null) {
    if (!batch) return
    const key = turnOutcomeKey(batch.threadId, batch.turnId)
    const result = buildEditRoundResult(batch)
    if (!key || !result) return
    completedRoundResults.value = {
      ...completedRoundResults.value,
      [key]: [...(completedRoundResults.value[key] ?? []), result],
    }
  }

  function rejectAllPendingProposals() {
    if (!deps.pendingEditProposals.value.length && !interruptActionCount.value) return

    const threadId = deps.interruptedThreadId.value
    if (threadId && interruptActionCount.value > 0) {
      const decisions: ResumeDecision[] = Array.from(
        { length: interruptActionCount.value },
        () => ({ type: 'rejected' as const, message: 'User sent a new message' }),
      )
      agentClient.resume({ threadId, decisions })
    }

    deps.threadRunState.value = 'idle'
    resetReviewState({ clearLiveTurnProposals: true })
  }

  function handleInterrupt(params: {
    threadId: string
    turnId: string | null
    proposals: EditProposal[]
  }) {
    deps.interruptedThreadId.value = params.threadId
    deps.interruptedTurnId.value = params.turnId ?? deps.currentTurnId.value
    // Count spans ALL proposals (auto-apply + manual) — the resume decisions array must cover them.
    interruptActionCount.value = params.proposals.length
    isResumingReviewedEdits.value = false

    // Write-session auto-apply proposals (04.1 §6 Stage 2) apply silently: no review card, and
    // a pre-set 'approved' decision so the batch flushes and applies them via the renderer
    // (executor.flushReviewedBatch → applyBlockProposalToTarget). Only manual proposals show cards.
    const autoApplyProposals = params.proposals.filter(p => p.autoApply)
    const manualProposals = params.proposals.filter(p => !p.autoApply)

    const liveTurn = deps.ensureLiveTurn({
      threadId: params.threadId,
      turnId: params.turnId,
      state: 'interrupted',
    })
    if (liveTurn) {
      liveTurn.reviews = manualProposals.map((p): DomainReviewItem => ({ kind: 'edit', payload: p }))
      deps.liveTurnRef.value = { ...liveTurn }
    }

    let batch = createReviewBatchState(
      params.threadId,
      params.turnId ?? deps.currentTurnId.value,
      params.proposals,
    )
    for (const p of autoApplyProposals) {
      batch = setProposalDecisionInBatch(batch, p.id, 'approved') ?? batch
    }
    setReviewBatch(batch)

    // Pure auto-apply batch → flush immediately (no card, no wait). Mixed batch → flush waits
    // until the manual proposals are decided (maybeFlushResume gates on all decisions present).
    if (autoApplyProposals.length) {
      void maybeFlushResume()
    }
  }

  function findProposal(proposalId: string): EditProposal | undefined {
    const pendingProposal = deps.pendingEditProposals.value.find(p => p.id === proposalId)
    if (pendingProposal) return pendingProposal
    return findProposalInBatch(getReviewBatch(), proposalId)
  }

  function removePendingProposal(proposalId: string) {
    const liveTurn = deps.ensureLiveTurn()
    if (!liveTurn) return
    liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'edit' || r.payload.id !== proposalId)
    deps.liveTurnRef.value = { ...liveTurn }
  }

  async function maybeFlushResume() {
    const threadId = deps.interruptedThreadId.value
    const count = interruptActionCount.value
    const batch = getReviewBatch()
    if (!threadId || count === 0 || !batch || Object.keys(batch.decisionsById).length < count) return

    await flushReviewedBatch({
      appStore: deps.appStore,
      saveFile: deps.saveFile,
      batch,
      updateLocalProposalToolCall: (proposalOrId, status) =>
        threadSync.updateLocalProposalToolCall(proposalOrId, status),
      setProposalDecision: (proposalId, kind, options) =>
        setProposalDecision(proposalId, kind, options),
    })

    const currentBatch = getReviewBatch()
    if (!currentBatch) return
    rememberCompletedRoundResult(currentBatch)
    const decisions: ResumeDecision[] = Array.from({ length: count }, (_, index) => {
      const proposalId = currentBatch.order[index]
      const record = proposalId ? currentBatch.decisionsById[proposalId] : undefined
      if (!record) return { type: 'rejected', message: EDIT_REJECTION_MESSAGE }
      if (record.kind === 'failed_to_apply') {
        return {
          type: 'responded',
          message:
            record.message ??
            'The edit failed to apply. This is a system apply failure, not a user rejection. Re-read the latest document outline/content before deciding whether to retry.',
        }
      }
      return {
        type: record.kind === 'approved' ? 'approved' : record.kind === 'edited' ? 'edited' : 'rejected',
        editedArgs: record.editedArgs,
        message: record.kind === 'approved' || record.kind === 'edited' ? undefined : (record.message ?? EDIT_REJECTION_MESSAGE),
      }
    })

    deps.threadRunState.value = 'streaming'
    isResumingReviewedEdits.value = true
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
    setReviewBatch(null)

    agentClient.resume({ threadId, decisions })

    const liveTurn = deps.ensureLiveTurn({ threadId, state: 'resuming' })
    if (liveTurn) {
      liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'edit')
      deps.liveTurnRef.value = { ...liveTurn }
    }
  }

  async function approveEditProposal(proposalId: string) {
    const proposal = findProposal(proposalId)
    if (!proposal) return
    if (getProposalIndex(proposalId) >= 0) setProposalDecision(proposalId, 'approved')
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function editAndApproveProposal(proposalId: string, editedArgs: Record<string, unknown>) {
    const proposal = findProposal(proposalId)
    if (!proposal || proposal.kind !== 'block') return
    const normalizedEditedArgs = normalizeEditedArgsForProposal(proposal, editedArgs)
    const blockProposal = {
      ...proposal,
      newContent:
        typeof normalizedEditedArgs.new_content === 'string'
          ? normalizedEditedArgs.new_content
          : proposal.newContent,
    }

    const liveTurn = deps.ensureLiveTurn()
    if (liveTurn) {
      liveTurn.reviews = liveTurn.reviews.map((r: DomainReviewItem) =>
        r.kind === 'edit' && r.payload.id === proposalId
          ? { kind: 'edit' as const, payload: { ...blockProposal, wasEdited: true } }
          : r
      )
      deps.liveTurnRef.value = { ...liveTurn }
    }

    if (getProposalIndex(proposalId) >= 0) {
      setProposalDecision(proposalId, 'edited', { editedArgs: normalizedEditedArgs })
    }
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function rejectEditProposal(proposalId: string, message?: string) {
    if (getProposalIndex(proposalId) >= 0) {
      setProposalDecision(proposalId, 'skipped', { message: message ?? EDIT_REJECTION_MESSAGE })
    }
    threadSync.updateLocalProposalToolCall(proposalId, 'rejected')
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  /** Decides every proposal in the batch (overriding any already-made per-item decision) and submits the whole round. */
  async function decideAllProposals(kind: 'approved' | 'skipped') {
    const batch = getReviewBatch()
    if (!batch) return
    const message = kind === 'skipped' ? EDIT_BATCH_REJECTION_MESSAGE : undefined
    for (const proposalId of batch.order) {
      setProposalDecision(proposalId, kind, { message })
      if (kind === 'skipped') threadSync.updateLocalProposalToolCall(proposalId, 'rejected')
    }

    const liveTurn = deps.ensureLiveTurn()
    if (liveTurn) {
      liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'edit')
      deps.liveTurnRef.value = { ...liveTurn }
    }

    await maybeFlushResume()
  }

  const reviewedBatchEntries = computed<ProposalReviewEntry[]>(() =>
    buildProposalReviewEntries(reviewBatch.value),
  )

  const reviewBatchSummary = computed<ProposalReviewSummary | null>(() =>
    buildProposalReviewSummary(reviewBatch.value),
  )

  function getCompletedRoundResult(threadId: string | null | undefined, turnId: string | null | undefined): EditRoundResult | null {
    const key = turnOutcomeKey(threadId ?? '', turnId)
    if (!key) return null
    return mergeEditRoundResults(completedRoundResults.value[key] ?? [])
  }

  async function approveAllProposals() {
    await decideAllProposals('approved')
  }

  async function rejectAllProposals() {
    await decideAllProposals('skipped')
  }

  return {
    interruptActionCount,
    isResumingReviewedEdits,
    reviewedToolCallStatuses: threadSync.reviewedToolCallStatuses,
    reviewedEditSignatures: threadSync.reviewedEditSignatures,
    reviewedBatchEntries,
    reviewBatchSummary,
    completedRoundResults,
    getCompletedRoundResult,
    displayOverrides,
    handleInterrupt,
    resetReviewState,
    rejectAllPendingProposals,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    approveAllProposals,
    rejectAllProposals,
  }
}
