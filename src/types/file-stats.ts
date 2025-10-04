// 编辑器统计信息接口
export interface FileStats {
  currentLine: number
  currentColumn: number
  paragraphType: string
  selectionCharCount: number
  selectionWordCount: number
  totalCharCount: number
  totalWordCount: number
  totalParagraphCount: number
}