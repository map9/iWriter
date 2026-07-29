/**
 * DocumentViewBuilder — converts TipTap editor state into a LLM-readable document view.
 *
 * Produces:
 *   - A Markdown string annotated with {b:n} block markers (sequential display IDs)
 *   - A BlockViewMapping[] table (displayId → nodeId / position)
 *   - An outline (heading tree with block count + word count per section)
 *
 * Design:
 *   - Only block types registered with UniqueID are included (have attrs.id).
 *   - List containers (bulletList/orderedList/taskList) are pure structure; not included.
 *   - table / blockquote / listItem each count as ONE block; their children are skipped.
 *   - Paragraph inside a listItem / taskItem / blockquote is skipped (belongs to parent block).
 */

import type { Editor } from '@tiptap/core'
import type { Mark, Node as PmNode } from '@tiptap/pm/model'
import { emojiToShortcode, gitHubEmojis, shortcodeToEmoji } from '@tiptap/extension-emoji'
import { normalizeAlertType } from '@/utils/markdownAlerts'

// ── Types ─────────────────────────────────────────────────────────────────

export interface BlockViewMapping {
  displayId: number     // Sequential number shown to LLM as {b:n}
  nodeId: string        // TipTap node.attrs.id (nanoid 8-char); for container blocks: "list:<firstItemId>"
  nodeType: string      // paragraph / heading / codeBlock / etc.
  from: number          // ProseMirror position (start of node)
  to: number            // ProseMirror position (end of node)
  /**
   * Two-level block model (A4.2): a container block wraps a whole list
   * (bulletList/orderedList/taskList). Container blocks are addressable for
   * container-level edit_block (whole-list replace) but are skipped in the
   * linear content flow (their child leaves render individually).
   */
  isContainer?: boolean
  /** For list-item leaf blocks: the displayId of the enclosing top-level list container. */
  containerId?: number
}

// List container node types (two-level model, A4.2)
const LIST_CONTAINER_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])

export interface OutlineEntry {
  displayId: number
  level: number         // Heading level 1–6
  text: string          // Heading plain text
  sectionBlocks: number // Blocks in this section (until next same/higher level heading)
  wordCount: number     // Approximate word count in this section
}

export interface DocumentView {
  /** Full document Markdown with {b:n} markers */
  viewMarkdown: string
  /** Compact outline-only text (for system prompt injection) */
  outlineText: string
  /** Block map: index is (displayId - 1) */
  blockMap: BlockViewMapping[]
  outline: OutlineEntry[]
  totalBlocks: number
  totalWords: number
}

// Block types that receive UniqueID attrs
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'codeBlock', 'mathBlock',
  'image', 'horizontalRule', 'blockquote', 'table',
  'listItem', 'taskItem',
])

// Types whose children we do NOT descend into (whole node = 1 block)
const OPAQUE_BLOCKS = new Set(['blockquote', 'table', 'image', 'horizontalRule', 'mathBlock'])

// Types inside which we skip a `paragraph` child (paragraph belongs to parent block)
const PARA_SKIP_PARENTS = new Set(['listItem', 'taskItem', 'blockquote'])

// ── Builder ───────────────────────────────────────────────────────────────

export class DocumentViewBuilder {
  /**
   * Build a full document view from the current editor state.
   * The blockMap returned is valid for the rest of this "session" (until
   * the LLM calls a mutating tool, after which the caller should rebuild).
   */
  build(editor: Editor): DocumentView {
    const doc = editor.state.doc
    const blockMap: BlockViewMapping[] = []
    const viewParts: string[] = []
    let displayId = 0
    // Active top-level list containers, for tagging item leaves with containerId.
    const containers: { from: number; to: number; displayId: number }[] = []

    doc.descendants((node, pos, parent) => {
      const typeName = node.type.name
      const parentType = parent?.type.name ?? 'doc'

      // Skip paragraph that lives inside a listItem, taskItem, or blockquote
      // (it is rendered as part of its parent block).
      if (typeName === 'paragraph' && PARA_SKIP_PARENTS.has(parentType)) {
        return false
      }

      // List containers: emit a container block for TOP-LEVEL lists only
      // (nested lists live inside a listItem and are covered by the top container's
      // whole-list replace). Then descend to register item leaves.
      if (LIST_CONTAINER_TYPES.has(typeName)) {
        if (parentType === 'doc') {
          const firstItemId: string = node.firstChild?.attrs?.id ?? ''
          if (firstItemId) {
            displayId++
            blockMap.push({
              displayId,
              nodeId: `list:${firstItemId}`,
              nodeType: typeName,
              from: pos,
              to: pos + node.nodeSize,
              isContainer: true,
            })
            containers.push({ from: pos, to: pos + node.nodeSize, displayId })
            // Container is addressable-only: not pushed to viewParts (its items render individually).
          }
        }
        return true
      }

      // A tracked block type
      if (BLOCK_TYPES.has(typeName)) {
        const nodeId: string = node.attrs?.id ?? ''
        if (!nodeId) {
          // UniqueID not yet assigned (edge case during initial load); skip
          return !OPAQUE_BLOCKS.has(typeName)
        }

        displayId++
        const isListLeaf = typeName === 'listItem' || typeName === 'taskItem'
        const containerId = isListLeaf
          ? containers.find(c => pos >= c.from && pos < c.to)?.displayId
          : undefined
        blockMap.push({
          displayId,
          nodeId,
          nodeType: typeName,
          from: pos,
          to: pos + node.nodeSize,
          ...(containerId !== undefined ? { containerId } : {}),
        })

        const md = nodeToMarkdown(node)
        viewParts.push(`{b:${displayId}}\n${md}`)

        // Opaque blocks and codeBlock/mathBlock: don't descend
        if (OPAQUE_BLOCKS.has(typeName) || typeName === 'codeBlock') return false

        // listItem / taskItem: descend to find nested list items (but not their paragraphs)
        if (typeName === 'listItem' || typeName === 'taskItem') return true

        // paragraph, heading: leaf, don't descend
        return false
      }

      // All other nodes (tableRow, tableCell, doc, etc.): don't add, but allow traversal
      // of the doc root (parent === null means we're at top-level children)
      return parentType === 'doc' || false
    })

    const outline = buildOutline(blockMap, doc)
    const totalWords = countWords(doc.textContent)

    return {
      viewMarkdown: viewParts.join('\n\n'),
      outlineText: buildOutlineText(outline, blockMap, totalWords),
      blockMap,
      outline,
      totalBlocks: displayId,
      totalWords,
    }
  }

  /**
   * Build a section view: from the heading block to the next same/higher-level heading.
   * Returns Markdown annotated with {b:n} markers.
   */
  buildSectionView(
    editor: Editor,
    headingDisplayId: number,
    blockMap: BlockViewMapping[]
  ): { content: string; blockIdRange: [number, number] } | null {
    const headingEntry = blockMap.find(
      b => b.displayId === headingDisplayId && b.nodeType === 'heading'
    )
    if (!headingEntry) return null

    const doc = editor.state.doc
    const headingNode = doc.nodeAt(headingEntry.from)
    if (!headingNode) return null
    const headingLevel = headingNode.attrs.level as number

    // Find where the section ends (next heading of same or higher level)
    let sectionEnd = blockMap[blockMap.length - 1]!.displayId
    for (const entry of blockMap) {
      if (entry.displayId <= headingDisplayId) continue
      if (entry.nodeType === 'heading') {
        const n = doc.nodeAt(entry.from)
        if (n && (n.attrs.level as number) <= headingLevel) {
          sectionEnd = entry.displayId - 1
          break
        }
      }
    }

    const sectionBlocks = blockMap.filter(
      b => b.displayId >= headingDisplayId && b.displayId <= sectionEnd
    )

    const parts = sectionBlocks.map(entry => {
      const node = doc.nodeAt(entry.from)
      if (!node) return `{b:${entry.displayId}}\n`
      return `{b:${entry.displayId}}\n${nodeToMarkdown(node)}`
    })

    return {
      content: parts.join('\n\n'),
      blockIdRange: [headingDisplayId, sectionEnd],
    }
  }

  /**
   * Build a context view centered on a block: window blocks before and after.
   */
  buildBlockContext(
    editor: Editor,
    centerDisplayId: number,
    blockMap: BlockViewMapping[],
    window = 3
  ): { blocks: Array<{ blockId: number; type: string; content: string }>; centerBlockId: number } {
    const doc = editor.state.doc
    const centerIndex = blockMap.findIndex(b => b.displayId === centerDisplayId)
    if (centerIndex === -1) return { blocks: [], centerBlockId: centerDisplayId }

    const start = Math.max(0, centerIndex - window)
    const end   = Math.min(blockMap.length - 1, centerIndex + window)
    const entries = blockMap.slice(start, end + 1)

    const blocks = entries.map(entry => {
      const node = doc.nodeAt(entry.from)
      if (!node) return { blockId: entry.displayId, type: entry.nodeType, content: `{b:${entry.displayId}}\n` }
      return {
        blockId: entry.displayId,
        type: entry.nodeType,
        content: `{b:${entry.displayId}}\n${nodeToMarkdown(node)}`,
      }
    })

    return { blocks, centerBlockId: centerDisplayId }
  }

  /**
   * Build a view for a specific set of block display IDs.
   */
  buildBlocksView(
    editor: Editor,
    displayIds: number[],
    blockMap: BlockViewMapping[]
  ): { blocks: Array<{ blockId: number; type: string; content: string }> } {
    const doc = editor.state.doc
    const blocks = displayIds.map(id => {
      const entry = blockMap.find(b => b.displayId === id)
      if (!entry) return { blockId: id, type: 'unknown', content: '(block not found)' }
      const node = doc.nodeAt(entry.from)
      if (!node) return { blockId: id, type: entry.nodeType, content: '(node not found)' }
      return {
        blockId: id,
        type: entry.nodeType,
        content: `{b:${id}}\n${nodeToMarkdown(node)}`,
      }
    })
    return { blocks }
  }

  /**
   * Build a range view from fromDisplayId to toDisplayId (inclusive).
   */
  buildRangeView(
    editor: Editor,
    fromDisplayId: number,
    toDisplayId: number,
    blockMap: BlockViewMapping[]
  ): string {
    const doc = editor.state.doc
    const entries = blockMap.filter(
      b => b.displayId >= fromDisplayId && b.displayId <= toDisplayId
    )
    const parts = entries.map(entry => {
      const node = doc.nodeAt(entry.from)
      if (!node) return `{b:${entry.displayId}}\n`
      return `{b:${entry.displayId}}\n${nodeToMarkdown(node)}`
    })
    return parts.join('\n\n')
  }
}

// ── Node → Markdown ───────────────────────────────────────────────────────

/**
 * Render a single block node to Markdown.
 * This is a lightweight renderer — it covers all types used in iWriter.
 */
export function nodeToMarkdown(node: PmNode): string {
  const type = node.type.name

  switch (type) {
    case 'paragraph':
      return inlineToMarkdown(node)

    case 'heading': {
      const prefix = '#'.repeat(node.attrs.level as number)
      return `${prefix} ${inlineToMarkdown(node)}`
    }

    case 'codeBlock': {
      const lang: string = node.attrs.language ?? ''
      return '```' + lang + '\n' + node.textContent + '\n```'
    }

    case 'blockMath': {
      const content = node.attrs.latex ?? node.textContent ?? ''
      return '$$\n' + content + '\n$$'
    }

    case 'image': {
      const alt: string = node.attrs.alt ?? ''
      const src: string = node.attrs.src ?? ''
      return `![${alt}](${src})`
    }

    case 'horizontalRule':
      return '---'

    case 'blockquote': {
      const lines: string[] = []
      node.forEach(child => {
        if (child.type.name === 'paragraph') {
          lines.push('> ' + inlineToMarkdown(child))
        }
      })
      const content = lines.join('\n>\n') || '> '
      const alertType = normalizeAlertType(node.attrs.alertType)
      return alertType ? `> [!${alertType}]\n${content}` : content
    }

    case 'table':
      return tableToMarkdown(node)

    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return listToMarkdown(node, 0)

    case 'listItem': {
      const firstPara = node.firstChild
      const text = firstPara?.type.name === 'paragraph'
        ? inlineToMarkdown(firstPara)
        : node.textContent
      return '- ' + text
    }

    case 'taskItem': {
      const checked = node.attrs.checked ? '[x]' : '[ ]'
      const firstPara = node.firstChild
      const text = firstPara?.type.name === 'paragraph'
        ? inlineToMarkdown(firstPara)
        : node.textContent
      return `- ${checked} ${text}`
    }

    default:
      return node.textContent
  }
}

// ── List container → Markdown (recursive, handles nesting) ────────────────

/**
 * Render a whole list container (bulletList/orderedList/taskList) to Markdown,
 * including nested sublists. Used for container-level blocks (A4.2): the content
 * of a list container block is the full list markdown, which the LLM edits and
 * replaces atomically for structural changes (add/remove/reorder/nest items).
 */
function listToMarkdown(listNode: PmNode, depth: number): string {
  const indent = '  '.repeat(depth)
  const ordered = listNode.type.name === 'orderedList'
  const lines: string[] = []
  let index = (listNode.attrs?.start as number) ?? 1

  listNode.forEach(item => {
    const itemType = item.type.name
    if (itemType !== 'listItem' && itemType !== 'taskItem') return

    // First paragraph = the item's own text; deeper block children (nested lists) recurse.
    let itemText = ''
    const nested: string[] = []
    item.forEach(child => {
      const childType = child.type.name
      if (childType === 'paragraph' && itemText === '') {
        itemText = inlineToMarkdown(child)
      } else if (LIST_CONTAINER_TYPES.has(childType)) {
        nested.push(listToMarkdown(child, depth + 1))
      }
    })

    let marker: string
    if (itemType === 'taskItem') {
      marker = `- ${item.attrs.checked ? '[x]' : '[ ]'}`
    } else if (ordered) {
      marker = `${index}.`
      index++
    } else {
      marker = '-'
    }

    lines.push(`${indent}${marker} ${itemText}`)
    if (nested.length) lines.push(nested.join('\n'))
  })

  return lines.join('\n')
}

// ── Inline content → Markdown ─────────────────────────────────────────────

interface InlineMarkdownSegment {
  text: string
  marks: readonly Mark[]
  canMerge: boolean
  inheritSurroundingMarks?: boolean
}

function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false
  return a.every((mark, index) => {
    const other = b[index]
    return other?.type.name === mark.type.name
      && JSON.stringify(other.attrs ?? {}) === JSON.stringify(mark.attrs ?? {})
  })
}

function renderMarkedInlineText(value: string, marks: readonly Mark[]): string {
  let text = value
  const linkMark = marks.find(mark => mark.type.name === 'link')
  const otherMarks = marks.filter(mark => mark.type.name !== 'link')

  for (const mark of otherMarks) {
    switch (mark.type.name) {
      case 'bold':        text = `**${text}**`; break
      case 'italic':      text = `_${text}_`; break
      case 'strike':      text = `~~${text}~~`; break
      case 'code':        text = `\`${text}\``; break
      case 'underline':   text = `<u>${text}</u>`; break
      case 'highlight':   text = `==${text}==`; break
      case 'subscript':   text = `~${text}~`; break
      case 'superscript': text = `^${text}^`; break
    }
  }

  if (linkMark) {
    const href: string = linkMark.attrs.href ?? ''
    text = `[${text}](${href})`
  }

  return text
}

function emojiNodeToText(node: PmNode): string {
  const name = typeof node.attrs.name === 'string' ? node.attrs.name : ''
  if (!name) return node.textContent
  return shortcodeToEmoji(name, gitHubEmojis)?.emoji ?? `:${name}:`
}

function inlineToMarkdown(node: PmNode): string {
  const segments: InlineMarkdownSegment[] = []

  node.forEach(child => {
    if (child.type.name === 'hardBreak') {
      segments.push({ text: '  \n', marks: [], canMerge: false })
      return
    }

    if (child.type.name === 'inlineMath') {
      // InlineMath stores formula in attrs.content or as text content
      const formula: string = child.attrs.content ?? child.attrs.latex ?? child.textContent ?? ''
      segments.push({ text: `$${formula}$`, marks: child.marks, canMerge: true })
      return
    }

    if (child.type.name === 'emoji') {
      const text = emojiNodeToText(child)
      if (!text) return
      segments.push({
        text,
        marks: child.marks,
        canMerge: true,
        // Emoji nodes created from literal Unicode may lose the surrounding text
        // mark. If both adjacent runs have the same marks, bridge the atom so
        // `**A↔B**` stays canonical instead of becoming `**A**↔**B**`.
        inheritSurroundingMarks: child.marks.length === 0,
      })
      return
    }

    const text = child.isText ? (child.text ?? '') : child.textContent
    if (!text) return
    segments.push({
      text,
      marks: child.marks,
      canMerge: true,
      // Markdown round-trips can split a marked run around literal emoji
      // (`**A**↔**B**`). Canonicalize that form the same way as an emoji atom.
      inheritSurroundingMarks:
        child.isText
        && child.marks.length === 0
        && emojiToShortcode(text, gitHubEmojis) !== undefined,
    })
  })

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    if (!segment.inheritSurroundingMarks) continue
    const previous = segments[index - 1]
    const next = segments[index + 1]
    if (
      previous?.canMerge
      && next?.canMerge
      && previous.marks.length > 0
      && sameMarks(previous.marks, next.marks)
    ) {
      segment.marks = previous.marks
    }
  }

  const merged: InlineMarkdownSegment[] = []
  for (const segment of segments) {
    const previous = merged[merged.length - 1]
    if (previous?.canMerge && segment.canMerge && sameMarks(previous.marks, segment.marks)) {
      previous.text += segment.text
      continue
    }
    merged.push({ ...segment })
  }

  return merged
    .map(segment => renderMarkedInlineText(segment.text, segment.marks))
    .join('')
}

// ── Table → GFM Markdown ──────────────────────────────────────────────────

function tableToMarkdown(node: PmNode): string {
  const rows: string[][] = []

  node.forEach(row => {
    if (row.type.name !== 'tableRow') return
    const cells: string[] = []
    row.forEach(cell => {
      if (!['tableCell', 'tableHeader'].includes(cell.type.name)) return
      // Extract text from the cell's paragraph child
      let cellText = ''
      cell.forEach(child => {
        if (child.type.name === 'paragraph') {
          cellText = inlineToMarkdown(child)
        }
      })
      cells.push(cellText)
    })
    if (cells.length) rows.push(cells)
  })

  if (!rows.length) return ''

  const header = rows[0]!
  const separator = header.map(() => '---')
  const body = rows.slice(1)

  const fmt = (row: string[]) => '| ' + row.join(' | ') + ' |'

  return [fmt(header), fmt(separator), ...body.map(fmt)].join('\n')
}

// ── Outline helpers ───────────────────────────────────────────────────────

function buildOutline(blockMap: BlockViewMapping[], doc: PmNode): OutlineEntry[] {
  const headings = blockMap.filter(b => b.nodeType === 'heading')
  const outline: OutlineEntry[] = []

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!
    const node = doc.nodeAt(h.from)
    if (!node) continue

    const level = node.attrs.level as number
    const text = node.textContent

    // Section ends at the next heading of same or higher level, or end of doc
    const nextHeading = headings.slice(i + 1).find(nh => {
      const n = doc.nodeAt(nh.from)
      return n && (n.attrs.level as number) <= level
    })

    const sectionEnd = nextHeading ? nextHeading.displayId - 1 : blockMap[blockMap.length - 1]!.displayId
    const sectionBlocks = sectionEnd - h.displayId + 1

    // Word count: collect text from section range
    let wordCount = 0
    const sectionEntries = blockMap.filter(b => b.displayId >= h.displayId && b.displayId <= sectionEnd)
    for (const entry of sectionEntries) {
      // Skip container blocks: their text is already counted via the item leaves.
      if (entry.isContainer) continue
      const n = doc.nodeAt(entry.from)
      if (n) wordCount += countWords(n.textContent)
    }

    outline.push({ displayId: h.displayId, level, text, sectionBlocks, wordCount })
  }

  return outline
}

function buildOutlineText(outline: OutlineEntry[], blockMap: BlockViewMapping[], totalWords: number): string {
  if (!outline.length) {
    const total = blockMap.length
    return `(no headings — ${total} blocks, ~${totalWords} words)`
  }

  const lines = outline.map(entry => {
    const indent = '  '.repeat(entry.level - 1)
    return `${indent}{b:${entry.displayId}} ${'#'.repeat(entry.level)} ${entry.text}  (~${entry.wordCount}字, ${entry.sectionBlocks}块)`
  })
  return lines.join('\n')
}

function countWords(text: string): number {
  if (!text.trim()) return 0
  // For CJK text, count characters; for Latin text, count words
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const latin = (text.match(/\b\w+\b/g) ?? []).length
  return cjk + latin
}
