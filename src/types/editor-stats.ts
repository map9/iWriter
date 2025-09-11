// 编辑器统计信息接口
export interface EditorStats {
  currentLine: number
  currentColumn: number
  paragraphType: string
  selectionCharCount: number
  selectionWordCount: number
  totalCharCount: number
  totalWordCount: number
  totalParagraphCount: number
  lineEnding: 'LF' | 'CRLF'
  invisibleCharacters: boolean
}