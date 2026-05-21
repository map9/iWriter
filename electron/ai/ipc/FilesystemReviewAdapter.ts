import type { FilesystemReviewItem } from '../../../src/ai/types'

interface ActionRequest {
  name: string
  args: Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

export function isFilesystemWriteTool(name: string): name is 'write_file' | 'edit_file' {
  return name === 'write_file' || name === 'edit_file'
}

export function buildFilesystemReviewItemFromAction(
  action: ActionRequest,
  toolCallId?: string,
  sourceMessageId?: string,
  sourceTurnId?: string,
): FilesystemReviewItem {
  if (!isFilesystemWriteTool(action.name)) {
    throw new Error(`buildFilesystemReviewItemFromAction: unexpected tool name "${action.name}"`)
  }
  const args = action.args ?? {}
  const toolName = action.name

  return {
    id: `filesystem-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'filesystem',
    status: 'pending',
    toolName,
    targetPath: asString(args.file_path),
    newContent: toolName === 'write_file' ? asString(args.content) : asString(args.new_string),
    oldString: toolName === 'edit_file' ? asString(args.old_string) : undefined,
    newString: toolName === 'edit_file' ? asString(args.new_string) : undefined,
    replaceAll: toolName === 'edit_file' && args.replace_all === true,
    toolCallId,
    sourceMessageId,
    sourceTurnId,
  }
}
