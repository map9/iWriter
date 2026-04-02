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
import type { BlockEditProposal } from '@/ai/types'
import { DocumentViewBuilder, nodeToMarkdown } from './DocumentViewBuilder'

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

function contentMismatchError(kind: string, blockLabel: string): string {
  return `${kind}: current content for ${blockLabel} no longer matches the expected content. Re-read the latest document blocks before editing again.`
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

function getRangeMarkdown(editor: Editor, startNodeId: string, endNodeId: string): string {
  const doc = editor.state.doc
  const view = new DocumentViewBuilder().build(editor)
  const startEntry = view.blockMap.find(entry => entry.nodeId === startNodeId)
  const endEntry = view.blockMap.find(entry => entry.nodeId === endNodeId)
  if (!startEntry || !endEntry) return ''

  const from = Math.min(startEntry.from, endEntry.from)
  const to = Math.max(startEntry.to, endEntry.to)

  return view.blockMap
    .filter(entry => entry.from >= from && entry.to <= to)
    .map(entry => {
      const node = doc.nodeAt(entry.from)
      return node ? nodeToMarkdown(node) : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

// ── Node Lookup ────────────────────────────────────────────────────────────

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
  const html = await marked.parse(markdown, { async: true })
  // Use TipTap's built-in HTML parser via a temporary content parse
  const { generateJSON } = await import('@tiptap/core')
  const doc = generateJSON(html, editor.extensionManager.extensions)
  return doc.content ?? []
}

/**
 * Wrap raw content Markdown with the appropriate block syntax for a given node type.
 * The LLM sends `new_content` without block-type markers for edit_block
 * (e.g., heading content without '##'), so we restore them here.
 */
function wrapForNodeType(content: string, node: PmNode): string {
  const type = node.type.name
  switch (type) {
    case 'heading':
      return '#'.repeat(node.attrs.level as number) + ' ' + content
    case 'codeBlock':
      return '```' + (node.attrs.language ?? '') + '\n' + content + '\n```'
    case 'mathBlock':
      return '$$\n' + content + '\n$$'
    case 'listItem':
      return '- ' + content
    case 'taskItem':
      return `- ${(node.attrs.checked as boolean) ? '[x]' : '[ ]'} ` + content
    default:
      return content // paragraph, image, etc.
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
      return { success: false, error: contentMismatchError('content_mismatch', `block ${nodeId}`) }
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
 * new_blocks is Markdown that may contain multiple blocks separated by blank lines.
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
        return { success: false, error: contentMismatchError('content_mismatch', `anchor block ${afterNodeId}`) }
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
      return { success: false, error: contentMismatchError('content_mismatch', `block ${nodeId}`) }
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
      return { success: false, error: contentMismatchError('content_mismatch', `range ${startNodeId}-${endNodeId}`) }
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
  const { nodeToMarkdown } = await import('./DocumentViewBuilder')
  return nodeToMarkdown(found.node)
}

// ── Schema helpers ─────────────────────────────────────────────────────────

export function resolveSchemaFromEditor(editor: Editor): Schema {
  return editor.schema
}
