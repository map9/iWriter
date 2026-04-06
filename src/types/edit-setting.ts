// 文字内容类型信息
export interface EditSetting {
  autoSave?: boolean
  lineEnding?: 'CRLF' | 'LF'
  invisibleCharacters?: boolean
  firstLineIndent?: boolean
  smartPunctuation?: boolean
  showProofreadErrors?: boolean
  proofread?: boolean
  readonly?: boolean
  fileReadonly?: boolean
  editReadonly?: boolean
  proofreadEngineType?: 'typo' | 'languagetool'
  proofreadLanguage?: string
  proofreadApiUrl?: string
  proofreadApiKey?: string
}
