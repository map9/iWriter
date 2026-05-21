import * as path from 'path'
import type { ResumeDecision } from '../../ipc/protocol'

export type FilesystemApprovalDecision =
  | { kind: 'auto-approve'; decision: ResumeDecision; reason: string }
  | { kind: 'requires-review'; reason: string }
  | { kind: 'auto-reject'; decision: ResumeDecision; reason: string }

export interface FilesystemWriteApprovalInput {
  toolName: string
  filePath: unknown
  workspacePath: string | null
}

const INTERNAL_WRITABLE_PREFIXES = [
  '/large_tool_results/',
  '/conversation_history/',
]

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

export function isFilesystemWriteToolName(toolName: string): toolName is 'write_file' | 'edit_file' {
  return toolName === 'write_file' || toolName === 'edit_file'
}

export function decideFilesystemWriteApproval(input: FilesystemWriteApprovalInput): FilesystemApprovalDecision {
  if (!isFilesystemWriteToolName(input.toolName)) {
    return { kind: 'requires-review', reason: 'Not a filesystem write tool.' }
  }

  if (typeof input.filePath !== 'string' || !input.filePath.trim()) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: `${input.toolName} requires a non-empty file_path.` },
      reason: 'Missing file_path.',
    }
  }

  const filePath = input.filePath.trim()
  if (hasUnsafePathSegment(filePath)) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: `${input.toolName} was rejected because file_path contains an unsafe path segment: ${filePath}` },
      reason: 'Unsafe file_path segment.',
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
      decision: { type: 'rejected', message: `${input.toolName} was rejected because file_path must be absolute: ${filePath}` },
      reason: 'Relative file_path.',
    }
  }

  if (input.workspacePath && isInside(input.workspacePath, filePath)) {
    return {
      kind: 'requires-review',
      reason: 'Workspace file write requires user review.',
    }
  }

  return {
    kind: 'auto-reject',
    decision: { type: 'rejected', message: `${input.toolName} was rejected because it targets a path outside the current workspace: ${filePath}` },
    reason: 'Outside workspace.',
  }
}
