/**
 * Tool registry — maps tool names to executor functions.
 *
 * Document access tools (get_document_outline, get_section, get_blocks, get_blocks_range)
 * are executed here, returning results directly to the LLM.
 *
 * Block edit tools (edit_block, insert_block, etc.) are NOT registered here —
 * they are intercepted by AgentRunner to produce BlockEditProposals that the
 * user must approve before the edit is applied.
 */

import type { AiToolCall, AiToolResult } from '@/types/ai'
import type { DocumentViewSnapshot } from '../thread/ContextBuilder'
import { FileTools } from './FileTools'
import { PermissionGate } from './PermissionGate'
import { registerShellTools } from './ShellTools'
import type { AiSettings } from '@/types/ai'
import {
  parseMarkdownBlocks,
  buildFileDocumentView,
  getSectionBlocks,
  formatBlocksWithMarkers,
} from '../edit-agent/FileDocumentView'

export type ToolExecutorFn = (args: Record<string, unknown>) => Promise<string>

export class ToolRegistry {
  private executors = new Map<string, ToolExecutorFn>()

  register(name: string, fn: ToolExecutorFn): void {
    this.executors.set(name, fn)
  }

  unregister(name: string): void {
    this.executors.delete(name)
  }

  has(name: string): boolean {
    return this.executors.has(name)
  }

  async execute(toolCall: AiToolCall): Promise<AiToolResult> {
    const fn = this.executors.get(toolCall.name)
    if (!fn) {
      return {
        toolCallId: toolCall.id,
        content: `Error: Unknown tool "${toolCall.name}".`,
        isError: true,
      }
    }

    try {
      const content = await fn(toolCall.arguments)
      return { toolCallId: toolCall.id, content }
    } catch (err) {
      return {
        toolCallId: toolCall.id,
        content: `Error executing "${toolCall.name}": ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }
}

/**
 * Create and populate a ToolRegistry with built-in tools.
 *
 * @param getSnapshot     Returns the current DocumentViewSnapshot (built once per sendMessage call)
 * @param getSettings     Returns current AiSettings (for PermissionGate)
 * @param getWorkspace    Returns current workspace folder path
 * @param getFilePath     Returns the currently active editing file path (for open-file detection)
 */
export function createToolRegistry(
  getSnapshot: () => DocumentViewSnapshot | null,
  getSettings: () => AiSettings,
  getWorkspace: () => string | null,
  getFilePath: () => string | null = () => null
): ToolRegistry {
  const registry = new ToolRegistry()

  const gate = new PermissionGate(getSettings, getWorkspace)
  const fileTools = new FileTools(gate, getWorkspace)

  // ── Shell tool ──────────────────────────────────────────────────────────
  registerShellTools(registry, getWorkspace)

  // ── File system tools ────────────────────────────────────────────────────

  registry.register('read_file', async (args) => {
    return fileTools.readFile(String(args.path ?? ''))
  })

  registry.register('list_directory', async (args) => {
    return fileTools.listDirectory(String(args.path ?? '.'))
  })

  registry.register('write_file', async (args) => {
    return fileTools.writeFile(String(args.path ?? ''), String(args.content ?? ''))
  })

  // ── File-backed document view helpers ────────────────────────────────────

  /** File extensions readable by document tools (get_document_outline, get_section, etc.) */
  const SUPPORTED_DOC_EXTS = new Set(['md', 'txt', 'iwt'])

  /**
   * Load a FileDocumentView from disk.
   * Supports .md/.txt (raw Markdown) and .iwt (JSON with embedded HTML).
   */
  async function loadFileView(filePath: string): Promise<ReturnType<typeof buildFileDocumentView> | { error: string }> {
    const raw = await window.electronAPI.readFile(filePath)
    if (raw === null) return { error: `File not found or unreadable: "${filePath}"` }

    let markdown: string
    if (filePath.toLowerCase().endsWith('.iwt')) {
      try {
        const parsed = JSON.parse(raw) as { content?: string }
        const html = parsed.content ?? ''
        const { htmlToMarkdown } = await import('../../import-export/formatConverter')
        markdown = htmlToMarkdown(html)
      } catch {
        return {
          error:
            `File "${filePath}" is not valid .iwt JSON. ` +
            'It may have been corrupted by a raw write. ' +
            'Use exec_shell (cat) to read its raw content, or ask the user to recreate the file.',
        }
      }
    } else {
      markdown = raw
    }

    const blocks = parseMarkdownBlocks(markdown)
    return buildFileDocumentView(blocks)
  }

  /**
   * Resolve a file_path argument to a readable source:
   * 1. Unsupported extension → error string (use exec_shell instead)
   * 2. File is the active editor document → { useSnapshot: true } (caller falls through to getSnapshot())
   * 3. Otherwise → { view: FileDocumentView } loaded from disk
   */
  type ResolvedFileView =
    | { view: ReturnType<typeof buildFileDocumentView> }
    | { useSnapshot: true }
    | { error: string }

  async function resolveFileView(filePath: string): Promise<ResolvedFileView> {
    // Step 1: check extension
    const ext = filePath.toLowerCase().split('.').pop() ?? ''
    if (!SUPPORTED_DOC_EXTS.has(ext)) {
      return {
        error: `Document tools do not support ".${ext}" files. ` +
               `Use exec_shell (e.g., cat "${filePath}") to read this file instead.`,
      }
    }

    // Step 2: check if the file is already open in the active editor (use live in-memory state)
    const currentPath = getFilePath()
    if (currentPath) {
      const norm = (p: string) => p.replace(/\\/g, '/')
      if (norm(currentPath) === norm(filePath)) {
        return { useSnapshot: true }
      }
    }

    // Step 3: load from disk
    const result = await loadFileView(filePath)
    if ('error' in result) return result
    return { view: result }
  }

  // ── Document access tools ────────────────────────────────────────────────

  registry.register('get_document_outline', async (args) => {
    const filePath = args.file_path ? String(args.file_path) : null

    if (filePath) {
      const resolved = await resolveFileView(filePath)
      if ('error' in resolved) return resolved.error
      if ('view' in resolved) {
        const fileView = resolved.view
        const outlineItems = fileView.outline.map(e => ({
          block_id: e.displayId, level: e.level, text: e.text,
          section_blocks: e.sectionBlocks, word_count: e.wordCount,
        }))
        return JSON.stringify({ outline: outlineItems, total_blocks: fileView.totalBlocks, total_words: fileView.totalWords }, null, 2)
      }
      // useSnapshot: fall through to live editor branch
    }

    const snapshot = getSnapshot()
    if (!snapshot) return 'Error: No document is currently open.'

    const { view } = snapshot
    const outlineItems = view.outline.map(entry => ({
      block_id:       entry.displayId,
      level:          entry.level,
      text:           entry.text,
      section_blocks: entry.sectionBlocks,
      word_count:     entry.wordCount,
    }))

    return JSON.stringify({
      outline:      outlineItems,
      total_blocks: view.totalBlocks,
      total_words:  view.totalWords,
    }, null, 2)
  })

  registry.register('get_section', async args => {
    const filePath = args.file_path ? String(args.file_path) : null

    if (filePath) {
      const resolved = await resolveFileView(filePath)
      if ('error' in resolved) return resolved.error
      if ('view' in resolved) {
        const fileView = resolved.view

        const headingBlockId = Number(args.heading_block_id)
        if (!headingBlockId || isNaN(headingBlockId)) {
          const available = fileView.outline.map(h => `${h.displayId} ("${h.text}")`).join(', ')
          return `Error: heading_block_id is required. Available: ${available || '(no headings)'}.`
        }

        const sectionBlocks = getSectionBlocks(fileView, headingBlockId)
        if (!sectionBlocks.length) {
          const available = fileView.outline.map(h => `${h.displayId} ("${h.text}")`).join(', ')
          return `Error: No heading found with block_id ${headingBlockId}. Available: ${available}.`
        }

        const heading = fileView.outline.find(h => h.displayId === headingBlockId)
        const offset = args.offset !== undefined ? Math.max(0, Number(args.offset)) : 0
        const limit  = args.limit  !== undefined ? Math.max(1, Number(args.limit))  : 20
        const paged  = sectionBlocks.slice(offset, offset + limit)
        const hasMore = offset + limit < sectionBlocks.length

        return JSON.stringify({
          heading:        heading?.text ?? `Block ${headingBlockId}`,
          block_id_range: [sectionBlocks[0]!.displayId, sectionBlocks[sectionBlocks.length - 1]!.displayId],
          content:        formatBlocksWithMarkers(paged),
          has_more:       hasMore, offset, limit,
        }, null, 2)
      }
      // useSnapshot: fall through to live editor branch
    }

    const snapshot = getSnapshot()
    if (!snapshot) return 'Error: No document is currently open.'

    const headingBlockId = Number(args.heading_block_id)
    if (!headingBlockId || isNaN(headingBlockId)) {
      const availableIds = snapshot.view.outline.map(h => `${h.displayId} ("${h.text}")`).join(', ')
      return `Error: heading_block_id is required and must be a number. Available heading block IDs: ${availableIds || '(none — document has no headings)'}. Use the N from {b:N} in <document_outline>.`
    }

    const { DocumentViewBuilder } = await import('../edit-agent/DocumentViewBuilder')
    const builder = new DocumentViewBuilder()
    const result = builder.buildSectionView(snapshot.editor, headingBlockId, snapshot.view.blockMap)

    if (!result) {
      const availableIds = snapshot.view.outline.map(h => `${h.displayId} ("${h.text}")`).join(', ')
      return `Error: No heading found with block_id ${headingBlockId}. Available headings: ${availableIds}.`
    }

    const heading = snapshot.view.outline.find(h => h.displayId === headingBlockId)
    const offset   = args.offset !== undefined ? Math.max(0, Number(args.offset)) : 0
    const limit    = args.limit  !== undefined ? Math.max(1, Number(args.limit))  : 20
    const allLines = result.content.split('\n\n')
    const paged    = allLines.slice(offset, offset + limit)
    const hasMore  = offset + limit < allLines.length

    return JSON.stringify({
      heading:        heading?.text ?? `Block ${headingBlockId}`,
      block_id_range: result.blockIdRange,
      content:        paged.join('\n\n'),
      has_more:       hasMore,
      offset,
      limit,
    }, null, 2)
  })

  registry.register('get_blocks', async args => {
    const filePath = args.file_path ? String(args.file_path) : null

    if (filePath) {
      const resolved = await resolveFileView(filePath)
      if ('error' in resolved) return resolved.error
      if ('view' in resolved) {
        const fileView = resolved.view

        const ids = args.block_ids
        if (!Array.isArray(ids) || !ids.length) {
          return `Error: block_ids must be a non-empty array. File has ${fileView.totalBlocks} blocks.`
        }

        const numIds = new Set(ids.map(Number).filter(n => !isNaN(n)))
        const found = fileView.blocks.filter(b => numIds.has(b.displayId))
        return JSON.stringify(found.map(b => ({ block_id: b.displayId, type: b.type, content: b.content })), null, 2)
      }
      // useSnapshot: fall through to live editor branch
    }

    const snapshot = getSnapshot()
    if (!snapshot) return 'Error: No document is currently open.'

    const ids = args.block_ids
    if (!Array.isArray(ids) || !ids.length) {
      const total = snapshot.view.totalBlocks
      return `Error: block_ids must be a non-empty array of numbers. The document has ${total} block(s) numbered 1 to ${total}. Example: get_blocks(block_ids=[1, 2, 3]). Find IDs in <document_outline> or <current_section>.`
    }

    const numIds = ids.map(Number).filter(n => !isNaN(n))
    const { DocumentViewBuilder } = await import('../edit-agent/DocumentViewBuilder')
    const builder = new DocumentViewBuilder()
    const result = builder.buildBlocksView(snapshot.editor, numIds, snapshot.view.blockMap)

    return JSON.stringify(result, null, 2)
  })

  registry.register('get_block_context', async args => {
    const filePath = args.file_path ? String(args.file_path) : null

    if (filePath) {
      const resolved = await resolveFileView(filePath)
      if ('error' in resolved) return resolved.error
      if ('view' in resolved) {
        const fileView = resolved.view

        const blockId = Number(args.block_id)
        if (!blockId || isNaN(blockId)) {
          return `Error: block_id must be a valid block number (1 to ${fileView.totalBlocks}).`
        }

        const win = args.window !== undefined ? Math.max(1, Number(args.window)) : 3
        const idx = fileView.blocks.findIndex(b => b.displayId === blockId)
        if (idx === -1) return `Error: No block with block_id ${blockId}. Valid range: 1 to ${fileView.totalBlocks}.`

        const start = Math.max(0, idx - win)
        const end   = Math.min(fileView.blocks.length - 1, idx + win)
        const window_blocks = fileView.blocks.slice(start, end + 1)
        return JSON.stringify(
          window_blocks.map(b => ({ block_id: b.displayId, type: b.type, content: b.content, is_center: b.displayId === blockId })),
          null, 2
        )
      }
      // useSnapshot: fall through to live editor branch
    }

    const snapshot = getSnapshot()
    if (!snapshot) return 'Error: No document is currently open.'

    const blockId = Number(args.block_id)
    if (!blockId || isNaN(blockId)) {
      const total = snapshot.view.totalBlocks
      return `Error: block_id must be a valid block number (1 to ${total}). Find IDs in <document_outline> or <current_section>.`
    }

    const window = args.window !== undefined ? Math.max(1, Number(args.window)) : 3
    const { DocumentViewBuilder } = await import('../edit-agent/DocumentViewBuilder')
    const builder = new DocumentViewBuilder()
    const result = builder.buildBlockContext(snapshot.editor, blockId, snapshot.view.blockMap, window)

    if (!result.blocks.length) {
      const total = snapshot.view.totalBlocks
      return `Error: No block found with block_id ${blockId}. Valid range: 1 to ${total}.`
    }

    return JSON.stringify(result, null, 2)
  })

  return registry
}
