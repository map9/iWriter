export type ExportFormatId =
  | 'html'
  | 'docx'
  | 'odt'
  | 'rtf'
  | 'epub'
  | 'latex'
  | 'mediawiki'
  | 'rst'
  | 'textile'
  | 'opml'

export type ExportFolderMode = 'prompt' | 'same-directory' | 'custom'
export type PandocPathMode = 'auto' | 'custom'

export interface ExportCommonSettings {
  defaultFolderMode: ExportFolderMode
  customFolderPath: string
  pandocPathMode: PandocPathMode
  pandocPath: string
  afterExportActions: {
    reveal: boolean
    open: boolean
  }
}

export interface ExportFormatSettings {
  customArgs: string
  referenceDocPath?: string
  templatePath?: string
  cssPath?: string
  tocDepth?: number
}

export interface ExportSettings {
  common: ExportCommonSettings
  formats: Record<ExportFormatId, ExportFormatSettings>
}
