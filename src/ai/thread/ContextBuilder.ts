/**
 * ContextBuilder — system prompt assembly + tool schema definitions (V3).
 *
 * Changes from V1:
 *  - edit_document replaced by 4 document access tools + 7 block edit tools
 *  - System prompt injects document_outline (always) + current_section (cursor-first)
 *  - DocumentContext carries the editor instance and cursor block info
 */

import type { AiAgentProfile, OpenTabInfo } from '@/types/ai'
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
  filePath?: string              // path of the active editing file (undefined when no file is open)
}

// ── Tool Schemas ───────────────────────────────────────────────────────────

// ── Document Access Tools ──────────────────────────────────────────────────

const TOOL_GET_DOCUMENT_OUTLINE: LMTool = {
  name: 'get_document_outline',
  description:
    'Get the document outline (heading structure with block count and word count per section). ' +
    'Always call this first to understand the document structure before editing or reading sections. ' +
    'Use the returned block_ids to call get_section or get_blocks for detailed content. ' +
    'Pass file_path to read a local file instead of the currently open editor document.',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to a local file (.md, .txt, or .iwt). Omit to use the open editor document.' },
    },
    required: [],
  },
}

const TOOL_GET_SECTION: LMTool = {
  name: 'get_section',
  description:
    'Get the full content of a section (from a heading block to the next same/higher-level heading). ' +
    'The returned content includes {b:n} block markers. ' +
    'Use heading_block_id from get_document_outline. For long sections, use offset/limit to paginate. ' +
    'Pass file_path to read a local file instead of the open editor document.',
  parameters: {
    type: 'object',
    properties: {
      heading_block_id: { type: 'number', description: 'The block_id of the section heading (from get_document_outline)' },
      offset:    { type: 'number', description: 'Skip this many blocks from the start of the section (default 0)' },
      limit:     { type: 'number', description: 'Maximum number of blocks to return (default 20)' },
      file_path: { type: 'string', description: 'Absolute path to a local file (.md, .txt, or .iwt). Omit to use the open editor document.' },
    },
    required: ['heading_block_id'],
  },
}

const TOOL_GET_BLOCKS: LMTool = {
  name: 'get_blocks',
  description:
    'Get the content of specific blocks by their IDs. ' +
    'Pass file_path to read from a local file instead of the open editor document.',
  parameters: {
    type: 'object',
    properties: {
      block_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of block_ids to retrieve (from document outline or section view)',
      },
      file_path: { type: 'string', description: 'Absolute path to a local file (.md, .txt, or .iwt). Omit to use the open editor document.' },
    },
    required: ['block_ids'],
  },
}

const TOOL_GET_BLOCK_CONTEXT: LMTool = {
  name: 'get_block_context',
  description:
    'Get the blocks surrounding a target block (window blocks before and after). ' +
    'Pass file_path to read from a local file instead of the open editor document.',
  parameters: {
    type: 'object',
    properties: {
      block_id:  { type: 'number', description: 'The center block_id (from {b:n} markers)' },
      window:    { type: 'number', description: 'Number of blocks before and after to include (default 3)' },
      file_path: { type: 'string', description: 'Absolute path to a local file (.md, .txt, or .iwt). Omit to use the open editor document.' },
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
      file_path:   { type: 'string', description: 'Absolute path of the .iwt file to edit. Omit to edit the active editor document.' },
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
      reason:    { type: 'string', description: 'Brief reason for this insertion (shown to user for review)' },
      file_path: { type: 'string', description: 'Absolute path of the .iwt file to edit. Omit to edit the active editor document.' },
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
      block_id:  { type: 'number', description: 'ID of the block to delete' },
      reason:    { type: 'string', description: 'Reason for deletion (shown to user for review)' },
      file_path: { type: 'string', description: 'Absolute path of the .iwt file to edit. Omit to edit the active editor document.' },
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
      file_path:      { type: 'string', description: 'Absolute path of the .iwt file to edit. Omit to edit the active editor document.' },
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

// ── File System Tools ──────────────────────────────────────────────────────

const TOOL_READ_FILE: LMTool = {
  name: 'read_file',
  description:
    'Read the content of a file. Path can be relative to the workspace folder or absolute. ' +
    'Returns the file content as text.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to workspace or absolute)' },
    },
    required: ['path'],
  },
}

const TOOL_LIST_DIRECTORY: LMTool = {
  name: 'list_directory',
  description:
    'List the files and folders in a directory. ' +
    'Path can be relative to the workspace folder or absolute. Use "." for the workspace root.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (relative to workspace or absolute). Use "." for workspace root.' },
    },
    required: ['path'],
  },
}

const TOOL_WRITE_FILE: LMTool = {
  name: 'write_file',
  description:
    'Write content to a file. Path must be relative to the workspace folder. ' +
    'Creates the file if it does not exist. Requires user approval.',
  parameters: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'File path relative to workspace folder' },
      content: { type: 'string', description: 'Full content to write (replaces entire file)' },
    },
    required: ['path', 'content'],
  },
}

/** Build the exec_shell tool with OS-appropriate command examples. */
export function buildExecShellTool(platform: string): LMTool {
  const isWindows = platform === 'win32'
  const examples = isWindows
    ? 'dir, type, findstr, where, echo, stat'
    : 'ls, cat, find, grep, head, tail, wc, stat, file, echo'
  const osName = isWindows ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'
  return {
    name: 'exec_shell',
    description:
      `Run a read-only shell command to explore the file system (${osName}). ` +
      `Allowed read-only commands: ${examples}. ` +
      'Use this to list files, search content, or read file content. ' +
      'To edit files, use write_file or the document block tools instead.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run (read-only commands only)' },
        cwd:     { type: 'string', description: 'Working directory (defaults to workspace folder)' },
      },
      required: ['command'],
    },
  }
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

const FILE_TOOLS = [
  TOOL_READ_FILE,
  TOOL_LIST_DIRECTORY,
  TOOL_WRITE_FILE,
]

/**
 * Get tools for a given profile.
 * Pass platform string to include the OS-aware exec_shell tool.
 */
export function getToolsForProfile(profile: AiAgentProfile, platform?: string): LMTool[] {
  const shellTool = platform ? [buildExecShellTool(platform)] : []
  switch (profile) {
    case 'write':
      // exec_shell covers file discovery (ls, find) and reading — no need for separate list_directory/read_file
      return [...DOC_ACCESS_TOOLS, ...BLOCK_EDIT_TOOL_LIST, TOOL_CREATE_DOCUMENT, TOOL_WRITE_FILE, ...shellTool]
    case 'ask':
      return [...DOC_ACCESS_TOOLS, ...shellTool]
    case 'minimal':
    default:
      return []
  }
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
  /** Whether the active editor file has unsaved changes */
  isDirty?: boolean
  /** Other open editor tabs (excluding the active tab) */
  openTabs?: OpenTabInfo[]
  /** True when the active file differs from the thread's originFilePath */
  fileChanged?: boolean
  /** The thread's originFilePath (for the warning message) */
  previousFilePath?: string | null
  /** Text file paths attached by the user (listed in <context_files> section) */
  textFilePaths?: string[]
  /** Directory paths attached by the user (listed in <environment> section) */
  attachedDirectories?: string[]
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
    // ── 1. Context map ─────────────────────────────────────────────────────
    // Always explain what the <environment> tags mean so the LLM can reason
    // about ALL available context sources, not just the active document.
    lines.push(
      '## Available Context',
      'Check the `<environment>` block at the end of this prompt to see what is available:',
      '- `<editing_file path="...">` — document currently open in the editor.',
      '  Block edit tools called WITHOUT `file_path` operate on THIS document.',
      '  If absent: no document is open; block tools without `file_path` will fail.',
      '- `<workspace_folder>` — root of the user\'s file system workspace.',
      '  Contains .iwt / .md / .txt files. Access them with `file_path` or `exec_shell`.',
      '- `<context_files>` — files the user explicitly attached. Read with doc tools (file_path) or exec_shell.',
      '- `<attached_directories>` — attached directories. Explore with exec_shell.',
      '- `<open_tabs>` — other open editor tabs (reference only; cannot be directly edited via block tools).',
      '',
    )

    // ── 2. File Type Rules — always ────────────────────────────────────────
    lines.push(
      '## File Type Rules — CRITICAL',
      '',
      '### .iwt files (iWriter native format)',
      '- .iwt files on disk are JSON: `{ version, content: "<html>...", metadata }`. NOT plain text.',
      '- ⚠️ NEVER use `write_file` or `exec_shell` to write to a .iwt file — it will corrupt the JSON structure.',
      '- For ALL .iwt files, use ONLY block tools:',
      '  - Read:  `get_document_outline(file_path=...)`, `get_section(file_path=...)`, etc.',
      '  - Write: `edit_block` / `insert_block` / `replace_range` / `delete_block` with `file_path=<abs path>`',
      '    (omit `file_path` only when the .iwt file IS the currently active `<editing_file>`)',
      '- Do NOT fall back to `write_file` even if a block tool call fails.',
      '',
      '### .md and .txt files',
      '- Plain text. Use `exec_shell` (cat, grep) for reading, `write_file` for writing.',
      '- Block tools also work when `file_path` is provided.',
      '',
      '### Block edit tools — file targeting rule',
      '- WITHOUT `file_path` → edits the ACTIVE `<editing_file>`. Fails if no file is open.',
      '- WITH `file_path` → edits that specific file on disk.',
      '- ⚠️ Reading a file with `file_path` then editing WITHOUT `file_path` silently edits the WRONG document.',
      '  Always set `file_path` to match your intended target.',
      '',
    )

    // ── 3. Active document — only when editor has content ──────────────────
    if (hasDocument) {
      lines.push(
        '## Active Document',
        'Context is injected at the end of this prompt:',
        '- `<document_outline>`: heading structure with `{b:N}` block IDs.',
        '  Use N as `heading_block_id` in section tools and `block_id` in edit tools.',
        '- `<current_section>`: Markdown of the section at cursor, with `{b:N}` markers.',
        'Read these BEFORE calling any tool — the block IDs you need are already here.',
        '',
        '## Whole-Document Tasks (grammar check, proofreading, full rewrite)',
        '**Core rule: read and edit in an overlapping pattern — never read everything first.**',
        '',
        'Basic pattern (sections ≤ 20 blocks):',
        '- Round 1: `get_section(section1_id)` → read section 1',
        '- Round 2: `edit_block(A)` + `edit_block(B)` + `get_section(section2_id)` → edit section 1 AND read section 2',
        '- Round N: `edit_block(X)` → edit last section (loop stops, user reviews proposals)',
        '',
        'Pagination (when `has_more=true`):',
        '- `get_section` defaults to 20 blocks per page; always check `has_more`',
        '- `edit_block(A) + get_section(N, offset=20)` → edit page 1 AND read page 2 in one response',
        '',
        'Rules:',
        '- Use `get_section` for sequential reading — NOT `get_blocks`',
        '- A response with ONLY edit tools stops the loop for user review',
        '',
        '## Reading the Active Document',
        'Use read tools only for content NOT already in the injected context:',
        '- `get_section(heading_block_id=N)` — a section from `<document_outline>`. Paginate with offset/limit.',
        '- `get_blocks(block_ids=[N, ...])` — targeted lookup of specific blocks.',
        '- `get_block_context(block_id=N, window=3)` — blocks surrounding block N.',
        '- `get_document_outline()` — refresh outline ONLY after making edits.',
        'Never use a block_id not seen in context or a prior tool result.',
        '',
      )
    }

    // ── 4. Workspace / file operations — always ────────────────────────────
    lines.push(
      '## Working With Workspace Files',
      'Use these steps to find, read, and edit any file in `<workspace_folder>` (or attached files):',
      '',
      '**Search:**',
      '- `exec_shell(command="find . -iname \'*keyword*\' -type f")` — find by name',
      '- `exec_shell(command="ls")` — list workspace root',
      '',
      '**Read:**',
      '- .iwt: `get_document_outline(file_path="/abs/path/file.iwt")` for structure,',
      '  then `get_section(heading_block_id=N, file_path="...")` for content',
      '- .md/.txt: `exec_shell(command="cat /abs/path/file")` for quick read',
      '',
      '**Edit an .iwt file (not currently open in editor):**',
      '1. `get_document_outline(file_path="/abs/path/file.iwt")` → note the `{b:N}` block IDs',
      '2. Call block edit tool with BOTH the block ID AND `file_path`:',
      '   `edit_block(block_id=N, new_content="...", file_path="/abs/path/file.iwt")`',
      '   or `insert_block`, `replace_range`, `delete_block` — same pattern',
      '- Build the absolute path: `<workspace_folder>` value + relative path from find/ls results.',
      '- ⚠️ Block IDs from `get_document_outline(file_path=...)` are for THAT FILE only.',
      '  Do not mix them with block IDs from the active document outline.',
      '',
    )

    // ── 5. Creating new documents — always ─────────────────────────────────
    lines.push(
      '## Creating New Documents',
      'To create a new document (opens as a new tab in the editor):',
      '1. Generate the full content as Markdown.',
      '2. Call `create_document(filename, content, reason?)`:',
      '   - `filename`: name without extension (e.g. "苏州两日游")',
      '   - `content`: complete Markdown document',
      '',
    )

    // ── 6. Editing tools — always ──────────────────────────────────────────
    lines.push(
      '## Editing Tools',
      'Choose the narrowest tool:',
      '- `edit_block(block_id, new_content, reason?, file_path?)` — change content of one block, keeping type/level.',
      '- `insert_block(after_block_id, new_blocks, reason?, file_path?)` — insert after a block (0 = doc start).',
      '- `delete_block(block_id, reason?, file_path?)` — delete a block.',
      '- `replace_range(start_block_id, end_block_id, new_content, reason?, file_path?)` — replace a range.',
      '  Use for multi-block rewrites OR when changing block type / heading level.',
      'Content: `edit_block` uses inline Markdown without type prefix (no `#` for headings, no fences for code).',
      '`insert_block` / `replace_range` use full Markdown.',
      '⚠️ `edit_block` CANNOT change block type or heading level — use `replace_range(N, N, "## text")` instead.',
      '',
    )

    // ── 7. Error recovery — always ─────────────────────────────────────────
    lines.push(
      '## Error Recovery',
      'If a tool returns an error:',
      '1. Read the error message — it will name the problem.',
      '2. For block ID errors: call `get_document_outline(file_path=...)` or check injected `<document_outline>`.',
      '3. Correct and retry — do NOT repeat the same call unchanged.',
      '4. If unresolvable, explain the problem to the user.',
      '',
      '## After Completing a Task',
      'Reply with a brief summary in the document\'s language (2–4 sentences):',
      '- What was done, notable decisions, what the user should review.',
      '',
    )
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

  // Environment context block
  const envLines: string[] = ['<environment>']
  if (ctx.filePath) {
    const status = ctx.isDirty ? 'unsaved' : 'saved'
    envLines.push(`  <editing_file path="${ctx.filePath}" status="${status}" />`)
  } else if (hasDocument) {
    envLines.push('  <editing_file status="unsaved_new" />')
  }
  if (ctx.openTabs && ctx.openTabs.length > 0) {
    envLines.push('  <open_tabs>')
    for (const tab of ctx.openTabs) {
      if (tab.path) {
        envLines.push(`    <tab path="${tab.path}" status="${tab.isDirty ? 'unsaved' : 'saved'}" />`)
      } else {
        envLines.push(`    <tab name="${tab.name}" status="unsaved_new" />`)
      }
    }
    envLines.push('  </open_tabs>')
  }
  if (ctx.folderPath) {
    envLines.push(`  <workspace_folder>${ctx.folderPath}</workspace_folder>`)
  }
  if (ctx.attachedDirectories?.length) {
    envLines.push('  <attached_directories>')
    for (const dir of ctx.attachedDirectories) {
      envLines.push(`    <directory path="${dir}" />`)
    }
    envLines.push('  </attached_directories>')
  }
  envLines.push('</environment>')
  lines.push(...envLines)

  // Attached text files — listed for tool-based access
  if (ctx.textFilePaths?.length) {
    lines.push(
      '<context_files>',
      'The user has attached the following local files for reference.',
      'Use document tools with the file_path parameter to read them (e.g. get_document_outline, get_section, get_blocks).',
      'Or use exec_shell (cat/head) for quick content inspection.',
    )
    for (const p of ctx.textFilePaths) {
      lines.push(`<file path="${p}" />`)
    }
    lines.push('</context_files>')
  }

  // File-switch warning
  if (ctx.fileChanged) {
    lines.push(
      '<file_context_warning>',
      `This session was started while editing: ${ctx.previousFilePath ?? 'no file'}`,
      `Currently editing: ${ctx.filePath ?? 'no file'}`,
      'Block IDs from earlier in this conversation are invalid for the current file.',
      'Document tools now operate on the CURRENT editing file.',
      '</file_context_warning>'
    )
  }

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
export function buildSnapshot(editor: Editor, cursorPos?: number, filePath?: string): DocumentViewSnapshot {
  const view = _builder.build(editor)
  const pos = cursorPos ?? editor.state.selection.from
  const cursorBlockId = findBlockAtPos(pos, view.blockMap)
  return { view, editor, cursorBlockId, filePath }
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
