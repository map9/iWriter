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
  workspaceIgnoreRules?: string
  useGitignoreForExplorer?: boolean
  useGitignoreForSearch?: boolean
  useGitignoreForWatcher?: boolean
  codeBlockLanguageScope?: 'common' | 'all'
  /** 无暂存更改时点「提交」的行为：all=提交所有更改(默认,对标 VSCode) / off=禁用 / prompt=每次询问 */
  commitWhenEmpty?: 'all' | 'off' | 'prompt'
}
