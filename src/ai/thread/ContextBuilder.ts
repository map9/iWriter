import type { AiAgentProfile } from '@/types/ai'
import type { LMTool } from '../providers/types'

// Maximum characters of document text sent to the LLM
const MAX_DOC_CHARS = 12000

// ── Tool Schema Definitions ────────────────────────────────────────────────

/** Edit the currently open document using an old/new text pair. */
const TOOL_EDIT_DOCUMENT: LMTool = {
  name: 'edit_document',
  description:
    'Make a targeted edit to the currently open document. ' +
    'Specify the exact text to replace (old_text) and its replacement (new_text). ' +
    'old_text must appear verbatim (or very closely) in the document. ' +
    'Use multiple calls for multiple separate edits.',
  parameters: {
    type: 'object',
    properties: {
      old_text: {
        type: 'string',
        description: 'The exact text segment to replace. Must exist in the document.',
      },
      new_text: {
        type: 'string',
        description: 'The replacement text.',
      },
      description: {
        type: 'string',
        description: 'One-sentence summary of what this edit does (shown to the user).',
      },
    },
    required: ['old_text', 'new_text', 'description'],
  },
}

/** Read a file from the workspace. */
const TOOL_READ_FILE: LMTool = {
  name: 'read_file',
  description: 'Read the contents of a file in the current workspace folder.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to the workspace folder root.',
      },
    },
    required: ['path'],
  },
}

/** List files in a directory. */
const TOOL_LIST_DIRECTORY: LMTool = {
  name: 'list_directory',
  description:
    'List files and subdirectories in a workspace directory. ' +
    'Use "." for the workspace root.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to the workspace folder root.',
      },
    },
    required: ['path'],
  },
}

/** Write content to an existing file. */
const TOOL_WRITE_FILE: LMTool = {
  name: 'write_file',
  description: 'Overwrite a file in the workspace with new content.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to the workspace folder root.',
      },
      content: {
        type: 'string',
        description: 'The new file content.',
      },
    },
    required: ['path', 'content'],
  },
}

/** Create a new document file. */
const TOOL_CREATE_DOCUMENT: LMTool = {
  name: 'create_document',
  description:
    'Create a new document file in the current workspace folder. ' +
    'The file will be created on disk but not automatically opened in the editor.',
  parameters: {
    type: 'object',
    properties: {
      file_name: {
        type: 'string',
        description:
          'File name with extension (e.g. "summary.md"). ' +
          'Do not include directory separators.',
      },
      content: {
        type: 'string',
        description: 'Initial content for the new document.',
      },
      description: {
        type: 'string',
        description: 'One-sentence summary of the document purpose.',
      },
    },
    required: ['file_name', 'content', 'description'],
  },
}

// ── Profile → Tool Set Mapping ────────────────────────────────────────────

const TOOL_SETS: Record<AiAgentProfile, LMTool[]> = {
  write: [
    TOOL_EDIT_DOCUMENT,
    TOOL_READ_FILE,
    TOOL_LIST_DIRECTORY,
    TOOL_WRITE_FILE,
    TOOL_CREATE_DOCUMENT,
  ],
  ask: [TOOL_READ_FILE, TOOL_LIST_DIRECTORY],
  minimal: [],
}

export function getToolsForProfile(profile: AiAgentProfile): LMTool[] {
  return TOOL_SETS[profile]
}

// ── System Prompt Builder ─────────────────────────────────────────────────

export interface DocumentContext {
  documentText: string
  selectionText?: string
  filePath?: string | null
  folderPath?: string | null
}

/**
 * Build the system prompt that is prepended to every request.
 * Includes document context formatted as XML tags (Anthropic best practice,
 * but universally understood by all major models).
 */
export function buildSystemPrompt(
  profile: AiAgentProfile,
  ctx: DocumentContext
): string {
  const lines: string[] = []

  lines.push(
    'You are an intelligent writing assistant integrated into iWriter, a document editor.',
    'Help the user write, edit, and improve their documents.',
    ''
  )

  // Profile instructions
  if (profile === 'write') {
    lines.push(
      'You have tools to edit the current document and manage files in the workspace.',
      'When the user asks you to edit, expand, condense, rewrite, or otherwise modify content,',
      'use the edit_document tool to propose changes.',
      'When the user asks to create a new document, use the create_document tool.',
      'When you need to read files for context, use read_file or list_directory.',
      ''
    )
  } else if (profile === 'ask') {
    lines.push(
      'You can read files in the workspace to answer questions.',
      'You cannot make edits — provide suggestions as text instead.',
      ''
    )
  } else {
    lines.push(
      'Respond based only on the document context provided below.',
      'Do not use any tools.',
      ''
    )
  }

  lines.push(
    'Output format rules:',
    '- When producing document content (not tool calls), write plain text matching the document style.',
    '- Do not use markdown code fences unless writing code.',
    '- Keep responses concise unless the user asks for elaboration.',
    ''
  )

  // Document context
  if (ctx.filePath) {
    lines.push(`<current_file>${ctx.filePath}</current_file>`)
  }

  if (ctx.folderPath) {
    lines.push(`<workspace_folder>${ctx.folderPath}</workspace_folder>`)
  }

  if (ctx.selectionText) {
    lines.push(
      `<selected_text>`,
      ctx.selectionText,
      `</selected_text>`
    )
  }

  if (ctx.documentText) {
    const truncated =
      ctx.documentText.length > MAX_DOC_CHARS
        ? `${ctx.documentText.slice(0, MAX_DOC_CHARS)}\n[... document truncated ...]`
        : ctx.documentText

    lines.push(
      `<document_content>`,
      truncated,
      `</document_content>`
    )
  }

  return lines.join('\n')
}
