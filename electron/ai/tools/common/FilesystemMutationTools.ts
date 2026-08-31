/**
 * FilesystemMutationTools — rename/move tools for files and directories.
 *
 * Deletion is provided by DeepAgents' native `delete` tool. These remaining
 * tools mirror the HITL flow of DeepAgents' built-in filesystem mutations:
 * they are listed in FILE_WRITE_INTERRUPT_ON (AgentFilesystem.ts), so the tool
 * body below only runs AFTER the user approves the action via interruptOn.
 * The body re-validates paths defensively as a second line of defense even
 * though FilesystemApprovalPolicy already gates the interrupt.
 */

import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { isPathInside } from '../../runtime/PathUtils'

type PathCheck =
  | { ok: true; path: string }
  | { ok: false; error: string }

function checkAbsolutePath(requested: string | undefined, label: string): PathCheck {
  const trimmed = requested?.trim()
  if (!trimmed) return { ok: false, error: `Error: ${label} is required.` }
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, error: `Error: ${label} must be an absolute path: "${trimmed}".` }
  }
  return { ok: true, path: trimmed }
}

export function buildFilesystemMutationTools() {
  const renameFile = tool(
    async ({ file_path, new_name }: { file_path: string; new_name: string }) => {
      const srcCheck = checkAbsolutePath(file_path, 'file_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: file_path does not exist: "${source}".`

      const trimmedName = new_name?.trim()
      if (!trimmedName) return 'Error: new_name is required.'
      if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..' || trimmedName.startsWith('~')) {
        return `Error: new_name must be a plain filename without path separators: "${new_name}".`
      }

      const target = path.join(path.dirname(source), trimmedName)
      const targetCheck = checkAbsolutePath(target, 'new_name')
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
        'new_name must be a plain filename (no path separators).',
      schema: z.object({
        file_path: z.string().describe('Path to the existing file or directory.'),
        new_name: z.string().describe('New filename (basename only, no path separators), e.g. "chapter-02.md".'),
      }),
    }
  )

  const moveFile = tool(
    async ({ source_path, destination_path }: { source_path: string; destination_path: string }) => {
      const srcCheck = checkAbsolutePath(source_path, 'source_path')
      if (!srcCheck.ok) return srcCheck.error
      const source = srcCheck.path

      if (!fs.existsSync(source)) return `Error: source_path does not exist: "${source}".`

      const destCheck = checkAbsolutePath(destination_path, 'destination_path')
      if (!destCheck.ok) return destCheck.error
      let dest = destCheck.path

      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
        const candidate = path.join(dest, path.basename(source))
        const candidateCheck = checkAbsolutePath(candidate, 'destination_path')
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
        'Move a file or directory to a new location. Requires user approval. ' +
        'If destination_path points to an existing directory, the source is moved into it keeping its current name.',
      schema: z.object({
        source_path: z.string().describe('Path to the file or directory to move.'),
        destination_path: z.string().describe('Destination path, or an existing directory to move into.'),
      }),
    }
  )

  return [renameFile, moveFile] as const
}
