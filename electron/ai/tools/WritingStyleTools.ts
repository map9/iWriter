import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { z } from 'zod'
import yaml from 'yaml'
import { DynamicStructuredTool } from '@langchain/core/tools'

const MAX_SKILL_NAME_LENGTH = 64
const MAX_EXCERPT_CHARS = 200
const MAX_EXCERPTS = 2

// Slugs currently being written — guards against concurrent create for same author
const inFlightSlugs = new Set<string>()

function slugifyAuthorName(authorName: string): string {
  // NFKC normalize + lower case
  let s = authorName.normalize('NFKC').toLowerCase()
  // Replace non-[a-z0-9] runs with hyphen
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // If the result is empty or contains no ASCII alphanumeric chars, fall back to hash
  if (!s || !/[a-z0-9]/.test(s)) {
    const hash = crypto.createHash('sha1').update(authorName).digest('hex').slice(0, 8)
    s = `author-${hash}`
  }

  if (s.length > MAX_SKILL_NAME_LENGTH) {
    const hash = crypto.createHash('sha1').update(s).digest('hex').slice(0, 4)
    s = s.slice(0, MAX_SKILL_NAME_LENGTH - 5) + '-' + hash
  }

  return s
}

function styleRoot(skillsRoot: string): string {
  return path.join(skillsRoot, 'writing-style')
}

function skillDir(skillsRoot: string, slug: string): string {
  return path.join(styleRoot(skillsRoot), slug)
}

function validateSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) && slug.length <= MAX_SKILL_NAME_LENGTH
}

function buildFrontmatterDescription(authorName: string, styleDescription: string): string {
  const firstLine = styleDescription
    .split(/\r?\n/)
    .map(line => line.replace(/^#+\s*/, '').trim())
    .find(Boolean)
  const summary = firstLine ? ` ${firstLine}` : ''
  const raw = `Named-author writing style for ${authorName}.${summary} Use when the author requests prose in ${authorName}'s style.`
  return raw.replace(/\s+/g, ' ').slice(0, 900)
}

function validateSkillMd(content: string, expectedSlug: string): { ok: true } | { ok: false; error: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (!match) {
    return { ok: false, error: 'SKILL.md must start with YAML frontmatter.' }
  }

  let frontmatter: unknown
  try {
    frontmatter = yaml.parse(match[1] ?? '')
  } catch (err) {
    return { ok: false, error: `Invalid YAML frontmatter: ${String(err)}` }
  }

  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return { ok: false, error: 'Frontmatter must be a YAML mapping.' }
  }

  const record = frontmatter as Record<string, unknown>
  const name = String(record.name ?? '').trim()
  const description = String(record.description ?? '').trim()
  if (!name || !description) {
    return { ok: false, error: 'Frontmatter must include name and description.' }
  }
  if (name !== expectedSlug) {
    return { ok: false, error: `Frontmatter name "${name}" must match slug "${expectedSlug}".` }
  }
  if (!validateSlug(name)) {
    return { ok: false, error: `Invalid skill name "${name}".` }
  }
  if (description.length > 1024) {
    return { ok: false, error: 'Frontmatter description exceeds 1024 characters.' }
  }
  return { ok: true }
}

function buildSkillMd(
  slug: string,
  authorName: string,
  styleDescription: string,
  references: string[],
  sampleExcerpts: string[],
): string {
  const description = buildFrontmatterDescription(authorName, styleDescription)
  const createdAt = new Date().toISOString()

  const excerptLines = sampleExcerpts
    .slice(0, MAX_EXCERPTS)
    .map((e, i) => `> Excerpt ${i + 1}: ${e.slice(0, MAX_EXCERPT_CHARS)}${e.length > MAX_EXCERPT_CHARS ? '…' : ''}`)
    .join('\n\n')

  const refLines = references.map(r => `- ${r}`).join('\n')

  return `---
name: ${slug}
description: ${JSON.stringify(description)}
---

# ${authorName} Writing Style

## Author Identity

${styleDescription}

## Sample Excerpts

${excerptLines || '> No excerpts provided.'}

## Sources

${refLines || '- No sources listed.'}

## Generation Guidance

When writing prose in this style, follow the style markers described above. Prefer the diction, rhythm, and imagery characteristic of this author. Avoid generic or contemporary prose patterns that would feel out of place in their body of work.

<!-- iwriter-meta: createdAt=${createdAt}, slug=${slug} -->
`
}

function parseCreatedAt(skillMd: string): string | null {
  const match = /<!--\s*iwriter-meta:.*?createdAt=([^,\s]+)/.exec(skillMd)
  return match ? (match[1] ?? null) : null
}

function parseAuthorNameFromMd(skillMd: string): string | null {
  const match = /^#\s+(.+?)\s+Writing Style/m.exec(skillMd)
  return match ? (match[1]?.trim() ?? null) : null
}

function listStyleDirs(skillsRoot: string): { slug: string; dir: string }[] {
  try {
    return fs.readdirSync(styleRoot(skillsRoot), { withFileTypes: true })
      .filter(e => e.isDirectory() && validateSlug(e.name))
      .map(e => ({ slug: e.name, dir: path.join(styleRoot(skillsRoot), e.name) }))
  } catch {
    return []
  }
}

// ── Tool builders ─────────────────────────────────────────────────────────────

function makeListWritingStyles(skillsRoot: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_writing_styles',
    description: 'Lists all saved author writing-style skills. Returns slug, authorName, and creation date for each.',
    schema: z.object({}),
    func: async () => {
      const dirs = listStyleDirs(skillsRoot)
      const styles = dirs.map(({ slug, dir }) => {
        const mdPath = path.join(dir, 'SKILL.md')
        let authorName: string | null = null
        let description = ''
        let createdAt: string | null = null
        try {
          const content = fs.readFileSync(mdPath, 'utf-8')
          authorName = parseAuthorNameFromMd(content)
          createdAt = parseCreatedAt(content)
          const descMatch = /^description:\s*(.+)$/m.exec(content)
          description = descMatch ? (descMatch[1]?.trim() ?? '') : ''
        } catch {
          // skip unreadable entries
        }
        return { slug, authorName: authorName ?? slug, description, createdAt }
      })
      return JSON.stringify({ styles })
    },
  })
}

function makeGetWritingStyle(skillsRoot: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_writing_style',
    description: "Returns the full SKILL.md content for a named author's writing style. Use the slug from list_writing_styles.",
    schema: z.object({
      slug: z.string().describe("The author's slug (e.g. 'lu-xun', 'jane-austen')"),
    }),
    func: async ({ slug }) => {
      const mdPath = path.join(skillDir(skillsRoot, slug), 'SKILL.md')
      try {
        return fs.readFileSync(mdPath, 'utf-8')
      } catch {
        return JSON.stringify({ error: `Writing style not found for slug "${slug}". Use list_writing_styles to see available styles.` })
      }
    },
  })
}

function makeSaveWritingStyleSkill(
  skillsRoot: string,
  onSkillsMutated: () => void,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'save_writing_style_skill',
    description: 'Saves a complete deepagents SKILL.md for a named-author writing style under the configured writing-style skills directory. The content must include valid YAML frontmatter with name equal to slug.',
    schema: z.object({
      slug: z.string().describe("The author style slug, e.g. 'lu-xun' or 'jane-austen'."),
      content: z.string().describe('Complete SKILL.md content to save, including YAML frontmatter.'),
      overwrite: z.boolean().optional().describe('If true, overwrites an existing style skill. Default false.'),
    }),
    func: async ({ slug, content, overwrite = false }) => {
      if (!validateSlug(slug)) {
        return JSON.stringify({ error: `Invalid slug format: "${slug}".` })
      }

      const validation = validateSkillMd(content, slug)
      if (!validation.ok) {
        return JSON.stringify({ error: validation.error })
      }

      const dir = skillDir(skillsRoot, slug)
      const mdPath = path.join(dir, 'SKILL.md')
      if (!overwrite && fs.existsSync(mdPath)) {
        return JSON.stringify({
          error: 'exists',
          slug,
          suggestion: 'Pass overwrite:true to replace the existing skill, or use update_writing_style for small refinements.',
        })
      }

      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(mdPath, content, 'utf-8')
      onSkillsMutated()
      console.log(`[WritingStyleTools] saved writing-style/${slug}`)
      return JSON.stringify({ saved: true, slug, skillPath: mdPath })
    },
  })
}

function makeCreateWritingStyle(
  skillsRoot: string,
  onSkillsMutated: () => void,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_writing_style',
    description: "Creates a new writing-style skill for a named author. Call this after researching the author's style. Provide a styleDescription summarizing diction, rhythm, imagery, and voice. Optionally add reference URLs and short sample excerpts (each ≤200 chars).",
    schema: z.object({
      authorName: z.string().describe("The author's full name (e.g. '鲁迅', 'Jane Austen')"),
      styleDescription: z.string().describe("Prose description of the author's writing style: diction, sentence rhythm, imagery, themes, voice, POV tendencies"),
      references: z.array(z.string()).optional().describe('Source URLs or titles used for research'),
      sampleExcerpts: z.array(z.string()).optional().describe('Short representative excerpts (each ≤200 chars, max 2)'),
      overwrite: z.boolean().optional().describe('If true, overwrites an existing skill with the same slug. Default false.'),
    }),
    func: async ({ authorName, styleDescription, references = [], sampleExcerpts = [], overwrite = false }) => {
      const slug = slugifyAuthorName(authorName)
      const dir = skillDir(skillsRoot, slug)

      if (inFlightSlugs.has(slug)) {
        return JSON.stringify({ error: 'concurrent_create', slug, message: `A create operation for slug "${slug}" is already in progress.` })
      }

      if (!overwrite && fs.existsSync(dir)) {
        return JSON.stringify({
          error: 'exists',
          slug,
          suggestion: 'Use update_writing_style to refine the existing skill, or pass overwrite:true to replace it.',
        })
      }

      inFlightSlugs.add(slug)
      try {
        fs.mkdirSync(dir, { recursive: true })
        const content = buildSkillMd(slug, authorName, styleDescription, references, sampleExcerpts)
        const validation = validateSkillMd(content, slug)
        if (!validation.ok) {
          return JSON.stringify({ error: validation.error })
        }
        const mdPath = path.join(dir, 'SKILL.md')
        fs.writeFileSync(mdPath, content, 'utf-8')
        onSkillsMutated()
        console.log(`[WritingStyleTools] created writing-style/${slug} for "${authorName}"`)
        return JSON.stringify({ created: true, slug, skillName: slug, skillPath: mdPath })
      } finally {
        inFlightSlugs.delete(slug)
      }
    },
  })
}

function makeUpdateWritingStyle(
  skillsRoot: string,
  onSkillsMutated: () => void,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'update_writing_style',
    description: "Updates an existing author writing-style skill. Use appendNote to add a refinement based on author feedback without rewriting the whole file.",
    schema: z.object({
      slug: z.string().describe("The author's slug"),
      patch: z.object({
        styleDescription: z.string().optional().describe('Replacement for the Author Identity section'),
        references: z.array(z.string()).optional().describe('New references to append'),
        sampleExcerpts: z.array(z.string()).optional().describe('New sample excerpts to append (each ≤200 chars)'),
        appendNote: z.string().optional().describe('Additional note to append at the end of the file'),
      }),
    }),
    func: async ({ slug, patch }) => {
      const mdPath = path.join(skillDir(skillsRoot, slug), 'SKILL.md')
      if (!fs.existsSync(mdPath)) {
        return JSON.stringify({ error: `Writing style not found for slug "${slug}".` })
      }

      let content = fs.readFileSync(mdPath, 'utf-8')
      const changedSections: string[] = []

      if (patch.styleDescription) {
        content = content.replace(
          /(## Author Identity\n\n)[\s\S]*?(\n\n## )/,
          `$1${patch.styleDescription}$2`,
        )
        changedSections.push('Author Identity')
      }

      if (patch.references?.length) {
        const newRefs = patch.references.map((r: string) => `- ${r}`).join('\n')
        content = content.replace(
          /(## Sources\n\n)([\s\S]*?)(\n\n## )/,
          (_, h, existing, rest) => `${h}${existing.trimEnd()}\n${newRefs}${rest}`,
        )
        changedSections.push('Sources')
      }

      if (patch.sampleExcerpts?.length) {
        const newExcerpts = patch.sampleExcerpts
          .slice(0, MAX_EXCERPTS)
          .map((e: string, i: number) => `> Excerpt (update ${i + 1}): ${e.slice(0, MAX_EXCERPT_CHARS)}${e.length > MAX_EXCERPT_CHARS ? '…' : ''}`)
          .join('\n\n')
        content = content.replace(
          /(## Sample Excerpts\n\n)([\s\S]*?)(\n\n## )/,
          (_, h, existing, rest) => `${h}${existing.trimEnd()}\n\n${newExcerpts}${rest}`,
        )
        changedSections.push('Sample Excerpts')
      }

      if (patch.appendNote) {
        // Insert before the final iwriter-meta comment
        content = content.replace(
          /(\n*<!-- iwriter-meta:)/,
          `\n\n## Refinement Notes\n\n${patch.appendNote}\n$1`,
        )
        changedSections.push('Refinement Notes')
      }

      fs.writeFileSync(mdPath, content, 'utf-8')
      onSkillsMutated()
      return JSON.stringify({ updated: true, slug, changedSections })
    },
  })
}

function makeDeleteWritingStyle(
  skillsRoot: string,
  onSkillsMutated: () => void,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'delete_writing_style',
    description: "Permanently deletes an author's writing-style skill. Requires explicit author approval (HITL).",
    schema: z.object({
      slug: z.string().describe("The author's slug to delete"),
    }),
    func: async ({ slug }) => {
      // Safety: must start with valid prefix pattern
      if (!validateSlug(slug)) {
        return JSON.stringify({ error: `Invalid slug format: "${slug}"` })
      }
      const dir = skillDir(skillsRoot, slug)
      if (!fs.existsSync(dir)) {
        return JSON.stringify({ error: `Writing style not found for slug "${slug}".` })
      }
      fs.rmSync(dir, { recursive: true, force: true })
      onSkillsMutated()
      console.log(`[WritingStyleTools] deleted writing-style/${slug}`)
      return JSON.stringify({ deleted: true, slug })
    },
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface WritingStyleToolsOptions {
  skillsRoot: string
  onSkillsMutated: () => void
}

export function buildWritingStyleTools(options: WritingStyleToolsOptions): readonly DynamicStructuredTool[] {
  const { skillsRoot, onSkillsMutated } = options
  return [
    makeListWritingStyles(skillsRoot),
    makeGetWritingStyle(skillsRoot),
    makeSaveWritingStyleSkill(skillsRoot, onSkillsMutated),
    makeCreateWritingStyle(skillsRoot, onSkillsMutated),
    makeUpdateWritingStyle(skillsRoot, onSkillsMutated),
    makeDeleteWritingStyle(skillsRoot, onSkillsMutated),
  ] as const
}
