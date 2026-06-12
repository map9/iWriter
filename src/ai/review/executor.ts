import type { Editor } from '@tiptap/core'
import type { BlockEditProposal, EditProposal, FileCreateProposal } from '@/ai/types'
import { UnifiedDocumentAccess } from '@/ai/edit-agent/UnifiedDocumentAccess'
import { pathUtils } from '@/utils/pathUtils'
import { DocumentType } from '@/types/document-type'
import type { ReviewBatchState } from './types'

/** Prefix for the virtual_id of an in-memory unsaved_new document, e.g. "untitled:<tab.id>". */
const UNTITLED_PREFIX = 'untitled:'

export interface ReviewExecutorAppStoreLike {
  tabs?: Array<{
    id?: string
    name?: string
    path?: string | null
    editorInstance?: unknown
  }>
  activeTab?: {
    path?: string | null
    editorInstance?: unknown
  } | null
  createTab: (
    name?: string,
    path?: string,
    documentType?: DocumentType,
    fileReadonly?: boolean,
    pendingImport?: { markdown: string; sourcePath?: string },
  ) => unknown
}

function hasPathLikeExtension(value: string): boolean {
  const basename = pathUtils.basename(value)
  return /\.[^./\\]+$/.test(basename)
}

function normalizeCreateDocumentDiskFilename(filename: string): string {
  const trimmed = filename.trim()
  if (!trimmed) return ''
  return hasPathLikeExtension(trimmed) ? trimmed : `${trimmed}.md`
}

function hasOpenCreateDocumentTarget(
  appStore: ReviewExecutorAppStoreLike,
  proposal: FileCreateProposal,
): boolean {
  const directory = proposal.directory ? pathUtils.normalize(proposal.directory) : undefined
  const filename = directory
    ? normalizeCreateDocumentDiskFilename(proposal.filename)
    : proposal.filename.trim()
  const targetPath = directory ? pathUtils.normalize(pathUtils.join(directory, filename)) : undefined

  return (appStore.tabs ?? []).some(tab => {
    const tabPath = tab.path ? pathUtils.normalize(tab.path) : undefined
    if (targetPath && tabPath === targetPath) return true
    return !targetPath && (tab.name ?? '').trim() === filename
  })
}

function buildApplyFailureRecoveryMessage(target: string): string {
  return `This is a system apply failure, not a user rejection. The target block IDs for ${target} may be stale after prior edits. Call get_document_outline(file_path=...) first, then read the updated target section or blocks before deciding whether to retry. Do not repeat the same edit call unchanged.`
}

export function buildProposalFailureMessage(proposal: BlockEditProposal, error: string): string {
  const target = proposal.filePath ? `file "${proposal.filePath}"` : 'the active document'
  const recovery = buildApplyFailureRecoveryMessage(target)
  switch (proposal.type) {
    case 'edit':
    case 'delete':
      return `Edit failed on ${target} for block_id=${proposal.displayBlockId ?? 'unknown'}: ${error} ${recovery}`
    case 'insert':
      return `Insert failed on ${target} after block_id=${proposal.displayBlockId ?? 0}: ${error} ${recovery}`
    case 'replace_range':
      return `Replace failed on ${target} for block_ids=${proposal.startDisplayBlockId ?? 'unknown'}-${proposal.endDisplayBlockId ?? 'unknown'}: ${error} ${recovery}`
    default:
      return `Edit failed on ${target}: ${error} ${recovery}`
  }
}

export function normalizeEditedArgsForProposal(
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
        new_content: editedArgs.new_content ?? proposal.newContent ?? '',
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

function syncEditedStructureToProposal(
  proposal: BlockEditProposal,
  normalizedArgs: Record<string, unknown>,
): void {
  switch (proposal.type) {
    case 'edit':
    case 'delete': {
      const previousBlockId = proposal.displayBlockId
      const previousExpectedContent = proposal.expectedCurrentContent
      if (typeof normalizedArgs.block_id === 'number') {
        proposal.displayBlockId = normalizedArgs.block_id
      }
      const targetChanged = typeof normalizedArgs.block_id === 'number'
        && normalizedArgs.block_id !== previousBlockId
      if (targetChanged) {
        proposal.oldContent = undefined
        if (
          typeof normalizedArgs.expected_current_content === 'string' &&
          normalizedArgs.expected_current_content !== previousExpectedContent
        ) {
          proposal.expectedCurrentContent = normalizedArgs.expected_current_content
        } else {
          proposal.expectedCurrentContent = undefined
          delete normalizedArgs.expected_current_content
        }
      }
      return
    }
    case 'insert': {
      const previousAfterBlockId = proposal.displayBlockId
      const previousExpectedAnchorContent = proposal.expectedAnchorContent
      if (typeof normalizedArgs.after_block_id === 'number') {
        proposal.displayBlockId = normalizedArgs.after_block_id
      }
      const targetChanged = typeof normalizedArgs.after_block_id === 'number'
        && normalizedArgs.after_block_id !== previousAfterBlockId
      if (targetChanged) {
        proposal.anchorContent = undefined
        if (
          typeof normalizedArgs.expected_anchor_content === 'string' &&
          normalizedArgs.expected_anchor_content !== previousExpectedAnchorContent
        ) {
          proposal.expectedAnchorContent = normalizedArgs.expected_anchor_content
        } else {
          proposal.expectedAnchorContent = undefined
          delete normalizedArgs.expected_anchor_content
        }
      }
      return
    }
    case 'replace_range': {
      const previousStartBlockId = proposal.startDisplayBlockId
      const previousEndBlockId = proposal.endDisplayBlockId
      const previousExpectedOldContent = proposal.expectedOldContent
      if (typeof normalizedArgs.start_block_id === 'number') {
        proposal.startDisplayBlockId = normalizedArgs.start_block_id
      }
      if (typeof normalizedArgs.end_block_id === 'number') {
        proposal.endDisplayBlockId = normalizedArgs.end_block_id
      }
      const targetChanged =
        (typeof normalizedArgs.start_block_id === 'number' && normalizedArgs.start_block_id !== previousStartBlockId) ||
        (typeof normalizedArgs.end_block_id === 'number' && normalizedArgs.end_block_id !== previousEndBlockId)
      if (targetChanged) {
        proposal.oldContent = undefined
        if (
          typeof normalizedArgs.expected_old_content === 'string' &&
          normalizedArgs.expected_old_content !== previousExpectedOldContent
        ) {
          proposal.expectedOldContent = normalizedArgs.expected_old_content
        } else {
          proposal.expectedOldContent = undefined
          delete normalizedArgs.expected_old_content
        }
      }
      return
    }
  }
}

async function applyBlockProposalToTarget(
  appStore: ReviewExecutorAppStoreLike,
  proposal: BlockEditProposal,
) {
  if (proposal.filePath?.startsWith(UNTITLED_PREFIX)) {
    const tabId = proposal.filePath.slice(UNTITLED_PREFIX.length)
    const tab = (appStore.tabs ?? []).find(t => t.id === tabId)
    const editor = tab?.editorInstance as Editor | undefined
    if (!editor) return { success: false as const, error: `未找到虚拟引用 "${proposal.filePath}" 对应的未保存文档`}

    const handle = UnifiedDocumentAccess.fromEditor(editor, tab?.path ?? undefined)
    const result = await handle.applyBlockProposal(proposal)
    return result.success
      ? { success: true as const }
      : { success: false as const, error: result.error }
  }

  if (proposal.filePath) {
    const normalizedTarget = pathUtils.normalize(proposal.filePath)
    const matchingTab = (appStore.tabs ?? []).find(
      t => t.path && pathUtils.normalize(t.path) === normalizedTarget
    )
    const editor = matchingTab?.editorInstance as Editor | undefined

    if (!editor) {
      const handle = await UnifiedDocumentAccess.createFreshFromFile(proposal.filePath)
      if ('error' in handle) return { success: false as const, error: handle.error }
      const result = await handle.applyBlockProposal(proposal)
      handle.dispose()
      return result.success
        ? { success: true as const }
        : { success: false as const, error: result.error }
    }

    const handle = UnifiedDocumentAccess.fromEditor(editor, matchingTab?.path ?? undefined)
    const result = await handle.applyBlockProposal(proposal)
    return result.success
      ? { success: true as const }
      : { success: false as const, error: result.error }
  }

  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  if (!editor) return { success: false as const, error: '没有活动的编辑器文档' }

  const handle = UnifiedDocumentAccess.fromEditor(editor, appStore.activeTab?.path ?? undefined)
  const result = await handle.applyBlockProposal(proposal)
  return result.success
    ? { success: true as const }
    : { success: false as const, error: result.error }
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

function sortedDecisionIndexes(batch: ReviewBatchState): number[] {
  return batch.order
    .map((proposalId, index) => ({ proposalId, index, decision: batch.decisionsById[proposalId] }))
    .filter(({ decision }) => decision?.kind === 'approved' || decision?.kind === 'edited')
    .map(({ index }) => index)
    .sort((a, b) => {
      const proposalA = batch.proposalsById[batch.order[a] ?? '']
      const proposalB = batch.proposalsById[batch.order[b] ?? '']
      if (!proposalA || !proposalB) return a - b
      const keyA = proposalSortKey(proposalA)
      const keyB = proposalSortKey(proposalB)
      if (keyA.fileKey !== keyB.fileKey) return keyA.fileKey.localeCompare(keyB.fileKey)
      if (keyA.position !== keyB.position) return keyB.position - keyA.position
      if (keyA.priority !== keyB.priority) return keyA.priority - keyB.priority
      return a - b
    })
}

async function applyRecordedDecision(params: {
  appStore: ReviewExecutorAppStoreLike
  saveFile?: (content: string, absolutePath: string) => Promise<unknown>
  batch: ReviewBatchState
  index: number
  updateLocalProposalToolCall: (proposalOrId: EditProposal | string, status: 'completed' | 'failed') => void
  setProposalDecision: (proposalId: string, kind: 'edited' | 'skipped' | 'failed_to_apply', options?: { editedArgs?: Record<string, unknown>; message?: string }) => void
}) {
  const { appStore, saveFile, batch, index, updateLocalProposalToolCall, setProposalDecision } = params
  const proposalId = batch.order[index]
  if (!proposalId) return
  const decision = batch.decisionsById[proposalId]
  const proposal = batch.proposalsById[proposalId]
  if (!decision || !proposal || ['skipped', 'rework_requested', 'round_ended', 'batch_paused'].includes(decision.kind)) return

  if (proposal.kind === 'create_file') {
    const createProposal = proposal as FileCreateProposal
    if (hasOpenCreateDocumentTarget(appStore, createProposal)) {
      updateLocalProposalToolCall(proposal, 'failed')
      setProposalDecision(proposalId, 'failed_to_apply', {
        message: `Document creation failed: "${createProposal.filename}" already exists or is already open.`,
      })
      return
    }

    // When a target directory is provided, write to disk first then open the saved file
    if (createProposal.directory && saveFile) {
      const dir = createProposal.directory
      const filename = normalizeCreateDocumentDiskFilename(createProposal.filename)
      if (
        !pathUtils.isAbsolutePath(dir) ||
        dir.includes('..') ||
        pathUtils.basename(filename) !== filename
      ) {
        updateLocalProposalToolCall(proposal, 'failed')
        setProposalDecision(proposalId, 'failed_to_apply', {
          message: `Document creation rejected: directory must be an absolute path with no ".." traversal and filename must be a basename. Got directory="${dir}", filename="${filename}".`,
        })
        return
      }
      const absolutePath = pathUtils.join(dir, filename)
      try {
        await saveFile(createProposal.content, absolutePath)
      } catch (err) {
        updateLocalProposalToolCall(proposal, 'failed')
        setProposalDecision(proposalId, 'failed_to_apply', { message: `Document creation failed: could not write to disk. ${String(err)}` })
        return
      }
      appStore.createTab(createProposal.filename, absolutePath, DocumentType.MARKDOWN_EDITOR)
      updateLocalProposalToolCall(proposal, 'completed')
      return
    }

    appStore.createTab(
      createProposal.filename,
      undefined,
      DocumentType.MARKDOWN_EDITOR,
      false,
      { markdown: createProposal.content },
    )
    updateLocalProposalToolCall(proposal, 'completed')
    return
  }

  const blockProposal = { ...proposal } as BlockEditProposal
  if (decision.kind === 'edited' && decision.editedArgs) {
    const normalizedEditedArgs = normalizeEditedArgsForProposal(blockProposal, decision.editedArgs)
    if (typeof normalizedEditedArgs.new_content === 'string') blockProposal.newContent = normalizedEditedArgs.new_content
    syncEditedStructureToProposal(blockProposal, normalizedEditedArgs)
    setProposalDecision(proposalId, 'edited', { editedArgs: normalizedEditedArgs, message: decision.message })
  }

  const result = await applyBlockProposalToTarget(appStore, blockProposal)
  if (!result.success) {
    updateLocalProposalToolCall(proposal, 'failed')
    setProposalDecision(proposalId, 'failed_to_apply', {
      message: buildProposalFailureMessage(blockProposal, result.error ?? 'Unknown apply error.'),
    })
    return
  }

  updateLocalProposalToolCall(proposal, 'completed')
}

export async function flushReviewedBatch(params: {
  appStore: ReviewExecutorAppStoreLike
  saveFile?: (content: string, absolutePath: string) => Promise<unknown>
  batch: ReviewBatchState
  updateLocalProposalToolCall: (proposalOrId: EditProposal | string, status: 'completed' | 'failed') => void
  setProposalDecision: (proposalId: string, kind: 'edited' | 'skipped' | 'failed_to_apply', options?: { editedArgs?: Record<string, unknown>; message?: string }) => void
}) {
  for (const index of sortedDecisionIndexes(params.batch)) {
    await applyRecordedDecision({ ...params, index })
  }
}
