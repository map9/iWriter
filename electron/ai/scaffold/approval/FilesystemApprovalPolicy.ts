import * as fs from 'fs'
import * as path from 'path'
import type { ResumeDecision } from '@shared/ai/contracts'

export type FilesystemApprovalDecision =
  | { kind: 'auto-approve'; decision: ResumeDecision; reason: string }
  | { kind: 'requires-review'; reason: string }
  | { kind: 'auto-reject'; decision: ResumeDecision; reason: string }

export interface FilesystemWriteApprovalInput {
  toolName: string
  args: Record<string, unknown>
  protectedRoots?: Array<string | null | undefined>
}

const INTERNAL_WRITABLE_PREFIXES = [
  '/large_tool_results/',
  '/conversation_history/',
]

const FILESYSTEM_WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'delete',
  'rename_file',
  // Compatibility for interrupted checkpoints created before the native
  // DeepAgents delete migration. New agents no longer publish this tool.
  'delete_file',
  'move_file',
])

const INTERNAL_VIRTUAL_ROOTS = new Set([
  '/large_tool_results',
  '/conversation_history',
])

function isInternalWritablePath(filePath: string): boolean {
  return INTERNAL_WRITABLE_PREFIXES.some(prefix => filePath.startsWith(prefix))
}

function hasUnsafePathSegment(filePath: string): boolean {
  return filePath.split(/[\\/]+/).some(segment => segment === '..' || segment === '~')
}

function normalizeHostPathCase(filePath: string): string {
  return process.platform === 'win32' || process.platform === 'darwin'
    ? filePath.toLocaleLowerCase('en-US')
    : filePath
}

function comparableHostPath(filePath: string): string {
  return normalizeHostPathCase(path.resolve(filePath))
}

function comparableRealHostPath(filePath: string): string {
  const resolved = path.resolve(filePath)
  let existingAncestor = resolved
  const missingSegments: string[] = []

  for (;;) {
    try {
      const realAncestor = fs.realpathSync.native(existingAncestor)
      return normalizeHostPathCase(path.join(realAncestor, ...missingSegments))
    } catch {
      const parent = path.dirname(existingAncestor)
      if (parent === existingAncestor) return normalizeHostPathCase(resolved)
      missingSegments.unshift(path.basename(existingAncestor))
      existingAncestor = parent
    }
  }
}

function comparableVirtualPath(filePath: string): string {
  const normalized = path.posix.normalize(filePath.replace(/\\/g, '/')).replace(/\/+$/, '')
  return normalized || '/'
}

function isSameOrAncestorPath(candidate: string, protectedRoot: string): boolean {
  const relative = path.relative(candidate, protectedRoot)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function isProtectedDeleteRoot(filePath: string, protectedRoots: Array<string | null | undefined>): boolean {
  const virtualPath = comparableVirtualPath(filePath)
  if (virtualPath === '/' || INTERNAL_VIRTUAL_ROOTS.has(virtualPath)) return true

  const hostPath = comparableHostPath(filePath)
  const realHostPath = comparableRealHostPath(filePath)
  if (hostPath === comparableHostPath(path.parse(hostPath).root)) return true
  return protectedRoots.some(root => {
    if (!root) return false
    const protectedHostPath = comparableHostPath(root)
    const protectedRealHostPath = comparableRealHostPath(root)
    return isSameOrAncestorPath(hostPath, protectedHostPath)
      || isSameOrAncestorPath(realHostPath, protectedRealHostPath)
  })
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
    case 'delete':
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
      const target = path.join(path.dirname(filePath), newName)
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

  if (input.toolName === 'delete_file') {
    return {
      kind: 'auto-reject',
      decision: {
        type: 'rejected',
        message: 'This historical delete_file request can no longer execute. Retry the operation with the native delete tool.',
      },
      reason: 'Legacy delete tool retired.',
    }
  }

  const candidatePaths = extractCandidatePaths(input.toolName, input.args)
  if (!Array.isArray(candidatePaths)) {
    return {
      kind: 'auto-reject',
      decision: { type: 'rejected', message: candidatePaths.error },
      reason: 'Invalid arguments.',
    }
  }

  const isDelete = input.toolName === 'delete' || input.toolName === 'delete_file'
  let needsReview = false
  for (const rawPath of candidatePaths) {
    const decision = decidePathApproval(input.toolName, rawPath)
    if (decision.kind === 'auto-reject') return decision
    if (isDelete && isProtectedDeleteRoot(rawPath.trim(), input.protectedRoots ?? [])) {
      return {
        kind: 'auto-reject',
        decision: {
          type: 'rejected',
          message: `${input.toolName} was rejected because it targets a protected root: ${rawPath}`,
        },
        reason: 'Protected root.',
      }
    }
    if (decision.kind === 'requires-review') needsReview = true
  }

  if (isDelete) {
    return {
      kind: 'requires-review',
      reason: 'Delete operation requires user review.',
    }
  }

  if (!needsReview) {
    // Every candidate path was an internal virtual path.
    return {
      kind: 'auto-approve',
      decision: { type: 'approved' },
      reason: 'Internal virtual filesystem path.',
    }
  }

  return {
    kind: 'requires-review',
    reason: 'Absolute file operation requires user review.',
  }
}
