export interface LibreOfficeAvailabilityResult {
  available: boolean
  version?: string
  executablePath?: string
  error?: string
  /** 适合用户阅读的安装说明（多行文本） */
  installHint?: string
  /** 适合在终端执行的安装命令（一行，适合复制） */
  installCommand?: string
  /** 官方下载页 URL */
  downloadUrl?: string
}

export interface OfficeConvertRequest {
  inputPath: string
  sofficePath?: string
}

export interface OfficeConvertResult {
  success: boolean
  pdfPath?: string
  errorCode?: 'NOT_INSTALLED' | 'CONVERSION_FAILED' | 'OUTPUT_NOT_FOUND'
  error?: string
}
