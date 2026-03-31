/**
 * DocumentTools — LangChain tools for reading iWriter document content.
 *
 * These tools request snapshots from the renderer via SnapshotBroker and
 * query them using BlockParser. Supports both the active editor and disk files.
 */

import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import { BlockParser } from '../document/BlockParser'
import { DocumentSearch, listWorkspaceDocumentPaths, SUPPORTED_DOC_EXTS, type DocumentSearchOptions } from '../document/DocumentSearch'
import { getRuntimeString } from './runtimeHelpers'

function getExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

function getRuntimeActiveFilePath(runtime: unknown): string | null {
  return getRuntimeString(runtime, 'active_file_path')
}

function getRuntimeWorkspacePath(runtime: unknown): string | null {
  const value = getRuntimeString(runtime, 'workspace_path')
  return value?.trim() ? value : null
}

function getRuntimeStringList(runtime: unknown, key: string): string[] {
  const raw = getRuntimeString(runtime, key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && !!item) : []
  } catch {
    return []
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function resolveDocumentPathForRuntime(argFilePath: string | undefined, runtime: unknown): string | null {
  const activeFilePath = getRuntimeActiveFilePath(runtime)
  const requested = BlockParser.resolveFilePath(argFilePath, activeFilePath)
  if (requested === null) return null
  if (fs.existsSync(requested)) return requested

  const candidates = [
    activeFilePath,
    ...getRuntimeStringList(runtime, 'attached_text_file_paths'),
  ].filter((value): value is string => typeof value === 'string' && !!value)

  const direct = candidates.find(candidate => normalizePath(candidate) === normalizePath(requested))
  if (direct) return direct

  const base = path.basename(requested).toLowerCase()
  if (base) {
    const sameName = candidates.filter(candidate => path.basename(candidate).toLowerCase() === base)
    if (sameName.length === 1) return sameName[0]!
  }

  const workspacePath = getRuntimeWorkspacePath(runtime)
  if (workspacePath && !path.isAbsolute(requested)) {
    const workspaceResolved = path.join(workspacePath, requested)
    if (fs.existsSync(workspaceResolved)) return workspaceResolved
  }

  return requested
}

function toSearchOptions(input: {
  case_sensitive?: boolean
  whole_word?: boolean
  regex?: boolean
}): DocumentSearchOptions {
  return {
    caseSensitive: input.case_sensitive,
    wholeWord: input.whole_word,
    regex: input.regex,
  }
}

export function buildDocumentTools(snapshotBroker: SnapshotBroker) {
  // ── get_document_outline ──────────────────────────────────────────────────

  const getDocumentOutline = tool(
    async ({ file_path }: { file_path?: string }, runtime) => {
      const resolvedPath = resolveDocumentPathForRuntime(file_path, runtime)

      if (resolvedPath !== null) {
        const ext = getExt(resolvedPath)
        if (!SUPPORTED_DOC_EXTS.has(ext)) {
          return (
            `Document tools do not support ".${ext}" files. ` +
            `Use execute (e.g., execute(command="cat ${resolvedPath}")) to read this file instead.`
          )
        }
      }

      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath)
      if (!snapshot) {
        return resolvedPath
          ? `Error: Could not load document "${resolvedPath}".`
          : 'Error: No document is currently open.'
      }

      return BlockParser.getDocumentOutline(snapshot)
    },
    {
      name: 'get_document_outline',
      description:
        'Get the document outline (heading structure with block count and word count per section). ' +
        'Always call this first to understand the document structure before editing or reading sections. ' +
        'Use the returned block_ids to call get_section or get_blocks for detailed content. ' +
        'Pass file_path to read a local file instead of the currently open editor document.',
      schema: z.object({
        file_path: z
          .string()
          .optional()
          .describe(
            'Absolute path to a local file (.md, .txt, or .iwt). Omit to use the open editor document.'
          ),
      }),
    }
  )

  // ── get_section ───────────────────────────────────────────────────────────

  const getSection = tool(
    async ({
      heading_block_id,
      offset,
      limit,
      file_path,
    }: {
      heading_block_id: number
      offset?: number
      limit?: number
      file_path?: string
    }, runtime) => {
      const resolvedPath = resolveDocumentPathForRuntime(file_path, runtime)
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath)
      if (!snapshot) {
        return resolvedPath
          ? `Error: Could not load document "${resolvedPath}".`
          : 'Error: No document is currently open.'
      }

      return BlockParser.getSection(
        snapshot,
        heading_block_id,
        offset !== undefined ? Math.max(0, offset) : 0,
        limit !== undefined ? Math.max(1, limit) : 20
      )
    },
    {
      name: 'get_section',
      description:
        'Get the content of a document section starting from a heading block. ' +
        'Returns the heading and all blocks until the next same/higher-level heading, ' +
        'with block IDs ({b:n}) for targeted editing. Supports pagination.',
      schema: z.object({
        heading_block_id: z
          .number()
          .describe('The block_id of the heading that starts the section (from get_document_outline).'),
        offset: z.number().optional().describe('Paragraph offset for pagination (default: 0).'),
        limit: z.number().optional().describe('Max paragraphs per page (default: 20).'),
        file_path: z
          .string()
          .optional()
          .describe('Absolute path to a local file. Omit to use the open editor.'),
      }),
    }
  )

  // ── get_blocks ────────────────────────────────────────────────────────────

  const getBlocks = tool(
    async ({
      block_ids,
      file_path,
    }: {
      block_ids: number[]
      file_path?: string
    }, runtime) => {
      const resolvedPath = resolveDocumentPathForRuntime(file_path, runtime)
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath)
      if (!snapshot) {
        return resolvedPath
          ? `Error: Could not load document "${resolvedPath}".`
          : 'Error: No document is currently open.'
      }

      return BlockParser.getBlocks(snapshot, block_ids.map(Number).filter(n => !isNaN(n)))
    },
    {
      name: 'get_blocks',
      description:
        'Get the content of specific blocks by their block IDs. ' +
        'Use when you need the exact content of known blocks (e.g., before editing them). ' +
        'Returns each block\'s content with its {b:n} marker.',
      schema: z.object({
        block_ids: z
          .array(z.number())
          .describe('Array of block display IDs (the numbers in {b:n} markers) to retrieve.'),
        file_path: z
          .string()
          .optional()
          .describe('Absolute path to a local file. Omit to use the open editor.'),
      }),
    }
  )

  // ── get_block_context ─────────────────────────────────────────────────────

  const getBlockContext = tool(
    async ({
      block_id,
      window: windowSize,
      file_path,
    }: {
      block_id: number
      window?: number
      file_path?: string
    }, runtime) => {
      const resolvedPath = resolveDocumentPathForRuntime(file_path, runtime)
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath)
      if (!snapshot) {
        return resolvedPath
          ? `Error: Could not load document "${resolvedPath}".`
          : 'Error: No document is currently open.'
      }

      return BlockParser.getBlockContext(
        snapshot,
        block_id,
        windowSize !== undefined ? Math.max(1, windowSize) : 3
      )
    },
    {
      name: 'get_block_context',
      description:
        'Get the surrounding context of a specific block (blocks before and after). ' +
        'Useful for understanding the local structure around a block you want to edit.',
      schema: z.object({
        block_id: z.number().describe('The block display ID to center the context around.'),
        window: z
          .number()
          .optional()
          .describe('Number of blocks before and after to include (default: 3).'),
        file_path: z
          .string()
          .optional()
          .describe('Absolute path to a local file. Omit to use the open editor.'),
      }),
    }
  )

  const searchDocumentBlocks = tool(
    async ({
      query,
      file_path,
      case_sensitive,
      whole_word,
      regex,
      max_matches,
    }: {
      query: string
      file_path?: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      max_matches?: number
    }, runtime) => {
      const resolvedPath = resolveDocumentPathForRuntime(file_path, runtime)
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath)
      if (!snapshot) {
        return resolvedPath
          ? `Error: Could not load document "${resolvedPath}".`
          : 'Error: No document is currently open.'
      }

      return DocumentSearch.searchDocumentBlocks(
        snapshot,
        query,
        toSearchOptions({ case_sensitive, whole_word, regex }),
        max_matches !== undefined ? Math.max(1, max_matches) : 200
      )
    },
    {
      name: 'search_document_blocks',
      description:
        'Search a single .md/.txt/.iwt document using block-aware matching. ' +
        'Returns matching block IDs, their containing section heading, and short previews. ' +
        'Use this when you know the document and need exact blocks to inspect or edit.',
      schema: z.object({
        query: z.string().describe('Search query text or regex pattern.'),
        file_path: z
          .string()
          .optional()
          .describe('Absolute path to a local file. Omit to use the open editor document.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Match whole words only.'),
        regex: z.boolean().optional().describe('Treat query as a regular expression.'),
        max_matches: z.number().optional().describe('Maximum number of matches to return (default: 200).'),
      }),
    }
  )

  const searchDocumentSections = tool(
    async ({
      query,
      file_path,
      case_sensitive,
      whole_word,
      regex,
      max_matches,
      max_sections,
    }: {
      query: string
      file_path?: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      max_matches?: number
      max_sections?: number
    }, runtime) => {
      const resolvedPath = resolveDocumentPathForRuntime(file_path, runtime)
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath)
      if (!snapshot) {
        return resolvedPath
          ? `Error: Could not load document "${resolvedPath}".`
          : 'Error: No document is currently open.'
      }

      return DocumentSearch.searchDocumentSections(
        snapshot,
        query,
        toSearchOptions({ case_sensitive, whole_word, regex }),
        max_matches !== undefined ? Math.max(1, max_matches) : 200,
        max_sections !== undefined ? Math.max(1, max_sections) : 50
      )
    },
    {
      name: 'search_document_sections',
      description:
        'Search a single .md/.txt/.iwt document and group results by section heading. ' +
        'Returns heading_block_id, heading title, matched block IDs, and previews. ' +
        'Use this to quickly locate relevant sections before calling get_section.',
      schema: z.object({
        query: z.string().describe('Search query text or regex pattern.'),
        file_path: z
          .string()
          .optional()
          .describe('Absolute path to a local file. Omit to use the open editor document.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Match whole words only.'),
        regex: z.boolean().optional().describe('Treat query as a regular expression.'),
        max_matches: z.number().optional().describe('Maximum number of block matches to consider (default: 200).'),
        max_sections: z.number().optional().describe('Maximum number of sections to return (default: 50).'),
      }),
    }
  )

  const searchWorkspaceDocuments = tool(
    async ({
      query,
      case_sensitive,
      whole_word,
      regex,
      include_glob,
      exclude_glob,
      max_files,
      max_matches,
    }: {
      query: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      include_glob?: string
      exclude_glob?: string
      max_files?: number
      max_matches?: number
    }, runtime) => {
      const workspacePath = getRuntimeWorkspacePath(runtime)
      if (!workspacePath) {
        return 'Error: No workspace is currently open.'
      }

      const filePaths = listWorkspaceDocumentPaths(
        workspacePath,
        include_glob,
        exclude_glob,
        max_files !== undefined ? Math.max(1, max_files) : 200
      )

      const options = toSearchOptions({ case_sensitive, whole_word, regex })
      const maxTotalMatches = max_matches !== undefined ? Math.max(1, max_matches) : 200
      let remainingMatches = maxTotalMatches
      const files: Parameters<typeof DocumentSearch.formatWorkspaceSearchResult>[1] = []

      for (const filePath of filePaths) {
        if (remainingMatches <= 0) break
        const snapshot = await snapshotBroker.requestSnapshot(filePath)
        if (!snapshot) continue
        const result = DocumentSearch.searchDocumentBlocksRaw(snapshot, query, options, remainingMatches)
        if (!result?.matches?.length) continue
        remainingMatches -= result.total_matches
        files.push({
          file_path: filePath,
          file_name: filePath.split(/[\\/]/).pop() ?? filePath,
          document_type: getExt(filePath),
          total_matches: result.total_matches,
          matches: result.matches.map(({ block_id, heading_block_id, heading, node_type, match_count, match_texts, preview }) => ({
            block_id, heading_block_id, heading, node_type, match_count, match_texts, preview,
          })),
        })
      }

      return DocumentSearch.formatWorkspaceSearchResult(query, files, filePaths.length)
    },
    {
      name: 'search_workspace_documents',
      description:
        'Search all .md/.txt/.iwt documents in the current workspace using block-aware matching. ' +
        'Returns matching files plus block IDs, section headings, and previews. ' +
        'Use this first when the relevant file is not yet known.',
      schema: z.object({
        query: z.string().describe('Search query text or regex pattern.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Match whole words only.'),
        regex: z.boolean().optional().describe('Treat query as a regular expression.'),
        include_glob: z.string().optional().describe('Optional wildcard include filter such as "**/*.md".'),
        exclude_glob: z.string().optional().describe('Optional wildcard exclude filter such as "archive/**".'),
        max_files: z.number().optional().describe('Maximum number of workspace files to scan (default: 200).'),
        max_matches: z.number().optional().describe('Maximum total matches to return across files (default: 200).'),
      }),
    }
  )

  return [
    getDocumentOutline,
    getSection,
    getBlocks,
    getBlockContext,
    searchDocumentBlocks,
    searchDocumentSections,
    searchWorkspaceDocuments,
  ] as const
}
