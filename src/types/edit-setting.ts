// 文字内容类型信息
export interface EditSetting {
  lineEnding?: 'CRLF' | 'LF'
  autoSave?: boolean
  invisibleCharacters?: boolean
  firstLineIndent?: boolean
  smartPunctuation?: boolean
  showProofreadErrors?: boolean
  proofread?: boolean
}