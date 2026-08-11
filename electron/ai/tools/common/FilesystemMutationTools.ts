/**
 * FilesystemMutationTools — rename/delete/move tools for files and directories
 * inside the current workspace.
 *
 * These tools mirror the HITL flow of deepagents' built-in write_file/edit_file:
 * they are listed in FILE_WRITE_INTERRUPT_ON (AgentFilesystem.ts), so the tool
 * body below only runs AFTER the user approves the action via interruptOn.
 * The body re-validates paths defensively as a second line of defense even
 * though FilesystemApprovalPolicy already gates the interrupt.
 */

import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  getRuntimeWorkspacePath,
  isPathInside,
  resolveRuntimePath,
} from '../../runtime/RuntimePathResolver'

type PathCheck =
  | { ok: true; path: string }
  | { ok: false; error: string }

function checkWorkspacePath(runtime: unknown, requested: string | undefined, label: string): PathCheck {
  const runtimePath = resolveRuntimePath(requested, runtime, label)
  if (!runtimePath.ok) return runtimePath
  const workspacePath = getRuntimeWorkspacePath(runtime)
  if (!workspacePath) {
    return { ok: false, error: `Error: ${label} requires an open workspace folder.` }
  }
  const resolved = runtimePath.path
  if (!isPathInside(workspacePath, resolved)) {
    return { ok: false, error: `Error: ${label} must be inside the current workspace ("${workspacePath}"): "${resolved}".` }
  }
  return { ok: true, path: resolved }
}

export function buildFilesystemMutationTools() {
  const deleteFile = tool(
    async ({ file_path, recursive }: { file_path: string; recursive?: boolean }, runtime) => {
      const check = checkWorkspacePath(runtime, file_path, 'file_path')
      if (!check.ok) return check.error
      const target = check.path

      if (!fs.existsSync(target)) return `Error: file_path does not exist: "${target}".`

      let stats: fs.Stats
      try {
        stats = fs.statSync(target)
      } catch (err) {
        return `Error: could not stat file_path "${target}": ${(err as Error).message}`
      }

      if (stats.isDirectory() && !recursive) {
        return `Error: "${target}" is a directory. Pass recursive=true to delete a directory and its contents.`
      }

      try {
        fs.rmSync(target, { recursive: !!recursive, force: false })
      } catch (err) {
        return `Error: failed to delete "${target}": ${(err as Error).message}`
      }

      return JSON.stringify({ deleted: true, path: target, was_directory: stats.isDirectory() }, null, 2)
    },
    {
      name: 'delete_file',
      description:
        'Delete a file or directory inside the current workspace. Requires user approval. ' +
        'For a non-empty directory, pass recursive=true; otherwise the deletion is rejected. ' +
        'file_path may be workspace-relative or an absolute host path inside the workspace.',
      schema: z.object({
        file_path: z.string().describe('Workspace-relative or absolute host path inside the workspace.'),
        recursive: z.boolean().optional().describe('Set to true to delete a non-empty directory and its contents. Default false.'),
      }),
    }
  )

  const renameFile = tool(
    async ({ file_path, new_name }: { file_path: string; new_name: string }, runtime) => {
      const srcCheck = checkWorkspacePath(runtime, file_path, 'file_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: file_path does not exist: "${source}".`

      const trimmedName = new_name?.trim()
      if (!trimmedName) return 'Error: new_name is required.'
      if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..' || trimmedName.startsWith('~')) {
        return `Error: new_name must be a plain filename without path separators: "${new_name}".`
      }

      const target = path.join(path.dirname(source), trimmedName)
      const targetCheck = checkWorkspacePath(runtime, target, 'new_name')
      if (!targetCheck.ok) return targetCheck.error

      if (fs.existsSync(targetCheck.path)) return `Error: a file or directory already exists at "${targetCheck.path}".`

      try {
        fs.renameSync(source, targetCheck.path)
      } catch (err) {
        return `Error: failed to rename "${source}" to "${targetCheck.path}": ${(err as Error).message}`
      }

      return JSON.stringify({ renamed: true, from: source, to: targetCheck.path }, null, 2)
    },
    {
      name: 'rename_file',
      description:
        'Rename a file or directory in place inside the current workspace (keeps it in the same parent directory). Requires user approval. ' +
        'file_path may be workspace-relative or absolute; new_name must be a plain filename (no path separators).',
      schema: z.object({
        file_path: z.string().describe('Workspace-relative or absolute host path to the existing file or directory.'),
        new_name: z.string().describe('New filename (basename only, no path separators), e.g. "chapter-02.md".'),
      }),
    }
  )

  const moveFile = tool(
    async ({ source_path, destination_path }: { source_path: string; destination_path: string }, runtime) => {
      const srcCheck = checkWorkspacePath(runtime, source_path, 'source_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: source_path does not exist: "${source}".`

      const destCheck = checkWorkspacePath(runtime, destination_path, 'destination_path')
      if (!destCheck.ok) return destCheck.error
      let dest = destCheck.path

      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
        const candidate = path.join(dest, path.basename(source))
        const candidateCheck = checkWorkspacePath(runtime, candidate, 'destination_path')
        if (!candidateCheck.ok) return candidateCheck.error
        dest = candidateCheck.path
      }

      if (fs.existsSync(dest)) return `Error: a file or directory already exists at "${dest}".`
      if (isPathInside(source, dest)) return `Error: cannot move "${source}" into its own subdirectory "${dest}".`

      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.renameSync(source, dest)
      } catch (err) {
        return `Error: failed to move "${source}" to "${dest}": ${(err as Error).message}`
      }

      return JSON.stringify({ moved: true, from: source, to: dest }, null, 2)
    },
    {
      name: 'move_file',
      description:
        'Move a file or directory to a new location inside the current workspace. Requires user approval. ' +
        'source_path and destination_path may be workspace-relative or absolute paths inside the workspace. ' +
        'If destination_path points to an existing directory, the source is moved into it keeping its current name.',
      schema: z.object({
        source_path: z.string().describe('Workspace-relative or absolute host path to the file or directory to move.'),
        destination_path: z.string().describe('Workspace-relative or absolute host destination path, or an existing directory to move into.'),
      }),
    }
  )

  return [deleteFile, renameFile, moveFile] as const
}
