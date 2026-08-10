import * as fs from 'fs/promises'
import * as path from 'path'
import type { CreativeReviewItem } from '../../../src/types/ai'
import type { GitService } from '../../GitService'

interface ActionRequest {
  name: string
  args: Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length ? items : undefined
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function asImportCollisionPolicy(value: unknown): 'reject' | 'skip' | 'overwrite' {
  return value === 'skip' || value === 'overwrite' ? value : 'reject'
}

async function countWorkspaceEntries(root: string): Promise<{ fileCount: number; directoryCount: number }> {
  let fileCount = 0
  let directoryCount = 0

  const visit = async (directory: string, isRoot: boolean): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => null)
    if (!entries) return
    for (const entry of entries) {
      if (isRoot && entry.name === '.git') continue
      if (entry.isDirectory()) {
        directoryCount += 1
        await visit(path.join(directory, entry.name), false)
      } else {
        fileCount += 1
      }
    }
  }

  await visit(root, true)
  return { fileCount, directoryCount }
}

/** Adds read-only, workspace-derived facts to Git approval cards before they reach the renderer. */
export async function enrichCreativeGitReviewItem(
  review: CreativeReviewItem,
  workspacePath: string | null,
  gitService: Pick<GitService, 'previewRestorePaths'>,
): Promise<CreativeReviewItem> {
  if (!workspacePath) return review
  const resolvedWorkspacePath = path.resolve(workspacePath)

  if (review.kind === 'creative_git_init') {
    const gitignorePath = path.join(resolvedWorkspacePath, '.gitignore')
    const [counts, hasGitignore] = await Promise.all([
      countWorkspaceEntries(resolvedWorkspacePath),
      fs.access(gitignorePath).then(() => true, () => false),
    ])
    return {
      ...review,
      workspacePath: resolvedWorkspacePath,
      gitDirectoryPath: path.join(resolvedWorkspacePath, '.git'),
      ...(hasGitignore && { gitignorePath }),
      ...counts,
    }
  }

  if (review.kind === 'creative_git_restore') {
    try {
      const preview = await gitService.previewRestorePaths(
        resolvedWorkspacePath,
        review.files,
        review.ref,
      )
      return {
        ...review,
        source: preview.source,
        changes: preview.files,
      }
    } catch (error) {
      console.warn('[CreativeReviewAdapter] Failed to build Git restore preview:', error)
      return {
        ...review,
        source: { ref: review.ref ?? 'index' },
        changes: review.files.map(file => ({ path: file, additions: null, deletions: null })),
      }
    }
  }

  return review
}

// Builds a creative review card from a creative-domain interrupt action. After the Phase 2
// storybible tool retirement, the creative domain only interrupts on the write-session plan gate
// (confirm_writing_plan) and the git tools; block edits are handled by the edit review surface.
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

  if (action.name === 'git_commit') {
    return {
      id,
      kind: 'creative_git_commit',
      toolName: 'git_commit',
      status: 'pending',
      message: asString(args.message),
      files: asStringArray(args.files) ?? ['.'],
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'git_tag') {
    return {
      id,
      kind: 'creative_git_tag',
      toolName: 'git_tag',
      status: 'pending',
      name: asString(args.name),
      message: asOptionalString(args.message),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'git_init') {
    return {
      id,
      kind: 'creative_git_init',
      toolName: 'git_init',
      status: 'pending',
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

  if (action.name === 'git_restore') {
    return {
      id,
      kind: 'creative_git_restore',
      toolName: 'git_restore',
      status: 'pending',
      files: asStringArray(args.files) ?? [],
      ref: asOptionalString(args.ref),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  throw new Error(`[CreativeReviewAdapter] unexpected creative tool name: ${action.name}`)
}
