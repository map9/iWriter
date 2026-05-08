import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CreativeDb } from '../db/CreativeDb'
import { STORYBIBLE_REBUILD_WORD_THRESHOLD } from '../db/CreativeDb'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import { getRuntimeString } from './runtimeHelpers'

const STORYBIBLE_CONTEXT_LIMIT = 4000
const CHAPTER_CONTEXT_LIMIT = 12000

type SafePathResult =
  | { ok: true; path: string; relativePath: string }
  | { ok: false; error: string }

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  return getRuntimeString(runtime, 'workspace_path')?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveDraftMarkdownPath(workspacePath: string, filename: string): SafePathResult {
  const trimmed = filename.trim()
  if (!trimmed) return { ok: false, error: 'Error: target_filename is required.' }
  if (path.isAbsolute(trimmed) || trimmed.startsWith('~') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: 'Error: target_filename must be relative to draft/ and cannot be absolute.' }
  }
  if (trimmed.split(/[\\/]+/).includes('..')) {
    return { ok: false, error: 'Error: target_filename cannot contain "..".' }
  }

  const draftDir = path.resolve(workspacePath, 'draft')
  const withExt = path.extname(trimmed) ? trimmed : `${trimmed}.md`
  if (path.extname(withExt).toLowerCase() !== '.md') {
    return { ok: false, error: 'Error: run_consistency_check only supports .md draft files.' }
  }

  const targetPath = path.resolve(draftDir, withExt)
  if (!isInside(draftDir, targetPath)) {
    return { ok: false, error: 'Error: resolved target path escapes the workspace draft directory.' }
  }

  return {
    ok: true,
    path: targetPath,
    relativePath: path.relative(draftDir, targetPath).replace(/\\/g, '/'),
  }
}

function truncateText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

export function buildCreativeAnalysisTools(options: {
  workspacePath?: string | null
  creativeDb: CreativeDb | null
  snapshotBroker: SnapshotBroker
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const runConsistencyCheck = tool(
    async ({
      target_filename,
      scope,
      layers,
    }: {
      target_filename: string
      scope?: 'full' | 'recent_writes'
      layers?: Array<'pov' | 'character' | 'logic' | 'voice' | 'pacing' | 'continuity'>
    }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveDraftMarkdownPath(workspacePath, target_filename)
      if (!resolved.ok) return resolved.error
      if (!fs.existsSync(resolved.path)) return `Error: draft chapter not found: draft/${resolved.relativePath}`

      const storyBiblePath = path.join(workspacePath, 'storybible.md')
      const rawStoryBible = fs.existsSync(storyBiblePath) ? fs.readFileSync(storyBiblePath, 'utf-8') : ''
      const rawChapter = fs.readFileSync(resolved.path, 'utf-8')
      const storyBible = truncateText(rawStoryBible, STORYBIBLE_CONTEXT_LIMIT)
      const chapter = truncateText(rawChapter, CHAPTER_CONTEXT_LIMIT)
      const snapshot = await options.snapshotBroker.requestSnapshot(resolved.path)

      return JSON.stringify({
        target: {
          filename: `draft/${resolved.relativePath}`,
          scope: scope ?? 'full',
          recent_writes_supported: false,
        },
        requested_layers: layers?.length ? layers : ['pov', 'character', 'logic', 'voice', 'pacing', 'continuity'],
        storybible_excerpt: storyBible.text,
        storybible_truncated: storyBible.truncated,
        chapter_outline: snapshot?.outline ?? [],
        chapter_content: chapter.text,
        chapter_truncated: chapter.truncated,
        instructions: [
          'Use this material to produce non-blocking consistency findings in the next assistant message.',
          'Do not call write_to_chapter or confirm_writing_plan based only on findings.',
          'If there are findings, emit a fenced code block tagged consistency-findings containing a JSON array.',
          'If no issues are found, say so in prose and do not emit an empty fenced block.',
        ],
      }, null, 2)
    },
    {
      name: 'run_consistency_check',
      description: 'Gather StoryBible, outline, and chapter material for a post-write consistency review. The model should emit consistency-findings JSON afterward.',
      schema: z.object({
        target_filename: z.string().describe('Relative Markdown filename under draft/ to review.'),
        scope: z.enum(['full', 'recent_writes']).optional().describe('Phase 2 implements full review; recent_writes is accepted but treated as full.'),
        layers: z.array(z.enum(['pov', 'character', 'logic', 'voice', 'pacing', 'continuity'])).optional(),
      }),
    }
  )

  const getStoryBibleRebuildSignal = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      if (!options.creativeDb) return 'Error: Creative session database is unavailable without an open workspace folder.'
      const stats = options.creativeDb.getStoryBibleChangeStats(workspacePath)
      const shouldPropose = stats.totalWordDelta >= STORYBIBLE_REBUILD_WORD_THRESHOLD
      return JSON.stringify({
        threshold_words: STORYBIBLE_REBUILD_WORD_THRESHOLD,
        total_word_delta_since_last_rebuild: stats.totalWordDelta,
        record_count: stats.recordCount,
        by_tool: stats.byTool,
        oldest_recorded_at: stats.oldestRecordedAt,
        newest_recorded_at: stats.newestRecordedAt,
        should_propose_rebuild: shouldPropose,
        hint: shouldPropose
          ? 'Propose rebuild_storybible in a user-approved plan. Do not call it silently.'
          : 'No StoryBible rebuild proposal is needed yet.',
      }, null, 2)
    },
    {
      name: 'get_storybible_rebuild_signal',
      description: 'Report accumulated creative change volume since the last StoryBible rebuild so the agent can propose a rebuild when useful.',
      schema: z.object({}),
    }
  )

  return [runConsistencyCheck, getStoryBibleRebuildSignal] as const
}
