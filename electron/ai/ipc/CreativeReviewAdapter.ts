import type { CreativeReviewItem } from '../../../src/types/ai'

interface ActionRequest {
  name: string
  args: Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asExactStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? [...value]
    : undefined
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function asImportCollisionPolicy(value: unknown): 'reject' | 'skip' | 'overwrite' {
  return value === 'skip' || value === 'overwrite' ? value : 'reject'
}

// Builds a creative review card from a creative-domain interrupt action. After the Phase 2
// storybible tool retirement, the creative domain only interrupts on the write-session plan gate
// (confirm_writing_plan) and git; block edits are handled by the edit review surface.
export function buildCreativeReviewItemFromAction(
  action: ActionRequest,
  toolCallId?: string,
  sourceMessageId?: string,
  sourceTurnId?: string,
): CreativeReviewItem {
  const id = `creative-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const args = action.args ?? {}

  if (action.name === 'confirm_writing_plan') {
    return {
      id,
      kind: 'creative_plan',
      toolName: 'confirm_writing_plan',
      status: 'pending',
      plan: asString(args.plan),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'git') {
    return {
      id,
      kind: 'creative_git',
      toolName: 'git',
      status: 'pending',
      args: asExactStringArray(args.args) ?? [],
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'finalize_chapter') {
    return {
      id,
      kind: 'creative_chapter_finalize',
      toolName: 'finalize_chapter',
      status: 'pending',
      chapter: asString(args.chapter),
      summary: asOptionalString(args.summary),
      // Filled by the host on interrupt (AgentEngine._enrichFinalizeReviews):
      // baseline/current + hasExternalEdits. autoFallback set only for run-end synthesized cards.
      baseline: '',
      current: '',
      autoFallback: false,
      hasExternalEdits: false,
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'import_manuscript') {
    return {
      id,
      kind: 'creative_manuscript_import',
      toolName: 'import_manuscript',
      status: 'pending',
      sourcePath: asString(args.source_path),
      targetDirectory: asString(args.target_directory),
      chapterCount: Array.isArray(args.boundaries) ? args.boundaries.length : 0,
      collisionPolicy: asImportCollisionPolicy(args.collision_policy),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  throw new Error(`[CreativeReviewAdapter] unexpected creative tool name: ${action.name}`)
}
