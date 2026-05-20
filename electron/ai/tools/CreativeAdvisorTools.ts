import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { IWriterAgentContext } from '../runtime/AgentContext'

const STORYBIBLE_CONTEXT_LIMIT = 4000
const FRAGMENTS_CONTEXT_LIMIT = 2000
const CHAPTER_PREVIEW_CHARS = 200

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  const wp = (runtime as { context?: IWriterAgentContext } | undefined)?.context?.workspacePath
  return wp?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

function truncateText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function readFileIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
}

function getDraftChapterOverview(draftDir: string): Array<{ filename: string; wordCount: number; preview: string }> {
  if (!fs.existsSync(draftDir)) return []
  const entries = fs.readdirSync(draftDir)
  return entries
    .filter((entry) => entry.endsWith('.md') && entry !== 'fragments.md')
    .sort()
    .map((entry) => {
      const filePath = path.join(draftDir, entry)
      const content = fs.readFileSync(filePath, 'utf-8')
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length
      const preview = content.slice(0, CHAPTER_PREVIEW_CHARS).replace(/\n+/g, ' ').trim()
      return { filename: entry, wordCount, preview }
    })
}

export function buildCreativeAdvisorTools(options: {
  workspacePath?: string | null
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const adviseDirections = tool(
    async ({ focus, scope }: { focus: string; scope?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'

      const storyBiblePath = path.join(workspacePath, 'storybible.md')
      const fragmentsPath = path.join(workspacePath, 'draft', 'fragments.md')
      const draftDir = path.join(workspacePath, 'draft')

      const rawStoryBible = readFileIfExists(storyBiblePath)
      const rawFragments = readFileIfExists(fragmentsPath)
      const storyBible = truncateText(rawStoryBible, STORYBIBLE_CONTEXT_LIMIT)
      const fragments = truncateText(rawFragments, FRAGMENTS_CONTEXT_LIMIT)
      const chapterOverview = getDraftChapterOverview(draftDir)

      return JSON.stringify({
        focus,
        scope: scope ?? 'general',
        storybible_excerpt: storyBible.text,
        storybible_truncated: storyBible.truncated,
        fragments_excerpt: fragments.text,
        fragments_truncated: fragments.truncated,
        draft_overview: chapterOverview,
        instructions: [
          'Use this material to generate 2–3 diverging creative directions.',
          'Each direction must grow from specific character psychology, world constraints, or planted story seeds—not generic plot templates.',
          'Emit an advisor-directions fenced block in the next assistant message.',
          'Each direction: one sentence stating what happens, angle: one short phrase explaining the unexplored potential it uses.',
          'Do not propose a writing plan in the same response unless the author has explicitly chosen a direction.',
        ],
      }, null, 2)
    },
    {
      name: 'advise_directions',
      description: 'Gather story state material to generate 2–3 diverging creative directions. Use when the author asks for ideas, is uncertain about direction, or when a proactive expansion check reveals a stronger angle than the one proposed.',
      schema: z.object({
        focus: z.string().describe('The author\'s current question or intended direction, summarized in one sentence.'),
        scope: z.enum(['character', 'plot', 'structure', 'scene', 'theme', 'general']).optional(),
      }),
    }
  )

  const analyzeStoryArchitecture = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'

      const storyBiblePath = path.join(workspacePath, 'storybible.md')
      const draftDir = path.join(workspacePath, 'draft')

      const rawStoryBible = readFileIfExists(storyBiblePath)
      const storyBible = truncateText(rawStoryBible, STORYBIBLE_CONTEXT_LIMIT)
      const chapterOverview = getDraftChapterOverview(draftDir)
      const totalWords = chapterOverview.reduce((sum, ch) => sum + ch.wordCount, 0)

      return JSON.stringify({
        storybible: storyBible.text,
        storybible_truncated: storyBible.truncated,
        chapter_count: chapterOverview.length,
        total_words: totalWords,
        chapters: chapterOverview,
        instructions: [
          'Analyze the overall story architecture: tension curve, pacing, structural gaps.',
          'Identify: where the story is now in its arc, what is building well, what risks losing energy.',
          'Use structural-diagnosis skill before responding.',
          'Respond in plain prose—no advisor-directions block unless the author asks for specific options.',
        ],
      }, null, 2)
    },
    {
      name: 'analyze_story_architecture',
      description: 'Gather full story structure material (StoryBible + chapter overview) to diagnose overall arc, pacing, and structural health. Use when the author asks about story shape, overall progress, or pacing at the macro level.',
      schema: z.object({}),
    }
  )

  return [adviseDirections, analyzeStoryArchitecture] as const
}
