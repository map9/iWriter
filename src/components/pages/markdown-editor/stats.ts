import { type Editor } from '@tiptap/vue-3'
import { getContentType } from './state' 

function getCurrentLineFromPos(editor: Editor | undefined, pos: number): number {
  if (!editor) return 1
  const doc = editor?.state.doc
  let line = 1
  let currentPos = 0
  
  doc.descendants((node: any, offset: number) => {
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

function getSelectionCharCount(selection: any): number {
  if (selection.empty) return 0
  return selection.to - selection.from
}

function getSelectionWordCount(editor: Editor | undefined, selection: any): number {
  if (selection.empty || !editor) return 0
  const selectedText = editor.state.doc.textBetween(selection.from, selection.to)
  return countWords(selectedText)
}

function countWords(text: string): number {
  if (!text.trim()) return 0
  // 使用正则匹配单词，排除标点符号
  const words = text.trim().match(/\b[a-zA-Z0-9\u4e00-\u9fff]+\b/g)
  return words ? words.length : 0
}

function countParagraphs(doc: any): number {
  let count = 0
  doc.descendants((node: any) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      count++
    }
  })
  return count
}

function detectLineEnding(text: string): 'LF' | 'CRLF' {
  if (text.includes('\r\n')) return 'CRLF'
  return 'LF'
}

export function calculateEditorStats(editor: Editor | undefined): import('@/types').EditorStats {
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
      lineEnding: 'LF',
      invisibleCharacters: false,
    }
  }

  const selection = editor.state.selection
  const doc = editor.state.doc
  const content = doc.textContent
  let { type } = getContentType(editor)
  if (typeof type === 'number') {
    type = `heading-${type}`
  }
  
  return {
    currentLine: getCurrentLineFromPos(editor, selection.from),
    currentColumn: getCurrentColumnFromPos(editor, selection.from),
    paragraphType: type,
    selectionCharCount: getSelectionCharCount(selection),
    selectionWordCount: getSelectionWordCount(editor, selection),
    totalCharCount: content.length,
    totalWordCount: countWords(content),
    totalParagraphCount: (content.length == 0)? 0 : countParagraphs(doc),
    lineEnding: detectLineEnding(content),
    // @ts-ignore
    invisibleCharacters: editor?.storage.invisibleCharacters?.visibility?.() ?? false,
  }
}