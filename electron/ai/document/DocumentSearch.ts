import * as fs from 'fs'
import * as path from 'path'
import type { SerializedBlockEntry, SerializedSnapshot } from '../ipc/protocol'

const SUPPORTED_DOC_EXTS = new Set(['md', 'txt', 'iwt'])

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

interface BlockMatch {
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

function buildSearchRegex(query: string, options: DocumentSearchOptions): RegExp | null {
  if (!query.trim()) return null
  const source = options.regex ? query : escapeRegex(query)
  const wrapped = options.wholeWord ? `\\b${source}\\b` : source
  const flags = options.caseSensitive ? 'g' : 'gi'
  try {
    return new RegExp(wrapped, flags)
  } catch {
    return null
  }
}

function findAllMatches(text: string, regex: RegExp): Array<{ index: number; text: string }> {
  const matches: Array<{ index: number; text: string }> = []
  const local = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
  for (const match of text.matchAll(local)) {
    const value = match[0]
    if (!value) continue
    matches.push({ index: match.index ?? 0, text: value })
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
    const matches = findAllMatches(block.content, regex)
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

function wildcardToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

function matchesGlob(filePath: string, workspacePath: string, glob?: string): boolean {
  if (!glob?.trim()) return true
  const relative = path.relative(workspacePath, filePath).replace(/\\/g, '/')
  return wildcardToRegex(glob).test(relative) || wildcardToRegex(glob).test(path.basename(filePath))
}

function shouldIncludeFile(
  filePath: string,
  workspacePath: string,
  includeGlob?: string,
  excludeGlob?: string
): boolean {
  if (!matchesGlob(filePath, workspacePath, includeGlob)) return false
  if (excludeGlob?.trim() && matchesGlob(filePath, workspacePath, excludeGlob)) return false
  return true
}

export function listWorkspaceDocumentPaths(
  workspacePath: string,
  includeGlob?: string,
  excludeGlob?: string,
  maxFiles = 200
): string[] {
  const results: string[] = []

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
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
          continue
        }
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase()
      if (!SUPPORTED_DOC_EXTS.has(ext)) continue
      if (!shouldIncludeFile(fullPath, workspacePath, includeGlob, excludeGlob)) continue
      results.push(fullPath)
    }
  }

  walk(workspacePath)
  return results
}

export class DocumentSearch {
  static searchDocumentBlocks(
    snapshot: SerializedSnapshot,
    query: string,
    options: DocumentSearchOptions = {},
    maxMatches = 200
  ): string {
    const matches = searchBlocksInSnapshot(snapshot, query, options, maxMatches)
    if (!matches) {
      return 'Error: Invalid search query or regex.'
    }
    return JSON.stringify({
      file_path: snapshot.filePath ?? null,
      total_matches: matches.reduce((sum, item) => sum + item.match_count, 0),
      matches,
    }, null, 2)
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
    return JSON.stringify({
      file_path: snapshot.filePath ?? null,
      total_sections: sections.length,
      total_matches: blockMatches.reduce((sum, item) => sum + item.match_count, 0),
      sections,
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
    scannedFiles: number
  ): string {
    return JSON.stringify({
      query,
      scanned_files: scannedFiles,
      matched_files: files.length,
      total_matches: files.reduce((sum, file) => sum + file.total_matches, 0),
      files,
    }, null, 2)
  }
}

