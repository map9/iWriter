/**
 * ContextBuilder — tool schema definitions + system prompt + EditorState injection.
 *
 * getSystemPrompt(profile)          — pure static text from system-prompts/*.ts
 * buildEditorStateBlock(...)        — delta-based XML prepended to each user message;
 *                                     injects only what changed since the last message
 * buildSnapshot(editor, pos?, path?) — DocumentViewSnapshot used by tools and EditorState
 */

import type { AiAgentProfile, AiThread, OpenTabInfo } from '@/types/ai'
import type { LMTool } from '../providers/types'
import type { Editor } from '@tiptap/core'
import { DocumentViewBuilder, type DocumentView } from '../edit-agent/DocumentViewBuilder'
import { WRITE_SYSTEM_PROMPT } from './system-prompts/write'
import { ASK_SYSTEM_PROMPT } from './system-prompts/ask'
import { MINIMAL_SYSTEM_PROMPT } from './system-prompts/minimal'

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

// ── System Prompt ──────────────────────────────────────────────────────────

/**
 * Return the static system prompt for a given profile.
 * Contains only role/capability instructions — no dynamic context.
 */
export function getSystemPrompt(profile: AiAgentProfile): string {
  switch (profile) {
    case 'write':   return WRITE_SYSTEM_PROMPT
    case 'ask':     return ASK_SYSTEM_PROMPT
    case 'minimal':
    default:        return MINIMAL_SYSTEM_PROMPT
  }
}

// ── EditorState Block ──────────────────────────────────────────────────────

/** Block count threshold: inline content when ≤ this, otherwise IDs only. */
const INLINE_BLOCK_THRESHOLD = 5

/** Lightweight hash for detecting document state changes across messages. */
function hashEditorState(
  filePath: string | null,
  outlineText: string,
  sectionHeading: string | null
): string {
  const input = `${filePath ?? 'none'}|${outlineText}|${sectionHeading ?? ''}`
  let h = 0
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  return h.toString(36)
}

/** Return block displayIds covered by the editor's current selection (empty if no selection). */
function getSelectionBlockIds(snapshot: DocumentViewSnapshot): number[] {
  const { from, to } = snapshot.editor.state.selection
  if (from === to) return []
  return snapshot.view.blockMap
    .filter(b => b.from < to && b.to > from)
    .map(b => b.displayId)
}

type CursorSectionNode = {
  heading: string | null
  sectionStartBlockId: number | null
  cursorBlockId: number
}

/** Build cursor section info from snapshot. Returns null if cursor position unknown. */
function buildCursorSectionNode(
  snapshot: DocumentViewSnapshot,
  _builder: DocumentViewBuilder
): CursorSectionNode | null {
  const { cursorBlockId, view } = snapshot
  if (cursorBlockId === null) return null

  const sectionHeading = findContainingHeading(cursorBlockId, view)

  if (sectionHeading) {
    return {
      heading: sectionHeading.text,
      sectionStartBlockId: sectionHeading.displayId,
      cursorBlockId,
    }
  }

  // No heading — cursor is at doc start or before first heading
  return {
    heading: null,
    sectionStartBlockId: null,
    cursorBlockId,
  }
}

function appendCursorSectionXml(
  lines: string[],
  node: CursorSectionNode,
  indent: string
): void {
  const headingAttr = node.heading ? ` heading="${node.heading}"` : ''
  const startAttr = node.sectionStartBlockId !== null ? ` section_start="{b:${node.sectionStartBlockId}}"` : ''
  const cursorAttr = ` cursor="{b:${node.cursorBlockId}}"`
  lines.push(`${indent}<cursor_section${headingAttr}${startAttr}${cursorAttr} />`)
}

function appendSelectionXml(
  lines: string[],
  snapshot: DocumentViewSnapshot,
  builder: DocumentViewBuilder,
  indent: string
): void {
  const selIds = getSelectionBlockIds(snapshot)
  if (!selIds.length) return
  const idsAttr = ` block_ids="[${selIds.join(',')}]"`
  if (selIds.length <= INLINE_BLOCK_THRESHOLD) {
    const content = builder.buildRangeView(
      snapshot.editor, selIds[0]!, selIds[selIds.length - 1]!, snapshot.view.blockMap
    )
    lines.push(`${indent}<selection${idsAttr}>`)
    lines.push(content)
    lines.push(`${indent}</selection>`)
  } else {
    const hint = ` hint="Use get_blocks([${selIds.join(',')}]) to read selected content."`
    lines.push(`${indent}<selection${idsAttr}${hint} />`)
  }
}

export interface EditorStateContext {
  filePath: string | null
  isDirty: boolean
  folderPath: string | null
  openTabs: OpenTabInfo[]
  textFilePaths: string[]
  attachedDirectories: string[]
}

export interface EditorStateResult {
  /** The <editor_state> XML to prepend to the user message, or null if nothing changed. */
  xml: string | null
  /** Delta tracking fields to save back to the thread after injection. */
  threadUpdate: {
    editorStateHash?: string
    lastFilePath?: string | null
    lastSectionHeading?: string | null
    workspaceInjected?: boolean
  }
}

/**
 * Build an <editor_state> XML block to prepend to a user message.
 * Implements delta logic: only injects what has changed since the last message.
 * Returns null xml when no context changed (and no attachments).
 */
export function buildEditorStateBlock(
  thread: AiThread,
  snapshot: DocumentViewSnapshot | null,
  ctx: EditorStateContext
): EditorStateResult {
  const builder = _builder
  const isFirstMsg = (thread.messages?.length ?? 0) <= 1
  const hasAttachments = ctx.textFilePaths.length > 0 || ctx.attachedDirectories.length > 0

  const sectionNode = snapshot ? buildCursorSectionNode(snapshot, builder) : null
  const cursorHeading = sectionNode?.heading ?? null

  const currentHash = snapshot
    ? hashEditorState(ctx.filePath, snapshot.view.outlineText, cursorHeading)
    : ''

  const fileChanged =
    !isFirstMsg &&
    thread.lastFilePath !== undefined &&
    thread.lastFilePath !== ctx.filePath
  const hashChanged = currentHash !== (thread.editorStateHash ?? '')
  const sectionChanged =
    !isFirstMsg && !hashChanged && thread.lastSectionHeading !== cursorHeading

  type ChangeType = 'full' | 'file_changed' | 'document_content' | 'cursor_section' | 'attachments_only'
  let change: ChangeType | null

  if (isFirstMsg) {
    change = 'full'
  } else if (fileChanged) {
    change = 'file_changed'
  } else if (hashChanged && snapshot) {
    change = 'document_content'
  } else if (sectionChanged && sectionNode) {
    change = 'cursor_section'
  } else if (hasAttachments) {
    change = 'attachments_only'
  } else {
    change = null
  }

  // Compute thread update fields
  const threadUpdate: EditorStateResult['threadUpdate'] = {}
  if (change && change !== 'attachments_only') {
    threadUpdate.editorStateHash = currentHash
    threadUpdate.lastFilePath = ctx.filePath
    threadUpdate.lastSectionHeading = cursorHeading
    if (change === 'full') threadUpdate.workspaceInjected = true
  }

  if (!change) return { xml: null, threadUpdate }

  // Build XML
  const lines: string[] = []
  const prevAttr = fileChanged ? ` previous_file="${thread.lastFilePath ?? 'none'}"` : ''
  lines.push(`<editor_state change="${change}"${prevAttr}>`)

  // Workspace — first message only
  if (change === 'full' && ctx.folderPath) {
    lines.push(`  <workspace>${ctx.folderPath}</workspace>`)
  }

  // Active document — full / file_changed / document_content
  if (snapshot && (change === 'full' || change === 'file_changed' || change === 'document_content')) {
    const pathAttr = ctx.filePath ? ` path="${ctx.filePath}"` : ''
    const statusAttr = ctx.filePath
      ? ` status="${ctx.isDirty ? 'unsaved' : 'saved'}"`
      : ' status="unsaved_new"'
    lines.push(`  <active_document${pathAttr}${statusAttr}>`)
    lines.push('    <outline>')
    lines.push(snapshot.view.outlineText)
    lines.push('    </outline>')
    if (sectionNode) appendCursorSectionXml(lines, sectionNode, '    ')
    appendSelectionXml(lines, snapshot, builder, '    ')
    lines.push('  </active_document>')
  }

  // Cursor section only — cursor_section change
  if (change === 'cursor_section' && sectionNode) {
    appendCursorSectionXml(lines, sectionNode, '  ')
  }

  // Open tabs — first message only
  if (change === 'full' && ctx.openTabs.length > 0) {
    lines.push('  <open_tabs>')
    for (const tab of ctx.openTabs) {
      if (tab.path) {
        lines.push(`    <tab path="${tab.path}" status="${tab.isDirty ? 'unsaved' : 'saved'}" />`)
      } else {
        lines.push(`    <tab name="${tab.name}" status="unsaved_new" />`)
      }
    }
    lines.push('  </open_tabs>')
  }

  // Attached files and directories
  if (hasAttachments) {
    if (ctx.textFilePaths.length > 0) {
      lines.push('  <attached_files>')
      for (const p of ctx.textFilePaths) lines.push(`    <file path="${p}" />`)
      lines.push('  </attached_files>')
    }
    if (ctx.attachedDirectories.length > 0) {
      lines.push('  <attached_dirs>')
      for (const d of ctx.attachedDirectories) lines.push(`    <dir path="${d}" />`)
      lines.push('  </attached_dirs>')
    }
  }

  lines.push('</editor_state>')
  return { xml: lines.join('\n'), threadUpdate }
}

const _builder = new DocumentViewBuilder()

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
