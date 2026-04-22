/**
 * DocumentLoader — shared document access layer for AI Agent and SearchReplaceInFiles.
 *
 * Both subsystems need to open a document (preferring a live editor tab, falling back to
 * disk) and then work with a TipTap Editor. Previously each had its own implementation
 * of that open-or-disk logic. This module extracts the shared portion:
 *
 *   1. Prefer the live TipTap editor from an open tab (captures unsaved changes).
 *   2. Fall back to reading from disk: convertContentFrom → generateJSON → headless Editor.
 *
 * Each subsystem keeps its own upper layer:
 *   - AI Agent: DocumentViewBuilder (block-level view) + BlockEditApplier — in UnifiedDocumentAccess.ts
 *   - SearchReplace: findMatchesInDocument + insertContentAt — in iwSearchReplaceInFilesService.ts
 */

import { Editor, generateJSON } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { AnyExtension } from '@tiptap/core'
import { createBaseExtensions } from '@/utils/editorExtensions'
import { convertContentFrom, convertContentTo } from '@/import-export/formatConverter'
import { pathUtils } from '@/utils/pathUtils'
import type { FileTab } from '@/types'

// ── Public types ─────────────────────────────────────────────────────────────

export interface LoadedDocument {
  /** TipTap Editor — live tab editor or headless virtual editor from disk. */
  editor: Editor
  /** Direct reference to editor.state.doc; safe to use after release() because ProseMirrorNodes are immutable. */
  doc: ProseMirrorNode
  /** File extension without leading dot, forwarded to convertContentTo(). */
  extension: string
  /** Detected or inherited line-ending style, preserved on round-trip save. */
  lineEnding: 'LF' | 'CRLF'
  /** True when the document is backed by an open tab; false for disk-loaded virtual editors. */
  isLive: boolean
  /** Releases resources: no-op for live tabs, destroys the virtual editor for disk-loaded docs. */
  release(): void
  /** Serializes the current editor content to the original file format string. */
  serialize(): string | null
}

export interface LoadError {
  error: string
}

export type LoadResult = LoadedDocument | LoadError

export function isLoadError(result: LoadResult): result is LoadError {
  return 'error' in result
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Load a document from an open tab (preferred) or directly from disk.
 *
 * @param filePath         Absolute path to the target file.
 * @param openTabs         Current open tabs from the app store. Pass `undefined` to skip tab lookup.
 * @param extraExtensions  Additional TipTap extensions injected into headless editors.
 *                         AI Agent passes [UniqueID]; SearchReplace passes [].
 */
export async function loadDocument(
  filePath: string,
  openTabs: FileTab[] | undefined,
  extraExtensions: AnyExtension[] = []
): Promise<LoadResult> {
  const extension = pathUtils.extension(filePath)

  const openTab = openTabs?.find(tab => tab.path === filePath)
  if (openTab?.editorInstance) {
    const editor = openTab.editorInstance as Editor
    const lineEnding: 'LF' | 'CRLF' = openTab.editState?.lineEnding ?? 'LF'
    return {
      editor,
      doc: editor.state.doc,
      extension,
      lineEnding,
      isLive: true,
      release: () => {},
      serialize: () => convertContentTo(editor, extension, lineEnding),
    }
  }

  return _loadFromDisk(filePath, extension, extraExtensions)
}

/**
 * Load a document directly from disk, bypassing any open tab.
 * Used by AI Agent's approval path to always operate on the latest on-disk state.
 */
export async function loadDocumentFromDisk(
  filePath: string,
  extraExtensions: AnyExtension[] = []
): Promise<LoadResult> {
  if (!pathUtils.isAbsolutePath(filePath)) {
    return { error: `file_path must be an absolute path: "${filePath}"` }
  }
  return _loadFromDisk(filePath, pathUtils.extension(filePath), extraExtensions)
}

// ── Private ───────────────────────────────────────────────────────────────────

async function _loadFromDisk(
  filePath: string,
  extension: string,
  extraExtensions: AnyExtension[]
): Promise<LoadResult> {
  let raw: string | null
  try {
    raw = await window.electronAPI.readFile(filePath)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `Failed to read file "${filePath}": ${msg}` }
  }
  if (raw === null) return { error: `File not found or unreadable: "${filePath}"` }

  const converted = await convertContentFrom(raw, extension)
  if (!converted) {
    return { error: `Unsupported file type: ".${extension}". Use execute command to read this file.` }
  }

  const extensions = [...createBaseExtensions(), ...extraExtensions]
  const json = generateJSON(converted.content, extensions)
  const virtualEditor = new Editor({ content: json, extensions })
  const lineEnding = converted.lineEnding

  return {
    editor: virtualEditor,
    doc: virtualEditor.state.doc,
    extension,
    lineEnding,
    isLive: false,
    release: () => virtualEditor.destroy(),
    serialize: () => convertContentTo(virtualEditor, extension, lineEnding),
  }
}
