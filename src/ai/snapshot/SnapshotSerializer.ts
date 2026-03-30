/**
 * SnapshotSerializer — converts a TipTap document (active editor or disk file)
 * into a JSON-safe SerializedSnapshot suitable for IPC transport.
 *
 * Used by the renderer to respond to 'ai:request-snapshot' events from the main process.
 * The main process uses the serialized data to run document read tools without
 * needing a live TipTap Editor instance.
 */

import type { Editor } from '@tiptap/core'
import { UnifiedDocumentAccess } from '@/ai/edit-agent/UnifiedDocumentAccess'
import type {
  SerializedSnapshot,
  SerializedBlockEntry,
} from '@/types/ai-ipc'

// Re-export for convenience
export type { SerializedSnapshot, SerializedBlockEntry }

/**
 * Build a SerializedSnapshot for the given file path.
 *
 * @param filePath - null = active tab, string = requested file path
 * @param editor - the TipTap editor for the requested file (null if file is not open in any tab)
 * @param editorFilePath - path associated with the provided editor instance
 */
export async function buildSerializedSnapshot(
  filePath: string | null,
  editor: Editor | null,
  editorFilePath: string | null,
  cursorBlockId: number | null = null
): Promise<SerializedSnapshot | null> {
  try {
    let handle: import('@/ai/edit-agent/UnifiedDocumentAccess').DocumentHandle | null = null

    const targetPath = filePath?.replace(/\\/g, '/') ?? null

    if (editor !== null) {
      // File is open in a tab — use live editor content (includes unsaved changes)
      handle = UnifiedDocumentAccess.fromEditor(editor, editorFilePath ?? undefined)
    } else if (targetPath !== null) {
      // File not open in any tab — load from disk
      const result = await UnifiedDocumentAccess.fromFile(targetPath)
      if ('error' in result) {
        console.warn('[SnapshotSerializer] fromFile error:', result.error)
        return null
      }
      handle = result
    } else {
      // No editor and no file path — no active document
      return null
    }

    const view = handle.snapshot.view

    // Build serialized block map with content for each block
    const blockMap: SerializedBlockEntry[] = view.blockMap.map(entry => {
      // Import nodeToMarkdown dynamically to avoid circular deps
      const content = extractBlockContent(view.viewMarkdown, entry.displayId)
      const headingMatch = entry.nodeType === 'heading'
        ? extractHeadingLevel(content)
        : undefined
      return {
        displayId: entry.displayId,
        nodeId: entry.nodeId,
        nodeType: entry.nodeType,
        content,
        headingLevel: headingMatch,
      }
    })

    const snapshot: SerializedSnapshot = {
      filePath: targetPath,
      viewMarkdown: view.viewMarkdown,
      outlineText: view.outlineText,
      blockMap,
      outline: view.outline.map(o => ({
        displayId: o.displayId,
        level: o.level,
        text: o.text,
        sectionBlocks: o.sectionBlocks,
        wordCount: o.wordCount,
      })),
      totalBlocks: view.totalBlocks,
      totalWords: view.totalWords,
      cursorBlockId,
    }

    return snapshot
  } catch (err) {
    console.error('[SnapshotSerializer] Failed to build snapshot:', err)
    return null
  }
}

/**
 * Extract the Markdown content of a specific block from the full viewMarkdown.
 * The viewMarkdown format is: "{b:1}\ncontent\n\n{b:2}\ncontent\n\n..."
 */
function extractBlockContent(viewMarkdown: string, displayId: number): string {
  const marker = `{b:${displayId}}`
  const nextMarker = `{b:${displayId + 1}}`

  const startIdx = viewMarkdown.indexOf(marker)
  if (startIdx === -1) return ''

  // Skip the marker line itself
  const contentStart = viewMarkdown.indexOf('\n', startIdx)
  if (contentStart === -1) return ''

  const endIdx = viewMarkdown.indexOf(nextMarker, contentStart)
  const rawContent = endIdx === -1
    ? viewMarkdown.slice(contentStart + 1)
    : viewMarkdown.slice(contentStart + 1, endIdx)

  return rawContent.trim()
}

/**
 * Extract the heading level from a markdown heading string.
 * Returns 1-6 for headings, undefined for non-headings.
 */
function extractHeadingLevel(content: string): number | undefined {
  const match = content.match(/^(#{1,6})\s/)
  return match ? match[1]!.length : undefined
}
