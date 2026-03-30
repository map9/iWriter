/**
 * UnifiedDocumentAccess — single document access layer for AI editing tools.
 *
 * All documents (active editor OR disk files) go through the same pipeline:
 *   DocumentViewBuilder → BlockEditApplier
 *
 * For disk files a virtual TipTap Editor is created in memory (no DOM rendering),
 * following the same pattern as TipTapSearchService workspace replacement.
 * This gives us real nodeIds via UniqueID, consistent block-type coverage,
 * and the exact same edit code path as the active editor.
 *
 * Replaces the dual FileDocumentView / FileBlockEditApplier approach.
 */

import { Editor, generateJSON } from '@tiptap/core'
import UniqueID from '@tiptap/extension-unique-id'
import { nanoid } from 'nanoid'

import { createBaseExtensions } from '@/utils/editorExtensions'
import { convertContentFrom, convertContentTo } from '@/import-export/formatConverter'
import { pathUtils } from '@/utils/pathUtils'
import { DocumentViewBuilder } from './DocumentViewBuilder'
import { applyBlockEditProposal } from './BlockEditApplier'
import type { BlockEditProposal } from '@/ai/types'
import type { DocumentViewSnapshot } from '../thread/ContextBuilder'

export type { ApplyResult } from './BlockEditApplier'
import type { ApplyResult } from './BlockEditApplier'

// ── Virtual editor extensions ────────────────────────────────────────────────
// createBaseExtensions() + UniqueID so blocks get stable node IDs (required by BlockEditApplier)

const VIRTUAL_EDITOR_NODE_TYPES = new Set([
  'paragraph', 'heading', 'codeBlock', 'mathBlock', 'image',
  'horizontalRule', 'blockquote', 'table', 'listItem', 'taskItem',
])

function buildVirtualEditorExtensions() {
  return [
    ...createBaseExtensions(),
    UniqueID.configure({
      types: Array.from(VIRTUAL_EDITOR_NODE_TYPES),
      generateID: () => nanoid(8),
    }),
  ]
}

/**
 * Ensure every block node tracked by UniqueID has a non-null id attr.
 *
 * UniqueID.onCreate should handle this automatically, but for headless virtual
 * editors loaded from HTML that lacks `data-id` attributes (e.g. legacy .iwt
 * files or files last saved before UniqueID was added), the hook may not fire
 * or may leave attrs.id === null. We force-assign IDs here so DocumentViewBuilder
 * never sees null ids and silently skips blocks.
 */
function ensureNodeIds(editor: Editor): void {
  const tr = editor.state.tr
  let modified = false
  editor.state.doc.descendants((node, pos) => {
    if (!VIRTUAL_EDITOR_NODE_TYPES.has(node.type.name)) return true
    if (node.attrs.id !== null && node.attrs.id !== '') return true
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: nanoid(8) })
    modified = true
    return true
  })
  if (modified) {
    tr.setMeta('addToHistory', false)
    editor.view.dispatch(tr)
  }
}

// ── DocumentHandle ────────────────────────────────────────────────────────────

export interface DocumentHandle {
  /** Pre-built snapshot for read tools and proposal inspection. */
  snapshot: DocumentViewSnapshot
  /**
   * Apply a BlockEditProposal to this document.
   * For disk-file handles: resolves nodeIds from the virtual editor, applies via
   * BlockEditApplier, then saves back to disk.
   * For active-editor handles: delegates directly to BlockEditApplier.
   */
  applyBlockProposal(proposal: BlockEditProposal): Promise<ApplyResult>
  /** Release the virtual Editor instance. No-op for active-editor handles. */
  dispose(): void
}

// ── UnifiedDocumentAccess ─────────────────────────────────────────────────────

export class UnifiedDocumentAccess {
  /**
   * Wrap the active TipTap editor as a DocumentHandle (zero overhead).
   * The caller owns the editor lifetime; dispose() is a no-op.
   */
  static fromEditor(editor: Editor, filePath?: string): DocumentHandle {
    const view = new DocumentViewBuilder().build(editor)
    const snapshot: DocumentViewSnapshot = {
      view,
      editor,
      cursorBlockId: null,
      filePath,
    }
    return {
      snapshot,
      applyBlockProposal: async (proposal: BlockEditProposal): Promise<ApplyResult> => {
        // Re-build a fresh view from the editor's current state so nodeIds are always
        // valid — even if the proposal was built when the file was not open (isNonActiveFile
        // path in AgentRunner) and the file was later opened before approval.
        const freshView = new DocumentViewBuilder().build(editor)
        const resolved = resolveProposalNodeIds(proposal, freshView.blockMap)
        if (!resolved) {
          return {
            success: false,
            error:
              `Cannot resolve block IDs for "${proposal.type}" proposal. ` +
              `The document may have changed since the proposal was built. ` +
              `Try re-reading the document and making a new edit request.`,
          }
        }
        return applyBlockEditProposal(editor, resolved)
      },
      dispose: () => {},
    }
  }

  /**
   * Load a disk file into a virtual Editor and return a fresh DocumentHandle.
   * The DeepAgents runtime now owns session lifecycle explicitly, so we avoid
   * keeping any global static editor cache here.
   */
  static async fromFile(filePath: string): Promise<DocumentHandle | { error: string }> {
    return this._createFromFile(filePath)
  }

  /**
   * Create a fresh (non-cached) handle for a disk file.
   * Used by approveEditProposal() so each approval operates on the latest
   * on-disk state (important when multiple proposals are applied in sequence).
   */
  static async createFreshFromFile(filePath: string): Promise<DocumentHandle | { error: string }> {
    return this._createFromFile(filePath)
  }

  /** Legacy no-op. The document session cache was removed from this class. */
  static getCachedPaths(): string[] {
    return []
  }

  /** Legacy no-op. The document session cache was removed from this class. */
  static disposeAll(): void {
    // no-op
  }

  // ── private ──────────────────────────────────────────────────────────────

  private static async _createFromFile(filePath: string): Promise<DocumentHandle | { error: string }> {
    const raw = await window.electronAPI.readFile(filePath)
    if (raw === null) return { error: `File not found or unreadable: "${filePath}"` }

    const ext = pathUtils.extension(filePath)
    const converted = await convertContentFrom(raw, ext)
    if (!converted) return { error: `Unsupported file type: ".${ext}". Use exec_shell to read this file.` }

    const extensions = buildVirtualEditorExtensions()
    const json = generateJSON(converted.content, extensions)
    const virtualEditor = new Editor({ content: json, extensions })
    ensureNodeIds(virtualEditor)

    const view = new DocumentViewBuilder().build(virtualEditor)
    const snapshot: DocumentViewSnapshot = {
      view,
      editor: virtualEditor,
      cursorBlockId: null,
      filePath,
    }

    const handle: DocumentHandle = {
      snapshot,

      applyBlockProposal: async (proposal: BlockEditProposal): Promise<ApplyResult> => {
        // Re-build a fresh view from the virtual editor's current state so nodeIds
        // are always valid (the editor may have been mutated by a prior approval).
        const freshView = new DocumentViewBuilder().build(virtualEditor)
        const resolved = resolveProposalNodeIds(proposal, freshView.blockMap)
        if (!resolved) {
          return {
            success: false,
            error: `Cannot resolve block IDs for proposal type "${proposal.type}". ` +
                   `The file may have changed since it was last read. ` +
                   `Try calling get_document_outline(file_path=...) again to get fresh block IDs.`,
          }
        }

        const applyResult = await applyBlockEditProposal(virtualEditor, resolved)
        if (!applyResult.success) return applyResult

        // Serialize and save back to disk
        const newContent = convertContentTo(virtualEditor, ext, converted.lineEnding ?? undefined)
        if (newContent === null) {
          return { success: false, error: 'Failed to serialize edited content' }
        }
        const saved = await window.electronAPI.saveFile(newContent, filePath)
        if (!saved) {
          return { success: false, error: `Failed to write file: "${filePath}"` }
        }
        return { success: true }
      },

      dispose: () => virtualEditor.destroy(),
    }

    return handle
  }
}

// ── Node ID resolution ────────────────────────────────────────────────────────

type BlockMapEntry = DocumentViewSnapshot['view']['blockMap'][number]

/**
 * Resolve displayBlockId(s) → nodeId(s) using the current blockMap.
 * Returns a copy of the proposal with nodeId fields filled in, or null if
 * any required block is missing.
 */
function resolveProposalNodeIds(
  proposal: BlockEditProposal,
  blockMap: BlockMapEntry[]
): BlockEditProposal | null {
  const findEntry = (displayId: number): BlockMapEntry | undefined =>
    blockMap.find(b => b.displayId === displayId)

  switch (proposal.type) {
    case 'edit':
    case 'delete': {
      const entry = findEntry(proposal.displayBlockId ?? -1)
      if (!entry) return null
      return { ...proposal, nodeId: entry.nodeId, nodeType: entry.nodeType }
    }

    case 'insert': {
      // displayBlockId === 0 means insert at document start
      if (!proposal.displayBlockId || proposal.displayBlockId === 0) {
        return { ...proposal, afterNodeId: '0' }
      }
      const entry = findEntry(proposal.displayBlockId)
      if (!entry) return null
      return { ...proposal, afterNodeId: entry.nodeId }
    }

    case 'replace_range': {
      const startEntry = findEntry(proposal.startDisplayBlockId ?? -1)
      const endEntry   = findEntry(proposal.endDisplayBlockId   ?? -1)
      if (!startEntry || !endEntry) return null
      return {
        ...proposal,
        startNodeId: startEntry.nodeId,
        endNodeId:   endEntry.nodeId,
      }
    }

    default:
      return null
  }
}
