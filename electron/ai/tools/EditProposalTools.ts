/**
 * EditProposalTools — LangChain tools for document edits.
 *
 * V2 Architecture (LangGraph interruptOn):
 * These tools are called by deepagents AFTER the user approves via interruptOn.
 * The interrupt and proposal building happen in AgentEngine._handleInterrupt().
 * The actual TipTap mutation is applied by the renderer BEFORE sending ai:resume.
 * So these tool functions simply return a success message.
 *
 * For rejections, deepagents' HITL middleware does NOT call the tool at all —
 * it inserts a rejection message into the conversation history automatically.
 */

import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export function buildEditProposalTools() {
  const editBlock = tool(
    async ({ block_id, file_path }: { block_id: number; new_content: string; expected_current_content?: string; reason?: string; file_path?: string }) => {
      const target = file_path ? `file "${file_path}"` : 'the active document'
      return `Edit applied to ${target} at block {b:${block_id}}. The document has changed, so block IDs for this file may now be stale. If you need more edits on the same file, call get_document_outline, get_section, or get_blocks again before editing.`
    },
    {
      name: 'edit_block',
      description:
        'Replace the content of an existing block. ' +
        'The user must approve the change before it is applied. ' +
        'Always call get_blocks first to see the current content before editing, ' +
        'and pass expected_current_content when available so the edit can fail safely if the block changed.',
      schema: z.object({
        block_id: z.number().describe('The {b:n} block ID to edit.'),
        new_content: z.string().describe('The new Markdown content to replace the block with.'),
        expected_current_content: z
          .string()
          .optional()
          .describe('Exact current Markdown of the target block (without the {b:n} marker), usually copied from get_blocks.'),
        reason: z.string().optional().describe('Brief reason for the edit.'),
        file_path: z.string().optional().describe(
          'Real absolute host path to a disk file. Never pass a basename, workspace-relative path, or virtual mount path. Omit to edit the active editor document.'
        ),
      }),
    }
  )

  const insertBlock = tool(
    async ({ after_block_id, file_path }: { after_block_id: number; new_content: string; expected_anchor_content?: string; reason?: string; file_path?: string }) => {
      const target = file_path ? `file "${file_path}"` : 'the active document'
      return `Insert applied to ${target} after block {b:${after_block_id}}. The document has changed, so block IDs for this file may now be stale. If you need more edits on the same file, call get_document_outline, get_section, or get_blocks again before editing.`
    },
    {
      name: 'insert_block',
      description:
        'Insert new content after a specific block. ' +
        'Use after_block_id=0 to insert before the first block (document start). ' +
        'The user must approve before the change is applied. ' +
        'When inserting after an existing block, pass expected_anchor_content when available so the insert fails if the anchor moved.',
      schema: z.object({
        after_block_id: z.number().describe('Insert after this block ID. Use 0 to insert at document start.'),
        new_content: z.string().describe('Markdown content of the new block(s) to insert.'),
        expected_anchor_content: z
          .string()
          .optional()
          .describe('Exact current Markdown of the anchor block (without the {b:n} marker), usually copied from get_blocks.'),
        reason: z.string().optional().describe('Brief reason for the insertion.'),
        file_path: z.string().optional().describe('Real absolute host path to a disk file. Never pass a basename, workspace-relative path, or virtual mount path. Omit for the active editor.'),
      }),
    }
  )

  const deleteBlock = tool(
    async ({ block_id, file_path }: { block_id: number; expected_current_content?: string; reason?: string; file_path?: string }) => {
      const target = file_path ? `file "${file_path}"` : 'the active document'
      return `Delete applied to ${target} at block {b:${block_id}}. The document has changed, so block IDs for this file may now be stale. If you need more edits on the same file, call get_document_outline, get_section, or get_blocks again before editing.`
    },
    {
      name: 'delete_block',
      description:
        'Delete an existing block. The user must approve before the change is applied. ' +
        'Pass expected_current_content when available so the delete fails safely if the block changed.',
      schema: z.object({
        block_id: z.number().describe('The {b:n} block ID to delete.'),
        expected_current_content: z
          .string()
          .optional()
          .describe('Exact current Markdown of the target block (without the {b:n} marker), usually copied from get_blocks.'),
        reason: z.string().optional().describe('Brief reason for the deletion.'),
        file_path: z.string().optional().describe('Real absolute host path to a disk file. Never pass a basename, workspace-relative path, or virtual mount path. Omit for the active editor.'),
      }),
    }
  )

  const replaceRange = tool(
    async ({ start_block_id, end_block_id, file_path }: { start_block_id: number; end_block_id: number; new_content: string; expected_old_content?: string; reason?: string; file_path?: string }) => {
      const target = file_path ? `file "${file_path}"` : 'the active document'
      return `Replace applied to ${target} for blocks {b:${start_block_id}}–{b:${end_block_id}}. The document has changed, so block IDs for this file may now be stale. If you need more edits on the same file, call get_document_outline, get_section, or get_blocks again before editing.`
    },
    {
      name: 'replace_range',
      description:
        'Replace a range of blocks from start_block_id to end_block_id (inclusive) ' +
        'with new content. Useful for rewriting multiple consecutive blocks at once. ' +
        'Pass expected_old_content when available so the replacement fails if the range changed.',
      schema: z.object({
        start_block_id: z.number().describe('First block ID in the range to replace.'),
        end_block_id: z.number().describe('Last block ID in the range to replace (inclusive).'),
        new_content: z.string().describe('New Markdown content to replace the range with.'),
        expected_old_content: z
          .string()
          .optional()
          .describe('Exact current Markdown of the whole target range (without {b:n} markers), usually copied from get_blocks.'),
        reason: z.string().optional().describe('Brief reason for the replacement.'),
        file_path: z.string().optional().describe('Real absolute host path to a disk file. Never pass a basename, workspace-relative path, or virtual mount path. Omit for the active editor.'),
      }),
    }
  )

  const createDocument = tool(
    async ({ filename }: { filename: string; content: string; reason?: string }) => {
      return `Document "${filename}" created successfully.`
    },
    {
      name: 'create_document',
      description:
        'Create a new document in the current workspace. ' +
        'The user must approve before the file is created. ' +
        'Use when asked to write a new document or create a new file.',
      schema: z.object({
        filename: z.string().describe('Desired filename (basename only, no directory). Extension is optional; .md will be used when omitted.'),
        content: z.string().describe('Full Markdown content for the new document.'),
        reason: z.string().optional().describe('Brief description of the document.'),
        directory: z.string().optional().describe('Absolute host path to the directory where the file should be written on disk (e.g. /Users/xxx/myproject/draft/). When provided the file is saved to disk and opened; when omitted, an in-memory tab is created.'),
      }),
    }
  )

  return [editBlock, insertBlock, deleteBlock, replaceRange, createDocument] as const
}
