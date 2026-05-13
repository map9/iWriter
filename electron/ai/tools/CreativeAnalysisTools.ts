import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CreativeDb } from '../db/CreativeDb'
import { STORYBIBLE_REBUILD_WORD_THRESHOLD } from '../db/CreativeDb'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import { getRuntimeString } from './runtimeHelpers'

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  return getRuntimeString(runtime, 'workspace_path')?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

function findMarkdownSection(content: string, section: string): { start: number; end: number } | null {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^##\\s+${escaped}\\s*$`, 'mi')
  const match = heading.exec(content)
  if (!match || match.index === undefined) return null
  const start = match.index
  const afterHeading = start + match[0].length
  const nextHeading = /^##\s+/gmi
  nextHeading.lastIndex = afterHeading
  const next = nextHeading.exec(content)
  return { start, end: next?.index ?? content.length }
}

function sectionBody(content: string, section: string): string {
  const range = findMarkdownSection(content, section)
  if (!range) return ''
  return content.slice(range.start, range.end).replace(/^##\s+.*$/m, '').trim()
}

function isPlaceholderOnly(body: string): boolean {
  const stripped = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[-*_`#>\s]/g, '')
    .trim()
  return stripped.length === 0
}

function extractOpenQuestions(content: string): string[] {
  return sectionBody(content, 'Open Questions')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-*]\s+/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
}

export function buildCreativeAnalysisTools(options: {
  workspacePath?: string | null
  creativeDb: CreativeDb | null
  snapshotBroker: SnapshotBroker
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const getStoryBibleRebuildSignal = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      if (!options.creativeDb) return 'Error: Creative session database is unavailable without an open workspace folder.'
      const stats = options.creativeDb.getStoryBibleChangeStats(workspacePath)
      const shouldPropose = stats.totalWordDelta >= STORYBIBLE_REBUILD_WORD_THRESHOLD
      const storyBiblePath = path.join(workspacePath, 'storybible.md')
      const storyBible = fs.existsSync(storyBiblePath) ? fs.readFileSync(storyBiblePath, 'utf-8') : ''
      const missingPremise = ['Premise', 'Theme', 'Promise to Reader'].some(section =>
        isPlaceholderOnly(sectionBody(storyBible, section))
      )
      return JSON.stringify({
        threshold_words: STORYBIBLE_REBUILD_WORD_THRESHOLD,
        total_word_delta_since_last_rebuild: stats.totalWordDelta,
        record_count: stats.recordCount,
        by_tool: stats.byTool,
        oldest_recorded_at: stats.oldestRecordedAt,
        newest_recorded_at: stats.newestRecordedAt,
        should_propose_rebuild: shouldPropose,
        missing_premise: missingPremise,
        open_questions: extractOpenQuestions(storyBible),
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

  return [getStoryBibleRebuildSignal] as const
}
