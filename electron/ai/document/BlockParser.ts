/**
 * BlockParser — implements document query operations on SerializedSnapshot.
 *
 * This is the main-process equivalent of DocumentViewBuilder's query methods,
 * operating on pure JSON data instead of a live TipTap Editor instance.
 */

import type { SerializedSnapshot } from '../ipc/protocol'

/**
 * 单页内容预算（字符数），块级读写协议 A4.1。
 * 分页以"内容预算"而非"段数"为单位，以块为最小单位聚集、绝不切开块
 * （修复缺陷①读得太碎、②分页不自适应）。超出预算的单个大块独占一页。
 */
export const DEFAULT_PAGE_BUDGET = 4000

export class BlockParser {
  /**
   * Returns the document outline (headings + stats).
   */
  static getDocumentOutline(snapshot: SerializedSnapshot): string {
    const outlineItems = snapshot.outline.map(entry => ({
      block_id: entry.displayId,
      level: entry.level,
      text: entry.text,
      section_blocks: entry.sectionBlocks,
      word_count: entry.wordCount,
    }))
    return JSON.stringify(
      {
        outline: outlineItems,
        total_blocks: snapshot.totalBlocks,
        total_words: snapshot.totalWords,
      },
      null,
      2
    )
  }

  /**
   * Returns the content of a section starting from a heading block.
   *
   * Pagination is block-atomic and by content budget (A4.1): starting at block
   * index `offset` within the section, blocks are accumulated until adding the
   * next block would exceed `budget` characters. A block is never split; a single
   * over-budget block occupies its own page. `next_offset` cursors the next page.
   */
  static getSection(
    snapshot: SerializedSnapshot,
    headingBlockId: number,
    offset = 0,
    budget = DEFAULT_PAGE_BUDGET
  ): string {
    const headingEntry = snapshot.blockMap.find(
      b => b.displayId === headingBlockId && b.nodeType === 'heading'
    )
    if (!headingEntry) {
      const available = snapshot.outline
        .map(h => `${h.displayId} ("${h.text}")`)
        .join(', ')
      throw new Error(`No heading found with block_id ${headingBlockId}. Available headings: ${available || '(none)'}.`)
    }

    const headingLevel = headingEntry.headingLevel ?? 1

    // Find section end: next heading of same or higher level
    let sectionEnd = snapshot.blockMap[snapshot.blockMap.length - 1]?.displayId ?? headingBlockId
    for (const entry of snapshot.blockMap) {
      if (entry.displayId <= headingBlockId) continue
      if (entry.nodeType === 'heading' && (entry.headingLevel ?? 1) <= headingLevel) {
        sectionEnd = entry.displayId - 1
        break
      }
    }

    const sectionAll = snapshot.blockMap.filter(
      b => b.displayId >= headingBlockId && b.displayId <= sectionEnd
    )
    // Container blocks (lists) are addressable-only; they do not participate in the
    // linear content flow (their item leaves render individually). They are surfaced
    // via the `containers` sidecar so the LLM can target whole-list edits (A4.2).
    const sectionBlocks = sectionAll.filter(b => !b.isContainer)
    const sectionContainers = sectionAll.filter(b => b.isContainer)

    // Block-atomic content-budget pagination
    const startIdx = Math.min(Math.max(0, offset), sectionBlocks.length)
    const effectiveBudget = Math.max(1, budget)
    const page: typeof sectionBlocks = []
    let used = 0
    let cursor = startIdx
    for (; cursor < sectionBlocks.length; cursor++) {
      const entry = sectionBlocks[cursor]!
      const size = entry.charCount ?? entry.content.length
      // Always include at least one block; otherwise stop before exceeding budget.
      if (page.length > 0 && used + size > effectiveBudget) break
      page.push(entry)
      used += size
      // A single over-budget block occupies its own page.
      if (size >= effectiveBudget) { cursor++; break }
    }
    const nextOffset = cursor
    const hasMore = nextOffset < sectionBlocks.length

    const content = page.map(entry => `{b:${entry.displayId}}\n${entry.content}`).join('\n\n')
    const pageRange: [number, number] = page.length
      ? [page[0]!.displayId, page[page.length - 1]!.displayId]
      : [headingBlockId, headingBlockId]

    const heading = snapshot.outline.find(h => h.displayId === headingBlockId)

    // Container sidecar: for each list container whose items appear on this page,
    // expose { block_id, type, item_block_ids } so the LLM can do a whole-list edit
    // (structural change) by calling edit_block on the container block_id.
    const pageIds = new Set(page.map(p => p.displayId))
    const containers = sectionContainers
      .map(c => {
        const itemBlockIds = sectionBlocks
          .filter(b => b.containerId === c.displayId)
          .map(b => b.displayId)
        return { block_id: c.displayId, type: c.nodeType, item_block_ids: itemBlockIds }
      })
      .filter(c => c.item_block_ids.some(id => pageIds.has(id)))

    return JSON.stringify(
      {
        heading: heading?.text ?? `Block ${headingBlockId}`,
        block_id_range: [headingBlockId, sectionEnd],
        page_block_id_range: pageRange,
        content,
        has_more: hasMore,
        offset: startIdx,
        next_offset: nextOffset,
        budget: effectiveBudget,
        chars_returned: used,
        blocks_returned: page.length,
        total_section_blocks: sectionBlocks.length,
        ...(containers.length
          ? {
              containers,
              containers_hint:
                'For structural list changes (add/remove/reorder/nest items), call edit_block on the container block_id with the whole list markdown as new_content. For a single item text tweak, edit its item block_id directly.',
            }
          : {}),
        word_count: heading?.wordCount ?? 0,
      },
      null,
      2
    )
  }

  /**
   * Returns the content of specific blocks by display ID.
   */
  static getBlocks(
    snapshot: SerializedSnapshot,
    blockIds: number[]
  ): string {
    if (!blockIds.length) {
      return `Error: block_ids must be a non-empty array of numbers. The document has ${snapshot.totalBlocks} block(s).`
    }

    const missingBlockIds: number[] = []
    const blocks = blockIds.map(id => {
      const entry = snapshot.blockMap.find(b => b.displayId === id)
      if (!entry) {
        missingBlockIds.push(id)
        return { blockId: id, type: 'unknown', content: '(block not found)' }
      }
      return {
        blockId: id,
        type: entry.nodeType,
        content: `{b:${id}}\n${entry.content}`,
        // Two-level model (A4.2): a list container returns the whole list markdown;
        // a list item exposes its container so structural edits can target it.
        ...(entry.isContainer ? { is_container: true } : {}),
        ...(entry.containerId !== undefined ? { container_block_id: entry.containerId } : {}),
      }
    })

    return JSON.stringify({
      blocks,
      ...(missingBlockIds.length
        ? {
            status: 'partial_error',
            missing_block_ids: missingBlockIds,
            error:
              'Some block IDs were not found. The block IDs may be stale after document edits. ' +
              'Call get_document_outline(file_path=...) first, then retry with refreshed block IDs. Do not repeat the same call unchanged.',
          }
        : {}),
    }, null, 2)
  }

  /**
   * Returns blocks surrounding a target block (context window).
   */
  static getBlockContext(
    snapshot: SerializedSnapshot,
    blockId: number,
    windowSize = 3
  ): string {
    const centerIndex = snapshot.blockMap.findIndex(b => b.displayId === blockId)
    if (centerIndex === -1) {
      return `Error: No block found with block_id ${blockId}. Valid range: 1 to ${snapshot.totalBlocks}.`
    }

    const start = Math.max(0, centerIndex - windowSize)
    const end = Math.min(snapshot.blockMap.length - 1, centerIndex + windowSize)
    const entries = snapshot.blockMap.slice(start, end + 1)

    const blocks = entries.map(entry => ({
      blockId: entry.displayId,
      type: entry.nodeType,
      content: `{b:${entry.displayId}}\n${entry.content}`,
    }))

    return JSON.stringify({ blocks, centerBlockId: blockId }, null, 2)
  }
}
