import * as fs from 'fs'
import * as path from 'path'
import type { SerializedSnapshot } from '@shared/ai/contracts'
import {
  DEFAULT_WORKSPACE_IGNORE_RULES,
  WORKSPACE_IGNORE_FILENAME,
  mergeWorkspaceIgnoreRules,
  parseWorkspaceIgnoreRules,
  shouldIncludeWorkspaceEntry,
} from '../../../shared/workspace/filtering'

export const SUPPORTED_DOC_EXTS = new Set(['md', 'txt', 'iwt'])

export interface DocumentSearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export interface WorkspaceSearchOptions extends DocumentSearchOptions {
  includeGlob?: string
  excludeGlob?: string
  maxFiles?: number
  maxMatches?: number
}

export interface BlockMatch {
  block_id: number
  heading_block_id: number | null
  heading: string | null
  node_type: string
  match_count: number
  match_texts: string[]
  preview: string
  content: string
}

interface SectionMatch {
  heading_block_id: number | null
  heading: string | null
  match_count: number
  matched_block_ids: number[]
  preview: string
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Literal queries treat `|` as an alternation of literal terms, matching `grep`'s behaviour so
 * one concept's several wordings can be found in a single call. Everything else stays literal —
 * only `regex: true` turns the query into a real pattern.
 */
function buildSearchRegex(query: string, options: DocumentSearchOptions): RegExp | null {
  if (!query.trim()) return null
  let source: string
  if (options.regex) {
    source = query
  } else {
    const terms = query.includes('|')
      ? query.split('|').map(term => term.trim()).filter(Boolean)
      : []
    source = terms.length > 1
      ? `(?:${terms.map(escapeRegex).join('|')})`
      : escapeRegex(query)
  }
  const flags = options.caseSensitive ? 'gu' : 'giu'
  try {
    return new RegExp(source, flags)
  } catch {
    // `u` rejects patterns a sloppy-mode regex would accept (lone surrogates, stray escapes).
    // A caller-supplied pattern is worth a second chance without it; whole-word still works,
    // since boundaries come from the segmenter rather than from the pattern.
    try {
      return new RegExp(source, options.caseSensitive ? 'g' : 'gi')
    } catch {
      return null
    }
  }
}

/**
 * Word-start offsets of `text` (plus its end), from ICU word segmentation.
 *
 * This is what makes `whole_word` mean the same thing in every writing system. A `\b`-wrapped
 * pattern cannot: JS defines `\b` over `[A-Za-z0-9_]`, so `\bcafé\b` fails on the accent and any
 * CJK query fails outright — `/\b伤疤\b/` matches neither "他的伤疤很深" nor a standalone "伤疤",
 * i.e. whole_word silently returned nothing for Chinese. ICU segments "他的伤疤很深" into
 * 他的 | 伤疤 | 很 | 深, so a match is accepted exactly when it starts and ends on a word edge.
 */
function wordBoundaries(text: string): Set<number> | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null
  const boundaries = new Set<number>()
  // Locale is irrelevant to the result here: ICU picks the dictionary breaker from the script.
  for (const segment of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
    boundaries.add(segment.index)
  }
  boundaries.add(text.length)
  return boundaries
}

function findAllMatches(
  text: string,
  regex: RegExp,
  wholeWord = false,
): Array<{ index: number; text: string }> {
  const matches: Array<{ index: number; text: string }> = []
  const local = regex.flags.includes('g') ? regex : new RegExp(regex.source, `${regex.flags}g`)
  // Only computed when whole-word filtering is on, and only for blocks that already matched.
  const boundaries = wholeWord ? wordBoundaries(text) : null
  for (const match of text.matchAll(local)) {
    const value = match[0]
    if (!value) continue
    const index = match.index ?? 0
    if (boundaries && !(boundaries.has(index) && boundaries.has(index + value.length))) continue
    matches.push({ index, text: value })
  }
  return matches
}

function buildPreview(text: string, index: number, length: number, radius = 36): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + length + radius)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`.replace(/\s+/g, ' ').trim()
}

function findContainingHeading(
  snapshot: SerializedSnapshot,
  blockId: number
): { heading_block_id: number | null; heading: string | null } {
  let current: { heading_block_id: number | null; heading: string | null } = {
    heading_block_id: null,
    heading: null,
  }
  for (const entry of snapshot.outline) {
    if (entry.displayId > blockId) break
    current = {
      heading_block_id: entry.displayId,
      heading: entry.text,
    }
  }
  return current
}

function searchBlocksInSnapshot(
  snapshot: SerializedSnapshot,
  query: string,
  options: DocumentSearchOptions,
  maxMatches = 200
): BlockMatch[] | null {
  const regex = buildSearchRegex(query, options)
  if (!regex) return null

  const results: BlockMatch[] = []
  let totalMatches = 0

  for (const block of snapshot.blockMap) {
    if (totalMatches >= maxMatches) break
    const matches = findAllMatches(block.content, regex, options.wholeWord)
    if (!matches.length) continue

    const limited = matches.slice(0, Math.max(1, maxMatches - totalMatches))
    totalMatches += limited.length
    const heading = findContainingHeading(snapshot, block.displayId)

    results.push({
      block_id: block.displayId,
      heading_block_id: heading.heading_block_id,
      heading: heading.heading,
      node_type: block.nodeType,
      match_count: limited.length,
      match_texts: limited.map(match => match.text),
      preview: buildPreview(block.content, limited[0]!.index, limited[0]!.text.length),
      content: `{b:${block.displayId}}\n${block.content}`,
    })
  }

  return results
}

function aggregateSections(blockMatches: BlockMatch[]): SectionMatch[] {
  const sections = new Map<string, SectionMatch>()
  for (const match of blockMatches) {
    const key = `${match.heading_block_id ?? 'root'}`
    const existing = sections.get(key)
    if (existing) {
      existing.match_count += match.match_count
      existing.matched_block_ids.push(match.block_id)
      if (!existing.preview && match.preview) existing.preview = match.preview
      continue
    }
    sections.set(key, {
      heading_block_id: match.heading_block_id,
      heading: match.heading,
      match_count: match.match_count,
      matched_block_ids: [match.block_id],
      preview: match.preview,
    })
  }
  return Array.from(sections.values())
}

function getDefaultWorkspaceDocumentIgnoreRules(workspacePath: string): string {
  const workspaceIgnorePath = path.join(workspacePath, WORKSPACE_IGNORE_FILENAME)
  let workspaceRules: string | undefined

  try {
    if (fs.existsSync(workspaceIgnorePath)) {
      workspaceRules = fs.readFileSync(workspaceIgnorePath, 'utf8')
    }
  } catch {
    workspaceRules = undefined
  }

  return mergeWorkspaceIgnoreRules(DEFAULT_WORKSPACE_IGNORE_RULES, workspaceRules)
}

export function listWorkspaceDocumentPaths(
  workspacePath: string,
  includeGlob?: string,
  excludeGlob?: string,
  maxFiles = 200
): string[] {
  const results: string[] = []
  const matcher = parseWorkspaceIgnoreRules(getDefaultWorkspaceDocumentIgnoreRules(workspacePath))

  function walk(dirPath: string): void {
    if (results.length >= maxFiles) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) return
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(workspacePath, fullPath).replace(/\\/g, '/')
      const shouldIncludeEntry = shouldIncludeWorkspaceEntry(
        { relativePath, isDirectory: entry.isDirectory() },
        matcher,
        entry.isDirectory() ? undefined : includeGlob,
        excludeGlob
      )

      if (entry.isDirectory()) {
        if (!shouldIncludeEntry) continue
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase()
      if (!SUPPORTED_DOC_EXTS.has(ext)) continue
      if (!shouldIncludeEntry) continue
      results.push(fullPath)
    }
  }

  walk(workspacePath)
  return results
}

/**
 * What a zero-hit result carries instead of a dead end.
 *
 * A miss is usually a vocabulary mismatch, not an absence: the caller guessed a wording the
 * document does not use (a prose label for something the file names by identifier, the wrong
 * language, a synonym). Returning the document's own headings turns "0 matches" into the
 * information needed to re-query, without a second round trip.
 */
function buildMissDiagnostics(
  snapshot: SerializedSnapshot,
  maxHeadings = 40,
): { hint: string; document_headings: Array<{ block_id: number; heading: string }> } {
  const headings = snapshot.outline.slice(0, maxHeadings).map(entry => ({
    block_id: entry.displayId,
    heading: entry.text,
  }))
  return {
    hint: headings.length
      ? 'No match is not proof of absence — it usually means this document words the thing differently. '
        + 'Take the wording from document_headings below (or read the section that should carry it) and re-query. '
        + 'Several wordings can go in one query: "term one|term two".'
      : 'No match is not proof of absence — it usually means this document words the thing differently. '
        + 'This document has no headings to sample; read it directly rather than guessing another query.',
    document_headings: headings,
  }
}

export class DocumentSearch {
  static searchDocumentBlocksRaw(
    snapshot: SerializedSnapshot,
    query: string,
    options: DocumentSearchOptions = {},
    maxMatches = 200
  ): { file_path: string | null; total_matches: number; matches: BlockMatch[] } | null {
    const matches = searchBlocksInSnapshot(snapshot, query, options, maxMatches)
    if (!matches) return null
    return {
      file_path: snapshot.filePath ?? null,
      total_matches: matches.reduce((sum, item) => sum + item.match_count, 0),
      matches,
    }
  }

  static searchDocumentBlocks(
    snapshot: SerializedSnapshot,
    query: string,
    options: DocumentSearchOptions = {},
    maxMatches = 200
  ): string {
    const result = DocumentSearch.searchDocumentBlocksRaw(snapshot, query, options, maxMatches)
    if (!result) {
      return 'Error: Invalid search query or regex.'
    }
    return JSON.stringify(
      result.total_matches === 0 ? { ...result, ...buildMissDiagnostics(snapshot) } : result,
      null,
      2,
    )
  }

  static searchDocumentSections(
    snapshot: SerializedSnapshot,
    query: string,
    options: DocumentSearchOptions = {},
    maxMatches = 200,
    maxSections = 50
  ): string {
    const blockMatches = searchBlocksInSnapshot(snapshot, query, options, maxMatches)
    if (!blockMatches) {
      return 'Error: Invalid search query or regex.'
    }
    const sections = aggregateSections(blockMatches).slice(0, Math.max(1, maxSections))
    const totalMatches = blockMatches.reduce((sum, item) => sum + item.match_count, 0)
    return JSON.stringify({
      file_path: snapshot.filePath ?? null,
      total_sections: sections.length,
      total_matches: totalMatches,
      sections,
      ...(totalMatches === 0 ? buildMissDiagnostics(snapshot) : {}),
    }, null, 2)
  }

  static formatWorkspaceSearchResult(
    query: string,
    files: Array<{
      file_path: string
      file_name: string
      document_type: string
      total_matches: number
      matches: Array<Omit<BlockMatch, 'content'>>
    }>,
    scannedFiles: number,
    /** Scanned file paths — the directory's own vocabulary, echoed back when nothing matched. */
    scannedPaths: readonly string[] = [],
  ): string {
    const totalMatches = files.reduce((sum, file) => sum + file.total_matches, 0)
    return JSON.stringify({
      query,
      scanned_files: scannedFiles,
      matched_files: files.length,
      total_matches: totalMatches,
      files,
      ...(totalMatches === 0
        ? {
            hint: scannedFiles === 0
              ? 'Nothing was scanned: no .md/.txt/.iwt document under this directory passed the filters. Check the path and the globs before concluding anything about content.'
              : 'No match is not proof of absence — it usually means the workspace words the thing differently. '
                + 'The scanned file names below show how this project names things; re-query with that wording, '
                + 'or put several wordings in one query: "term one|term two".',
            ...(scannedFiles > 0 ? { scanned_paths: scannedPaths.slice(0, 60) } : {}),
          }
        : {}),
    }, null, 2)
  }
}
