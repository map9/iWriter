import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { StoryAsset, StoryAssetType } from '../schema/types'
import { validateStoryAsset } from '../schema/validator'

export const NOVEL_STORY_SECTIONS = [
  'characters',
  'worldbook',
  'outlines',
  'scenes',
  'timeline',
  'foreshadowing',
  'style',
] as const

export type NovelStorySection = typeof NOVEL_STORY_SECTIONS[number]

export interface StoryAssetFile {
  asset: StoryAsset
  body: string
  section: NovelStorySection
  slug: string
  path: string
}

export interface StoryAssetListItem {
  section: NovelStorySection
  slug: string
  path: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/

export function normalizeStorySlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function resolveStoryAssetSection(type: StoryAssetType): NovelStorySection {
  switch (type) {
    case 'character_card':
      return 'characters'
    case 'scene_card':
      return 'scenes'
    case 'timeline_chapter':
      return 'timeline'
    case 'foreshadowing_entry':
      return 'foreshadowing'
    case 'outline_chapter':
      return 'outlines'
    case 'style_profile':
      return 'style'
    case 'worldbook_entry':
      return 'worldbook'
  }
}

function validateAsset(asset: unknown): StoryAsset {
  const result = validateStoryAsset(asset)
  if (result.ok) return result.data
  const errors = 'errors' in result ? result.errors : ['Unknown validation error']
  throw new Error(`Story asset schema validation failed:\n${errors.join('\n')}`)
}

function assetSlug(asset: StoryAsset): string {
  if (asset.type === 'style_profile') return 'profile'
  const slug = normalizeStorySlug(asset.id)
  if (!slug) {
    throw new Error('Story asset id must contain letters or numbers.')
  }
  return slug
}

function defaultBody(asset: StoryAsset): string {
  switch (asset.type) {
    case 'character_card':
      return `## Summary\n${asset.name}\n`
    case 'scene_card':
      return `## Summary\n${asset.summary}\n`
    case 'timeline_chapter':
      return `## Timeline\n${asset.events.map(event => `- ${event.time}: ${event.event}`).join('\n')}\n`
    case 'foreshadowing_entry':
      return `## Foreshadowing\n${asset.description}\n`
    case 'outline_chapter':
      return `## Outline\n${asset.summary}\n`
    case 'style_profile':
      return '## Style Profile\n'
    case 'worldbook_entry':
      return `## Worldbook\n${asset.description}\n`
  }
}

function serializeAsset(asset: StoryAsset, body: string): string {
  const frontmatter = yaml.dump(asset, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  })
  return `---\n${frontmatter}---\n\n${body.trimEnd()}\n`
}

function parseAssetFile(content: string): { asset: StoryAsset; body: string } {
  const match = content.match(FRONTMATTER_RE)
  if (!match) {
    throw new Error('Story asset file is missing YAML frontmatter.')
  }

  const frontmatter = yaml.load(match[1] ?? '')
  return {
    asset: validateAsset(frontmatter),
    body: match[2] ?? '',
  }
}

export class StoryStateStore {
  constructor(private readonly rootDir: string) {}

  getRootDir(): string {
    return this.rootDir
  }

  resolveSectionDir(section: NovelStorySection): string {
    return path.join(this.rootDir, section)
  }

  ensureSectionDir(section: NovelStorySection): string {
    const dir = this.resolveSectionDir(section)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  resolveAssetPath(asset: StoryAsset): { section: NovelStorySection; slug: string; path: string } {
    const validated = validateAsset(asset)
    const section = resolveStoryAssetSection(validated.type)
    const slug = assetSlug(validated)
    return {
      section,
      slug,
      path: path.join(this.ensureSectionDir(section), `${slug}.md`),
    }
  }

  writeAsset(asset: StoryAsset, body?: string): StoryAssetFile {
    const validated = validateAsset(asset)
    const target = this.resolveAssetPath(validated)
    const markdownBody = body ?? defaultBody(validated)
    const content = serializeAsset(validated, markdownBody)
    const tempPath = `${target.path}.${process.pid}.${Date.now()}.tmp`

    try {
      fs.writeFileSync(tempPath, content, 'utf-8')
      fs.renameSync(tempPath, target.path)
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
      throw error
    }

    return {
      asset: validated,
      body: markdownBody.trimEnd() + '\n',
      section: target.section,
      slug: target.slug,
      path: target.path,
    }
  }

  readAsset(section: NovelStorySection, slug: string): StoryAssetFile {
    const normalizedSlug = normalizeStorySlug(slug)
    if (!normalizedSlug) {
      throw new Error('Story asset slug is required.')
    }

    const filePath = path.join(this.resolveSectionDir(section), `${normalizedSlug}.md`)
    const content = fs.readFileSync(filePath, 'utf-8')
    const parsed = parseAssetFile(content)
    return {
      ...parsed,
      section,
      slug: normalizedSlug,
      path: filePath,
    }
  }

  listAssets(section?: NovelStorySection): StoryAssetListItem[] {
    const sections = section ? [section] : [...NOVEL_STORY_SECTIONS]
    return sections.flatMap(currentSection => {
      const dir = this.ensureSectionDir(currentSection)
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => ({
          section: currentSection,
          slug: entry.name.replace(/\.md$/i, ''),
          path: path.join(dir, entry.name),
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug))
    })
  }
}
