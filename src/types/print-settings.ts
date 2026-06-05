// Shared base print settings used by all print engines (HTML + PDF).
// Extended by PdfPrintSettings and ImagePrintSettings for engine-specific fields.

export interface BasePrintSettings {
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
}

export const DEFAULT_BASE_PRINT_SETTINGS: BasePrintSettings = {
  printer: '',
  pageRange: 'all',
  customPageRange: '',
  copies: 1,
  pagesPerSheet: 1,
  dpi: 300,
  scaleMode: 'default',
  customScale: 100,
  color: 'color',
}
