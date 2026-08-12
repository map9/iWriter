/**
 * FilesystemMutationTools — rename/delete/move tools for files and directories
 * addressed by explicit host paths.
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
  isPathInside,
  resolveRuntimePath,
} from '../../runtime/RuntimePathResolver'

type PathCheck =
  | { ok: true; path: string }
  | { ok: false; error: string }

function checkRuntimePath(runtime: unknown, requested: string | undefined, label: string): PathCheck {
  const runtimePath = resolveRuntimePath(requested, runtime, label)
  if (!runtimePath.ok) return runtimePath
  return { ok: true, path: runtimePath.path }
}

export function buildFilesystemMutationTools() {
  const deleteFile = tool(
    async ({ file_path, recursive }: { file_path: string; recursive?: boolean }, runtime) => {
      const check = checkRuntimePath(runtime, file_path, 'file_path')
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
        'Delete a file or directory at an explicit host path. Requires user approval. ' +
        'For a non-empty directory, pass recursive=true; otherwise the deletion is rejected. ' +
        'Use the real absolute host path, including for files outside the current workspace.',
      schema: z.object({
        file_path: z.string().describe('Real absolute host path to the file or directory.'),
        recursive: z.boolean().optional().describe('Set to true to delete a non-empty directory and its contents. Default false.'),
      }),
    }
  )

  const renameFile = tool(
    async ({ file_path, new_name }: { file_path: string; new_name: string }, runtime) => {
      const srcCheck = checkRuntimePath(runtime, file_path, 'file_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: file_path does not exist: "${source}".`

      const trimmedName = new_name?.trim()
      if (!trimmedName) return 'Error: new_name is required.'
      if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..' || trimmedName.startsWith('~')) {
        return `Error: new_name must be a plain filename without path separators: "${new_name}".`
      }

      const target = path.join(path.dirname(source), trimmedName)
      const targetCheck = checkRuntimePath(runtime, target, 'new_name')
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
        'Rename a file or directory in place (keeps it in the same parent directory). Requires user approval. ' +
        'Use the real absolute host path; new_name must be a plain filename (no path separators).',
      schema: z.object({
        file_path: z.string().describe('Real absolute host path to the existing file or directory.'),
        new_name: z.string().describe('New filename (basename only, no path separators), e.g. "chapter-02.md".'),
      }),
    }
  )

  const moveFile = tool(
    async ({ source_path, destination_path }: { source_path: string; destination_path: string }, runtime) => {
      const srcCheck = checkRuntimePath(runtime, source_path, 'source_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: source_path does not exist: "${source}".`

      const destCheck = checkRuntimePath(runtime, destination_path, 'destination_path')
      if (!destCheck.ok) return destCheck.error
      let dest = destCheck.path

      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
        const candidate = path.join(dest, path.basename(source))
        const candidateCheck = checkRuntimePath(runtime, candidate, 'destination_path')
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
        'Move a file or directory to a new host location. Requires user approval. ' +
        'Use real absolute host paths for source_path and destination_path. ' +
        'If destination_path points to an existing directory, the source is moved into it keeping its current name.',
      schema: z.object({
        source_path: z.string().describe('Real absolute host path to the file or directory to move.'),
        destination_path: z.string().describe('Real absolute host destination path, or an existing directory to move into.'),
      }),
    }
  )

  return [deleteFile, renameFile, moveFile] as const
}
