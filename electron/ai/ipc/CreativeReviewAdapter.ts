import type { CreativeReviewItem } from '../../../src/types/ai'
import { parseLogicAudit } from '../../../src/ai/creative/logicAudit'

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

function asWriteMode(value: unknown): 'append' | 'insert_at' | 'replace_range' {
  return value === 'insert_at' || value === 'replace_range' ? value : 'append'
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

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
      rationale: asString(args.rationale),
      alternatives: asStringArray(args.alternatives),
      logicAudit: parseLogicAudit(args.logicAudit),
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
