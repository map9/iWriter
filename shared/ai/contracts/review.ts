interface BaseEditProposal {
  id: string
  description?: string
  status: 'pending' | 'applied' | 'rejected'
  sourceMessageId?: string
  sourceTurnId?: string
  wasEdited?: boolean
  autoApply?: boolean
}

export interface BlockEditProposal extends BaseEditProposal {
  kind: 'block'
  type: 'edit' | 'insert' | 'delete' | 'replace_range'
  displayBlockId?: number
  nodeId?: string
  nodeType?: string
  afterNodeId?: string
  oldContent?: string
  anchorContent?: string
  newContent?: string
  expectedCurrentContent?: string
  expectedAnchorContent?: string
  expectedOldContent?: string
  startDisplayBlockId?: number
  endDisplayBlockId?: number
  startNodeId?: string
  endNodeId?: string
  toolCallId?: string
  filePath: string
}

export interface FileCreateProposal extends BaseEditProposal {
  kind: 'create_file'
  filename: string
  content: string
  toolCallId?: string
  directory?: string
  openInEditor?: boolean
}

export type EditProposal = BlockEditProposal | FileCreateProposal

interface BaseCreativeReviewItem {
  id: string
  status: 'pending' | 'applied' | 'rejected'
  sourceMessageId?: string
  sourceTurnId?: string
  toolCallId?: string
  wasEdited?: boolean
}

export interface CreativePlanReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_plan'
  toolName: 'confirm_writing_plan'
  plan: string
}

export interface CreativeGitReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_git'
  toolName: 'git'
  args: string[]
}

export interface CreativeChapterFinalizeReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_chapter_finalize'
  toolName: 'finalize_chapter'
  chapter: string
  summary?: string
  baseline: string
  current: string
  autoFallback?: boolean
  hasExternalEdits?: boolean
}

export interface CreativeManuscriptImportReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_manuscript_import'
  toolName: 'import_manuscript'
  sourcePath: string
  targetDirectory: string
  chapterCount: number
  collisionPolicy?: 'reject' | 'skip' | 'overwrite'
}

export type CreativeReviewItem =
  | CreativePlanReviewItem
  | CreativeGitReviewItem
  | CreativeChapterFinalizeReviewItem
  | CreativeManuscriptImportReviewItem

export interface FilesystemReviewItem {
  id: string
  kind: 'filesystem'
  status: 'pending' | 'applied' | 'rejected'
  toolName: 'write_file' | 'edit_file' | 'rename_file' | 'delete_file' | 'move_file'
  targetPath: string
  newContent?: string
  oldString?: string
  newString?: string
  replaceAll?: boolean
  sourcePath?: string
  destPath?: string
  recursive?: boolean
  sourceMessageId?: string
  sourceTurnId?: string
  toolCallId?: string
}

export type DomainReviewItem =
  | { kind: 'edit'; payload: EditProposal }
  | { kind: 'creative'; payload: CreativeReviewItem }
  | { kind: 'filesystem'; payload: FilesystemReviewItem }

export function isDomainReviewItem(value: unknown): value is DomainReviewItem {
  if (!value || typeof value !== 'object') return false

  const candidate = value as { kind?: unknown; payload?: unknown }
  const hasSupportedKind = candidate.kind === 'edit'
    || candidate.kind === 'creative'
    || candidate.kind === 'filesystem'

  return hasSupportedKind && !!candidate.payload && typeof candidate.payload === 'object'
}

export type EditRoundResultState =
  | 'applied'
  | 'applied_edited'
  | 'skipped'
  | 'rework_requested'
  | 'ended'
  | 'failed_to_apply'

export type CreativeRoundResultState =
  | 'applied'
  | 'applied_edited'
  | 'skipped'
  | 'failed_to_apply'

export interface CreativeRoundResultItem {
  reviewId: string
  state: CreativeRoundResultState
  kind: CreativeReviewItem['kind']
  toolName: string
  label: string
  finalContent?: string
  failureMessage?: string
}

export interface CreativeRoundResult {
  total: number
  applied: number
  appliedEdited: number
  skipped: number
  failedToApply: number
  items: CreativeRoundResultItem[]
}

export interface EditRoundResultItem {
  proposalId: string
  state: EditRoundResultState
  kind: EditProposal['kind'] | BlockEditProposal['type']
  label: string
  filePath?: string
  description?: string
  oldContent?: string
  newContent?: string
  finalAppliedContent?: string
  failureMessage?: string
  blockInfo?: {
    displayBlockId?: number
    startDisplayBlockId?: number
    endDisplayBlockId?: number
  }
}

export interface EditRoundResult {
  total: number
  applied: number
  appliedEdited: number
  skipped: number
  reworkRequested: number
  ended: number
  failedToApply: number
  items: EditRoundResultItem[]
}
