import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { CreativeDb } from '../db/CreativeDb'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import { DocumentSearch, listWorkspaceDocumentPaths } from '../document/DocumentSearch'
import { getRuntimeString } from './runtimeHelpers'
import { countWordDelta, countWords } from '../../../src/utils/textStats'
import { LogicAuditSchema, type LogicAudit } from '../../../src/ai/creative/logicAudit'

const STORYBIBLE_TEMPLATE = `# StoryBible

_Last updated: not yet established_

## Premise
<!-- One sentence: whose change does this novel follow, and what change is it? -->

## Theme
<!-- The question, emotional value, or proposition the author wants to leave with the reader. -->

## Promise to Reader
<!-- The tone, genre, and emotional contract promised by the opening and echoed by the ending. -->

## Characters

## World

## Story State

## Writing Constraints

## Open Questions
`

export type SafePathResult =
  | { ok: true; path: string; relativePath: string }
  | { ok: false; error: string }

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  return getRuntimeString(runtime, 'workspace_path')?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

export function isInside(parent: string, child: string): boolean {
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

export function resolveWorkspaceSubpath(
  workspacePath: string,
  subdir: string,
  filename: string,
  options?: {
    requiredExt?: string
    appendExt?: boolean
    label?: string
  },
): SafePathResult {
  const trimmed = filename.trim()
  const label = options?.label ?? 'filename'
  if (!trimmed) return { ok: false, error: `Error: ${label} is required.` }
  if (path.isAbsolute(trimmed) || trimmed.startsWith('~') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: `Error: ${label} must be relative to ${subdir}/ and cannot be absolute.` }
  }
  if (trimmed.split(/[\\/]+/).includes('..')) {
    return { ok: false, error: `Error: ${label} cannot contain "..".` }
  }

  const rootDir = path.resolve(workspacePath, subdir)
  let targetName = trimmed
  if (options?.appendExt && options.requiredExt && !path.extname(targetName)) {
    targetName = `${targetName}${options.requiredExt}`
  }
  if (options?.requiredExt && path.extname(targetName).toLowerCase() !== options.requiredExt.toLowerCase()) {
    return { ok: false, error: `Error: ${label} must use ${options.requiredExt} files.` }
  }

  const targetPath = path.resolve(rootDir, targetName)
  if (!isInside(rootDir, targetPath)) {
    return { ok: false, error: `Error: resolved ${label} escapes the ${subdir}/ directory.` }
  }

  return {
    ok: true,
    path: targetPath,
    relativePath: path.relative(rootDir, targetPath).replace(/\\/g, '/'),
  }
}

function resolveDraftMarkdownPath(workspacePath: string, filename: string): SafePathResult {
  return resolveWorkspaceSubpath(workspacePath, 'draft', filename, {
    requiredExt: '.md',
    appendExt: true,
    label: 'filename',
  })
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

function summarizeArchivedChapter(filename: string, content: string): string {
  const body = content
    .replace(/^#\s+.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!body) return `${filename}: Empty chapter or placeholder content.`
  const target = body.length > 420 ? `${body.slice(0, 360).trim()} ... ${body.slice(-120).trim()}` : body
  return `${filename}: ${target}`
}

function upsertArchivedChapters(content: string, entries: Array<{ filename: string; summary: string }>): string {
  const storyStateRange = findMarkdownSection(content, 'Story State')
  const base = storyStateRange
    ? content
    : `${content.trimEnd()}\n\n## Story State\n\n`
  const range = findMarkdownSection(base, 'Story State')
  if (!range) return base

  const storyState = base.slice(range.start, range.end)
  const archiveHeading = /^###\s+Archived Chapters\s*$/mi
  const archiveMatch = archiveHeading.exec(storyState)
  const entryByFilename = new Map(entries.map(entry => [entry.filename, entry.summary.trim()]))

  if (!archiveMatch || archiveMatch.index === undefined) {
    const addition = [
      '',
      '### Archived Chapters',
      '',
      ...entries.map(entry => `- **${entry.filename}**: ${entry.summary.trim()}`),
      '',
    ].join('\n')
    return `${base.slice(0, range.end).trimEnd()}\n${addition}${base.slice(range.end)}`
  }

  const archiveStart = archiveMatch.index
  const afterHeading = archiveStart + archiveMatch[0].length
  const nextSubheading = /^###\s+/gmi
  nextSubheading.lastIndex = afterHeading
  const next = nextSubheading.exec(storyState)
  const archiveEnd = next?.index ?? storyState.length
  const beforeArchive = storyState.slice(0, archiveStart)
  const archiveBlock = storyState.slice(archiveStart, archiveEnd)
  const afterArchive = storyState.slice(archiveEnd)
  const consumed = new Set<string>()
  const lines = archiveBlock.split(/\r?\n/)
  const nextLines = lines.map(line => {
    const match = /^-\s+\*\*(.+?)\*\*:\s*/.exec(line.trim())
    const filename = match?.[1]
    if (!filename || !entryByFilename.has(filename)) return line
    consumed.add(filename)
    return `- **${filename}**: ${entryByFilename.get(filename)}`
  })
  for (const entry of entries) {
    if (!consumed.has(entry.filename)) {
      nextLines.push(`- **${entry.filename}**: ${entry.summary.trim()}`)
    }
  }
  const nextStoryState = `${beforeArchive}${nextLines.join('\n').trimEnd()}\n${afterArchive}`
  return `${base.slice(0, range.start)}${nextStoryState}${base.slice(range.end)}`
}

function removeOpenQuestion(content: string, question: string): string {
  const range = findMarkdownSection(content, 'Open Questions')
  if (!range) return content
  const target = question.trim().replace(/^[-*]\s*/, '').trim()
  if (!target) return content
  const current = content.slice(range.start, range.end)
  const lines = current.split(/\r?\n/)
  const nextLines = lines.filter(line => {
    const normalized = line.trim().replace(/^[-*]\s*/, '').trim()
    return normalized !== target
  })
  return `${content.slice(0, range.start)}${nextLines.join('\n').trimEnd()}\n${content.slice(range.end)}`
}

interface ChapterInfo {
  filename: string
  path: string
  number: number | null
  suffix: string
  h1: string
  wordCount: number
}

function parseChapterFilename(filename: string): { number: number; suffix: string } | null {
  const match = /^ch(\d+)(.*)\.md$/i.exec(filename)
  if (!match) return null
  return { number: Number(match[1]), suffix: match[2] ?? '' }
}

function formatChapterFilename(number: number, suffix: string): string {
  return `ch${String(number).padStart(2, '0')}${suffix}.md`
}

function readChapterInfos(workspacePath: string): ChapterInfo[] {
  const draftDir = path.join(workspacePath, 'draft')
  if (!fs.existsSync(draftDir)) return []
  return fs.readdirSync(draftDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^ch\d+.*\.md$/i.test(entry.name))
    .map(entry => {
      const filePath = path.join(draftDir, entry.name)
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseChapterFilename(entry.name)
      return {
        filename: entry.name,
        path: filePath,
        number: parsed?.number ?? null,
        suffix: parsed?.suffix ?? '',
        h1: /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? '',
        wordCount: countWords(content),
      }
    })
    .sort((a, b) => {
      if (a.number !== null && b.number !== null && a.number !== b.number) return a.number - b.number
      return a.filename.localeCompare(b.filename)
    })
}

function summarizeChapters(workspacePath: string) {
  return readChapterInfos(workspacePath).map(({ filename, h1, wordCount }) => ({ filename, h1, wordCount }))
}

function renameManyTransaction(steps: Array<{ from: string; to: string }>): void {
  const filtered = steps.filter(step => step.from !== step.to)
  if (!filtered.length) return
  const fromSet = new Set(filtered.map(step => path.resolve(step.from)))
  for (const step of filtered) {
    if (!fs.existsSync(step.from)) throw new Error(`Source does not exist: ${path.basename(step.from)}`)
    const target = path.resolve(step.to)
    if (fs.existsSync(target) && !fromSet.has(target)) {
      throw new Error(`Target already exists: ${path.basename(step.to)}`)
    }
  }

  const staged: Array<{ original: string; temp: string; final: string }> = []
  try {
    for (const step of filtered) {
      const temp = path.join(path.dirname(step.from), `.${path.basename(step.from)}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
      fs.renameSync(step.from, temp)
      staged.push({ original: step.from, temp, final: step.to })
    }
    for (const item of staged) {
      ensureDir(path.dirname(item.final))
      fs.renameSync(item.temp, item.final)
    }
  } catch (err) {
    for (const item of staged.reverse()) {
      if (fs.existsSync(item.temp) && !fs.existsSync(item.original)) {
        try { fs.renameSync(item.temp, item.original) } catch { /* best effort rollback */ }
      }
    }
    throw err
  }
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

  const resolveOpenQuestion = tool(
    async ({
      question,
      resolution,
      target_section,
    }: {
      question: string
      resolution: string
      target_section: string
    }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const cleanQuestion = question.trim().replace(/^[-*]\s*/, '').trim()
      const cleanResolution = resolution.trim()
      const cleanSection = target_section.trim()
      if (!cleanQuestion || !cleanResolution || !cleanSection) {
        return 'Error: question, resolution, and target_section are required.'
      }
      const filePath = ensureStoryBible(workspacePath)
      const current = fs.readFileSync(filePath, 'utf-8')
      const withResolution = upsertStoryBibleSection(current, cleanSection, cleanResolution)
      const next = removeOpenQuestion(withResolution, cleanQuestion)
      fs.writeFileSync(filePath, next, 'utf-8')
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'resolve_open_question',
        targetPath: 'storybible.md',
        wordDelta: countWordDelta(current, next),
        summary: cleanQuestion.slice(0, 120),
      })
      return JSON.stringify({
        resolved: true,
        question: cleanQuestion,
        target_section: cleanSection,
      }, null, 2)
    },
    {
      name: 'resolve_open_question',
      description: 'Resolve one StoryBible Open Questions bullet by adding the confirmed resolution to a target section and removing that bullet.',
      schema: z.object({
        question: z.string().describe('The exact Open Questions bullet to resolve.'),
        resolution: z.string().describe('Confirmed resolution text to add to the target StoryBible section.'),
        target_section: z.string().describe('StoryBible section to receive the resolution, e.g. Premise, Theme, Characters, World, Story State.'),
      }),
    }
  )

  const listChapters = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      return JSON.stringify({ chapters: summarizeChapters(workspacePath) }, null, 2)
    },
    {
      name: 'list_chapters',
      description: 'List draft/ch*.md chapters in numeric order with filename, first H1, and word count.',
      schema: z.object({}),
    }
  )

  const createChapter = tool(
    async ({ filename, after_filename }: { filename: string; after_filename?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveDraftMarkdownPath(workspacePath, filename)
      if (!resolved.ok) return resolved.error
      const draftDir = path.join(workspacePath, 'draft')
      ensureDir(draftDir)

      const before = summarizeChapters(workspacePath)
      const requested = path.basename(resolved.relativePath)
      const requestedParsed = parseChapterFilename(requested)
      let targetFilename = requested

      if (after_filename?.trim()) {
        const after = resolveDraftMarkdownPath(workspacePath, after_filename)
        if (!after.ok) return after.error
        if (!fs.existsSync(after.path)) return `Error: after_filename not found: draft/${after.relativePath}`
        const afterParsed = parseChapterFilename(path.basename(after.relativePath))
        if (!afterParsed) return 'Error: after_filename must be a numbered chapter like ch02.md.'
        const targetNumber = afterParsed.number + 1
        const suffix = requestedParsed?.suffix ?? ''
        targetFilename = requestedParsed ? formatChapterFilename(targetNumber, suffix) : requested
        const shifts = readChapterInfos(workspacePath)
          .filter(chapter => chapter.number !== null && chapter.number >= targetNumber)
          .sort((a, b) => (b.number ?? 0) - (a.number ?? 0))
          .map(chapter => ({
            from: chapter.path,
            to: path.join(draftDir, formatChapterFilename((chapter.number ?? 0) + 1, chapter.suffix)),
          }))
        renameManyTransaction(shifts)
      }

      const targetPath = path.join(draftDir, targetFilename)
      if (fs.existsSync(targetPath)) return `Error: draft chapter already exists: draft/${targetFilename}`
      fs.writeFileSync(targetPath, `# ${targetFilename.replace(/\.md$/i, '')}\n\n`, 'utf-8')
      const after = summarizeChapters(workspacePath)
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'create_chapter',
        targetPath: `draft/${targetFilename}`,
        wordDelta: 0,
        summary: `Created ${targetFilename}`,
      })
      return JSON.stringify({ created: true, filename: `draft/${targetFilename}`, before, after }, null, 2)
    },
    {
      name: 'create_chapter',
      description: 'Create an empty chapter file under draft/. If after_filename is provided, later numbered chapters are renumbered transactionally.',
      schema: z.object({
        filename: z.string().describe('Desired chapter filename, e.g. ch03-shen-wang.md.'),
        after_filename: z.string().optional().describe('Optional existing chapter after which to insert this chapter.'),
      }),
    }
  )

  const deleteChapter = tool(
    async ({ filename, cascade_renumber }: { filename: string; cascade_renumber?: boolean }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const resolved = resolveDraftMarkdownPath(workspacePath, filename)
      if (!resolved.ok) return resolved.error
      if (!fs.existsSync(resolved.path)) return `Error: draft chapter not found: draft/${resolved.relativePath}`
      const draftDir = path.join(workspacePath, 'draft')
      const before = summarizeChapters(workspacePath)
      const parsed = parseChapterFilename(path.basename(resolved.relativePath))
      const current = fs.readFileSync(resolved.path, 'utf-8')
      fs.unlinkSync(resolved.path)
      if (cascade_renumber !== false && parsed) {
        const shifts = readChapterInfos(workspacePath)
          .filter(chapter => chapter.number !== null && chapter.number > parsed.number)
          .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
          .map(chapter => ({
            from: chapter.path,
            to: path.join(draftDir, formatChapterFilename((chapter.number ?? 0) - 1, chapter.suffix)),
          }))
        renameManyTransaction(shifts)
      }
      const after = summarizeChapters(workspacePath)
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'delete_chapter',
        targetPath: `draft/${resolved.relativePath}`,
        wordDelta: -countWords(current),
        summary: `Deleted ${resolved.relativePath}`,
      })
      return JSON.stringify({ deleted: true, filename: `draft/${resolved.relativePath}`, before, after }, null, 2)
    },
    {
      name: 'delete_chapter',
      description: 'Delete a chapter under draft/ and optionally cascade-renumber following chapters. Explain Story State impact to the author before using.',
      schema: z.object({
        filename: z.string().describe('Existing chapter filename under draft/.'),
        cascade_renumber: z.boolean().optional().describe('Whether to renumber following chapters. Default true.'),
      }),
    }
  )

  const renameChapter = tool(
    async ({ filename, new_filename }: { filename: string; new_filename: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const source = resolveDraftMarkdownPath(workspacePath, filename)
      if (!source.ok) return source.error
      const target = resolveDraftMarkdownPath(workspacePath, new_filename)
      if (!target.ok) return target.error
      if (!fs.existsSync(source.path)) return `Error: draft chapter not found: draft/${source.relativePath}`
      if (fs.existsSync(target.path)) return `Error: target chapter already exists: draft/${target.relativePath}`
      const before = summarizeChapters(workspacePath)
      ensureDir(path.dirname(target.path))
      fs.renameSync(source.path, target.path)
      const after = summarizeChapters(workspacePath)
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'rename_chapter',
        targetPath: `draft/${target.relativePath}`,
        wordDelta: 0,
        summary: `Renamed ${source.relativePath} to ${target.relativePath}`,
      })
      return JSON.stringify({ renamed: true, filename: `draft/${source.relativePath}`, new_filename: `draft/${target.relativePath}`, before, after }, null, 2)
    },
    {
      name: 'rename_chapter',
      description: 'Rename one Markdown chapter under draft/, checking for target filename conflicts.',
      schema: z.object({
        filename: z.string().describe('Existing chapter filename under draft/.'),
        new_filename: z.string().describe('New chapter filename under draft/.'),
      }),
    }
  )

  const reorderChapters = tool(
    async ({ order }: { order: string[] }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const draftDir = path.join(workspacePath, 'draft')
      const chapters = readChapterInfos(workspacePath)
      const before = summarizeChapters(workspacePath)
      const normalizedOrder: string[] = []
      for (const item of order) {
        const resolved = resolveDraftMarkdownPath(workspacePath, item)
        if (!resolved.ok) return resolved.error
        normalizedOrder.push(path.basename(resolved.relativePath))
      }
      const existing = new Set(chapters.map(chapter => chapter.filename))
      const requested = new Set(normalizedOrder)
      if (requested.size !== normalizedOrder.length) return 'Error: order contains duplicate chapter filenames.'
      if (existing.size !== requested.size || [...existing].some(filename => !requested.has(filename))) {
        return 'Error: order must contain every existing draft/ch*.md chapter exactly once.'
      }
      const byName = new Map(chapters.map(chapter => [chapter.filename, chapter]))
      const steps = normalizedOrder.map((filename, index) => {
        const chapter = byName.get(filename)!
        const suffix = parseChapterFilename(chapter.filename)?.suffix ?? `-${chapter.filename.replace(/\.md$/i, '')}`
        return {
          from: chapter.path,
          to: path.join(draftDir, formatChapterFilename(index + 1, suffix)),
        }
      })
      renameManyTransaction(steps)
      const after = summarizeChapters(workspacePath)
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'reorder_chapters',
        targetPath: 'draft/',
        wordDelta: 0,
        summary: normalizedOrder.join(' → '),
      })
      return JSON.stringify({ reordered: true, before, after }, null, 2)
    },
    {
      name: 'reorder_chapters',
      description: 'Renumber all existing draft/ch*.md chapters transactionally according to the given order.',
      schema: z.object({
        order: z.array(z.string()).describe('Every existing draft/ch*.md filename exactly once, in desired reading order.'),
      }),
    }
  )

  const confirmWritingPlan = tool(
    async ({
      plan,
      rationale,
      alternatives,
      logicAudit,
    }: {
      plan: string
      rationale: string
      alternatives?: string[]
      logicAudit?: LogicAudit
    }) => {
      return JSON.stringify({
        approved_plan: plan,
        rationale,
        alternatives: alternatives ?? [],
        ...(logicAudit && { logicAudit }),
      }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the user to approve or edit a writing plan before drafting a scene/chapter or large rewrite.',
      schema: z.object({
        plan: z.string().describe('Concrete writing plan.'),
        rationale: z.string().describe('Why this plan fits the current story and craft goals.'),
        alternatives: z.array(z.string()).optional().describe('Optional alternative directions.'),
        logicAudit: LogicAuditSchema.optional().describe('Optional PlannerAgent logic audit for character motivation, causal chain, and common-sense checks.'),
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

  const compressStoryBibleHistory = tool(
    async ({ completed_chapters }: { completed_chapters: string[] }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const chapters = [...new Set(completed_chapters.map(chapter => chapter.trim()).filter(Boolean))]
      if (!chapters.length) return 'Error: completed_chapters is required.'

      const entries: Array<{ filename: string; summary: string }> = []
      for (const chapter of chapters) {
        const resolved = resolveDraftMarkdownPath(workspacePath, chapter)
        if (!resolved.ok) return resolved.error
        if (!fs.existsSync(resolved.path)) return `Error: draft chapter not found: draft/${resolved.relativePath}`
        const content = fs.readFileSync(resolved.path, 'utf-8')
        entries.push({
          filename: resolved.relativePath,
          summary: summarizeArchivedChapter(resolved.relativePath, content),
        })
      }

      const filePath = ensureStoryBible(workspacePath)
      const current = fs.readFileSync(filePath, 'utf-8')
      const next = upsertArchivedChapters(current, entries)
      fs.writeFileSync(filePath, next, 'utf-8')
      options.creativeDb?.recordStoryBibleChange(workspacePath, {
        toolName: 'compress_storybible_history',
        targetPath: 'storybible.md',
        wordDelta: countWordDelta(current, next),
        summary: `Archived ${entries.map(entry => entry.filename).join(', ')}`,
      })
      return JSON.stringify({
        archived: true,
        chapters: entries.map(entry => entry.filename),
        added_or_updated: entries,
      }, null, 2)
    },
    {
      name: 'compress_storybible_history',
      description: 'Append or upsert archived chapter summaries under StoryBible ## Story State / ### Archived Chapters. Never deletes existing StoryBible content.',
      schema: z.object({
        completed_chapters: z.array(z.string()).describe('Chapter filenames whose content can be summarized, e.g. ["ch01.md", "ch02.md"].'),
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
    resolveOpenQuestion,
    listChapters,
    createChapter,
    deleteChapter,
    renameChapter,
    reorderChapters,
    confirmWritingPlan,
    writeToChapter,
    replaceStoryBibleSection,
    rebuildStoryBible,
    compressStoryBibleHistory,
  ] as const
}
