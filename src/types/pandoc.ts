export type PandocErrorCode =
  | 'NOT_INSTALLED'
  | 'UNSUPPORTED_FORMAT'
  | 'CONVERSION_FAILED'

export interface PandocAvailabilityResult {
  available: boolean
  version?: string
  error?: string
  installHint?: string
  executablePath?: string
}

export interface PandocImportRequest {
  inputPath: string
  pandocPath?: string
}

export interface PandocImportResult {
  success: boolean
  markdown?: string
  sourceFormat?: string
  error?: string
  errorCode?: PandocErrorCode
}

export interface PandocExportRequest {
  markdown: string
  outputPath: string
  title?: string
  pandocPath?: string
  options?: {
    customArgs?: string
    referenceDocPath?: string
    templatePath?: string
    cssPath?: string
    tocDepth?: number
  }
}

export interface PandocExportResult {
  success: boolean
  outputPath?: string
  targetFormat?: string
  error?: string
  errorCode?: PandocErrorCode
}
