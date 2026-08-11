/**
 * DocumentTools — LangChain tools for reading iWriter document content.
 *
 * These tools request snapshots from the renderer via SnapshotBroker and
 * query them using BlockParser. Supports both the active editor and disk files.
 */

import * as fs from 'fs'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { BlockParser } from '../../document/BlockParser'
import { DocumentSearch, listWorkspaceDocumentPaths, SUPPORTED_DOC_EXTS, type DocumentSearchOptions } from '../../document/DocumentSearch'
import type { SerializedSnapshot } from '../../ipc/protocol'
import { parseUntitledTabId } from '../../document/virtualId'
import { resolveRuntimePath } from '../../runtime/RuntimePathResolver'

function getExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

type DocumentPathResolution =
  | { ok: true; filePath: string; tabId?: undefined }
  | { ok: true; filePath: null; tabId: string }
  | { ok: false; error: string }

function asErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function blockIdRecoveryMessage(): string {
  return 'The block IDs may be stale after document edits. Call get_document_outline(file_path=...) first, then retry with refreshed block IDs. Do not repeat the same call unchanged.'
}

function describeDocument(resolved: Extract<DocumentPathResolution, { ok: true }>): string {
  return resolved.filePath ?? `untitled:${resolved.tabId}`
}

function formatBlockToolError(toolName: string, invalidArgument: string, reason: string): string {
  return `Error: ${toolName} failed. Invalid argument: ${invalidArgument}. Reason: ${reason} Recovery: ${blockIdRecoveryMessage()}`
}

function resolveDocumentPathForRuntime(argFilePath: string | undefined, runtime: unknown): DocumentPathResolution {
  const requested = argFilePath?.trim()
  if (!requested) return { ok: false, error: 'Error: file_path is required.' }

  const untitledTabId = parseUntitledTabId(requested)
  if (untitledTabId !== undefined) {
    return { ok: true, filePath: null, tabId: untitledTabId }
  }

  const runtimePath = resolveRuntimePath(requested, runtime, 'file_path')
  if (!runtimePath.ok) return runtimePath
  const resolvedPath = runtimePath.path

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      error: `Error: FILE_NOT_FOUND — file_path does not exist on disk: "${resolvedPath}".`,
    }
  }

  return { ok: true, filePath: resolvedPath }
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
    return { ok: false, error: 'Error: directory_path is required.' }
  }

  const runtimePath = resolveRuntimePath(requested, runtime, 'directory_path')
  if (!runtimePath.ok) return runtimePath
  const resolvedPath = runtimePath.path

  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `Error: directory_path does not exist on disk: "${resolvedPath}".` }
  }

  let stats: fs.Stats
  try {
    stats = fs.statSync(resolvedPath)
  } catch {
    return { ok: false, error: `Error: Could not stat directory_path: "${resolvedPath}".` }
  }

  if (!stats.isDirectory()) {
    return { ok: false, error: `Error: directory_path must point to a directory: "${resolvedPath}".` }
  }

  return { ok: true, directoryPath: resolvedPath }
}

export function buildDocumentTools(snapshotBroker: SnapshotBroker) {
  // ── get_document_outline ──────────────────────────────────────────────────

  const getDocumentOutline = tool(
    async ({ file_path }: { file_path: string }, runtime) => {
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

      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId)
      if (!snapshot) {
        return `Error: Could not load document "${describeDocument(resolved)}".`
      }

      return BlockParser.getDocumentOutline(snapshot)
    },
    {
      name: 'get_document_outline',
      description:
        'Get the document outline (heading structure with block count and word count per section). ' +
        'Always call this first to understand the document structure before editing or reading sections. ' +
        'Use the returned block_ids to call get_section or get_blocks for detailed content. ' +
        'Pass an explicit workspace-relative path, absolute path, or untitled: virtual ID. Call get_editor_state when targeting the current tab.',
      schema: z.object({
        file_path: z
          .string()
          .describe(
            'Required workspace-relative path or real absolute host path to a local .md/.txt/.iwt file. For an in-memory unsaved document, pass the untitled: virtual ID returned by get_editor_state.'
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
      file_path: string
    }, runtime) => {
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId)
      if (!snapshot) {
        return `Error: Could not load document "${describeDocument(resolved)}".`
      }

      try {
        return BlockParser.getSection(
          snapshot,
          heading_block_id,
          offset !== undefined ? Math.max(0, offset) : 0,
          limit !== undefined ? Math.max(1, limit) : undefined
        )
      } catch (err) {
        return formatBlockToolError('get_section', `heading_block_id=${heading_block_id}`, asErrorMessage(err))
      }
    },
    {
      name: 'get_section',
      description:
        'Get the content of a document section starting from a heading block. ' +
        'Returns the heading and all blocks until the next same/higher-level heading, ' +
        'with block IDs ({b:n}) for targeted editing. Paginates by content budget (block-atomic); ' +
        'when has_more is true, pass offset=next_offset to fetch the next page. ' +
        'Pass an explicit workspace-relative path, absolute path, or untitled: virtual ID. Call get_editor_state when targeting the current tab.',
      schema: z.object({
        heading_block_id: z
          .number()
          .describe('The block_id of the heading that starts the section (from get_document_outline).'),
        offset: z.number().optional().describe('Block offset within the section for pagination (default: 0). Use the returned next_offset to page forward.'),
        limit: z.number().optional().describe('Content budget in characters per page (default: 4000). Blocks are never split; a single over-budget block occupies its own page.'),
        file_path: z
          .string()
          .describe('Required workspace-relative or real absolute path to the target document, or an untitled: virtual ID returned by get_editor_state.'),
      }),
    }
  )

  // ── get_sections ──────────────────────────────────────────────────────────

  const getSections = tool(
    async ({
      requests,
      file_path,
    }: {
      requests: Array<{
        heading_block_id: number
        offset?: number
        limit?: number
        file_path?: string
      }>
      file_path?: string
    }, runtime) => {
      const snapshotCache = new Map<string, SerializedSnapshot | null>()
      const sections: Array<Record<string, unknown>> = []

      for (const request of requests) {
        const requestFilePath = request.file_path ?? file_path
        const headingBlockId = request.heading_block_id

        try {
          const resolved = resolveDocumentPathForRuntime(requestFilePath, runtime)
          if (!resolved.ok) {
            sections.push({
              heading_block_id: headingBlockId,
              status: 'error',
              error: resolved.error.replace(/^Error:\s*/i, ''),
            })
            continue
          }

          const resolvedPath = resolved.filePath
          const cacheKey = resolvedPath ?? `__tab:${resolved.tabId}__`
          if (!snapshotCache.has(cacheKey)) {
            snapshotCache.set(cacheKey, await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId))
          }

          const snapshot = snapshotCache.get(cacheKey)
          if (!snapshot) {
            sections.push({
              heading_block_id: headingBlockId,
              status: 'error',
              error: `Could not load document "${describeDocument(resolved)}".`,
            })
            continue
          }

          const raw = BlockParser.getSection(
            snapshot,
            headingBlockId,
            request.offset !== undefined ? Math.max(0, request.offset) : 0,
            request.limit !== undefined ? Math.max(1, request.limit) : undefined
          )
          sections.push({
            heading_block_id: headingBlockId,
            status: 'success',
            ...JSON.parse(raw),
          })
        } catch (err) {
          sections.push({
            heading_block_id: headingBlockId,
            status: 'error',
            error: `${asErrorMessage(err)} ${blockIdRecoveryMessage()}`,
          })
        }
      }

      const successCount = sections.filter(section => section.status === 'success').length

      return JSON.stringify(
        {
          sections,
          total_sections: sections.length,
          success_count: successCount,
          error_count: sections.length - successCount,
        },
        null,
        2
      )
    },
    {
      name: 'get_sections',
      description:
        'Get multiple document sections in a single tool call. ' +
        'Use this when you need to read several known heading_block_id sections before answering or editing. ' +
        'Each request supports heading_block_id, offset, limit (char budget), and optional file_path. ' +
        'The top-level file_path applies to every request that does not provide its own file_path.',
      schema: z.object({
        requests: z
          .array(z.object({
            heading_block_id: z
              .number()
              .describe('The block_id of the heading that starts the section (from get_document_outline).'),
            offset: z.number().optional().describe('Block offset within the section for pagination (default: 0). Use the returned next_offset to page forward.'),
            limit: z.number().optional().describe('Content budget in characters per page (default: 4000). Blocks are never split.'),
            file_path: z
              .string()
              .optional()
              .describe('Workspace-relative, real absolute, or untitled: document reference for this request. Omit to use the top-level file_path.'),
          }))
          .min(1)
          .max(12)
          .describe('Section read requests. Prefer this over emitting many same-kind get_section calls.'),
        file_path: z
          .string()
          .optional()
          .describe('Shared workspace-relative or real absolute document path, or untitled: virtual ID. Required unless every request has file_path.'),
      }),
    }
  )

  // ── get_blocks ────────────────────────────────────────────────────────────

  const getBlocks = tool(
    async ({
      block_ids,
      file_path,
    }: {
      block_ids?: number[]
      file_path: string
    }, runtime) => {
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId)
      if (!snapshot) {
        return `Error: Could not load document "${describeDocument(resolved)}".`
      }

      const resolvedBlockIds = block_ids === undefined
        ? snapshot.blockMap.map(entry => entry.displayId)
        : block_ids.map(Number).filter(n => !isNaN(n))

      return BlockParser.getBlocks(snapshot, resolvedBlockIds)
    },
    {
      name: 'get_blocks',
      description:
        'Get document blocks by block IDs, or omit block_ids to read all blocks. ' +
        'Use when you need exact block-marked content (e.g., before editing). ' +
        'Returns each block\'s content with its {b:n} marker. ' +
        'The explicit file_path identifies the exact document, whether open or closed.',
      schema: z.object({
        block_ids: z
          .array(z.number())
          .optional()
          .describe('Optional array of block display IDs (the numbers in {b:n} markers) to retrieve. Omit to retrieve all blocks.'),
        file_path: z
          .string()
          .describe('Required workspace-relative or real absolute path to the target document, or an untitled: virtual ID returned by get_editor_state.'),
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
      file_path: string
    }, runtime) => {
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId)
      if (!snapshot) {
        return `Error: Could not load document "${describeDocument(resolved)}".`
      }

      const result = BlockParser.getBlockContext(
        snapshot,
        block_id,
        windowSize !== undefined ? Math.max(1, windowSize) : 3
      )
      return result.startsWith('Error:')
        ? formatBlockToolError('get_block_context', `block_id=${block_id}`, result.replace(/^Error:\s*/i, ''))
        : result
    },
    {
      name: 'get_block_context',
      description:
        'Get the surrounding context of a specific block (blocks before and after). ' +
        'Useful for understanding the local structure around a block you want to edit. ' +
        'The explicit file_path identifies the exact document, whether open or closed.',
      schema: z.object({
        block_id: z.number().describe('The block display ID to center the context around.'),
        window: z
          .number()
          .optional()
          .describe('Number of blocks before and after to include (default: 3).'),
        file_path: z
          .string()
          .describe('Required workspace-relative or real absolute path to the target document, or an untitled: virtual ID returned by get_editor_state.'),
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
      file_path: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      max_matches?: number
    }, runtime) => {
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId)
      if (!snapshot) {
        return `Error: Could not load document "${describeDocument(resolved)}".`
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
        query: z.string().describe('Text to search for. Matched literally, with one exception: "one|other" is an alternation, so put every wording of the same thing in ONE query instead of one call per wording. For a real pattern, set regex: true.'),
        file_path: z
          .string()
          .describe('Required workspace-relative or real absolute path to the target document, or an untitled: virtual ID returned by get_editor_state.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Reject matches that are part of a longer word. Works in every writing system, including scripts without spaces.'),
        regex: z.boolean().optional().describe('Treat query as a JavaScript regular expression. Not needed for plain alternation — "one|other" already works without it.'),
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
      file_path: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      max_matches?: number
      max_sections?: number
    }, runtime) => {
      const resolved = resolveDocumentPathForRuntime(file_path, runtime)
      if (!resolved.ok) return resolved.error
      const resolvedPath = resolved.filePath
      const snapshot = await snapshotBroker.requestSnapshot(resolvedPath, resolved.tabId)
      if (!snapshot) {
        return `Error: Could not load document "${describeDocument(resolved)}".`
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
        query: z.string().describe('Text to search for. Matched literally, with one exception: "one|other" is an alternation, so put every wording of the same thing in ONE query instead of one call per wording. For a real pattern, set regex: true.'),
        file_path: z
          .string()
          .describe('Required workspace-relative or real absolute path to the target document, or an untitled: virtual ID returned by get_editor_state.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Reject matches that are part of a longer word. Works in every writing system, including scripts without spaces.'),
        regex: z.boolean().optional().describe('Treat query as a JavaScript regular expression. Not needed for plain alternation — "one|other" already works without it.'),
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

      return DocumentSearch.formatWorkspaceSearchResult(query, files, filePaths.length, filePaths)
    },
    {
      name: 'search_in_directory',
      description:
        'Search the CONTENT of .md/.txt/.iwt documents under one specific directory using block-aware matching. ' +
        'Returns only files whose document content matches the query, plus block IDs, section headings, and previews. ' +
        'This works for the workspace root (directory_path="."), a user-attached directory, or any explicitly named directory. ' +
        'Do NOT use this to locate filenames, folder paths, tabs, or documents you already know by path. ' +
        'If you know the path, call get_document_outline/get_section/get_blocks with file_path directly. ' +
        'For file/path discovery, use shell file tools such as ls/glob/find/grep instead.',
      schema: z.object({
        query: z.string().describe('Text to search for. Matched literally, with one exception: "one|other" is an alternation, so put every wording of the same thing in ONE query instead of one call per wording. For a real pattern, set regex: true.'),
        directory_path: z
          .string()
          .describe('Workspace-relative or real absolute directory path whose document contents should be searched. Use "." for the workspace root.'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Reject matches that are part of a longer word. Works in every writing system, including scripts without spaces.'),
        regex: z.boolean().optional().describe('Treat query as a JavaScript regular expression. Not needed for plain alternation — "one|other" already works without it.'),
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
    getSections,
    getBlocks,
    getBlockContext,
    searchBlocksInDocument,
    searchSectionsInDocument,
    searchInDirectory,
  ] as const
}
