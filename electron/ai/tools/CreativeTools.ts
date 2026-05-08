import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CreativeDb } from '../db/CreativeDb'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import { DocumentSearch, listWorkspaceDocumentPaths } from '../document/DocumentSearch'
import { getRuntimeString } from './runtimeHelpers'
import { countWordDelta } from '../../../src/utils/textStats'

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

async function searchDraftFiles(
  draftDir: string,
  query: string,
  limit: number,
  snapshotBroker: SnapshotBroker | null,
): Promise<string> {
  if (!snapshotBroker) {
    return JSON.stringify({ query, scanned_files: 0, matched_files: 0, total_matches: 0, files: [] }, null, 2)
  }
  const filePaths = listWorkspaceDocumentPaths(draftDir, '**/*.md', undefined, 200)
  const fileLimit = Math.max(1, Math.min(limit, 10))
  const matchBudget = fileLimit * 5
  let remaining = matchBudget
  const files: Array<{
    file_path: string
    file_name: string
    document_type: string
    total_matches: number
    matches: Array<{
      block_id: number
      heading_block_id: number | null
      heading: string | null
      node_type: string
      match_count: number
      match_texts: string[]
      preview: string
    }>
  }> = []

  for (const filePath of filePaths) {
    if (remaining <= 0 || files.length >= fileLimit) break
    const snapshot = await snapshotBroker.requestSnapshot(filePath)
    if (!snapshot) continue
    const result = DocumentSearch.searchDocumentBlocksRaw(snapshot, query, {}, remaining)
    if (!result?.matches.length) continue
    remaining -= result.total_matches
    files.push({
      file_path: filePath,
      file_name: path.basename(filePath),
      document_type: 'md',
      total_matches: result.total_matches,
      matches: result.matches.map(match => ({
        block_id: match.block_id,
        heading_block_id: match.heading_block_id,
        heading: match.heading,
        node_type: match.node_type,
        match_count: match.match_count,
        match_texts: match.match_texts,
        preview: match.preview,
      })),
    })
  }

  return DocumentSearch.formatWorkspaceSearchResult(query, files, filePaths.length)
}

export function buildCreativeTools(options: {
  workspacePath?: string | null
  creativeDb: CreativeDb | null
  snapshotBroker?: SnapshotBroker | null
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
      return searchDraftFiles(path.join(workspacePath, 'draft'), cleanQuery, Math.max(1, Math.min(limit ?? 3, 10)), options.snapshotBroker ?? null)
    },
    {
      name: 'search_draft',
      description: 'Block-aware keyword search across Markdown files under draft/, returning matched blocks and headings.',
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
      const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
      const next = `${current}\n\n- ${entry}\n`
      fs.appendFileSync(filePath, `\n\n- ${entry}\n`, 'utf-8')
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'add_fragment',
        targetPath: 'draft/fragments.md',
        wordDelta: countWordDelta(current, next),
        summary: entry.slice(0, 240),
      })
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
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'patch_storybible',
        targetPath: 'storybible.md',
        wordDelta: countWordDelta(current, next),
        summary: patchContent.slice(0, 240),
      })
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
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'write_to_chapter',
        targetPath: `draft/${resolved.relativePath}`,
        wordDelta: countWordDelta(current, next),
        summary: cleanContent.slice(0, 240),
      })
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
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'replace_storybible_section',
        targetPath: 'storybible.md',
        wordDelta: countWordDelta(current, next),
        summary: cleanContent.slice(0, 240),
      })
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
      options.creativeDb?.clearStoryBibleChangeLog(workspacePath)
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
