import type { Editor } from '@tiptap/core'
import type { EditorStateDocument, EditorStateSnapshot } from '@/ai/ipc'
import type { FileTab } from '@/types'
import { DocumentType } from '@/types'
import { DocumentViewBuilder } from './DocumentViewBuilder'

const INLINE_SELECTION_BLOCK_LIMIT = 5
const builder = new DocumentViewBuilder()

function tabReference(tab: FileTab) {
  return {
    path: tab.path ?? null,
    virtualId: tab.path ? null : `untitled:${tab.id}`,
    name: tab.name,
    fileType: tab.documentType ?? DocumentType.MARKDOWN_EDITOR,
    dirty: tab.isDirty,
  }
}

function buildActiveDocument(tab: FileTab): EditorStateDocument {
  const base = tabReference(tab)
  const editor = tab.docState?.editorInstance as Editor | undefined
  if (!editor) {
    return {
      ...base,
      cursorBlockId: null,
      cursorSection: null,
      selection: null,
      outline: [],
    }
  }

  try {
    const view = builder.build(editor)
    const { from, to } = editor.state.selection
    const cursorBlockId = view.blockMap.find(entry => from >= entry.from && from < entry.to)?.displayId ?? null
    const heading = cursorBlockId === null
      ? null
      : [...view.outline].reverse().find(entry => entry.displayId <= cursorBlockId) ?? null
    const selectedBlocks = from === to
      ? []
      : view.blockMap.filter(entry => entry.from < to && entry.to > from)
    const selectionContent = selectedBlocks.length > 0 && selectedBlocks.length <= INLINE_SELECTION_BLOCK_LIMIT
      ? builder.buildRangeView(
        editor,
        selectedBlocks[0]!.displayId,
        selectedBlocks[selectedBlocks.length - 1]!.displayId,
        view.blockMap,
      )
      : null

    return {
      ...base,
      cursorBlockId,
      cursorSection: heading
        ? { heading: heading.text, headingBlockId: heading.displayId }
        : cursorBlockId === null ? null : { heading: null, headingBlockId: null },
      selection: selectedBlocks.length
        ? { blockIds: selectedBlocks.map(entry => entry.displayId), content: selectionContent }
        : null,
      outline: view.outline.map(entry => ({
        blockId: entry.displayId,
        level: entry.level,
        text: entry.text,
        sectionBlocks: entry.sectionBlocks,
        wordCount: entry.wordCount,
      })),
    }
  } catch (error) {
    console.warn('[EditorStateSerializer] Failed to inspect active editor:', error)
    return {
      ...base,
      cursorBlockId: null,
      cursorSection: null,
      selection: null,
      outline: [],
    }
  }
}

export function buildEditorStateSnapshot(
  tabs: FileTab[],
  activeTab: FileTab | undefined,
): EditorStateSnapshot {
  return {
    activeDocument: activeTab ? buildActiveDocument(activeTab) : null,
    openTabs: tabs.filter(tab => tab.id !== activeTab?.id).map(tabReference),
  }
}
