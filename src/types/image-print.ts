// Image print settings – used by ImagePrintDialog / ImagePrintSettingsForm
import type { BasePrintSettings } from './print-settings'

export interface ImagePrintSettings extends BasePrintSettings {
  paperSize: string
  orientation: 'portrait' | 'landscape'
  margins: 'default' | 'none' | 'minimum'
  /** How the image is scaled to fit the paper */
  fit: 'contain' | 'cover' | 'actual'
  /** Visual rotation of the image in degrees (0 | 90 | 180 | 270) */
  rotation: number
}

export const DEFAULT_IMAGE_PRINT_SETTINGS: ImagePrintSettings = {
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
  fit: 'contain',
  rotation: 0,
}
