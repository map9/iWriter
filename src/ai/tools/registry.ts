/**
 * Tool registry — maps tool names to executor functions.
 *
 * Document access tools (get_document_outline, get_section, get_blocks, get_block_context)
 * are executed here, returning results directly to the LLM.
 *
 * Block edit tools (edit_block, insert_block, etc.) are NOT registered here —
 * they are intercepted by AgentRunner to produce BlockEditProposals that the
 * user must approve before the edit is applied.
 */

import type { AiToolCall, AiToolResult } from '@/types/ai'
import type { DocumentViewSnapshot } from '../thread/ContextBuilder'
import { UnifiedDocumentAccess, type DocumentHandle } from '../edit-agent/UnifiedDocumentAccess'
import { DocumentViewBuilder } from '../edit-agent/DocumentViewBuilder'
import { FileTools } from './FileTools'
import { PermissionGate } from './PermissionGate'
import { registerShellTools } from './ShellTools'
import type { AiSettings } from '@/types/ai'
import { pathUtils } from '@/utils/pathUtils'

const _docViewBuilder = new DocumentViewBuilder()

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

  /** Dispose all cached virtual editors. Call after each sendMessage() completes. */
  disposeAll(): void {
    UnifiedDocumentAccess.disposeAll()
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

  // ── Document access tools ────────────────────────────────────────────────
  // All file extensions that block document tools support
  const SUPPORTED_DOC_EXTS = new Set(['md', 'txt', 'iwt'])

  /**
   * Resolve a file_path argument to a DocumentHandle:
   * 1. No file_path → use active editor snapshot
   * 2. file_path == active editing file → use active editor snapshot (includes unsaved changes)
   * 3. file_path == different file → load via UnifiedDocumentAccess (virtual editor, cached)
   */
  async function resolveDocumentHandle(
    filePath: string | null
  ): Promise<DocumentHandle | { error: string }> {
    // No file_path → active editor
    if (!filePath) {
      const snapshot = getSnapshot()
      if (!snapshot) return { error: 'No document is currently open.' }
      return UnifiedDocumentAccess.fromEditor(snapshot.editor, snapshot.filePath)
    }

    // file_path matches active editor → use in-memory snapshot (includes unsaved changes)
    const currentPath = getFilePath()
    if (currentPath) {
      if (pathUtils.normalize(currentPath) === pathUtils.normalize(filePath)) {
        const snapshot = getSnapshot()
        if (!snapshot) return { error: 'No document is currently open.' }
        return UnifiedDocumentAccess.fromEditor(snapshot.editor, snapshot.filePath)
      }
    }

    // Different file → virtual editor (cached per sendMessage)
    const ext = pathUtils.extension(filePath)
    if (!SUPPORTED_DOC_EXTS.has(ext)) {
      return {
        error:
          `Document tools do not support ".${ext}" files. ` +
          `Use exec_shell (e.g., cat "${filePath}") to read this file instead.`,
      }
    }
    return UnifiedDocumentAccess.fromFile(filePath)
  }

  // ── get_document_outline ─────────────────────────────────────────────────

  registry.register('get_document_outline', async (args) => {
    const filePath = args.file_path ? String(args.file_path) : null
    const result = await resolveDocumentHandle(filePath)
    if ('error' in result) return result.error

    const { view } = result.snapshot
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

  // ── get_section ──────────────────────────────────────────────────────────

  registry.register('get_section', async (args) => {
    const filePath = args.file_path ? String(args.file_path) : null
    const result = await resolveDocumentHandle(filePath)
    if ('error' in result) return result.error

    const { view, editor } = result.snapshot

    const headingBlockId = Number(args.heading_block_id)
    if (!headingBlockId || isNaN(headingBlockId)) {
      const available = view.outline.map(h => `${h.displayId} ("${h.text}")`).join(', ')
      return `Error: heading_block_id is required. Available: ${available || '(no headings)'}.`
    }

    const sectionResult = _docViewBuilder.buildSectionView(editor, headingBlockId, view.blockMap)

    if (!sectionResult) {
      const available = view.outline.map(h => `${h.displayId} ("${h.text}")`).join(', ')
      return `Error: No heading found with block_id ${headingBlockId}. Available headings: ${available}.`
    }

    const heading = view.outline.find(h => h.displayId === headingBlockId)
    const offset   = args.offset !== undefined ? Math.max(0, Number(args.offset)) : 0
    const limit    = args.limit  !== undefined ? Math.max(1, Number(args.limit))  : 20
    const allLines = sectionResult.content.split('\n\n')
    const paged    = allLines.slice(offset, offset + limit)
    const hasMore  = offset + limit < allLines.length

    return JSON.stringify({
      heading:        heading?.text ?? `Block ${headingBlockId}`,
      block_id_range: sectionResult.blockIdRange,
      content:        paged.join('\n\n'),
      has_more:       hasMore,
      offset,
      limit,
    }, null, 2)
  })

  // ── get_blocks ───────────────────────────────────────────────────────────

  registry.register('get_blocks', async (args) => {
    const filePath = args.file_path ? String(args.file_path) : null
    const result = await resolveDocumentHandle(filePath)
    if ('error' in result) return result.error

    const { view, editor } = result.snapshot

    const ids = args.block_ids
    if (!Array.isArray(ids) || !ids.length) {
      return `Error: block_ids must be a non-empty array of numbers. The document has ${view.totalBlocks} block(s). Example: get_blocks(block_ids=[1, 2, 3]).`
    }

    const numIds = ids.map(Number).filter(n => !isNaN(n))
    const blocks = _docViewBuilder.buildBlocksView(editor, numIds, view.blockMap)
    return JSON.stringify(blocks, null, 2)
  })

  // ── get_block_context ────────────────────────────────────────────────────

  registry.register('get_block_context', async (args) => {
    const filePath = args.file_path ? String(args.file_path) : null
    const result = await resolveDocumentHandle(filePath)
    if ('error' in result) return result.error

    const { view, editor } = result.snapshot

    const blockId = Number(args.block_id)
    if (!blockId || isNaN(blockId)) {
      return `Error: block_id must be a valid block number (1 to ${view.totalBlocks}). Find IDs in document outline or section views.`
    }

    const window_ = args.window !== undefined ? Math.max(1, Number(args.window)) : 3
    const contextResult = _docViewBuilder.buildBlockContext(editor, blockId, view.blockMap, window_)

    if (!contextResult.blocks.length) {
      return `Error: No block found with block_id ${blockId}. Valid range: 1 to ${view.totalBlocks}.`
    }

    return JSON.stringify(contextResult, null, 2)
  })

  return registry
}
