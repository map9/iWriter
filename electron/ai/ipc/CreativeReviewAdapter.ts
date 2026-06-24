import * as fs from 'fs'
import * as path from 'path'
import type { CreativeReviewItem } from '../../../src/types/ai'

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

function asDirectionArray(value: unknown): Array<{ name: string; description: string }> {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      name: asString(item.name),
      description: asString(item.description),
    }))
    .filter(item => item.name || item.description)
}

function asDirectionSummaryArray(value: unknown): Array<{ name: string; summary: string; narrativeConsequences: string[] }> | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      name: asString(item.name),
      summary: asString(item.summary),
      narrativeConsequences: asStringArray(item.narrative_consequences ?? item.narrativeConsequences) ?? [],
    }))
    .filter(item => item.name || item.summary || item.narrativeConsequences.length)
  return items.length ? items : undefined
}

function asWriteMode(value: unknown): 'append' | 'insert_at' | 'replace_range' {
  return value === 'insert_at' || value === 'replace_range' ? value : 'append'
}

function asPromoteMode(value: unknown): 'append' | 'replace' {
  return value === 'replace' ? 'replace' : 'append'
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveMarkdownSubpath(workspacePath: string, subdir: string, filename: string): string | null {
  const trimmed = filename.trim()
  if (!trimmed || path.isAbsolute(trimmed) || trimmed.startsWith('~') || /^[a-zA-Z]:[\\/]/.test(trimmed)) return null
  if (trimmed.split(/[\\/]+/).includes('..')) return null
  const root = path.resolve(workspacePath, subdir)
  const withExt = path.extname(trimmed) ? trimmed : `${trimmed}.md`
  if (path.extname(withExt).toLowerCase() !== '.md') return null
  const resolved = path.resolve(root, withExt)
  return isInside(root, resolved) ? resolved : null
}

function readOptionalFile(filePath: string | null): string | undefined {
  if (!filePath || !fs.existsSync(filePath)) return undefined
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

export function buildCreativeReviewItemFromAction(
  action: ActionRequest,
  toolCallId?: string,
  sourceMessageId?: string,
  sourceTurnId?: string,
  workspacePath?: string | null,
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

  if (action.name === 'write_to_chapter') {
    return {
      id,
      kind: 'creative_write',
      toolName: 'write_to_chapter',
      status: 'pending',
      filename: asString(args.filename),
      mode: asWriteMode(args.mode),
      approvedPlan: asString(args.approved_plan ?? args.approvedPlan),
      newContent: asString(args.content),
      insertAnchor: asOptionalString(args.insert_anchor),
      replaceStartAnchor: asOptionalString(args.replace_start_anchor),
      replaceEndAnchor: asOptionalString(args.replace_end_anchor),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'replace_storybible_section') {
    return {
      id,
      kind: 'creative_storybible',
      toolName: 'replace_storybible_section',
      status: 'pending',
      section: asString(args.section),
      newContent: asString(args.content),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'resolve_open_question') {
    return {
      id,
      kind: 'creative_storybible',
      toolName: 'resolve_open_question',
      status: 'pending',
      section: asString(args.target_section),
      targetSection: asString(args.target_section),
      question: asString(args.question),
      newContent: asString(args.resolution),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'create_chapter') {
    return {
      id,
      kind: 'creative_chapter_structure',
      toolName: 'create_chapter',
      status: 'pending',
      operation: 'create',
      filename: asString(args.filename),
      afterFilename: asOptionalString(args.after_filename),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'delete_chapter') {
    return {
      id,
      kind: 'creative_chapter_structure',
      toolName: 'delete_chapter',
      status: 'pending',
      operation: 'delete',
      filename: asString(args.filename),
      cascadeRenumber: asBoolean(args.cascade_renumber),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'rename_chapter') {
    return {
      id,
      kind: 'creative_chapter_structure',
      toolName: 'rename_chapter',
      status: 'pending',
      operation: 'rename',
      filename: asString(args.filename),
      newFilename: asString(args.new_filename),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'reorder_chapters') {
    return {
      id,
      kind: 'creative_chapter_structure',
      toolName: 'reorder_chapters',
      status: 'pending',
      operation: 'reorder',
      order: asStringArray(args.order) ?? [],
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
      files: asStringArray(args.files) ?? ['storybible.md', 'draft/'],
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

  if (action.name === 'start_exploration') {
    return {
      id,
      kind: 'creative_exploration_start',
      toolName: 'start_exploration',
      status: 'pending',
      context: asString(args.context),
      directions: asDirectionArray(args.directions),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'finish_exploration') {
    return {
      id,
      kind: 'creative_exploration_compare',
      toolName: 'finish_exploration',
      status: 'pending',
      comparisonReport: asString(args.comparison_report),
      directionSummaries: asDirectionSummaryArray(args.direction_summaries),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'promote_exploration') {
    const workspace = workspacePath ? path.resolve(workspacePath) : null
    const beforeContent = workspace
      ? readOptionalFile(resolveMarkdownSubpath(workspace, 'draft', asString(args.target_chapter)))
      : undefined
    const storedExplorationContent = workspace
      ? readOptionalFile(resolveMarkdownSubpath(workspace, '.iwriter/explorations', asString(args.direction_name)))
      : undefined
    return {
      id,
      kind: 'creative_exploration_merge',
      toolName: 'promote_exploration',
      status: 'pending',
      directionName: asString(args.direction_name),
      targetChapter: asString(args.target_chapter),
      mode: asPromoteMode(args.mode),
      beforeContent,
      newContent: asOptionalString(args.content) ?? storedExplorationContent,
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'delete_exploration') {
    return {
      id,
      kind: 'creative_exploration_delete',
      toolName: 'delete_exploration',
      status: 'pending',
      directionName: asString(args.direction_name),
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name === 'compress_storybible_history') {
    return {
      id,
      kind: 'creative_compress',
      toolName: 'compress_storybible_history',
      status: 'pending',
      completedChapters: asStringArray(args.completed_chapters) ?? [],
      toolCallId,
      sourceMessageId,
      sourceTurnId,
    }
  }

  if (action.name !== 'rebuild_storybible') {
    console.warn('[CreativeReviewAdapter] unexpected creative tool name:', action.name, '— treating as rebuild_storybible')
  }
  return {
    id,
    kind: 'creative_storybible',
    toolName: 'rebuild_storybible',
    status: 'pending',
    newContent: asString(args.content),
    toolCallId,
    sourceMessageId,
    sourceTurnId,
  }
}
