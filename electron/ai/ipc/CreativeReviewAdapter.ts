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

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
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
