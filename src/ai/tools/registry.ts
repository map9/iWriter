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
 * @param getSnapshot  Returns the current DocumentViewSnapshot (built once per sendMessage call)
 */
export function createToolRegistry(
  getSnapshot: () => DocumentViewSnapshot | null
): ToolRegistry {
  const registry = new ToolRegistry()

  // ── Document access tools ────────────────────────────────────────────────

  registry.register('get_document_outline', async () => {
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
