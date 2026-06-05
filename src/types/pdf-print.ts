// PDF print settings – used by PdfPrintDialog / PdfPrintSettingsForm

export interface PdfPrintSettings {
  /** Printer device name, or empty string for the default printer */
  printer: string
  pageRange: 'all' | 'odd' | 'even' | 'custom'
  customPageRange: string
  copies: number
  pagesPerSheet: number
  dpi: number
  scaleMode: 'default' | 'custom'
  customScale: number
  color: 'color' | 'grayscale'
  paperSize: string
  orientation: 'portrait' | 'landscape'
  margins: 'default' | 'none' | 'minimum'
  duplex: 'simplex' | 'longEdge' | 'shortEdge'
}

export const DEFAULT_PDF_PRINT_SETTINGS: PdfPrintSettings = {
  printer: '',
  pageRange: 'all',
  customPageRange: '',
  copies: 1,
  pagesPerSheet: 1,
  dpi: 300,
  scaleMode: 'default',
  customScale: 100,
  color: 'color',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'default',
  duplex: 'simplex',
}
