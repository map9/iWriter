import * as path from 'path'
import type { FilesystemReviewItem } from '../../../shared/ai/contracts'

interface ActionRequest {
  name: string
  args: Record<string, unknown>
}

const FILESYSTEM_REVIEW_TOOL_NAMES = new Set<FilesystemReviewItem['toolName']>([
  'write_file',
  'edit_file',
  'rename_file',
  'delete_file',
  'move_file',
])

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

export function isFilesystemWriteTool(name: string): name is FilesystemReviewItem['toolName'] {
  return FILESYSTEM_REVIEW_TOOL_NAMES.has(name as FilesystemReviewItem['toolName'])
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

  const base = {
    id: `filesystem-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'filesystem' as const,
    status: 'pending' as const,
    toolName,
    toolCallId,
    sourceMessageId,
    sourceTurnId,
  }

  switch (toolName) {
    case 'write_file':
      return {
        ...base,
        targetPath: asString(args.file_path),
        newContent: asString(args.content),
      }
    case 'edit_file':
      return {
        ...base,
        targetPath: asString(args.file_path),
        newContent: asString(args.new_string),
        oldString: asString(args.old_string),
        newString: asString(args.new_string),
        replaceAll: args.replace_all === true,
      }
    case 'delete_file':
      return {
        ...base,
        targetPath: asString(args.file_path),
        recursive: args.recursive === true,
      }
    case 'rename_file': {
      const filePath = asString(args.file_path)
      const newName = asString(args.new_name)
      return {
        ...base,
        targetPath: filePath,
        destPath: filePath && newName ? path.join(path.dirname(filePath), newName) : '',
      }
    }
    case 'move_file': {
      const sourcePath = asString(args.source_path)
      return {
        ...base,
        targetPath: sourcePath,
        sourcePath,
        destPath: asString(args.destination_path),
      }
    }
  }
}
