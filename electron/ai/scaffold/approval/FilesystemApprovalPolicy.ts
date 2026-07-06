import * as path from 'path'
import type { ResumeDecision } from '../../ipc/protocol'

export type FilesystemApprovalDecision =
  | { kind: 'auto-approve'; decision: ResumeDecision; reason: string }
  | { kind: 'requires-review'; reason: string }
  | { kind: 'auto-reject'; decision: ResumeDecision; reason: string }

export interface FilesystemWriteApprovalInput {
  toolName: string
  args: Record<string, unknown>
  workspacePath: string | null
}

const INTERNAL_WRITABLE_PREFIXES = [
  '/large_tool_results/',
  '/conversation_history/',
]

const FILESYSTEM_WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'rename_file',
  'delete_file',
  'move_file',
])

function isInternalWritablePath(filePath: string): boolean {
  return INTERNAL_WRITABLE_PREFIXES.some(prefix => filePath.startsWith(prefix))
}

function hasUnsafePathSegment(filePath: string): boolean {
  return filePath.split(/[\\/]+/).some(segment => segment === '..' || segment === '~')
}

function isInside(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath)
  const child = path.resolve(childPath)
  const relative = path.relative(parent, child)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

export function isFilesystemWriteToolName(toolName: string): boolean {
  return FILESYSTEM_WRITE_TOOL_NAMES.has(toolName)
}

/** Decide the approval outcome for a single candidate path. */
function decidePathApproval(toolName: string, rawPath: string): FilesystemApprovalDecision {
  if (!rawPath.trim()) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: `${toolName} requires a non-empty path.` },
      reason: 'Missing path.',
    }
  }

  const filePath = rawPath.trim()
  if (hasUnsafePathSegment(filePath)) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: `${toolName} was rejected because a path contains an unsafe path segment: ${filePath}` },
      reason: 'Unsafe path segment.',
    }
  }

  if (isInternalWritablePath(filePath)) {
    return {
      kind: 'auto-approve',
      decision: { type: 'approved' },
      reason: 'Internal virtual filesystem path.',
    }
  }

  if (!path.isAbsolute(filePath)) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: `${toolName} was rejected because a path must be absolute: ${filePath}` },
      reason: 'Relative path.',
    }
  }

  return { kind: 'requires-review', reason: 'absolute-path' }
}

/** Extract the absolute path(s) that must be validated for a given filesystem write/mutation tool call. */
function extractCandidatePaths(toolName: string, args: Record<string, unknown>): string[] | { error: string } {
  const asString = (value: unknown): string | null => typeof value === 'string' ? value : null

  switch (toolName) {
    case 'write_file':
    case 'edit_file':
    case 'delete_file': {
      const filePath = asString(args.file_path)
      if (filePath === null) return { error: `${toolName} requires a non-empty file_path.` }
      return [filePath]
    }
    case 'rename_file': {
      const filePath = asString(args.file_path)
      const newName = asString(args.new_name)
      if (filePath === null) return { error: `${toolName} requires a non-empty file_path.` }
      if (!newName || !newName.trim()) return { error: `${toolName} requires a non-empty new_name.` }
      if (/[\\/]/.test(newName) || newName === '.' || newName === '..' || newName.startsWith('~')) {
        return { error: `${toolName} was rejected because new_name must be a plain filename without path separators: ${newName}` }
      }
      const target = path.isAbsolute(filePath) ? path.join(path.dirname(filePath), newName) : newName
      return [filePath, target]
    }
    case 'move_file': {
      const sourcePath = asString(args.source_path)
      const destinationPath = asString(args.destination_path)
      if (sourcePath === null) return { error: `${toolName} requires a non-empty source_path.` }
      if (destinationPath === null) return { error: `${toolName} requires a non-empty destination_path.` }
      return [sourcePath, destinationPath]
    }
    default:
      return []
  }
}

export function decideFilesystemWriteApproval(input: FilesystemWriteApprovalInput): FilesystemApprovalDecision {
  if (!isFilesystemWriteToolName(input.toolName)) {
    return { kind: 'requires-review', reason: 'Not a filesystem write tool.' }
  }

  const candidatePaths = extractCandidatePaths(input.toolName, input.args)
  if (!Array.isArray(candidatePaths)) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: candidatePaths.error },
      reason: 'Invalid arguments.',
    }
  }

  let needsReview = false
  for (const rawPath of candidatePaths) {
    const decision = decidePathApproval(input.toolName, rawPath)
    if (decision.kind === 'auto-reject') return decision
    if (decision.kind === 'requires-review') needsReview = true
  }

  if (!needsReview) {
    // Every candidate path was an internal virtual path.
    return {
      kind: 'auto-approve',
      decision: { type: 'approved' },
      reason: 'Internal virtual filesystem path.',
    }
  }

  // At least one path requires the workspace-scope check below.
  for (const rawPath of candidatePaths) {
    const filePath = rawPath.trim()
    if (isInternalWritablePath(filePath)) continue
    if (!path.isAbsolute(filePath)) continue // already auto-rejected above

    if (input.workspacePath && isInside(input.workspacePath, filePath)) {
      continue
    }

    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: `${input.toolName} was rejected because it targets a path outside the current workspace: ${filePath}` },
      reason: 'Outside workspace.',
    }
  }

  return {
    kind: 'requires-review',
    reason: 'Workspace file operation requires user review.',
  }
}
