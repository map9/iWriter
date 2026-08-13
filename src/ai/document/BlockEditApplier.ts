/**
 * BlockEditApplier — applies approved BlockEditProposals to the active TipTap editor.
 *
 * Core principle: locate blocks by their stable UniqueID (node.attrs.id),
 * then apply Markdown → PM node conversion and execute the TipTap command chain.
 *
 * All operations are recorded in TipTap's UndoRedo history, so the user
 * can press Cmd+Z to revert any applied edit.
 */

import type { Editor } from '@tiptap/core'
import type { Node as PmNode, Schema } from '@tiptap/pm/model'
import type { JSONContent } from '@tiptap/core'
import { marked } from 'marked'
import type { BlockEditProposal } from '@shared/ai/contracts'
import { DocumentViewBuilder, nodeToMarkdown } from './DocumentViewBuilder'
import { unwrapBlockImages } from '@/import-export/formatConverter'
import { transformAlertBlockquotesInHtml } from '@/utils/markdownAlerts'

export interface ApplyResult {
  success: boolean
  error?: string
}

function normalizeExpectedMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/^\{b:\d+\}\n?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
}

function sanitizeContentForNodeType(content: string, node: PmNode): string {
  const trimmed = content.replace(/\r\n/g, '\n').trim()
  const type = node.type.name

  switch (type) {
    case 'heading':
      return trimmed.replace(/^#{1,6}\s+/, '')
    case 'listItem':
      return trimmed.replace(/^[-*+]\s+/, '')
    case 'taskItem':
      return trimmed.replace(/^[-*+]\s+\[[ xX]\]\s+/, '')
    default:
      return trimmed
  }
}

/**
 * Build a mismatch message that is actionable on the FIRST failure.
 *
 * A bare "re-read and retry" is unactionable when the file did not change: the caller
 * re-reads, gets the same bytes, resends the same payload, and loops. So we point at
 * where the two strings actually diverge (post-normalization, i.e. `{b:n}` markers and
 * surrounding whitespace already ignored) and cap the excerpts so a failed edit cannot
 * flood the agent's context.
 */
const MISMATCH_EXCERPT_CHARS = 60

function describeContentDivergence(current: string, expected: string): string {
  const a = normalizeExpectedMarkdown(current)
  const b = normalizeExpectedMarkdown(expected)

  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++

  const excerpt = (s: string): string => {
    const slice = s.slice(i, i + MISMATCH_EXCERPT_CHARS)
    return `${JSON.stringify(slice)}${i + MISMATCH_EXCERPT_CHARS < s.length ? '…' : ''}`
  }

  if (i === 0) {
    return `they differ from the first character (current ${a.length} chars, expected ${b.length}). ` +
      `Current starts ${excerpt(a)}; you sent ${excerpt(b)}. ` +
      `Most often the expected content covers a different block, or several blocks, than the one addressed.`
  }
  return `they match for ${i} chars, then diverge — current has ${excerpt(a)}, you sent ${excerpt(b)} ` +
    `(current ${a.length} chars, expected ${b.length}).`
}

function contentMismatchError(
  kind: string,
  blockLabel: string,
  current?: string,
  expected?: string,
  source: 'snapshot' | 'caller' = 'caller'
): string {
  const base =
    source === 'snapshot'
      ? `${kind}: ${blockLabel} changed between the time this edit was proposed and the time it was applied, so it was not applied. This is not about the content you sent — the document moved underneath the proposal (a concurrent edit, or an earlier edit in this run)`
      : `${kind}: current content for ${blockLabel} does not match the expected content you sent`
  const detail =
    current !== undefined && expected !== undefined
      ? `: ${describeContentDivergence(current, expected)}`
      : '.'
  const advice =
    source === 'snapshot'
      ? ` Re-read the document (get_document_outline / get_section) to pick up the new block IDs and reissue against the current state. Sending the same payload again will fail the same way.`
      : ` Re-read this block with get_blocks and copy its exact markdown (without the {b:n} marker). ` +
        `If a fresh read produces the same payload and it still fails, stop and report — do not retry the identical call.`
  return `${base}${detail}${advice}`
}

function logContentMismatch(blockLabel: string, currentContent: string, expectedContent: string): void {
  console.warn('[BlockEditApplier] content mismatch', {
    blockLabel,
    currentContent,
    expectedContent,
    normalizedCurrentContent: normalizeExpectedMarkdown(currentContent),
    normalizedExpectedContent: normalizeExpectedMarkdown(expectedContent),
  })
}

function resolveExpectedContent(preferred: string | undefined, fallback: string | undefined): string | undefined {
  const normalizedPreferred = preferred ? normalizeExpectedMarkdown(preferred) : ''
  if (normalizedPreferred) return preferred

  const normalizedFallback = fallback ? normalizeExpectedMarkdown(fallback) : ''
  return normalizedFallback ? fallback : undefined
}

/**
 * Which side supplied the content we are checking against.
 *
 * `oldContent` is captured from the document snapshot taken when the edit was proposed;
 * `expectedCurrentContent` is what the caller sent. The snapshot wins when present, which
 * means a mismatch is frequently NOT the caller's fault: the document moved between the
 * proposal and the apply, and the caller's own payload was never the thing compared. The
 * two cases need different advice, so the message has to say which one happened —
 * otherwise "re-read and reissue" sends the caller into a loop it cannot exit.
 */
function expectedContentSource(preferred: string | undefined): 'snapshot' | 'caller' {
  return preferred && normalizeExpectedMarkdown(preferred) ? 'snapshot' : 'caller'
}

function getRangeMarkdown(editor: Editor, startNodeId: string, endNodeId: string): string {
  const doc = editor.state.doc
  const view = new DocumentViewBuilder().build(editor)
  const startEntry = view.blockMap.find(entry => entry.nodeId === startNodeId)
  const endEntry = view.blockMap.find(entry => entry.nodeId === endNodeId)
  if (!startEntry || !endEntry) return ''

  const from = Math.min(startEntry.from, endEntry.from)
  const to = Math.max(startEntry.to, endEntry.to)

  const rangeEntries = view.blockMap
    .filter(entry => entry.from >= from && entry.to <= to)
  // The block map exposes both a whole-list container and its leaves for
  // addressing, but range Markdown is a linear view. Avoid rendering both.
  const shadowedContainerIds = new Set(
    rangeEntries
      .map(entry => entry.containerId)
      .filter((id): id is number => id !== undefined)
  )

  return rangeEntries
    .filter(entry => !entry.isContainer || !shadowedContainerIds.has(entry.displayId))
    .map(entry => {
      const node = doc.nodeAt(entry.from)
      return node ? nodeToMarkdown(node) : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

// List container node types (two-level model, A4.2)
const LIST_CONTAINER_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])

// ── Node Lookup ────────────────────────────────────────────────────────────

/**
 * Locate the top-level list container that encloses a given list item.
 * Container blocks are addressed as "list:<firstItemId>" (A4.2); this resolves
 * that to the outermost enclosing list node for whole-list replacement.
 */
function findListContainerByItemId(
  doc: PmNode,
  itemId: string
): { node: PmNode; from: number; to: number } | null {
  const item = findNodeById(doc, itemId)
  if (!item) return null
  const $pos = doc.resolve(item.from)
  // Ascend from shallowest depth to pick the OUTERMOST list container (parent === doc).
  for (let d = 1; d <= $pos.depth; d++) {
    const anc = $pos.node(d)
    if (LIST_CONTAINER_TYPES.has(anc.type.name)) {
      const from = $pos.before(d)
      return { node: anc, from, to: from + anc.nodeSize }
    }
  }
  return null
}

/**
 * Resolve a block reference to a node, handling both normal UniqueID blocks and
 * container blocks addressed as "list:<firstItemId>" (A4.2). Used by the review
 * surface to locate/highlight the original block for any edit proposal.
 */
export function findBlockOrContainer(
  doc: PmNode,
  nodeId: string
): { node: PmNode; from: number; to: number } | null {
  if (nodeId.startsWith('list:')) {
    return findListContainerByItemId(doc, nodeId.slice('list:'.length))
  }
  return findNodeById(doc, nodeId)
}

/**
 * Find a node by its UniqueID (attrs.id) in the document.
 * Returns the node and its ProseMirror positions.
 */
export function findNodeById(
  doc: PmNode,
  nodeId: string
): { node: PmNode; from: number; to: number } | null {
  let found: { node: PmNode; from: number; to: number } | null = null

  doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs?.id === nodeId) {
      found = { node, from: pos, to: pos + node.nodeSize }
      return false
    }
    return true
  })

  return found
}

// ── Markdown → PM content ─────────────────────────────────────────────────

/**
 * Convert Markdown to TipTap JSONContent (an array of block nodes).
 * Uses the marked → HTML → TipTap setContent pipeline.
 */
async function markdownToContent(
  editor: Editor,
  markdown: string
): Promise<JSONContent[]> {
  // Task lists: GFM `- [x]` does not round-trip to TipTap's taskList (which needs
  // ul[data-type="taskList"]); marked would degrade it to a bulletList and drop the
  // checked state. Build the taskList HTML directly for a flat task list (A4.2).
  const taskHtml = await tryBuildTaskListHtml(markdown)
  const parsedHtml = await marked.parse(markdown, { async: true })
  const html = taskHtml ?? transformAlertBlockquotesInHtml(unwrapBlockImages(parsedHtml))
  // Use TipTap's built-in HTML parser via a temporary content parse
  const { generateJSON } = await import('@tiptap/core')
  const doc = generateJSON(html, editor.extensionManager.baseExtensions)
  return doc.content ?? []
}

/**
 * If `markdown` is a flat task list (every non-empty line is `- [ ]`/`- [x]`),
 * build the TipTap-compatible taskList HTML so the type and checked state survive.
 * Returns null for anything else (including nested task lists) → caller falls back to marked.
 */
async function tryBuildTaskListHtml(markdown: string): Promise<string | null> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0)
  if (!lines.length) return null
  const items: string[] = []
  for (const line of lines) {
    const m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (!m) return null // not a pure flat task list
    const checked = m[1]!.toLowerCase() === 'x'
    const inlineHtml = await marked.parseInline(m[2]!, { async: true })
    items.push(`<li data-type="taskItem" data-checked="${checked}"><p>${inlineHtml}</p></li>`)
  }
  return `<ul data-type="taskList">${items.join('')}</ul>`
}

/**
 * Wrap raw content Markdown with the appropriate block syntax for a given node type.
 * The LLM sends `new_content` without block-type markers for edit_block
 * (e.g., heading content without '##'), so we restore them here.
 */
function wrapForNodeType(content: string, node: PmNode): string {
  const sanitized = sanitizeContentForNodeType(content, node)
  const type = node.type.name
  switch (type) {
    case 'heading':
      return '#'.repeat(node.attrs.level as number) + ' ' + sanitized
    case 'codeBlock':
      return '```' + (node.attrs.language ?? '') + '\n' + sanitized + '\n```'
    case 'mathBlock':
      return '$$\n' + sanitized + '\n$$'
    case 'listItem':
      return '- ' + sanitized
    case 'taskItem':
      return `- ${(node.attrs.checked as boolean) ? '[x]' : '[ ]'} ` + sanitized
    default:
      return sanitized // paragraph, image, etc.
  }
}

// ── Single-block operations ────────────────────────────────────────────────

/**
 * edit_block: Replace the content of a block, keeping its type.
 * new_content uses type-specific format (e.g., heading text without '#').
 */
export async function applyEditBlock(
  editor: Editor,
  proposal: BlockEditProposal
): Promise<ApplyResult> {
  const { nodeId, nodeType, newContent } = proposal
  if (!nodeId || !nodeType || newContent === undefined) {
    return { success: false, error: 'Missing nodeId, nodeType, or newContent' }
  }

  // Container-level edit (A4.2): nodeId "list:<firstItemId>" targets a whole list.
  // new_content is the complete list markdown; replace the entire list node atomically
  // (robust for structural changes: add/remove/reorder/nest items).
  if (nodeId.startsWith('list:')) {
    const firstItemId = nodeId.slice('list:'.length)
    const container = findListContainerByItemId(editor.state.doc, firstItemId)
    if (!container) {
      return { success: false, error: `List container ${nodeId} not found in document` }
    }
    const expectedListContent = resolveExpectedContent(
      proposal.oldContent,
      proposal.expectedCurrentContent
    )
    if (expectedListContent !== undefined) {
      const currentContent = nodeToMarkdown(container.node)
      if (normalizeExpectedMarkdown(currentContent) !== normalizeExpectedMarkdown(expectedListContent)) {
        logContentMismatch(`list ${nodeId}`, currentContent, expectedListContent)
        return { success: false, error: contentMismatchError('content_mismatch', `list ${nodeId}`, currentContent, expectedListContent, expectedContentSource(proposal.oldContent)) }
      }
    }
    const listNodes = await markdownToContent(editor, newContent)
    if (!listNodes.length) {
      return { success: false, error: 'Markdown produced empty content' }
    }
    editor.chain()
      .focus()
      .deleteRange({ from: container.from, to: container.to })
      .insertContentAt(container.from, listNodes)
      .run()
    return { success: true }
  }

  const found = findNodeById(editor.state.doc, nodeId)
  if (!found) {
    return { success: false, error: `Block ${nodeId} not found in document` }
  }

  const expectedCurrentContent = resolveExpectedContent(
    proposal.oldContent,
    proposal.expectedCurrentContent
  )
  if (expectedCurrentContent !== undefined) {
    const currentContent = nodeToMarkdown(found.node)
    if (normalizeExpectedMarkdown(currentContent) !== normalizeExpectedMarkdown(expectedCurrentContent)) {
      logContentMismatch(`block ${nodeId}`, currentContent, expectedCurrentContent)
      return { success: false, error: contentMismatchError('content_mismatch', `block ${nodeId}`, currentContent, expectedCurrentContent, expectedContentSource(proposal.oldContent)) }
    }
  }

  const wrapped = wrapForNodeType(newContent, found.node)
  const nodes = await markdownToContent(editor, wrapped)
  if (!nodes.length) {
    return { success: false, error: 'Markdown produced empty content' }
  }

  // For listItem/taskItem, markdownToContent wraps the result in a bulletList/taskList.
  // We need the inner listItem/taskItem nodes, not the outer list container.
  const nodeTypeName = found.node.type.name
  let insertContent: JSONContent | JSONContent[] = nodes
  if (nodeTypeName === 'listItem' || nodeTypeName === 'taskItem') {
    const innerItems = nodes[0]?.content
    if (Array.isArray(innerItems) && innerItems.length > 0) {
      insertContent = innerItems
    }
  }

  editor.chain()
    .focus()
    .deleteRange({ from: found.from, to: found.to })
    .insertContentAt(found.from, insertContent)
    .run()

  return { success: true }
}

/**
 * insert_block: Insert new blocks after the given block (or at document start if afterNodeId === '0').
 * new_content is Markdown that may contain multiple blocks separated by blank lines.
 */
export async function applyInsertBlock(
  editor: Editor,
  proposal: BlockEditProposal
): Promise<ApplyResult> {
  const { afterNodeId, newContent } = proposal
  if (newContent === undefined) {
    return { success: false, error: 'Missing newContent' }
  }

  const nodes = await markdownToContent(editor, newContent)
  if (!nodes.length) {
    return { success: false, error: 'Markdown produced empty content' }
  }

  let insertPos: number

  if (!afterNodeId || afterNodeId === '0') {
    // Insert at document start
    insertPos = 1 // After the doc open token
  } else {
    const found = findNodeById(editor.state.doc, afterNodeId)
    if (!found) {
      return { success: false, error: `Block ${afterNodeId} not found in document` }
    }
    const expectedAnchorContent = resolveExpectedContent(
      proposal.anchorContent,
      proposal.expectedAnchorContent
    )
    if (expectedAnchorContent !== undefined) {
      const currentContent = nodeToMarkdown(found.node)
      if (normalizeExpectedMarkdown(currentContent) !== normalizeExpectedMarkdown(expectedAnchorContent)) {
        logContentMismatch(`anchor block ${afterNodeId}`, currentContent, expectedAnchorContent)
        return { success: false, error: contentMismatchError('content_mismatch', `anchor block ${afterNodeId}`, currentContent, expectedAnchorContent, expectedContentSource(proposal.oldContent)) }
      }
    }
    insertPos = found.to
  }

  editor.chain()
    .focus()
    .insertContentAt(insertPos, nodes)
    .run()

  return { success: true }
}

/**
 * delete_block: Delete a single block by ID.
 */
export function applyDeleteBlock(
  editor: Editor,
  proposal: BlockEditProposal
): ApplyResult {
  const { nodeId } = proposal
  if (!nodeId) return { success: false, error: 'Missing nodeId' }

  const found = findNodeById(editor.state.doc, nodeId)
  if (!found) {
    return { success: false, error: `Block ${nodeId} not found in document` }
  }

  const expectedCurrentContent = resolveExpectedContent(
    proposal.oldContent,
    proposal.expectedCurrentContent
  )
  if (expectedCurrentContent !== undefined) {
    const currentContent = nodeToMarkdown(found.node)
    if (normalizeExpectedMarkdown(currentContent) !== normalizeExpectedMarkdown(expectedCurrentContent)) {
      logContentMismatch(`block ${nodeId}`, currentContent, expectedCurrentContent)
      return { success: false, error: contentMismatchError('content_mismatch', `block ${nodeId}`, currentContent, expectedCurrentContent, expectedContentSource(proposal.oldContent)) }
    }
  }

  editor.chain()
    .focus()
    .deleteRange({ from: found.from, to: found.to })
    .run()

  return { success: true }
}

// ── Range operation ───────────────────────────────────────────────────────

/**
 * replace_range: Replace all blocks from startNodeId to endNodeId (inclusive) with new content.
 */
export async function applyReplaceRange(
  editor: Editor,
  proposal: BlockEditProposal
): Promise<ApplyResult> {
  const { startNodeId, endNodeId, newContent } = proposal
  if (!startNodeId || !endNodeId || newContent === undefined) {
    return { success: false, error: 'Missing startNodeId, endNodeId, or newContent' }
  }

  const doc = editor.state.doc
  const startFound = findNodeById(doc, startNodeId)
  const endFound   = findNodeById(doc, endNodeId)
  if (!startFound) return { success: false, error: `Start block ${startNodeId} not found` }
  if (!endFound)   return { success: false, error: `End block ${endNodeId} not found` }

  const from = Math.min(startFound.from, endFound.from)
  const to   = Math.max(startFound.to,   endFound.to)

  const expectedOldContent = resolveExpectedContent(
    proposal.oldContent,
    proposal.expectedOldContent
  )
  if (expectedOldContent !== undefined) {
    const currentContent = getRangeMarkdown(editor, startNodeId, endNodeId)
    if (normalizeExpectedMarkdown(currentContent) !== normalizeExpectedMarkdown(expectedOldContent)) {
      logContentMismatch(`range ${startNodeId}-${endNodeId}`, currentContent, expectedOldContent)
      return { success: false, error: contentMismatchError('content_mismatch', `range ${startNodeId}-${endNodeId}`, currentContent, expectedOldContent, expectedContentSource(proposal.oldContent)) }
    }
  }

  const nodes = await markdownToContent(editor, newContent)
  if (!nodes.length) {
    return { success: false, error: 'Markdown produced empty content' }
  }

  editor.chain()
    .focus()
    .deleteRange({ from, to })
    .insertContentAt(from, nodes)
    .run()

  return { success: true }
}

// ── Dispatch table ─────────────────────────────────────────────────────────

/**
 * Apply a BlockEditProposal to the editor.
 * Returns ApplyResult with success/error information.
 */
export async function applyBlockEditProposal(
  editor: Editor,
  proposal: BlockEditProposal
): Promise<ApplyResult> {
  switch (proposal.type) {
    case 'edit':          return applyEditBlock(editor, proposal)
    case 'insert':        return applyInsertBlock(editor, proposal)
    case 'delete':        return applyDeleteBlock(editor, proposal)
    case 'replace_range': return applyReplaceRange(editor, proposal)
    default:
      return { success: false, error: `Unknown proposal type: ${(proposal as BlockEditProposal).type}` }
  }
}

// ── Markdown extraction for diff display ─────────────────────────────────

/**
 * Get the current Markdown content of a block (for diff display in EditProposalCard).
 * Used when building BlockEditProposal.oldContent from the editor.
 */
export async function getBlockMarkdown(editor: Editor, nodeId: string): Promise<string> {
  const found = findNodeById(editor.state.doc, nodeId)
  if (!found) return ''
  return nodeToMarkdown(found.node)
}

// ── Schema helpers ─────────────────────────────────────────────────────────

export function resolveSchemaFromEditor(editor: Editor): Schema {
  return editor.schema
}
