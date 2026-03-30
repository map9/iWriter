import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const STORY_SECTIONS = [
  'brainstorms',
  'worldbook',
  'characters',
  'storylines',
  'scenes',
  'notes',
] as const

type StorySection = typeof STORY_SECTIONS[number]

function getRuntimeConfigurable(runtime: unknown): Record<string, unknown> {
  return ((runtime as { config?: { configurable?: Record<string, unknown> } })?.config?.configurable) ?? {}
}

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function resolveStoryRoot(aiRootPath: string, runtime: unknown): string {
  const configurable = getRuntimeConfigurable(runtime)
  const workspacePath = typeof configurable.workspace_path === 'string' ? configurable.workspace_path : ''
  const threadId = typeof configurable.thread_id === 'string' ? configurable.thread_id : 'default-thread'

  if (workspacePath.trim()) {
    return path.join(workspacePath, '.iwriter', 'story')
  }

  return path.join(aiRootPath, 'projects', threadId, 'story')
}

function ensureSectionDir(rootDir: string, section: StorySection): string {
  const dir = path.join(rootDir, section)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readAssetIndex(rootDir: string, section?: StorySection) {
  const sections = section ? [section] : [...STORY_SECTIONS]
  return sections.map(currentSection => {
    const dir = ensureSectionDir(rootDir, currentSection)
    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => ({
        slug: entry.name.replace(/\.md$/i, ''),
        path: path.join(dir, entry.name),
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
    return { section: currentSection, files }
  })
}

export function buildCreativeArtifactTools(aiRootPath: string) {
  const listStoryAssets = tool(
    async ({ section }: { section?: StorySection }, runtime) => {
      const rootDir = resolveStoryRoot(aiRootPath, runtime)
      const sections = readAssetIndex(rootDir, section)
      return JSON.stringify({ root_dir: rootDir, sections }, null, 2)
    },
    {
      name: 'list_story_assets',
      description:
        'List saved story-planning assets under the current project story workspace. ' +
        'Use this before creating or revising worldbuilding, character, storyline, or brainstorm files.',
      schema: z.object({
        section: z.enum(STORY_SECTIONS).optional().describe('Optional section to filter by.'),
      }),
    }
  )

  const readStoryAsset = tool(
    async ({ section, slug }: { section: StorySection; slug: string }, runtime) => {
      const rootDir = resolveStoryRoot(aiRootPath, runtime)
      const normalizedSlug = normalizeSlug(slug)
      if (!normalizedSlug) {
        return 'Error: slug is required.'
      }
      const filePath = path.join(ensureSectionDir(rootDir, section), `${normalizedSlug}.md`)
      if (!fs.existsSync(filePath)) {
        return `Error: Story asset not found: ${filePath}`
      }
      return fs.readFileSync(filePath, 'utf-8')
    },
    {
      name: 'read_story_asset',
      description:
        'Read a saved story-planning asset such as a worldbook entry, character sheet, storyline plan, or brainstorm note.',
      schema: z.object({
        section: z.enum(STORY_SECTIONS).describe('Which story asset section to read from.'),
        slug: z.string().describe('Asset slug or short identifier.'),
      }),
    }
  )

  const saveStoryAsset = tool(
    async (
      { section, slug, content }: { section: StorySection; slug: string; content: string },
      runtime,
    ) => {
      const rootDir = resolveStoryRoot(aiRootPath, runtime)
      const normalizedSlug = normalizeSlug(slug)
      if (!normalizedSlug) {
        return 'Error: slug must contain letters or numbers.'
      }
      const filePath = path.join(ensureSectionDir(rootDir, section), `${normalizedSlug}.md`)
      fs.writeFileSync(filePath, content, 'utf-8')
      return JSON.stringify(
        {
          saved: true,
          section,
          slug: normalizedSlug,
          path: filePath,
        },
        null,
        2
      )
    },
    {
      name: 'save_story_asset',
      description:
        'Create or overwrite a structured story-planning markdown file. ' +
        'Use this to persist brainstorm results, worldbook notes, character sheets, storylines, or scene plans.',
      schema: z.object({
        section: z.enum(STORY_SECTIONS).describe('Which story asset section to save into.'),
        slug: z.string().describe('Asset slug or short identifier used as the markdown filename.'),
        content: z.string().describe('Full markdown content to save.'),
      }),
    }
  )

  return [listStoryAssets, readStoryAsset, saveStoryAsset] as const
}
