import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  AiThread,
  EditProposal,
  EditRoundResult,
  ThreadMessage,
} from '@/ai/types'
import type { ToolCallStatusOverrides } from '@/ai/message/display-normalizer'
import type { ResumeDecision, DomainReviewItem } from '@/ai/ipc'
import {
  flushReviewedBatch,
  normalizeEditedArgsForProposal,
  type ReviewExecutorAppStoreLike,
} from '@/ai/review/executor'
import {
  buildEditRoundResult,
  mergeEditRoundResults,
  buildProposalReviewEntries,
  buildProposalReviewSummary,
} from '@/ai/review/selectors'
import {
  createReviewBatchState,
  findProposalInBatch,
  getProposalDecision as getProposalDecisionFromBatch,
  getProposalIndex as getProposalIndexFromBatch,
  setProposalDecisionInBatch,
} from '@/ai/review/state'
import { createReviewThreadSync } from '@/ai/review/threadSync'
import type { LiveTurn } from './runtimeState'
import type {
  ProposalDecisionKind,
  ProposalReviewEntry,
  ProposalReviewSummary,
  ReviewBatchState,
} from '@/ai/review/types'

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

  function getProposalDecision(proposalId: string) {
    return getProposalDecisionFromBatch(getReviewBatch(), proposalId)
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
      window.electronAPI.aiResume?.({ threadId, decisions })
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
    interruptActionCount.value = params.proposals.length
    isResumingReviewedEdits.value = false

    const liveTurn = deps.ensureLiveTurn({
      threadId: params.threadId,
      turnId: params.turnId,
      state: 'interrupted',
    })
    if (liveTurn) {
      liveTurn.reviews = params.proposals.map((p): DomainReviewItem => ({ kind: 'edit', payload: p }))
      deps.liveTurnRef.value = { ...liveTurn }
    }

    setReviewBatch(createReviewBatchState(
      params.threadId,
      params.turnId ?? deps.currentTurnId.value,
      params.proposals,
    ))
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
      if (!record) return { type: 'rejected', message: 'User rejected.' }
      return {
        type: record.kind === 'approved' ? 'approved' : record.kind === 'edited' ? 'edited' : 'rejected',
        editedArgs: record.editedArgs,
        message: record.kind === 'approved' || record.kind === 'edited' ? undefined : (record.message ?? 'User rejected.'),
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

    window.electronAPI.aiResume?.({ threadId, decisions })

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
    if (getProposalIndex(proposalId) >= 0) setProposalDecision(proposalId, 'skipped', { message })
    threadSync.updateLocalProposalToolCall(proposalId, 'rejected')
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function requestProposalRework(proposalId: string, reason: string) {
    if (getProposalIndex(proposalId) >= 0) {
      setProposalDecision(proposalId, 'rework_requested', {
        message: `User requested a revision for this edit only. Keep other proposal decisions unchanged. After the current review round finishes, propose an updated change for this item using this feedback: ${reason}`,
      })
    }
    threadSync.updateLocalProposalToolCall(proposalId, 'rejected')
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function skipRemainingProposalsAndContinue() {
    const skipMessage = 'User skipped the remaining proposals in this batch. Continue from the already reviewed decisions without ending the whole round.'
    for (const proposal of deps.pendingEditProposals.value) {
      if (getProposalIndex(proposal.id) >= 0 && !getProposalDecision(proposal.id)) {
        setProposalDecision(proposal.id, 'skipped', { message: skipMessage })
      }
      threadSync.updateLocalProposalToolCall(proposal.id, 'rejected')
    }

    const liveTurn = deps.ensureLiveTurn()
    if (liveTurn) {
      liveTurn.reviews = liveTurn.reviews.filter((r: DomainReviewItem) => r.kind !== 'edit')
      deps.liveTurnRef.value = { ...liveTurn }
    }

    await maybeFlushResume()
  }

  async function endReviewRound(fromProposalId?: string) {
    const endMessage = 'The user ended this review round. Do not make further edits in this batch. Briefly summarize the outcome and finish.'
    for (const proposal of deps.pendingEditProposals.value) {
      if (getProposalIndex(proposal.id) >= 0 && !getProposalDecision(proposal.id)) {
        setProposalDecision(proposal.id, 'round_ended', { message: endMessage })
      }
      threadSync.updateLocalProposalToolCall(proposal.id, 'rejected')
    }

    if (fromProposalId && !deps.pendingEditProposals.value.some(proposal => proposal.id === fromProposalId)) {
      if (getProposalIndex(fromProposalId) >= 0 && !getProposalDecision(fromProposalId)) {
        setProposalDecision(fromProposalId, 'round_ended', { message: endMessage })
      }
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
    const ids = [...deps.pendingEditProposals.value].map(proposal => proposal.id)
    for (const id of ids) await approveEditProposal(id)
  }

  async function rejectAllProposals() {
    await endReviewRound()
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
    requestProposalRework,
    skipRemainingProposalsAndContinue,
    approveAllProposals,
    rejectAllProposals,
    endReviewRound,
  }
}
