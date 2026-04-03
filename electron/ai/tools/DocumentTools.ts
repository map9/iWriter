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

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function isVirtualDocumentPath(requested: string): boolean {
  const normalized = requested.replace(/\\/g, '/')
  return normalized === '/attached_dirs' ||
    normalized === '/attached_files' ||
    normalized.startsWith('/attached_dirs/') ||
    normalized.startsWith('/attached_files/')
}

type DocumentPathResolution =
  | { ok: true; filePath: string | null }
  | { ok: false; error: string }

function resolveDocumentPathForRuntime(argFilePath: string | undefined, runtime: unknown): DocumentPathResolution {
  const activeFilePath = getRuntimeActiveFilePath(runtime)
  const requested = BlockParser.resolveFilePath(argFilePath, activeFilePath)
  if (requested === null) return { ok: true, filePath: null }

  if (activeFilePath && normalizePath(activeFilePath) === normalizePath(requested)) {
    return { ok: true, filePath: activeFilePath }
  }

  if (isVirtualDocumentPath(requested)) {
    return {
      ok: false,
      error:
        `Error: file_path must be a real absolute host path, not a virtual mount path like "${requested}". ` +
        'Use the absolute path shown in <workspace>, <attached_files>, or the user message.',
    }
  }

  if (!path.isAbsolute(requested)) {
    return {
      ok: false,
      error:
        `Error: file_path must be an absolute host path. Relative, basename-only, and workspace-root paths are not allowed: "${requested}".`,
    }
  }

  if (!fs.existsSync(requested)) {
    return {
      ok: false,
      error: `Error: file_path does not exist on disk: "${requested}".`,
    }
  }

  return { ok: true, filePath: requested }
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

type DirectoryResolution =
  | { ok: true; directoryPath: string }
  | { ok: false; error: string }

function resolveDirectoryPathForRuntime(argDirectoryPath: string | undefined, runtime: unknown): DirectoryResolution {
  const requested = argDirectoryPath?.trim()
  if (!requested) {
    return { ok: false, error: 'Error: directory_path is required and must be an absolute host directory path.' }
  }

  if (isVirtualDocumentPath(requested)) {
    return {
      ok: false,
      error:
        `Error: directory_path must be a real absolute host path, not a virtual mount path like "${requested}". ` +
        'Use the absolute path shown in <workspace> or <attached_dirs>.',
    }
  }

  if (!path.isAbsolute(requested)) {
    return {
      ok: false,
      error:
        `Error: directory_path must be an absolute host path. Relative, basename-only, and workspace-root virtual paths are not allowed: "${requested}".`,
    }
  }

  if (!fs.existsSync(requested)) {
    return { ok: false, error: `Error: directory_path does not exist on disk: "${requested}".` }
  }

  let stats: fs.Stats
  try {
    stats = fs.statSync(requested)
  } catch {
    return { ok: false, error: `Error: Could not stat directory_path: "${requested}".` }
  }

  if (!stats.isDirectory()) {
    return { ok: false, error: `Error: directory_path must point to a directory: "${requested}".` }
  }

  return { ok: true, directoryPath: requested }
}

export function buildDocumentTools(snapshotBroker: SnapshotBroker) {
  // ── get_document_outline ──────────────────────────────────────────────────

  const getDocumentOutline = tool(
    async ({ file_path }: { file_path?: string }, runtime) => {
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath

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
        'Pass file_path to read a specific local file by absolute path, whether or not it is currently open in the editor. ' +
        'Omit file_path only when you intentionally want the active editor document.',
      schema: z.object({
        file_path: z
          .string()
          .optional()
          .describe(
            'Real absolute host path to a local .md/.txt/.iwt file. Never pass a basename, workspace-relative path, workspace-root virtual path like "/foo.iwt", or virtual mount path like "/attached_dirs/...". Omit to use the active editor document.'
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
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
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
        'with block IDs ({b:n}) for targeted editing. Supports pagination. ' +
        'With file_path, this reads that exact file on disk even if it is not open in the editor.',
      schema: z.object({
        heading_block_id: z
          .number()
          .describe('The block_id of the heading that starts the section (from get_document_outline).'),
        offset: z.number().optional().describe('Paragraph offset for pagination (default: 0).'),
        limit: z.number().optional().describe('Max paragraphs per page (default: 20).'),
        file_path: z
          .string()
          .optional()
          .describe('Real absolute host path to the target document file. Omit to use the active editor document.'),
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
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
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
        'Returns each block\'s content with its {b:n} marker. ' +
        'With file_path, this reads that exact file on disk even if it is not open in the editor.',
      schema: z.object({
        block_ids: z
          .array(z.number())
          .describe('Array of block display IDs (the numbers in {b:n} markers) to retrieve.'),
        file_path: z
          .string()
          .optional()
          .describe('Real absolute host path to the target document file. Omit to use the active editor document.'),
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
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
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
        'Useful for understanding the local structure around a block you want to edit. ' +
        'With file_path, this reads that exact file on disk even if it is not open in the editor.',
      schema: z.object({
        block_id: z.number().describe('The block display ID to center the context around.'),
        window: z
          .number()
          .optional()
          .describe('Number of blocks before and after to include (default: 3).'),
        file_path: z
          .string()
          .optional()
          .describe('Real absolute host path to the target document file. Omit to use the active editor document.'),
      }),
    }
  )

  const searchBlocksInDocument = tool(
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
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
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
      name: 'search_blocks_in_document',
      description:
        'Search a single .md/.txt/.iwt document using block-aware matching. ' +
        'Returns matching block IDs, their containing section heading, and short previews. ' +
        'Use this when you know the document and need exact blocks to inspect or edit.',
      schema: z.object({
        query: z.string().describe('Search query text or regex pattern.'),
        file_path: z
          .string()
          .optional()
          .describe('Real absolute host path to the target document file. Omit to use the active editor document.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Match whole words only.'),
        regex: z.boolean().optional().describe('Treat query as a regular expression.'),
        max_matches: z.number().optional().describe('Maximum number of matches to return (default: 200).'),
      }),
    }
  )

  const searchSectionsInDocument = tool(
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
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
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
      name: 'search_sections_in_document',
      description:
        'Search the CONTENT of one specific .md/.txt/.iwt document and group results by section heading. ' +
        'Returns heading_block_id, heading title, matched block IDs, and previews. ' +
        'Use this when you already know the target file path and need to find relevant content inside that document before calling get_section.',
      schema: z.object({
        query: z.string().describe('Search query text or regex pattern.'),
        file_path: z
          .string()
          .optional()
          .describe('Real absolute host path to the target document file. Omit to use the active editor document.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Match whole words only.'),
        regex: z.boolean().optional().describe('Treat query as a regular expression.'),
        max_matches: z.number().optional().describe('Maximum number of block matches to consider (default: 200).'),
        max_sections: z.number().optional().describe('Maximum number of sections to return (default: 50).'),
      }),
    }
  )

  const searchInDirectory = tool(
    async ({
      query,
      directory_path,
      case_sensitive,
      whole_word,
      regex,
      include_glob,
      exclude_glob,
      max_files,
      max_matches,
    }: {
      query: string
      directory_path: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      include_glob?: string
      exclude_glob?: string
      max_files?: number
      max_matches?: number
    }, runtime) => {
      const resolved = resolveDirectoryPathForRuntime(directory_path, runtime)
      if (!resolved.ok) return resolved.error
      const rootDirectoryPath = resolved.directoryPath

      const filePaths = listWorkspaceDocumentPaths(
        rootDirectoryPath,
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
      name: 'search_in_directory',
      description:
        'Search the CONTENT of .md/.txt/.iwt documents under one specific directory using block-aware matching. ' +
        'Returns only files whose document content matches the query, plus block IDs, section headings, and previews. ' +
        'This works for the workspace root, a user-attached directory, or any directory the user explicitly named by absolute path. ' +
        'Do NOT use this to locate filenames, folder paths, tabs, or documents you already know by absolute path. ' +
        'If you know the path, call get_document_outline/get_section/get_blocks with file_path directly. ' +
        'For file/path discovery, use shell file tools such as ls/glob/find/grep instead.',
      schema: z.object({
        query: z.string().describe('Search query text or regex pattern.'),
        directory_path: z
          .string()
          .describe('Real absolute host path to the directory whose document contents should be searched. Prefer a user-specified directory, an attached directory, or the workspace root.'),
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
    searchBlocksInDocument,
    searchSectionsInDocument,
    searchInDirectory,
  ] as const
}
