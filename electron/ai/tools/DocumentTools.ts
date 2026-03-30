/**
 * DocumentTools — LangChain tools for reading iWriter document content.
 *
 * These tools request snapshots from the renderer via SnapshotBroker and
 * query them using BlockParser. Supports both the active editor and disk files.
 */

import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import { BlockParser } from '../document/BlockParser'

const SUPPORTED_DOC_EXTS = new Set(['md', 'txt', 'iwt'])

function getExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

function getRuntimeActiveFilePath(runtime: unknown): string | null {
  const configurable = (runtime as { config?: { configurable?: Record<string, unknown> } })?.config?.configurable
  const value = configurable?.active_file_path
  return typeof value === 'string' ? value : null
}

export function buildDocumentTools(snapshotBroker: SnapshotBroker) {
  // ── get_document_outline ──────────────────────────────────────────────────

  const getDocumentOutline = tool(
    async ({ file_path }: { file_path?: string }, runtime) => {
      const resolvedPath = BlockParser.resolveFilePath(file_path, getRuntimeActiveFilePath(runtime))

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
      const resolvedPath = BlockParser.resolveFilePath(file_path, getRuntimeActiveFilePath(runtime))
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
      const resolvedPath = BlockParser.resolveFilePath(file_path, getRuntimeActiveFilePath(runtime))
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
      const resolvedPath = BlockParser.resolveFilePath(file_path, getRuntimeActiveFilePath(runtime))
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

  return [getDocumentOutline, getSection, getBlocks, getBlockContext] as const
}
