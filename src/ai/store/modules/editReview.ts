import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type {
  AiThread,
  AiToolCall,
  BlockEditProposal,
  EditProposal,
  FileCreateProposal,
  ThreadMessage,
} from '@/ai/types'
import { applyBlockEditProposal } from '@/ai/edit-agent/BlockEditApplier'
import { UnifiedDocumentAccess } from '@/ai/edit-agent/UnifiedDocumentAccess'
import { stableStringify, type ToolCallStatusOverrides } from '@/ai/message/display-normalizer'
import type { ResumeDecision } from '@/ai/ipc'
import { pathUtils } from '@/utils/pathUtils'
import { DocumentType } from '@/types/document-type'
import type { LiveTurn } from './runtimeState'

export interface ProposalReviewEntry {
  proposal: EditProposal
  state: 'approved' | 'edited' | 'rework' | 'paused' | 'ended' | 'rejected'
  label: string
  tone: 'green' | 'blue' | 'amber' | 'gray'
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
}

interface AppStoreLike {
  activeTab?: {
    path?: string | null
    editorInstance?: unknown
  } | null
  createTab: (name?: string, path?: string, documentType?: DocumentType, fileReadonly?: boolean) => unknown
}

interface EditReviewModuleDeps {
  appStore: AppStoreLike
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
  const reviewedToolCallStatuses = ref<Record<string, AiToolCall['status']>>({})
  const reviewedEditSignatures = ref<Record<string, AiToolCall['status']>>({})

  const decisionRecord = new Map<number, {
    type: 'approved' | 'edited' | 'rejected'
    editedArgs?: Record<string, unknown>
    message?: string
  }>()
  const proposalIndexMap = new Map<string, number>()
  const proposalBatch = new Map<number, EditProposal>()

  function displayOverrides(): ToolCallStatusOverrides {
    return {
      byId: reviewedToolCallStatuses.value,
      bySignature: reviewedEditSignatures.value,
    }
  }

  function proposalToolSignature(proposal: EditProposal): string {
    if (proposal.kind === 'create_file') {
      return `create_document:${stableStringify({
        filename: proposal.filename,
        content: proposal.content,
      })}`
    }
    switch (proposal.type) {
      case 'edit':
        return `edit_block:${stableStringify({
          block_id: proposal.displayBlockId,
          file_path: proposal.filePath,
        })}`
      case 'insert':
        return `insert_block:${stableStringify({
          after_block_id: proposal.displayBlockId ?? 0,
          file_path: proposal.filePath,
        })}`
      case 'delete':
        return `delete_block:${stableStringify({
          block_id: proposal.displayBlockId,
          file_path: proposal.filePath,
        })}`
      case 'replace_range':
        return `replace_range:${stableStringify({
          start_block_id: proposal.startDisplayBlockId,
          end_block_id: proposal.endDisplayBlockId,
          file_path: proposal.filePath,
        })}`
    }
  }

  function proposalMatchesToolCall(proposal: EditProposal, toolCall: AiToolCall): boolean {
    if (toolCall.id === proposal.toolCallId) return true

    const args = toolCall.arguments
    if (proposal.kind === 'create_file') {
      return toolCall.name === 'create_document'
        && String(args.filename ?? '') === String(proposal.filename ?? '')
    }

    const sameFilePath = String(args.file_path ?? '') === String(proposal.filePath ?? '')
    switch (proposal.type) {
      case 'edit':
        return toolCall.name === 'edit_block'
          && String(args.block_id ?? '') === String(proposal.displayBlockId ?? '')
          && sameFilePath
      case 'insert':
        return toolCall.name === 'insert_block'
          && String(args.after_block_id ?? 0) === String(proposal.displayBlockId ?? 0)
          && sameFilePath
      case 'delete':
        return toolCall.name === 'delete_block'
          && String(args.block_id ?? '') === String(proposal.displayBlockId ?? '')
          && sameFilePath
      case 'replace_range':
        return toolCall.name === 'replace_range'
          && String(args.start_block_id ?? '') === String(proposal.startDisplayBlockId ?? '')
          && String(args.end_block_id ?? '') === String(proposal.endDisplayBlockId ?? '')
          && sameFilePath
    }
  }

  function updateLocalProposalToolCall(
    proposalOrId: EditProposal | string,
    status: AiToolCall['status'],
  ) {
    const proposal = typeof proposalOrId === 'string'
      ? findProposal(proposalOrId)
      : proposalOrId
    if (!proposal) return
    const proposalSignature = proposalToolSignature(proposal)
    const toolCallId = proposal.toolCallId
    if (toolCallId) {
      reviewedToolCallStatuses.value = {
        ...reviewedToolCallStatuses.value,
        [toolCallId]: status,
      }
    }
    reviewedEditSignatures.value = {
      ...reviewedEditSignatures.value,
      [proposalToolSignature(proposal)]: status,
    }

    const thread = deps.activeThread.value
    if (!thread?.messages?.length) return
    const hasSourceMessage = !!proposal.sourceMessageId
      && thread.messages.some(message => message.id === proposal.sourceMessageId)

    const messages = thread.messages.map(message => {
      if (hasSourceMessage && message.id !== proposal.sourceMessageId) return message
      if (!message.toolCalls?.length) return message
      return {
        ...message,
        toolCalls: message.toolCalls.map(tc => {
          const isMatch =
            tc.id === toolCallId
            || `${tc.name}:${stableStringify(tc.arguments)}` === proposalSignature
            || proposalMatchesToolCall(proposal, tc)
          return isMatch ? { ...tc, status } : tc
        }),
      }
    })
    deps.updateThread({ ...thread, messages: deps.normalizeMessagesForDisplay(messages) })
  }

  function buildProposalFailureMessage(proposal: BlockEditProposal, error: string): string {
    const target = proposal.filePath ? `file "${proposal.filePath}"` : 'the active document'
    switch (proposal.type) {
      case 'edit':
      case 'delete':
        return `Edit failed on ${target} for block_id=${proposal.displayBlockId ?? 'unknown'}: ${error} Re-read the latest document content with get_blocks or get_section before deciding whether to retry.`
      case 'insert':
        return `Insert failed on ${target} after block_id=${proposal.displayBlockId ?? 0}: ${error} Re-read the latest document content with get_blocks or get_section before deciding whether to retry.`
      case 'replace_range':
        return `Replace failed on ${target} for block_ids=${proposal.startDisplayBlockId ?? 'unknown'}-${proposal.endDisplayBlockId ?? 'unknown'}: ${error} Re-read the latest document content with get_blocks or get_section before deciding whether to retry.`
      default:
        return `Edit failed on ${target}: ${error} Re-read the latest document content before deciding whether to retry.`
    }
  }

  async function applyBlockProposalToTarget(proposal: BlockEditProposal) {
    if (proposal.filePath) {
      if (!pathUtils.isAbsolutePath(proposal.filePath)) {
        return { success: false as const, error: `file_path 必须是绝对路径，当前收到: ${proposal.filePath}` }
      }

      const fileExists = await window.electronAPI.pathExists(proposal.filePath)
      if (!fileExists) {
        return { success: false as const, error: `目标文件不存在: ${proposal.filePath}` }
      }

      const currentFilePath = deps.appStore.activeTab?.path
      const isActiveFile = !!currentFilePath
        && pathUtils.normalize(currentFilePath) === pathUtils.normalize(proposal.filePath)

      if (!isActiveFile) {
        const handle = await UnifiedDocumentAccess.createFreshFromFile(proposal.filePath)
        if ('error' in handle) return { success: false as const, error: handle.error }
        const result = await handle.applyBlockProposal(proposal)
        handle.dispose()
        return result.success
          ? { success: true as const }
          : { success: false as const, error: result.error }
      }
    }

    const editor = deps.appStore.activeTab?.editorInstance as Editor | undefined
    if (!editor) return { success: false as const, error: '没有活动的编辑器文档' }

    const handle = UnifiedDocumentAccess.fromEditor(editor, deps.appStore.activeTab?.path ?? undefined)
    const result = await handle.applyBlockProposal(proposal)
    return result.success
      ? { success: true as const }
      : { success: false as const, error: result.error }
  }

  function resetReviewState(options?: { clearLiveTurnProposals?: boolean }) {
    deps.interruptedThreadId.value = null
    deps.interruptedTurnId.value = null
    interruptActionCount.value = 0
    isResumingReviewedEdits.value = false
    decisionRecord.clear()
    proposalIndexMap.clear()
    proposalBatch.clear()
    if (options?.clearLiveTurnProposals) {
      const liveTurn = deps.ensureLiveTurn()
      if (liveTurn) {
        liveTurn.proposals = []
        deps.liveTurnRef.value = { ...liveTurn }
      }
    }
  }

  function rejectAllPendingProposals() {
    if (!deps.pendingEditProposals.value.length && !interruptActionCount.value) return

    const threadId = deps.interruptedThreadId.value
    if (threadId && interruptActionCount.value > 0) {
      const decisions: ResumeDecision[] = Array.from(
        { length: interruptActionCount.value },
        () => ({ type: 'rejected' as const, message: 'User sent a new message' })
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
    decisionRecord.clear()
    proposalIndexMap.clear()
    proposalBatch.clear()

    const liveTurn = deps.ensureLiveTurn({
      threadId: params.threadId,
      turnId: params.turnId,
      state: 'interrupted',
    })
    if (liveTurn) {
      liveTurn.proposals = params.proposals
      deps.liveTurnRef.value = { ...liveTurn }
    }

    params.proposals.forEach((proposal, index) => {
      proposalIndexMap.set(proposal.id, index)
      proposalBatch.set(index, proposal)
    })
  }

  function findProposal(proposalId: string): EditProposal | undefined {
    const pendingProposal = deps.pendingEditProposals.value.find(p => p.id === proposalId)
    if (pendingProposal) return pendingProposal
    for (const proposal of proposalBatch.values()) {
      if (proposal.id === proposalId) return proposal
    }
    return undefined
  }

  function removePendingProposal(proposalId: string) {
    const liveTurn = deps.ensureLiveTurn()
    if (!liveTurn) return
    liveTurn.proposals = liveTurn.proposals.filter(p => p.id !== proposalId)
    deps.liveTurnRef.value = { ...liveTurn }
  }

  function normalizeEditedArgsForProposal(
    proposal: BlockEditProposal,
    editedArgs: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (proposal.type) {
      case 'edit':
        return {
          block_id: proposal.displayBlockId,
          new_content: editedArgs.new_content ?? proposal.newContent ?? '',
          expected_current_content: proposal.expectedCurrentContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
      case 'insert':
        return {
          after_block_id: proposal.displayBlockId ?? 0,
          new_blocks: editedArgs.new_blocks ?? editedArgs.new_content ?? proposal.newContent ?? '',
          expected_anchor_content: proposal.expectedAnchorContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
      case 'replace_range':
        return {
          start_block_id: proposal.startDisplayBlockId,
          end_block_id: proposal.endDisplayBlockId,
          new_content: editedArgs.new_content ?? proposal.newContent ?? '',
          expected_old_content: proposal.expectedOldContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
      case 'delete':
        return {
          block_id: proposal.displayBlockId,
          expected_current_content: proposal.expectedCurrentContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
    }
  }

  function proposalSortKey(proposal: EditProposal): { fileKey: string; position: number; priority: number } {
    if (proposal.kind === 'create_file') {
      return { fileKey: `create:${proposal.filename}`, position: Number.NEGATIVE_INFINITY, priority: 99 }
    }
    const position = proposal.type === 'replace_range'
      ? (proposal.startDisplayBlockId ?? -1)
      : (proposal.displayBlockId ?? -1)
    const priority = proposal.type === 'delete' ? 0 : proposal.type === 'replace_range' ? 1 : proposal.type === 'edit' ? 2 : 3
    return { fileKey: proposal.filePath ?? '__active__', position, priority }
  }

  function sortedDecisionIndexes(): number[] {
    return Array.from(decisionRecord.entries())
      .filter(([, record]) => record.type === 'approved' || record.type === 'edited')
      .map(([index]) => index)
      .sort((a, b) => {
        const proposalA = proposalBatch.get(a)
        const proposalB = proposalBatch.get(b)
        if (!proposalA || !proposalB) return a - b
        const keyA = proposalSortKey(proposalA)
        const keyB = proposalSortKey(proposalB)
        if (keyA.fileKey !== keyB.fileKey) return keyA.fileKey.localeCompare(keyB.fileKey)
        if (keyA.position !== keyB.position) return keyB.position - keyA.position
        if (keyA.priority !== keyB.priority) return keyA.priority - keyB.priority
        return a - b
      })
  }

  async function applyRecordedDecision(index: number): Promise<void> {
    const decision = decisionRecord.get(index)
    const proposal = proposalBatch.get(index)
    if (!decision || !proposal || decision.type === 'rejected') return

    if (proposal.kind === 'create_file') {
      const createProposal = proposal as FileCreateProposal
      deps.appStore.createTab(createProposal.filename, undefined, DocumentType.MARKDOWN_EDITOR)

      const getEditor = (): Editor | undefined => deps.appStore.activeTab?.editorInstance as Editor | undefined
      for (let i = 0; i < 20; i++) {
        await nextTick()
        if (getEditor()) break
      }

      const editor = getEditor()
      if (!editor) {
        updateLocalProposalToolCall(proposal, 'failed')
        decisionRecord.set(index, { type: 'rejected', message: 'Document creation failed: editor not ready.' })
        return
      }

      const insertProposal: BlockEditProposal = {
        id: proposal.id,
        kind: 'block',
        type: 'insert',
        status: 'pending',
        afterNodeId: '0',
        newContent: createProposal.content,
      }
      const result = await applyBlockEditProposal(editor, insertProposal)
      if (!result.success) {
        updateLocalProposalToolCall(proposal, 'failed')
        decisionRecord.set(index, { type: 'rejected', message: `Document creation failed: ${result.error}` })
        return
      }

      updateLocalProposalToolCall(proposal, 'completed')
      return
    }

    const blockProposal = { ...proposal } as BlockEditProposal
    if (decision.type === 'edited' && decision.editedArgs) {
      const normalizedEditedArgs = normalizeEditedArgsForProposal(blockProposal, decision.editedArgs)
      decision.editedArgs = normalizedEditedArgs
      if (typeof normalizedEditedArgs.new_content === 'string') blockProposal.newContent = normalizedEditedArgs.new_content
      if (typeof normalizedEditedArgs.new_blocks === 'string') blockProposal.newContent = normalizedEditedArgs.new_blocks
    }

    const result = await applyBlockProposalToTarget(blockProposal)
    if (!result.success) {
      updateLocalProposalToolCall(proposal, 'failed')
      decisionRecord.set(index, {
        type: 'rejected',
        message: buildProposalFailureMessage(blockProposal, result.error ?? 'Unknown apply error.'),
      })
      return
    }

    updateLocalProposalToolCall(proposal, 'completed')
  }

  async function flushReviewedBatch() {
    for (const index of sortedDecisionIndexes()) {
      await applyRecordedDecision(index)
    }
  }

  async function maybeFlushResume() {
    const threadId = deps.interruptedThreadId.value
    const count = interruptActionCount.value
    if (!threadId || count === 0 || decisionRecord.size < count) return

    await flushReviewedBatch()

    const decisions: ResumeDecision[] = Array.from({ length: count }, (_, index) => {
      const record = decisionRecord.get(index)!
      return {
        type: record.type,
        editedArgs: record.editedArgs,
        message: record.type === 'rejected' ? (record.message ?? 'User rejected.') : undefined,
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
    decisionRecord.clear()
    proposalIndexMap.clear()
    proposalBatch.clear()

    window.electronAPI.aiResume?.({ threadId, decisions })

    const liveTurn = deps.ensureLiveTurn({ threadId, state: 'resuming' })
    if (liveTurn) {
      liveTurn.proposals = []
      deps.liveTurnRef.value = { ...liveTurn }
    }
  }

  async function approveEditProposal(proposalId: string) {
    const proposal = findProposal(proposalId)
    if (!proposal) return
    const proposalIndex = proposalIndexMap.get(proposalId) ?? -1
    if (proposalIndex >= 0) decisionRecord.set(proposalIndex, { type: 'approved' })
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function editAndApproveProposal(proposalId: string, editedArgs: Record<string, unknown>) {
    const proposal = findProposal(proposalId)
    if (!proposal || proposal.kind !== 'block') return
    const proposalIndex = proposalIndexMap.get(proposalId) ?? -1
    const normalizedEditedArgs = normalizeEditedArgsForProposal(proposal, editedArgs)

    const blockProposal = { ...proposal } as BlockEditProposal
    if (typeof normalizedEditedArgs.new_content === 'string') blockProposal.newContent = normalizedEditedArgs.new_content
    if (typeof normalizedEditedArgs.new_blocks === 'string') blockProposal.newContent = normalizedEditedArgs.new_blocks

    const liveTurn = deps.ensureLiveTurn()
    if (liveTurn) {
      liveTurn.proposals = liveTurn.proposals.map(current =>
        current.id === proposalId ? { ...blockProposal, wasEdited: true } : current
      )
      deps.liveTurnRef.value = { ...liveTurn }
    }

    if (proposalIndex >= 0) {
      decisionRecord.set(proposalIndex, { type: 'edited', editedArgs: normalizedEditedArgs })
    }
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function rejectEditProposal(proposalId: string, message?: string) {
    const proposalIndex = proposalIndexMap.get(proposalId) ?? -1
    if (proposalIndex >= 0) decisionRecord.set(proposalIndex, { type: 'rejected', message })
    updateLocalProposalToolCall(proposalId, 'rejected')
    removePendingProposal(proposalId)
    await maybeFlushResume()
  }

  async function requestProposalRework(proposalId: string, reason: string) {
    const currentIndex = proposalIndexMap.get(proposalId) ?? -1
    if (currentIndex >= 0) {
      decisionRecord.set(currentIndex, {
        type: 'rejected',
        message: `User requested a revision for this edit. Follow this feedback and propose an updated change: ${reason}`,
      })
    }
    updateLocalProposalToolCall(proposalId, 'rejected')

    for (const proposal of deps.pendingEditProposals.value) {
      if (proposal.id === proposalId) continue
      const index = proposalIndexMap.get(proposal.id) ?? -1
      if (index >= 0 && !decisionRecord.has(index)) {
        decisionRecord.set(index, {
          type: 'rejected',
          message: 'Stop the current edit batch after addressing the user feedback and propose the next revision in a new round.',
        })
      }
      updateLocalProposalToolCall(proposal.id, 'rejected')
    }

    const liveTurn = deps.ensureLiveTurn()
    if (liveTurn) {
      liveTurn.proposals = []
      deps.liveTurnRef.value = { ...liveTurn }
    }

    await maybeFlushResume()
  }

  async function endReviewRound(fromProposalId?: string) {
    const endMessage = 'The user ended this review round. Do not make further edits in this batch. Briefly summarize the outcome and finish.'
    for (const proposal of deps.pendingEditProposals.value) {
      const index = proposalIndexMap.get(proposal.id) ?? -1
      if (index >= 0 && !decisionRecord.has(index)) {
        decisionRecord.set(index, { type: 'rejected', message: endMessage })
      }
      updateLocalProposalToolCall(proposal.id, 'rejected')
    }

    if (fromProposalId && !deps.pendingEditProposals.value.some(proposal => proposal.id === fromProposalId)) {
      const index = proposalIndexMap.get(fromProposalId) ?? -1
      if (index >= 0 && !decisionRecord.has(index)) {
        decisionRecord.set(index, { type: 'rejected', message: endMessage })
      }
    }

    const liveTurn = deps.ensureLiveTurn()
    if (liveTurn) {
      liveTurn.proposals = []
      deps.liveTurnRef.value = { ...liveTurn }
    }

    await maybeFlushResume()
  }

  function reviewEntryForDecision(
    proposal: EditProposal,
    decision: { type: 'approved' | 'edited' | 'rejected'; editedArgs?: Record<string, unknown>; message?: string },
  ): ProposalReviewEntry {
    if (decision.type === 'approved') return { proposal, state: 'approved', label: '已确认应用', tone: 'green' }
    if (decision.type === 'edited') return { proposal, state: 'edited', label: '已确认编辑后应用', tone: 'blue' }

    const message = decision.message ?? ''
    if (message.includes('requested a revision')) return { proposal, state: 'rework', label: '已退回重做', tone: 'amber' }
    if (message.includes('Stop the current edit batch')) return { proposal, state: 'paused', label: '后续已暂停', tone: 'gray' }
    if (message.includes('ended this review round')) return { proposal, state: 'ended', label: '本轮已结束', tone: 'gray' }
    return { proposal, state: 'rejected', label: '已跳过', tone: 'gray' }
  }

  const reviewedBatchEntries = computed<ProposalReviewEntry[]>(() =>
    Array.from(decisionRecord.entries())
      .sort((a, b) => a[0] - b[0])
      .flatMap(([index, decision]) => {
        const proposal = proposalBatch.get(index)
        if (!proposal) return []
        return [reviewEntryForDecision(proposal, decision)]
      })
  )

  const reviewBatchSummary = computed<ProposalReviewSummary | null>(() => {
    const total = proposalBatch.size
    if (!total) return null

    const summary: ProposalReviewSummary = {
      total,
      resolved: decisionRecord.size,
      pending: total - decisionRecord.size,
      approved: 0,
      edited: 0,
      rework: 0,
      paused: 0,
      ended: 0,
      rejected: 0,
    }
    for (const entry of reviewedBatchEntries.value) {
      summary[entry.state] += 1
    }
    return summary
  })

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
    reviewedToolCallStatuses,
    reviewedEditSignatures,
    reviewedBatchEntries,
    reviewBatchSummary,
    displayOverrides,
    handleInterrupt,
    resetReviewState,
    rejectAllPendingProposals,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    requestProposalRework,
    approveAllProposals,
    rejectAllProposals,
    endReviewRound,
  }
}
