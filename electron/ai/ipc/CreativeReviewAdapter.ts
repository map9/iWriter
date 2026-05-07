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

function asWriteMode(value: unknown): 'append' | 'insert_at' | 'replace_range' {
  return value === 'insert_at' || value === 'replace_range' ? value : 'append'
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
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
