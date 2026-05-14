import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CreativeDb } from '../db/CreativeDb'
import { countWordDelta } from '../../../src/utils/textStats'
import { getRuntimeString } from './runtimeHelpers'
import { resolveWorkspaceSubpath } from './CreativeTools'

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  return getRuntimeString(runtime, 'workspace_path')?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

function resolveExplorationPath(workspacePath: string, directionName: string) {
  return resolveWorkspaceSubpath(workspacePath, '.iwriter/explorations', directionName, {
    requiredExt: '.md',
    appendExt: true,
    label: 'direction_name',
  })
}

function resolveDraftPath(workspacePath: string, filename: string) {
  return resolveWorkspaceSubpath(workspacePath, 'draft', filename, {
    requiredExt: '.md',
    appendExt: true,
    label: 'target_chapter',
  })
}

function firstMeaningfulLine(content: string): string {
  return content
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^#+\s*/, ''))
    .find(Boolean) ?? ''
}

export function buildCreativeExplorationTools(options: {
  workspacePath?: string | null
  creativeDb: CreativeDb | null
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const listExplorations = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const explorationDir = path.join(workspacePath, '.iwriter', 'explorations')
      if (!fs.existsSync(explorationDir)) return JSON.stringify({ explorations: [] }, null, 2)
      const explorations = fs.readdirSync(explorationDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map(entry => {
          const filePath = path.join(explorationDir, entry.name)
          const content = fs.readFileSync(filePath, 'utf-8')
          return {
            direction_name: entry.name,
            summary: firstMeaningfulLine(content),
            updated_at: fs.statSync(filePath).mtime.toISOString(),
          }
        })
      return JSON.stringify({ explorations }, null, 2)
    },
    {
      name: 'list_explorations',
      description: 'List narrative-direction exploration drafts under .iwriter/explorations/.',
      schema: z.object({}),
    }
  )

  const startExploration = tool(
    async ({ context, directions }: { context: string; directions: Array<{ name: string; description: string }> }) => {
      return JSON.stringify({ approved_exploration: true, context, directions }, null, 2)
    },
    {
      name: 'start_exploration',
      description: 'Ask the author to approve a narrative-direction exploration plan with 2-3 directions.',
      schema: z.object({
        context: z.string().describe('Divergence point or chapter context to explore from.'),
        directions: z.array(z.object({
          name: z.string().describe('Short direction name.'),
          description: z.string().describe('One-sentence direction description.'),
        })).min(2).max(3).describe('Two or three narrative directions to explore.'),
      }),
    }
  )

  const writeExplorationDraft = tool(
    async ({ direction_name, content }: { direction_name: string; content: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveExplorationPath(workspacePath, direction_name)
      if (!resolved.ok) return resolved.error
      const cleanContent = content.trimEnd()
      if (!cleanContent.trim()) return 'Error: content is required.'
      ensureDir(path.dirname(resolved.path))
      fs.writeFileSync(resolved.path, `${cleanContent}\n`, 'utf-8')
      return JSON.stringify({ written: true, filename: `.iwriter/explorations/${resolved.relativePath}` }, null, 2)
    },
    {
      name: 'write_exploration_draft',
      description: 'Write one ExplorerAgent narrative-direction draft under .iwriter/explorations/.',
      schema: z.object({
        direction_name: z.string().describe('Exploration filename or direction name. .md is appended if omitted.'),
        content: z.string().describe('Full exploration content, including summary, consequences, sample prose, and craft notes.'),
      }),
    }
  )

  const readExploration = tool(
    async ({ direction_name }: { direction_name: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveExplorationPath(workspacePath, direction_name)
      if (!resolved.ok) return resolved.error
      if (!fs.existsSync(resolved.path)) return `Error: exploration draft not found: .iwriter/explorations/${resolved.relativePath}`
      return fs.readFileSync(resolved.path, 'utf-8')
    },
    {
      name: 'read_exploration',
      description: 'Read one narrative-direction exploration draft.',
      schema: z.object({
        direction_name: z.string().describe('Exploration filename or direction name.'),
      }),
    }
  )

  const finishExploration = tool(
    async ({
      comparison_report,
      direction_summaries,
    }: {
      comparison_report: string
      direction_summaries?: Array<{ name: string; summary: string; narrative_consequences: string[] }>
    }) => {
      return JSON.stringify({ reviewed_exploration: true, comparison_report, direction_summaries: direction_summaries ?? [] }, null, 2)
    },
    {
      name: 'finish_exploration',
      description: 'Show the author a comparison report across completed narrative-direction explorations. Does not modify draft/.',
      schema: z.object({
        comparison_report: z.string().describe('Comparison report across directions: summaries, consequences, and craft notes.'),
        direction_summaries: z.array(z.object({
          name: z.string().describe('Direction name.'),
          summary: z.string().describe('Short narrative summary.'),
          narrative_consequences: z.array(z.string()).describe('Downstream story implications.'),
        })).optional().describe('Optional structured direction summaries for review UI display.'),
      }),
    }
  )

  const promoteExploration = tool(
    async ({
      direction_name,
      target_chapter,
      mode,
      content,
    }: {
      direction_name: string
      target_chapter: string
      mode: 'append' | 'replace'
      content?: string
    }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const exploration = resolveExplorationPath(workspacePath, direction_name)
      if (!exploration.ok) return exploration.error
      if (!fs.existsSync(exploration.path)) return `Error: exploration draft not found: .iwriter/explorations/${exploration.relativePath}`
      const draft = resolveDraftPath(workspacePath, target_chapter)
      if (!draft.ok) return draft.error

      const cleanContent = (content ?? fs.readFileSync(exploration.path, 'utf-8')).trimEnd()
      if (!cleanContent.trim()) return 'Error: exploration content is empty.'
      ensureDir(path.dirname(draft.path))
      const current = fs.existsSync(draft.path) ? fs.readFileSync(draft.path, 'utf-8') : ''
      const next = mode === 'replace'
        ? `${cleanContent}\n`
        : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${cleanContent}\n`
      fs.writeFileSync(draft.path, next, 'utf-8')
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'promote_exploration',
        targetPath: `draft/${draft.relativePath}`,
        wordDelta: countWordDelta(current, next),
        summary: `Promoted ${exploration.relativePath} to ${draft.relativePath}`,
      })
      return JSON.stringify({
        promoted: true,
        direction_name: exploration.relativePath,
        target_chapter: `draft/${draft.relativePath}`,
        mode,
      }, null, 2)
    },
    {
      name: 'promote_exploration',
      description: 'Promote an approved exploration draft directly into draft/{target_chapter}. Does not trigger plan-first cycle.',
      schema: z.object({
        direction_name: z.string().describe('Exploration filename or direction name.'),
        target_chapter: z.string().describe('Target chapter filename under draft/.'),
        mode: z.enum(['append', 'replace']).describe('Append to or replace the target chapter.'),
        content: z.string().optional().describe('Optional edited exploration content to promote instead of the stored draft.'),
      }),
    }
  )

  const deleteExploration = tool(
    async ({ direction_name }: { direction_name: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveExplorationPath(workspacePath, direction_name)
      if (!resolved.ok) return resolved.error
      if (!fs.existsSync(resolved.path)) return `Error: exploration draft not found: .iwriter/explorations/${resolved.relativePath}`
      const trashDir = path.join(workspacePath, '.iwriter', 'explorations', '.trash')
      ensureDir(trashDir)
      const ext = path.extname(resolved.relativePath)
      const base = path.basename(resolved.relativePath, ext)
      const trashName = `${base}-${Date.now()}${ext || '.md'}`
      const trashPath = path.join(trashDir, trashName)
      fs.renameSync(resolved.path, trashPath)
      return JSON.stringify({
        deleted: true,
        direction_name: resolved.relativePath,
        trash_path: `.iwriter/explorations/.trash/${trashName}`,
      }, null, 2)
    },
    {
      name: 'delete_exploration',
      description: 'Soft-delete one exploration draft by moving it to .iwriter/explorations/.trash/.',
      schema: z.object({
        direction_name: z.string().describe('Exploration filename or direction name.'),
      }),
    }
  )

  return [
    listExplorations,
    startExploration,
    writeExplorationDraft,
    readExploration,
    finishExploration,
    promoteExploration,
    deleteExploration,
  ] as const
}
