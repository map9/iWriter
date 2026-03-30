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
    async ({ block_id }: { block_id: number; new_content: string; description?: string; file_path?: string }) => {
      return `Block {b:${block_id}} edited successfully.`
    },
    {
      name: 'edit_block',
      description:
        'Replace the content of an existing block. ' +
        'The user must approve the change before it is applied. ' +
        'Always call get_blocks first to see the current content before editing.',
      schema: z.object({
        block_id: z.number().describe('The {b:n} block ID to edit.'),
        new_content: z.string().describe('The new Markdown content to replace the block with.'),
        description: z.string().optional().describe('Brief reason for the edit.'),
        file_path: z.string().optional().describe(
          'Absolute path to a disk file. Omit to edit the active editor document.'
        ),
      }),
    }
  )

  const insertBlock = tool(
    async ({ after_block_id }: { after_block_id: number; content: string; description?: string; file_path?: string }) => {
      return `Block inserted after {b:${after_block_id}} successfully.`
    },
    {
      name: 'insert_block',
      description:
        'Insert new content after a specific block. ' +
        'Use after_block_id=0 to insert before the first block (document start). ' +
        'The user must approve before the change is applied.',
      schema: z.object({
        after_block_id: z.number().describe('Insert after this block ID. Use 0 to insert at document start.'),
        content: z.string().describe('The Markdown content of the new block(s) to insert.'),
        description: z.string().optional().describe('Brief reason for the insertion.'),
        file_path: z.string().optional().describe('Absolute path to a disk file. Omit for the active editor.'),
      }),
    }
  )

  const deleteBlock = tool(
    async ({ block_id }: { block_id: number; description?: string; file_path?: string }) => {
      return `Block {b:${block_id}} deleted successfully.`
    },
    {
      name: 'delete_block',
      description: 'Delete an existing block. The user must approve before the change is applied.',
      schema: z.object({
        block_id: z.number().describe('The {b:n} block ID to delete.'),
        description: z.string().optional().describe('Brief reason for the deletion.'),
        file_path: z.string().optional().describe('Absolute path to a disk file. Omit for the active editor.'),
      }),
    }
  )

  const replaceRange = tool(
    async ({ start_block_id, end_block_id }: { start_block_id: number; end_block_id: number; new_content: string; description?: string; file_path?: string }) => {
      return `Blocks {b:${start_block_id}}–{b:${end_block_id}} replaced successfully.`
    },
    {
      name: 'replace_range',
      description:
        'Replace a range of blocks from start_block_id to end_block_id (inclusive) ' +
        'with new content. Useful for rewriting multiple consecutive blocks at once.',
      schema: z.object({
        start_block_id: z.number().describe('First block ID in the range to replace.'),
        end_block_id: z.number().describe('Last block ID in the range to replace (inclusive).'),
        new_content: z.string().describe('New Markdown content to replace the range with.'),
        description: z.string().optional().describe('Brief reason for the replacement.'),
        file_path: z.string().optional().describe('Absolute path to a disk file. Omit for the active editor.'),
      }),
    }
  )

  const createDocument = tool(
    async ({ filename }: { filename: string; content: string; description?: string }) => {
      return `Document "${filename}" created successfully.`
    },
    {
      name: 'create_document',
      description:
        'Create a new document in the current workspace. ' +
        'The user must approve before the file is created. ' +
        'Use when asked to write a new document or create a new file.',
      schema: z.object({
        filename: z.string().describe('Desired filename with extension (e.g., "notes.md"). No path separators.'),
        content: z.string().describe('Full Markdown content for the new document.'),
        description: z.string().optional().describe('Brief description of the document.'),
      }),
    }
  )

  return [editBlock, insertBlock, deleteBlock, replaceRange, createDocument] as const
}
