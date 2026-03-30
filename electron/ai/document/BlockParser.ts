/**
 * BlockParser — implements document query operations on SerializedSnapshot.
 *
 * This is the main-process equivalent of DocumentViewBuilder's query methods,
 * operating on pure JSON data instead of a live TipTap Editor instance.
 */

import type { SerializedSnapshot, SerializedBlockEntry } from '../ipc/protocol'

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
   */
  static getSection(
    snapshot: SerializedSnapshot,
    headingBlockId: number,
    offset = 0,
    limit = 20
  ): string {
    const headingEntry = snapshot.blockMap.find(
      b => b.displayId === headingBlockId && b.nodeType === 'heading'
    )
    if (!headingEntry) {
      const available = snapshot.outline
        .map(h => `${h.displayId} ("${h.text}")`)
        .join(', ')
      return `Error: No heading found with block_id ${headingBlockId}. Available headings: ${available || '(none)'}.`
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

    const sectionBlocks = snapshot.blockMap.filter(
      b => b.displayId >= headingBlockId && b.displayId <= sectionEnd
    )

    const allLines = sectionBlocks
      .map(entry => `{b:${entry.displayId}}\n${entry.content}`)
      .join('\n\n')
      .split('\n\n')

    const paged = allLines.slice(offset, offset + limit)
    const hasMore = offset + limit < allLines.length

    const heading = snapshot.outline.find(h => h.displayId === headingBlockId)

    return JSON.stringify(
      {
        heading: heading?.text ?? `Block ${headingBlockId}`,
        block_id_range: [headingBlockId, sectionEnd],
        content: paged.join('\n\n'),
        has_more: hasMore,
        offset,
        limit,
        total_lines: allLines.length,
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

    const blocks = blockIds.map(id => {
      const entry = snapshot.blockMap.find(b => b.displayId === id)
      if (!entry) return { blockId: id, type: 'unknown', content: '(block not found)' }
      return {
        blockId: id,
        type: entry.nodeType,
        content: `{b:${id}}\n${entry.content}`,
      }
    })

    return JSON.stringify({ blocks }, null, 2)
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

  /**
   * Resolve a file_path argument:
   * - null / '' → use active editor snapshot (filePath null)
   * - matches current active file → use active editor snapshot
   * - different file → return the filePath for SnapshotBroker to fetch
   */
  static resolveFilePath(
    argFilePath: string | null | undefined,
    _activeFilePath: string | null
  ): string | null {
    return (argFilePath && argFilePath.trim()) ? argFilePath : null
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}
