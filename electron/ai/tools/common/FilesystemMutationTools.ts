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
import type { IWriterAgentContext } from '../../runtime/AgentContext'

function getWorkspacePath(runtime: unknown): string | null {
  const wp = (runtime as { context?: IWriterAgentContext } | undefined)?.context?.workspacePath
  return wp?.trim() || null
}

function isInside(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath)
  const child = path.resolve(childPath)
  const relative = path.relative(parent, child)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

type PathCheck =
  | { ok: true; path: string }
  | { ok: false; error: string }

function checkWorkspacePath(workspacePath: string | null, requested: string | undefined, label: string): PathCheck {
  const trimmed = requested?.trim()
  if (!trimmed) return { ok: false, error: `Error: ${label} is required.` }
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, error: `Error: ${label} must be an absolute host path, not a relative path or basename: "${trimmed}".` }
  }
  if (!workspacePath) {
    return { ok: false, error: `Error: ${label} requires an open workspace folder.` }
  }
  const resolved = path.resolve(trimmed)
  if (!isInside(workspacePath, resolved)) {
    return { ok: false, error: `Error: ${label} must be inside the current workspace ("${workspacePath}"): "${resolved}".` }
  }
  return { ok: true, path: resolved }
}

export function buildFilesystemMutationTools() {
  const deleteFile = tool(
    async ({ file_path, recursive }: { file_path: string; recursive?: boolean }, runtime) => {
      const check = checkWorkspacePath(getWorkspacePath(runtime), file_path, 'file_path')
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
        'file_path must be an absolute host path inside the workspace, e.g. the path shown in <workspace>/<open_tabs>.',
      schema: z.object({
        file_path: z.string().describe('Absolute host path to the file or directory to delete.'),
        recursive: z.boolean().optional().describe('Set to true to delete a non-empty directory and its contents. Default false.'),
      }),
    }
  )

  const renameFile = tool(
    async ({ file_path, new_name }: { file_path: string; new_name: string }, runtime) => {
      const workspacePath = getWorkspacePath(runtime)
      const srcCheck = checkWorkspacePath(workspacePath, file_path, 'file_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: file_path does not exist: "${source}".`

      const trimmedName = new_name?.trim()
      if (!trimmedName) return 'Error: new_name is required.'
      if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..' || trimmedName.startsWith('~')) {
        return `Error: new_name must be a plain filename without path separators: "${new_name}".`
      }

      const target = path.join(path.dirname(source), trimmedName)
      const targetCheck = checkWorkspacePath(workspacePath, target, 'new_name')
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
        'file_path must be an absolute host path inside the workspace; new_name must be a plain filename (no path separators).',
      schema: z.object({
        file_path: z.string().describe('Absolute host path to the existing file or directory.'),
        new_name: z.string().describe('New filename (basename only, no path separators), e.g. "chapter-02.md".'),
      }),
    }
  )

  const moveFile = tool(
    async ({ source_path, destination_path }: { source_path: string; destination_path: string }, runtime) => {
      const workspacePath = getWorkspacePath(runtime)
      const srcCheck = checkWorkspacePath(workspacePath, source_path, 'source_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: source_path does not exist: "${source}".`

      const destCheck = checkWorkspacePath(workspacePath, destination_path, 'destination_path')
      if (!destCheck.ok) return destCheck.error
      let dest = destCheck.path

      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
        const candidate = path.join(dest, path.basename(source))
        const candidateCheck = checkWorkspacePath(workspacePath, candidate, 'destination_path')
        if (!candidateCheck.ok) return candidateCheck.error
        dest = candidateCheck.path
      }

      if (fs.existsSync(dest)) return `Error: a file or directory already exists at "${dest}".`
      if (isInside(source, dest)) return `Error: cannot move "${source}" into its own subdirectory "${dest}".`

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
        'Both source_path and destination_path must be absolute host paths inside the workspace. ' +
        'If destination_path points to an existing directory, the source is moved into it keeping its current name.',
      schema: z.object({
        source_path: z.string().describe('Absolute host path to the file or directory to move.'),
        destination_path: z.string().describe('Absolute host destination path, or an existing directory to move into.'),
      }),
    }
  )

  return [deleteFile, renameFile, moveFile] as const
}
