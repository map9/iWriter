import { type Editor } from '@tiptap/vue-3'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import { getContentState } from './state'
import { getActualSelectionRange, getSelectionText } from '@/components/common/tiptap'

function getCurrentLineFromPos(editor: Editor | undefined, pos: number): number {
  if (!editor) return 1
  const doc = editor?.state.doc
  let line = 1
  let currentPos = 0
  
  doc.descendants((node: ProseMirrorNode, offset: number) => {
    if (currentPos >= pos) return false
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      if (offset + node.nodeSize >= pos) {
        return false
      }
      line++
    }
    currentPos = offset + node.nodeSize
    return true
  })
  
  return line
}

function getCurrentColumnFromPos(editor: Editor | undefined, pos: number): number {
  if (!editor) return 1
  const doc = editor?.state.doc
  const resolved = doc.resolve(pos)
  return resolved.parentOffset + 1
}

function getSelectionCharCount(selection: Selection): number {
  if (selection.empty) return 0
  const { from, to } = getActualSelectionRange(selection)
  return to - from
}

function getSelectionWordCount(editor: Editor | undefined, selection: Selection): number {
  if (selection.empty || !editor) return 0
  const selectedText = getSelectionText(editor.state.doc, selection)
  return countWords(selectedText)
}

function countWords(text: string): number {
  if (!text.trim()) return 0
  // 使用正则匹配单词，排除标点符号
  const words = text.trim().match(/\b[a-zA-Z0-9\u4e00-\u9fff]+\b/g)
  return words ? words.length : 0
}

function countParagraphs(doc: ProseMirrorNode): number {
  let count = 0
  doc.descendants((node: ProseMirrorNode) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      count++
    }
  })
  return count
}

export function calculateFileStats(editor: Editor | undefined): import('@/types').FileStats {
  if (!editor) {
    return {
      currentLine: 1,
      currentColumn: 1,
      paragraphType: 'paragraph',
      selectionCharCount: 0,
      selectionWordCount: 0,
      totalCharCount: 0,
      totalWordCount: 0,
      totalParagraphCount: 0,
    }
  }

  const selection = editor.state.selection
  const doc = editor.state.doc
  const content = doc.textContent
  const hasSelection = !editor.state.selection.empty
  const { type } = hasSelection ? { type: 'unknown' } : getContentState(editor)
  
  return {
    currentLine: getCurrentLineFromPos(editor, selection.from),
    currentColumn: getCurrentColumnFromPos(editor, selection.from),
    paragraphType: hasSelection ? 'Selection' : (((typeof type === 'number')) ? `heading-${type}` : (type || 'unknown')),
    selectionCharCount: getSelectionCharCount(selection),
    selectionWordCount: getSelectionWordCount(editor, selection),
    totalCharCount: content.length,
    totalWordCount: countWords(content),
    totalParagraphCount: (content.length == 0)? 0 : countParagraphs(doc),
  }
}