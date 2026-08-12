import type { Editor } from '@tiptap/core'
import type { EditorStateDocument, EditorStateSnapshot } from '@/ai/ipc'
import type { FileTab } from '@/types'
import { DocumentType } from '@/types'
import { DocumentViewBuilder } from './DocumentViewBuilder'

const builder = new DocumentViewBuilder()

function tabReference(tab: FileTab) {
  return {
    ref: tab.path ?? `untitled:${tab.id}`,
    fileType: tab.documentType ?? DocumentType.MARKDOWN_EDITOR,
    ...(!tab.path ? { displayName: tab.name } : {}),
  }
}

function buildActiveDocument(tab: FileTab): EditorStateDocument {
  const base = tabReference(tab)
  const editor = tab.docState?.editorInstance as Editor | undefined
  if (!editor) {
    return {
      ...base,
      cursor: null,
      selection: null,
    }
  }

  try {
    const blockMap = builder.buildBlockMap(editor)
    const { from, to } = editor.state.selection
    const cursorEntry = blockMap
      .filter(entry => !entry.isContainer && from >= entry.from && from < entry.to)
      .sort((left, right) => (left.to - left.from) - (right.to - right.from))[0]
      ?? blockMap.find(entry => from >= entry.from && from < entry.to)
      ?? null
    const headingEntry = cursorEntry === null
      ? null
      : [...blockMap].reverse().find(entry => (
        entry.nodeType === 'heading' && entry.displayId <= cursorEntry.displayId
      )) ?? null
    const headingNode = headingEntry ? editor.state.doc.nodeAt(headingEntry.from) : null
    const selectedBlocks = from === to
      ? []
      : blockMap.filter(entry => !entry.isContainer && entry.from < to && entry.to > from)
    const selectedText = from === to ? null : editor.state.doc.textBetween(from, to, '\n') || null

    return {
      ...base,
      cursor: cursorEntry
        ? {
          blockId: cursorEntry.displayId,
          containerBlockId: cursorEntry.containerId ?? (cursorEntry.isContainer ? cursorEntry.displayId : null),
          sectionHeadingBlockId: headingEntry?.displayId ?? null,
          sectionHeading: headingNode?.textContent ?? null,
        }
        : null,
      selection: selectedBlocks.length
        ? { blockIds: selectedBlocks.map(entry => entry.displayId), selectedText }
        : null,
    }
  } catch (error) {
    console.warn('[EditorStateSerializer] Failed to inspect active editor:', error)
    return {
      ...base,
      cursor: null,
      selection: null,
    }
  }
}

export function buildEditorStateSnapshot(
  tabs: FileTab[],
  activeTab: FileTab | undefined,
  options: { includeOpenTabs?: boolean } = {},
): EditorStateSnapshot {
  return {
    activeDocument: activeTab ? buildActiveDocument(activeTab) : null,
    ...(options.includeOpenTabs
      ? { openTabs: tabs.filter(tab => tab.id !== activeTab?.id).map(tabReference) }
      : {}),
  }
}
