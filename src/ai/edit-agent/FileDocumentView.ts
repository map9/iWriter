/**
 * FileDocumentView — lightweight markdown parser for LLM document tool access on local files.
 *
 * Produces a DocumentView-compatible structure from raw markdown text WITHOUT needing
 * a TipTap Editor instance. Used by document read tools when a file_path argument is provided.
 *
 * Block IDs assigned here are sequential text-based IDs, suitable for reading only.
 * Edit tools (edit_block etc.) require real TipTap node IDs and should not use this.
 */

export interface FileBlock {
  displayId: number
  type: 'heading' | 'paragraph' | 'code' | 'list_item' | 'blockquote' | 'other'
  level?: number    // heading level 1-6
  content: string   // raw markdown for this block
}

export interface FileOutlineEntry {
  displayId: number
  level: number
  text: string
  sectionBlocks: number
  wordCount: number
}

export interface FileDocumentView {
  blocks: FileBlock[]
  outline: FileOutlineEntry[]
  totalBlocks: number
  totalWords: number
  outlineText: string
}

/** Split markdown into logical blocks (blank-line separated, with code fence awareness). */
export function parseMarkdownBlocks(markdown: string): FileBlock[] {
  const lines = markdown.split('\n')
  const rawBlocks: string[] = []
  let current: string[] = []
  let inCodeFence = false
  let codeFenceMark = ''

  for (const line of lines) {
    // Track code fences to avoid splitting inside them
    const fenceMatch = line.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (!inCodeFence) {
        inCodeFence = true
        codeFenceMark = fenceMatch[1]!
        current.push(line)
      } else if (line.trimEnd() === codeFenceMark || line.startsWith(codeFenceMark)) {
        inCodeFence = false
        current.push(line)
        rawBlocks.push(current.join('\n'))
        current = []
      } else {
        current.push(line)
      }
      continue
    }

    if (inCodeFence) {
      current.push(line)
      continue
    }

    if (line.trim() === '') {
      if (current.length > 0) {
        rawBlocks.push(current.join('\n'))
        current = []
      }
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) rawBlocks.push(current.join('\n'))

  const blocks: FileBlock[] = []
  let displayId = 0

  for (const raw of rawBlocks) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    displayId++

    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)/)
      if (match) {
        blocks.push({
          displayId,
          type: 'heading',
          level: match[1]!.length,
          content: trimmed,
        })
        continue
      }
    }

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      blocks.push({ displayId, type: 'code', content: trimmed })
      continue
    }

    if (trimmed.startsWith('> ') || trimmed === '>') {
      blocks.push({ displayId, type: 'blockquote', content: trimmed })
      continue
    }

    if (/^[-*+] |^\d+\. /.test(trimmed)) {
      blocks.push({ displayId, type: 'list_item', content: trimmed })
      continue
    }

    blocks.push({ displayId, type: 'paragraph', content: trimmed })
  }

  return blocks
}

function countWords(text: string): number {
  // Count CJK characters as individual words; split Latin on whitespace
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const latin = (text.match(/\b\w+\b/g) ?? []).length
  return cjk + latin
}

/** Build the full document view from parsed blocks. */
export function buildFileDocumentView(blocks: FileBlock[]): FileDocumentView {
  const outline: FileOutlineEntry[] = []
  let totalWords = 0

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    totalWords += countWords(block.content)

    if (block.type === 'heading') {
      // Count how many blocks are in this section
      const headingLevel = block.level ?? 1
      let sectionBlocks = 0
      let sectionWords = 0
      for (let j = i + 1; j < blocks.length; j++) {
        const next = blocks[j]!
        if (next.type === 'heading' && (next.level ?? 1) <= headingLevel) break
        sectionBlocks++
        sectionWords += countWords(next.content)
      }
      const headingText = block.content.replace(/^#{1,6}\s+/, '').trim()
      outline.push({
        displayId: block.displayId,
        level: headingLevel,
        text: headingText,
        sectionBlocks,
        wordCount: sectionWords,
      })
    }
  }

  const outlineLines: string[] = []
  for (const entry of outline) {
    const indent = '  '.repeat(entry.level - 1)
    const prefix = '#'.repeat(entry.level)
    outlineLines.push(
      `{b:${entry.displayId}} ${indent}${prefix} ${entry.text}  (${entry.sectionBlocks} blocks, ~${entry.wordCount} words)`
    )
  }

  return {
    blocks,
    outline,
    totalBlocks: blocks.length,
    totalWords,
    outlineText: outlineLines.join('\n'),
  }
}

/** Get all blocks that belong to a section starting at the given heading display ID. */
export function getSectionBlocks(
  view: FileDocumentView,
  headingDisplayId: number
): FileBlock[] {
  const headingIdx = view.blocks.findIndex(b => b.displayId === headingDisplayId)
  if (headingIdx === -1) return []

  const headingBlock = view.blocks[headingIdx]!
  if (headingBlock.type !== 'heading') return []
  const headingLevel = headingBlock.level ?? 1

  const result: FileBlock[] = [headingBlock]
  for (let i = headingIdx + 1; i < view.blocks.length; i++) {
    const block = view.blocks[i]!
    if (block.type === 'heading' && (block.level ?? 1) <= headingLevel) break
    result.push(block)
  }
  return result
}

/** Format a list of blocks as a Markdown string with {b:N} markers. */
export function formatBlocksWithMarkers(blocks: FileBlock[]): string {
  return blocks.map(b => `{b:${b.displayId}}\n${b.content}`).join('\n\n')
}
