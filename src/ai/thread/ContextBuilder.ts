/**
 * ContextBuilder — system prompt assembly + tool schema definitions (V3).
 *
 * Changes from V1:
 *  - edit_document replaced by 4 document access tools + 7 block edit tools
 *  - System prompt injects document_outline (always) + current_section (cursor-first)
 *  - DocumentContext carries the editor instance and cursor block info
 */

import type { AiAgentProfile } from '@/types/ai'
import type { LMTool } from '../providers/types'
import type { Editor } from '@tiptap/core'
import { DocumentViewBuilder, type DocumentView } from '../edit-agent/DocumentViewBuilder'

// ── Document View Cache ────────────────────────────────────────────────────

/**
 * A per-request snapshot of the document view (built once per sendMessage call).
 * Shared between ContextBuilder (for system prompt) and ToolRegistry (for tool execution).
 */
export interface DocumentViewSnapshot {
  view: DocumentView
  editor: Editor
  cursorBlockId: number | null   // displayId of the block containing the cursor
}

// ── Tool Schemas ───────────────────────────────────────────────────────────

// ── Document Access Tools ──────────────────────────────────────────────────

const TOOL_GET_DOCUMENT_OUTLINE: LMTool = {
  name: 'get_document_outline',
  description:
    'Get the document outline (heading structure with block count and word count per section). ' +
    'Always call this first to understand the document structure before editing or reading sections. ' +
    'Use the returned block_ids to call get_section or get_blocks for detailed content.',
  parameters: { type: 'object', properties: {}, required: [] },
}

const TOOL_GET_SECTION: LMTool = {
  name: 'get_section',
  description:
    'Get the full content of a section (from a heading block to the next same/higher-level heading). ' +
    'The returned content includes {b:n} block markers you can use in edit tools. ' +
    'Use heading_block_id from get_document_outline. For long sections, use offset/limit to paginate.',
  parameters: {
    type: 'object',
    properties: {
      heading_block_id: {
        type: 'number',
        description: 'The block_id of the section heading (from get_document_outline)',
      },
      offset: {
        type: 'number',
        description: 'Skip this many blocks from the start of the section (default 0)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of blocks to return (default 20)',
      },
    },
    required: ['heading_block_id'],
  },
}

const TOOL_GET_BLOCKS: LMTool = {
  name: 'get_blocks',
  description:
    'Get the content of specific blocks by their IDs. ' +
    'Use this to inspect the current content of blocks before editing them, ' +
    'or to compare content at different positions in the document.',
  parameters: {
    type: 'object',
    properties: {
      block_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of block_ids to retrieve (from document outline or section view)',
      },
    },
    required: ['block_ids'],
  },
}

const TOOL_GET_BLOCK_CONTEXT: LMTool = {
  name: 'get_block_context',
  description:
    'Get the blocks surrounding a target block (window blocks before and after). ' +
    'Use this to understand the context around a specific block before editing it.',
  parameters: {
    type: 'object',
    properties: {
      block_id: { type: 'number', description: 'The center block_id (from {b:n} markers)' },
      window:   { type: 'number', description: 'Number of blocks before and after to include (default 3)' },
    },
    required: ['block_id'],
  },
}

// ── Block Edit Tools ───────────────────────────────────────────────────────

const TOOL_EDIT_BLOCK: LMTool = {
  name: 'edit_block',
  description:
    'Replace the CONTENT of a block while keeping its type and level unchanged. ' +
    'IMPORTANT: This tool cannot change block type or heading level. ' +
    'To convert a paragraph to a heading, or to change heading level (e.g., H1 → H2), ' +
    'use replace_range(N, N, "## new text") with full Markdown instead.\n' +
    'Content format rules:\n' +
    '- paragraph: plain text with Markdown inline marks (**bold**, _italic_, ~~strike~~, ==highlight==, $formula$)\n' +
    '- heading: heading text only, without # prefix (existing level is preserved)\n' +
    '- listItem / taskItem: item text only, without - or checkbox prefix\n' +
    '- codeBlock: code content only, without ``` fences (language is preserved)\n' +
    '- mathBlock: formula only, without $$ fences',
  parameters: {
    type: 'object',
    properties: {
      block_id:    { type: 'number', description: 'Target block ID (from {b:n} in document view)' },
      new_content: { type: 'string', description: 'New content in type-specific Markdown format (see rules above)' },
      reason:      { type: 'string', description: 'Brief reason for this edit (shown to user for review)' },
    },
    required: ['block_id', 'new_content'],
  },
}

const TOOL_INSERT_BLOCK: LMTool = {
  name: 'insert_block',
  description:
    'Insert one or more new blocks after the specified block. ' +
    'new_blocks is full Markdown — multiple blocks are separated by blank lines. ' +
    'Set after_block_id to 0 to insert at the beginning of the document.',
  parameters: {
    type: 'object',
    properties: {
      after_block_id: {
        type: 'number',
        description: 'Insert after this block ID. Use 0 to insert at document start.',
      },
      new_blocks: {
        type: 'string',
        description: 'Markdown content to insert (can contain multiple blocks separated by blank lines)',
      },
      reason: { type: 'string', description: 'Brief reason for this insertion (shown to user for review)' },
    },
    required: ['after_block_id', 'new_blocks'],
  },
}

const TOOL_DELETE_BLOCK: LMTool = {
  name: 'delete_block',
  description: 'Delete a single block. Requires user approval before execution.',
  parameters: {
    type: 'object',
    properties: {
      block_id: { type: 'number', description: 'ID of the block to delete' },
      reason:   { type: 'string', description: 'Reason for deletion (shown to user for review)' },
    },
    required: ['block_id'],
  },
}

const TOOL_REPLACE_RANGE: LMTool = {
  name: 'replace_range',
  description:
    'Replace a contiguous range of blocks (from start_block_id to end_block_id inclusive) with new content. ' +
    'Use this for significant rewrites spanning multiple blocks or an entire section. ' +
    'new_content is full Markdown and may contain multiple blocks separated by blank lines.',
  parameters: {
    type: 'object',
    properties: {
      start_block_id: { type: 'number', description: 'First block_id of the range to replace (inclusive)' },
      end_block_id:   { type: 'number', description: 'Last block_id of the range to replace (inclusive)' },
      new_content:    { type: 'string', description: 'Full Markdown replacement content' },
      reason:         { type: 'string', description: 'Brief reason for this replacement (shown to user for review)' },
    },
    required: ['start_block_id', 'end_block_id', 'new_content'],
  },
}

const TOOL_CREATE_DOCUMENT: LMTool = {
  name: 'create_document',
  description:
    'Create a new document with the specified content. ' +
    'Use this when no document is currently open and the user asks you to create or write a document. ' +
    'Generate the full Markdown content first, then call this tool once.',
  parameters: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Document name without file extension (e.g. "苏州两日游")',
      },
      content: {
        type: 'string',
        description: 'Full Markdown content of the new document',
      },
      reason: {
        type: 'string',
        description: 'Brief description shown to the user (e.g. "创建苏州两日游完整日程安排")',
      },
    },
    required: ['filename', 'content'],
  },
}

// ── Profile → Tool Set ─────────────────────────────────────────────────────

const DOC_ACCESS_TOOLS = [
  TOOL_GET_DOCUMENT_OUTLINE,
  TOOL_GET_SECTION,
  TOOL_GET_BLOCKS,
  TOOL_GET_BLOCK_CONTEXT,
]

const BLOCK_EDIT_TOOL_LIST = [
  TOOL_EDIT_BLOCK,
  TOOL_INSERT_BLOCK,
  TOOL_DELETE_BLOCK,
  TOOL_REPLACE_RANGE,
]

const TOOL_SETS: Record<AiAgentProfile, LMTool[]> = {
  write:   [...DOC_ACCESS_TOOLS, ...BLOCK_EDIT_TOOL_LIST, TOOL_CREATE_DOCUMENT],
  ask:     [...DOC_ACCESS_TOOLS],
  minimal: [],
}

export function getToolsForProfile(profile: AiAgentProfile): LMTool[] {
  return TOOL_SETS[profile]
}

// ── System Prompt Builder ──────────────────────────────────────────────────

export interface DocumentContext {
  /** Optional TipTap editor instance for building the document view */
  editor?: Editor
  /** Pre-built document view snapshot (preferred over building from scratch) */
  viewSnapshot?: DocumentViewSnapshot
  selectionText?: string
  filePath?: string | null
  folderPath?: string | null
}

const _builder = new DocumentViewBuilder()

/**
 * Build the system prompt for a request.
 * Injects document outline (always) + cursor section content (when available).
 */
export function buildSystemPrompt(
  profile: AiAgentProfile,
  ctx: DocumentContext
): string {
  const lines: string[] = []
  const hasDocument = !!(ctx.viewSnapshot || ctx.editor)

  lines.push(
    'You are an intelligent writing assistant integrated into iWriter, a document editor.',
    'Help the user write, edit, and improve their documents.',
    '在回答用户问题或执行编辑任务时，请先认真思考，然后再行动。仔细阅读下面的文档上下文和工具说明，确保你完全理解后再进行下一步。',
    ''
  )

  if (profile === 'write') {
    if (!hasDocument) {
      lines.push(
        '## 当前状态：没有打开的文档',
        'No document is currently open.',
        '',
        '## 创建新文档',
        'If the user asks you to create or write a document:',
        '1. Generate the full content as Markdown.',
        '2. Call `create_document(filename, content, reason?)` once:',
        '   - `filename`: concise name without extension (e.g. "苏州两日游")',
        '   - `content`: complete Markdown document',
        '   - `reason`: brief description for the user',
        '',
        'Do NOT call get_section, get_blocks, get_block_context, or get_document_outline.',
        'These tools require an open document and will fail.',
        ''
      )
    } else {
      lines.push(
        'You have tools to read and edit the current document.',
        '',
        '## Document Context',
        'The document context is already injected at the end of this system prompt:',
        '- `<document_outline>`: full heading structure with `{b:N}` block IDs, section block count, and word count.',
        '  The number N is the exact value to use as `heading_block_id` in section tools and as `block_id` in edit tools.',
        '- `<current_section>`: full Markdown content of the section containing the cursor, with `{b:N}` markers on every block.',
        '  These N values are the `block_id` parameters for block edit tools.',
        'Read these tags BEFORE calling any tool. The block IDs you need are already there.',
        '',
        '## Whole-Document Tasks (grammar check, proofreading, full rewrite, style review)',
        'When the task requires processing the ENTIRE document (not just the current section):',
        '',
        '**Core rule: read and edit in an overlapping pattern — never read everything first.**',
        '',
        'Basic pattern (sections ≤ 20 blocks each):',
        '- Round 1: `get_section(section1_id)` → read section 1',
        '- Round 2: `edit_block(A)` + `edit_block(B)` + `get_section(section2_id)` → submit edits for section 1 AND read section 2 in the same response',
        '- Round N: `edit_block(X)` → submit edits for the last section (loop stops, user reviews proposals)',
        '',
        'Large-section pagination (when `has_more=true` in `get_section` response):',
        '- `get_document_outline` shows `section_blocks` per section — use this to anticipate large sections',
        '- `get_section` defaults to 20 blocks per page; check `has_more` in every response',
        '- Apply the same overlap pattern across pages: submit edits for page K AND read page K+1 in the same response',
        '- Example: `edit_block(A) + get_section(N, offset=20)` → edit page 1 AND read page 2',
        '',
        'Key rules:',
        '- Use `get_section` for whole-document reading — do NOT use `get_blocks` for large sequential reads',
        '- Submit edits immediately after reading a page/section, not after reading the whole document',
        '- Mixing read tools and edit tools in one response lets the loop continue; a response with ONLY edit tools stops the loop for user review',
        '',
        '## Reading',
        'Use read tools only for content NOT already in the injected context:',
        '- `get_section(heading_block_id=N)` — read a section other than `<current_section>`.',
        '  N must come from `<document_outline>`. Example: outline shows `{b:5} ## Introduction` → call `get_section(heading_block_id=5)`.',
        '  For long sections add `offset` and `limit` to paginate: `get_section(heading_block_id=5, offset=20, limit=20)`.',
        '  Always check `has_more` in the response — if `true`, call again with `offset += limit`.',
        '- `get_blocks(block_ids=[N, ...])` — fetch specific blocks by ID. Use for targeted lookups, not large sequential reads.',
        '- `get_block_context(block_id=N, window=3)` — fetch the blocks surrounding block N (3 before and 3 after by default). Use to understand context before editing.',
        '- `get_document_outline()` — call ONLY to refresh the outline after you have made edits. Do NOT call it at the start; the outline is already provided.',
        'Never pass a block_id you have not yet seen in the injected context or a previous tool result.',
        '',
        '## Editing',
        'Choose the narrowest tool that fits the task:',
        '- `edit_block(block_id, new_content, reason?)` — change CONTENT of one block, preserving its type and level. Use ONLY when the block type stays the same (e.g., paragraph stays paragraph, heading stays heading at same level).',
        '- `insert_block(after_block_id, new_blocks, reason?)` — insert blocks after a given block. Use `after_block_id=0` for document start.',
        '- `delete_block(block_id, reason?)` — delete a single block.',
        '- `replace_range(start_block_id, end_block_id, new_content, reason?)` — replace a contiguous range of blocks with new content. Use for multi-block rewrites, section rewrites, OR **when you need to change a block\'s type** (e.g., paragraph → heading, or change heading level).',
        'Content format: `edit_block` uses type-specific inline Markdown (no `#` prefix for headings, no fences for code). `insert_block`/`replace_range` use full Markdown syntax.',
        '⚠️ Type-change rule: `edit_block` CANNOT change a block\'s type or heading level. To convert a paragraph to a heading, or to change `# Heading 1` to `## Heading 2`, always use `replace_range(N, N, "## new heading text")` instead of `edit_block`.',
        '',
        '## Error Recovery',
        'If a tool returns an error:',
        '1. Read the error message — it will list valid block IDs or explain what is wrong.',
        '2. Check `<document_outline>` and `<current_section>` in this prompt for the correct block ID.',
        '3. Correct the parameter and retry — do NOT repeat the same call with the same arguments.',
        '4. Call `get_document_outline()` only if your edits may have changed the block structure.',
        '5. If you cannot find a valid block ID, explain the problem to the user instead of guessing.',
        '',
        '## After Completing a Task',
        'After all edits are submitted, reply with a brief summary in the document\'s language:',
        '- What was done (e.g., "已在第 X 章之后插入第 Y 章，共 N 段")',
        '- Any notable decisions or assumptions made during editing',
        '- What the user should review or approve in the proposals above',
        'Keep the summary concise (2–4 sentences). Do not repeat the full content you wrote.',
        ''
      )
    }
  } else if (profile === 'ask') {
    lines.push(
      'You can read the document to answer questions.',
      'You cannot make edits — provide suggestions as text instead.',
      ''
    )
  } else {
    lines.push('Respond based on the document context. Do not use tools.', '')
  }

  lines.push(
    'Output rules:',
    '- Keep responses concise unless elaboration is requested.',
    '- When producing document content (not tool calls), match the document\'s style and language.',
    ''
  )

  // File and workspace context
  if (ctx.filePath)   lines.push(`<current_file>${ctx.filePath}</current_file>`)
  if (ctx.folderPath) lines.push(`<workspace_folder>${ctx.folderPath}</workspace_folder>`)

  // Selection context
  if (ctx.selectionText) {
    lines.push('<selected_text>', ctx.selectionText, '</selected_text>')
  }

  // Document view: outline + cursor section
  const snapshot = ctx.viewSnapshot ?? (ctx.editor ? buildSnapshot(ctx.editor) : null)

  if (snapshot) {
    const { view, cursorBlockId } = snapshot

    // Always inject outline
    lines.push('<document_outline>', view.outlineText, '</document_outline>')

    // Inject cursor section (the section containing the cursor)
    if (cursorBlockId !== null) {
      const cursorBlock = view.blockMap.find(b => b.displayId === cursorBlockId)
      if (cursorBlock) {
        // Find the heading that contains this block
        const sectionHeading = findContainingHeading(cursorBlockId, view)

        if (sectionHeading) {
          const sectionResult = _builder.buildSectionView(snapshot.editor, sectionHeading.displayId, view.blockMap)
          if (sectionResult) {
            lines.push(
              `<current_section heading="${sectionHeading.text}">`,
              sectionResult.content,
              '</current_section>'
            )
          }
        } else {
          // No heading — inject the cursor block and a few neighbors
          const start = Math.max(1, cursorBlockId - 2)
          const end   = Math.min(view.totalBlocks, cursorBlockId + 3)
          const rangeContent = _builder.buildRangeView(snapshot.editor, start, end, view.blockMap)
          lines.push('<current_context>', rangeContent, '</current_context>')
        }
      }
    }

    lines.push(`<cursor_block_id>${cursorBlockId ?? 'unknown'}</cursor_block_id>`)
  }

  return lines.join('\n')
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a DocumentViewSnapshot from an editor instance. */
export function buildSnapshot(editor: Editor, cursorPos?: number): DocumentViewSnapshot {
  const view = _builder.build(editor)
  const pos = cursorPos ?? editor.state.selection.from
  const cursorBlockId = findBlockAtPos(pos, view.blockMap)
  return { view, editor, cursorBlockId }
}

/** Find the displayId of the block that contains position `pos`. */
function findBlockAtPos(pos: number, blockMap: DocumentViewSnapshot['view']['blockMap']): number | null {
  for (const entry of blockMap) {
    if (pos >= entry.from && pos < entry.to) return entry.displayId
  }
  return null
}

/** Find the nearest heading that contains the given displayId (for section context). */
function findContainingHeading(
  displayId: number,
  view: DocumentView
): { displayId: number; text: string; level: number } | null {
  // Walk backwards through outline to find the heading that "owns" this block
  const headings = [...view.outline].reverse()
  for (const h of headings) {
    if (h.displayId <= displayId) {
      return { displayId: h.displayId, text: h.text, level: h.level }
    }
  }
  return null
}
