import * as path from 'path'
import type { IWriterAgentContext } from './AgentContext'

export type RuntimePathResolution =
  | { ok: true; path: string }
  | { ok: false; error: string }

export function getRuntimeWorkspacePath(runtime: unknown): string | null {
  const workspacePath = (runtime as { context?: IWriterAgentContext } | undefined)?.context?.workspacePath
  return workspacePath?.trim() || null
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveWorkspacePath(
  requestedPath: string | undefined,
  workspacePath: string | null,
  argumentName: string,
): RuntimePathResolution {
  const requested = requestedPath?.trim()
  if (!requested) {
    return { ok: false, error: `Error: ${argumentName} is required.` }
  }

  if (path.isAbsolute(requested)) {
    return { ok: true, path: path.resolve(requested) }
  }

  if (!workspacePath) {
    return {
      ok: false,
      error: `Error: ${argumentName} is relative, but no workspace folder is open: "${requested}".`,
    }
  }

  const resolved = path.resolve(workspacePath, requested)
  if (!isPathInside(workspacePath, resolved)) {
    return {
      ok: false,
      error: `Error: relative ${argumentName} escapes the current workspace: "${requested}".`,
    }
  }

  return { ok: true, path: resolved }
}

export function resolveRuntimePath(
  requestedPath: string | undefined,
  runtime: unknown,
  argumentName: string,
): RuntimePathResolution {
  return resolveWorkspacePath(
    requestedPath,
    getRuntimeWorkspacePath(runtime),
    argumentName,
  )
}
