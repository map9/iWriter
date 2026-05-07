import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CreativeDb } from '../db/CreativeDb'
import { getRuntimeString } from './runtimeHelpers'

const STORYBIBLE_TEMPLATE = `# StoryBible

_Last updated: not yet established_

## Characters

## World

## Story State

## Writing Constraints

## Open Questions
`

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

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

function ensureStoryBible(workspacePath: string): string {
  const filePath = path.join(workspacePath, 'storybible.md')
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, STORYBIBLE_TEMPLATE, 'utf-8')
  }
  return filePath
}

function ensureFragments(workspacePath: string): string {
  const draftDir = path.join(workspacePath, 'draft')
  ensureDir(draftDir)
  const filePath = path.join(draftDir, 'fragments.md')
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '# Fragments\n\n', 'utf-8')
  }
  return filePath
}

function resolveDraftMarkdownPath(workspacePath: string, filename: string): SafePathResult {
  const trimmed = filename.trim()
  if (!trimmed) return { ok: false, error: 'Error: filename is required.' }
  if (path.isAbsolute(trimmed) || trimmed.startsWith('~') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: 'Error: filename must be relative to draft/ and cannot be absolute.' }
  }
  if (trimmed.split(/[\\/]+/).includes('..')) {
    return { ok: false, error: 'Error: filename cannot contain "..".' }
  }

  const draftDir = path.resolve(workspacePath, 'draft')
  const withExt = path.extname(trimmed) ? trimmed : `${trimmed}.md`
  if (path.extname(withExt).toLowerCase() !== '.md') {
    return { ok: false, error: 'Error: creative draft tools only support .md files.' }
  }

  const targetPath = path.resolve(draftDir, withExt)
  if (!isInside(draftDir, targetPath)) {
    return { ok: false, error: 'Error: resolved draft path escapes the workspace draft directory.' }
  }

  return {
    ok: true,
    path: targetPath,
    relativePath: path.relative(draftDir, targetPath).replace(/\\/g, '/'),
  }
}

function insertAfterAnchor(current: string, anchor: string, content: string): string | null {
  const index = current.indexOf(anchor)
  if (index < 0) return null
  const insertAt = index + anchor.length
  const prefix = current.slice(0, insertAt)
  const suffix = current.slice(insertAt)
  return `${prefix}${prefix.endsWith('\n') ? '' : '\n'}${content}${content.endsWith('\n') ? '' : '\n'}${suffix}`
}

function replaceBetweenAnchors(current: string, startAnchor: string, endAnchor: string, content: string): string | null {
  const start = current.indexOf(startAnchor)
  if (start < 0) return null
  const end = current.indexOf(endAnchor, start + startAnchor.length)
  if (end < 0) return null
  const replaceStart = start
  const replaceEnd = end + endAnchor.length
  return `${current.slice(0, replaceStart)}${content}${content.endsWith('\n') ? '' : '\n'}${current.slice(replaceEnd)}`
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

function upsertStoryBibleSection(content: string, section: string, patchContent: string): string {
  const sectionRange = findMarkdownSection(content, section)
  const nextEntry = patchContent.trim()
  if (!nextEntry) return content
  if (!sectionRange) {
    return `${content.trimEnd()}\n\n## ${section}\n\n${nextEntry}\n`
  }
  const currentSection = content.slice(sectionRange.start, sectionRange.end).trimEnd()
  return `${content.slice(0, sectionRange.start)}${currentSection}\n\n${nextEntry}\n${content.slice(sectionRange.end)}`
}

function summarizeSearchMatch(text: string, query: string): string | null {
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return null
  const start = Math.max(0, index - 80)
  const end = Math.min(text.length, index + query.length + 160)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`.replace(/\s+/g, ' ').trim()
}

function searchDraftFiles(draftDir: string, query: string, limit: number) {
  const results: Array<{ filename: string; matches: string[] }> = []
  if (!fs.existsSync(draftDir)) return results

  function walk(dirPath: string): void {
    if (results.length >= limit) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= limit) return
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      let text = ''
      try {
        text = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }
      const match = summarizeSearchMatch(text, query)
      if (match) {
        results.push({
          filename: path.relative(draftDir, fullPath).replace(/\\/g, '/'),
          matches: [match],
        })
      }
    }
  }

  walk(draftDir)
  return results
}

export function buildCreativeTools(options: {
  workspacePath?: string | null
  creativeDb: CreativeDb | null
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const readStoryBible = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const filePath = ensureStoryBible(workspacePath)
      return fs.readFileSync(filePath, 'utf-8')
    },
    {
      name: 'read_storybible',
      description: 'Read the project StoryBible from storybible.md. Creates a minimal template if it does not exist.',
      schema: z.object({}),
    }
  )

  const readChapter = tool(
    async ({ filename }: { filename: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveDraftMarkdownPath(workspacePath, filename)
      if (!resolved.ok) return resolved.error
      if (!fs.existsSync(resolved.path)) return `Error: draft chapter not found: draft/${resolved.relativePath}`
      return fs.readFileSync(resolved.path, 'utf-8')
    },
    {
      name: 'read_chapter',
      description: 'Read one Markdown chapter under draft/. The filename must be relative to draft/.',
      schema: z.object({
        filename: z.string().describe('Relative Markdown filename under draft/, e.g. ch01.md.'),
      }),
    }
  )

  const readFragments = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      return fs.readFileSync(ensureFragments(workspacePath), 'utf-8')
    },
    {
      name: 'read_fragments',
      description: 'Read draft/fragments.md, creating it if needed.',
      schema: z.object({}),
    }
  )

  const searchDraft = tool(
    async ({ query, limit }: { query: string; limit?: number }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const cleanQuery = query.trim()
      if (!cleanQuery) return 'Error: query is required.'
      const results = searchDraftFiles(path.join(workspacePath, 'draft'), cleanQuery, Math.max(1, Math.min(limit ?? 3, 10)))
      return JSON.stringify({ query: cleanQuery, files: results }, null, 2)
    },
    {
      name: 'search_draft',
      description: 'Keyword-search Markdown files under draft/ and return small content previews.',
      schema: z.object({
        query: z.string().describe('Keyword or phrase to search for.'),
        limit: z.number().optional().describe('Maximum matched files to return. Default 3, max 10.'),
      }),
    }
  )

  const getSessionDiff = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      if (!options.creativeDb) return 'Error: Creative session database is unavailable without an open workspace folder.'
      return JSON.stringify(options.creativeDb.getSessionDiff(workspacePath), null, 2)
    },
    {
      name: 'get_session_diff',
      description: 'Return file-level changes in storybible.md and draft/**/*.md since the last completed creative run.',
      schema: z.object({}),
    }
  )

  const addFragment = tool(
    async ({ content }: { content: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const filePath = ensureFragments(workspacePath)
      const entry = content.trim()
      if (!entry) return 'Error: content is required.'
      fs.appendFileSync(filePath, `\n\n- ${entry}\n`, 'utf-8')
      return `Fragment added to draft/fragments.md.`
    },
    {
      name: 'add_fragment',
      description: 'Append a small idea, seed, open question, or note to draft/fragments.md. This is additive only.',
      schema: z.object({
        content: z.string().describe('The fragment text to append.'),
      }),
    }
  )

  const patchStoryBible = tool(
    async ({ section, content }: { section: string; anchor?: string; content: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const patchContent = content.trim()
      if (!section.trim() || !patchContent) return 'Error: section and content are required.'
      if (patchContent.length > 1600) {
        return 'Error: patch_storybible is limited to small append/upsert patches. Use replace_storybible_section for larger changes.'
      }
      const filePath = ensureStoryBible(workspacePath)
      const current = fs.readFileSync(filePath, 'utf-8')
      const next = upsertStoryBibleSection(current, section.trim(), patchContent)
      fs.writeFileSync(filePath, next, 'utf-8')
      return JSON.stringify({ patched: true, section: section.trim(), summary: patchContent.slice(0, 240) }, null, 2)
    },
    {
      name: 'patch_storybible',
      description: 'Append or upsert a small confirmed fact into one StoryBible section. Do not use for deletion or large replacement.',
      schema: z.object({
        section: z.string().describe('StoryBible section heading, e.g. Characters, World, Story State.'),
        anchor: z.string().optional().describe('Optional local anchor for the update. Used as context only in Phase 1.'),
        content: z.string().describe('Small patch content to append/upsert.'),
      }),
    }
  )

  const confirmWritingPlan = tool(
    async ({ plan, rationale, alternatives }: { plan: string; rationale: string; alternatives?: string[] }) => {
      return JSON.stringify({
        approved_plan: plan,
        rationale,
        alternatives: alternatives ?? [],
      }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the user to approve or edit a writing plan before drafting a scene/chapter or large rewrite.',
      schema: z.object({
        plan: z.string().describe('Concrete writing plan.'),
        rationale: z.string().describe('Why this plan fits the current story and craft goals.'),
        alternatives: z.array(z.string()).optional().describe('Optional alternative directions.'),
      }),
    }
  )

  const writeToChapter = tool(
    async ({
      filename,
      content,
      mode,
      approved_plan,
      insert_anchor,
      replace_start_anchor,
      replace_end_anchor,
    }: {
      filename: string
      content: string
      mode: 'append' | 'insert_at' | 'replace_range'
      approved_plan: string
      insert_anchor?: string
      replace_start_anchor?: string
      replace_end_anchor?: string
    }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      if (!approved_plan.trim()) return 'Error: approved_plan is required.'
      const resolved = resolveDraftMarkdownPath(workspacePath, filename)
      if (!resolved.ok) return resolved.error
      ensureDir(path.dirname(resolved.path))
      const cleanContent = content.trimEnd()
      if (!cleanContent.trim()) return 'Error: content is required.'
      const current = fs.existsSync(resolved.path) ? fs.readFileSync(resolved.path, 'utf-8') : ''
      let next = current
      if (mode === 'append') {
        next = `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${cleanContent}\n`
      } else if (mode === 'insert_at') {
        if (!insert_anchor) return 'Error: insert_at mode requires insert_anchor.'
        const inserted = insertAfterAnchor(current, insert_anchor, cleanContent)
        if (inserted === null) return 'Error: insert_anchor was not found in the chapter.'
        next = inserted
      } else {
        if (!replace_start_anchor || !replace_end_anchor) {
          return 'Error: replace_range mode requires replace_start_anchor and replace_end_anchor.'
        }
        const replaced = replaceBetweenAnchors(current, replace_start_anchor, replace_end_anchor, cleanContent)
        if (replaced === null) return 'Error: replace anchors were not found in the chapter.'
        next = replaced
      }
      fs.writeFileSync(resolved.path, next, 'utf-8')
      return JSON.stringify({ written: true, filename: `draft/${resolved.relativePath}`, mode }, null, 2)
    },
    {
      name: 'write_to_chapter',
      description: 'Write approved prose into a Markdown chapter under draft/. Requires approved_plan from confirm_writing_plan.',
      schema: z.object({
        filename: z.string().describe('Relative Markdown filename under draft/.'),
        content: z.string().describe('Prose to write.'),
        mode: z.enum(['append', 'insert_at', 'replace_range']).describe('How to write content.'),
        approved_plan: z.string().describe('The user-approved or user-edited plan being executed.'),
        insert_anchor: z.string().optional().describe('Required for insert_at: insert after this exact text.'),
        replace_start_anchor: z.string().optional().describe('Required for replace_range: start anchor of text to replace.'),
        replace_end_anchor: z.string().optional().describe('Required for replace_range: end anchor of text to replace.'),
      }),
    }
  )

  const replaceStoryBibleSection = tool(
    async ({ section, content }: { section: string; content: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const cleanSection = section.trim()
      const cleanContent = content.trim()
      if (!cleanSection || !cleanContent) return 'Error: section and content are required.'
      const filePath = ensureStoryBible(workspacePath)
      const current = fs.readFileSync(filePath, 'utf-8')
      const range = findMarkdownSection(current, cleanSection)
      const replacement = `## ${cleanSection}\n\n${cleanContent}\n`
      const next = range
        ? `${current.slice(0, range.start)}${replacement}${current.slice(range.end)}`
        : `${current.trimEnd()}\n\n${replacement}`
      fs.writeFileSync(filePath, next, 'utf-8')
      return JSON.stringify({ replaced: true, section: cleanSection }, null, 2)
    },
    {
      name: 'replace_storybible_section',
      description: 'Replace an entire StoryBible section after user approval.',
      schema: z.object({
        section: z.string().describe('StoryBible section heading to replace.'),
        content: z.string().describe('Complete replacement content for the section, without the ## heading.'),
      }),
    }
  )

  const rebuildStoryBible = tool(
    async ({ content }: { content: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const cleanContent = content.trim()
      if (!cleanContent) return 'Error: content is required.'
      const filePath = path.join(workspacePath, 'storybible.md')
      fs.writeFileSync(filePath, `${cleanContent}\n`, 'utf-8')
      return 'StoryBible rebuilt.'
    },
    {
      name: 'rebuild_storybible',
      description: 'Replace storybible.md with a complete rebuilt StoryBible after user approval. Read draft context first.',
      schema: z.object({
        content: z.string().describe('Complete rebuilt StoryBible Markdown.'),
      }),
    }
  )

  return [
    readStoryBible,
    readChapter,
    readFragments,
    searchDraft,
    getSessionDiff,
    addFragment,
    patchStoryBible,
    confirmWritingPlan,
    writeToChapter,
    replaceStoryBibleSection,
    rebuildStoryBible,
  ] as const
}
