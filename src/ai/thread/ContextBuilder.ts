/**
 * ContextBuilder — EditorState injection + document snapshot helpers.
 *
 * buildEditorStateBlock(...)        — delta-based XML prepended to each user message;
 *                                     injects only what changed since the last message
 * buildSnapshot(editor, pos?, path?) — DocumentViewSnapshot used by tools and EditorState
 */

import type { AiThread, OpenTabInfo } from '@/ai/types'
import type { Editor } from '@tiptap/core'
import { DocumentViewBuilder, type DocumentView } from '../edit-agent/DocumentViewBuilder'

// ── Document View Cache ────────────────────────────────────────────────────

/**
 * A per-request snapshot of the document view (built once per sendMessage call).
 * Shared between ContextBuilder, document tooling, and EditorState injection.
 */
export interface DocumentViewSnapshot {
  view: DocumentView
  editor: Editor
  cursorBlockId: number | null   // displayId of the block containing the cursor
  filePath?: string              // path of the active editing file (undefined when no file is open)
}

// ── EditorState Block ──────────────────────────────────────────────────────

/** Block count threshold: inline content when ≤ this, otherwise IDs only. */
const INLINE_BLOCK_THRESHOLD = 5

/** Lightweight hash for detecting document state changes across messages. */
function hashEditorState(
  filePath: string | null,
  outlineText: string,
  sectionHeading: string | null
): string {
  const input = `${filePath ?? 'none'}|${outlineText}|${sectionHeading ?? ''}`
  let h = 0
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  return h.toString(36)
}

/** Return block displayIds covered by the editor's current selection (empty if no selection). */
function getSelectionBlockIds(snapshot: DocumentViewSnapshot): number[] {
  const { from, to } = snapshot.editor.state.selection
  if (from === to) return []
  return snapshot.view.blockMap
    .filter(b => b.from < to && b.to > from)
    .map(b => b.displayId)
}

type CursorSectionNode = {
  heading: string | null
  sectionStartBlockId: number | null
  cursorBlockId: number
}

/** Build cursor section info from snapshot. Returns null if cursor position unknown. */
function buildCursorSectionNode(
  snapshot: DocumentViewSnapshot,
  _builder: DocumentViewBuilder
): CursorSectionNode | null {
  const { cursorBlockId, view } = snapshot
  if (cursorBlockId === null) return null

  const sectionHeading = findContainingHeading(cursorBlockId, view)

  if (sectionHeading) {
    return {
      heading: sectionHeading.text,
      sectionStartBlockId: sectionHeading.displayId,
      cursorBlockId,
    }
  }

  // No heading — cursor is at doc start or before first heading
  return {
    heading: null,
    sectionStartBlockId: null,
    cursorBlockId,
  }
}

function appendCursorSectionXml(
  lines: string[],
  node: CursorSectionNode,
  indent: string
): void {
  const headingAttr = node.heading ? ` heading="${node.heading}"` : ''
  const startAttr = node.sectionStartBlockId !== null ? ` section_start="{b:${node.sectionStartBlockId}}"` : ''
  const cursorAttr = ` cursor="{b:${node.cursorBlockId}}"`
  lines.push(`${indent}<cursor_section${headingAttr}${startAttr}${cursorAttr} />`)
}

function appendSelectionXml(
  lines: string[],
  snapshot: DocumentViewSnapshot,
  builder: DocumentViewBuilder,
  indent: string
): void {
  const selIds = getSelectionBlockIds(snapshot)
  if (!selIds.length) return
  const idsAttr = ` block_ids="[${selIds.join(',')}]"`
  if (selIds.length <= INLINE_BLOCK_THRESHOLD) {
    const content = builder.buildRangeView(
      snapshot.editor, selIds[0]!, selIds[selIds.length - 1]!, snapshot.view.blockMap
    )
    lines.push(`${indent}<selection${idsAttr}>`)
    lines.push(content)
    lines.push(`${indent}</selection>`)
  } else {
    const hint = ` hint="Use get_blocks([${selIds.join(',')}]) to read selected content."`
    lines.push(`${indent}<selection${idsAttr}${hint} />`)
  }
}

export interface EditorStateContext {
  filePath: string | null
  isDirty: boolean
  folderPath: string | null
  openTabs: OpenTabInfo[]
  textFilePaths: string[]
  attachedDirectories: string[]
}

export interface EditorStateResult {
  /** The <editor_state> XML to prepend to the user message, or null if nothing changed. */
  xml: string | null
  /** Delta tracking fields to save back to the thread after injection. */
  threadUpdate: {
    editorStateHash?: string
    lastFilePath?: string | null
    lastSectionHeading?: string | null
    workspaceInjected?: boolean
  }
}

/**
 * Build an <editor_state> XML block to prepend to a user message.
 * Implements delta logic: only injects what has changed since the last message.
 * Returns null xml when no context changed (and no attachments).
 */
export function buildEditorStateBlock(
  thread: AiThread,
  snapshot: DocumentViewSnapshot | null,
  ctx: EditorStateContext
): EditorStateResult {
  const builder = _builder
  const isFirstMsg = (thread.messages?.length ?? 0) <= 1
  const hasAttachments = ctx.textFilePaths.length > 0 || ctx.attachedDirectories.length > 0

  const sectionNode = snapshot ? buildCursorSectionNode(snapshot, builder) : null
  const cursorHeading = sectionNode?.heading ?? null

  const currentHash = snapshot
    ? hashEditorState(ctx.filePath, snapshot.view.outlineText, cursorHeading)
    : ''

  const fileChanged =
    !isFirstMsg &&
    thread.lastFilePath !== undefined &&
    thread.lastFilePath !== ctx.filePath
  const hashChanged = currentHash !== (thread.editorStateHash ?? '')
  const sectionChanged =
    !isFirstMsg && !hashChanged && thread.lastSectionHeading !== cursorHeading

  type ChangeType = 'full' | 'file_changed' | 'document_content' | 'cursor_section' | 'attachments_only'
  let change: ChangeType | null

  if (isFirstMsg) {
    change = 'full'
  } else if (fileChanged) {
    change = 'file_changed'
  } else if (hashChanged && snapshot) {
    change = 'document_content'
  } else if (sectionChanged && sectionNode) {
    change = 'cursor_section'
  } else if (hasAttachments) {
    change = 'attachments_only'
  } else {
    change = null
  }

  // Compute thread update fields
  const threadUpdate: EditorStateResult['threadUpdate'] = {}
  if (change && change !== 'attachments_only') {
    threadUpdate.editorStateHash = currentHash
    threadUpdate.lastFilePath = ctx.filePath
    threadUpdate.lastSectionHeading = cursorHeading
    if (change === 'full') threadUpdate.workspaceInjected = true
  }

  if (!change) return { xml: null, threadUpdate }

  // Build XML
  const lines: string[] = []
  const prevAttr = fileChanged ? ` previous_file="${thread.lastFilePath ?? 'none'}"` : ''
  lines.push(`<editor_state change="${change}"${prevAttr}>`)

  // Workspace — first message only
  if (change === 'full' && ctx.folderPath) {
    lines.push(`  <workspace>${ctx.folderPath}</workspace>`)
  }

  // Active document — full / file_changed / document_content
  if (snapshot && (change === 'full' || change === 'file_changed' || change === 'document_content')) {
    const pathAttr = ctx.filePath ? ` path="${ctx.filePath}"` : ''
    const statusAttr = ctx.filePath
      ? ` status="${ctx.isDirty ? 'unsaved' : 'saved'}"`
      : ' status="unsaved_new"'
    lines.push(`  <active_document${pathAttr}${statusAttr}>`)
    lines.push('    <outline>')
    lines.push(snapshot.view.outlineText)
    lines.push('    </outline>')
    if (sectionNode) appendCursorSectionXml(lines, sectionNode, '    ')
    appendSelectionXml(lines, snapshot, builder, '    ')
    lines.push('  </active_document>')
  }

  // Cursor section only — cursor_section change
  if (change === 'cursor_section' && sectionNode) {
    appendCursorSectionXml(lines, sectionNode, '  ')
  }

  // Open tabs — first message only
  if (change === 'full' && ctx.openTabs.length > 0) {
    lines.push('  <open_tabs>')
    for (const tab of ctx.openTabs) {
      if (tab.path) {
        lines.push(`    <tab path="${tab.path}" status="${tab.isDirty ? 'unsaved' : 'saved'}" />`)
      } else {
        lines.push(`    <tab name="${tab.name}" status="unsaved_new" />`)
      }
    }
    lines.push('  </open_tabs>')
  }

  // Attached files and directories
  if (hasAttachments) {
    if (ctx.textFilePaths.length > 0) {
      lines.push('  <attached_files>')
      for (const p of ctx.textFilePaths) lines.push(`    <file path="${p}" />`)
      lines.push('  </attached_files>')
    }
    if (ctx.attachedDirectories.length > 0) {
      lines.push('  <attached_dirs>')
      for (const d of ctx.attachedDirectories) lines.push(`    <dir path="${d}" />`)
      lines.push('  </attached_dirs>')
    }
  }

  lines.push('</editor_state>')
  return { xml: lines.join('\n'), threadUpdate }
}

const _builder = new DocumentViewBuilder()

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a DocumentViewSnapshot from an editor instance. */
export function buildSnapshot(editor: Editor, cursorPos?: number, filePath?: string): DocumentViewSnapshot {
  const view = _builder.build(editor)
  const pos = cursorPos ?? editor.state.selection.from
  const cursorBlockId = findBlockAtPos(pos, view.blockMap)
  return { view, editor, cursorBlockId, filePath }
}

/** Find the displayId of the block that contains position `pos`. */
function findBlockAtPos(pos: number, blockMap: DocumentViewSnapshot['view']['blockMap']): number | null {
  for (const entry of blockMap) {
    if (pos >= entry.from && pos < entry.to) return entry.displayId
  }
  return null
}

/** Find the nearest heading that contains the given displayId (for section context). */
function findContainingHeading(
  displayId: number,
  view: DocumentView
): { displayId: number; text: string; level: number } | null {
  // Walk backwards through outline to find the heading that "owns" this block
  const headings = [...view.outline].reverse()
  for (const h of headings) {
    if (h.displayId <= displayId) {
      return { displayId: h.displayId, text: h.text, level: h.level }
    }
  }
  return null
}
