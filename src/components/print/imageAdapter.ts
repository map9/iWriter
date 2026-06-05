/**
 * imageAdapter.ts
 *
 * Builds the HTML body and print CSS for image printing through the HTML engine.
 * The resulting html + css pair is passed to buildPreviewDocumentWithOptions(),
 * which injects pagedjs and renders a single-page preview identical to
 * what is sent to the printer / PDF exporter.
 */
import type { ImagePrintSettings } from '@/types/image-print'

// ---------------------------------------------------------------------------
// HTML body
// ---------------------------------------------------------------------------

/**
 * Returns a minimal HTML body fragment containing the image.
 * The actual layout (fit / rotation) is controlled by the CSS returned from
 * buildImagePrintCss(), so the HTML itself never needs to change when settings
 * change – only the CSS is rebuilt on each preview update.
 */
export function buildImagePrintHtml(filePath: string): string {
  // Normalise Windows back-slashes and ensure the path starts with exactly one slash.
  const normalised = filePath.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, (_, d) => `/${d}`)
  const src = `file://${normalised}`
  return `<div class="iw-image-page"><img class="iw-print-image" src="${src}" /></div>`
}

// ---------------------------------------------------------------------------
// Print CSS
// ---------------------------------------------------------------------------

type MarginValue = 'default' | 'none' | 'minimum'

const MARGIN_MAP: Record<MarginValue, string> = {
  default: '15mm',
  none:    '0',
  minimum: '3mm',
}

/**
 * Returns a CSS string for printing a single image on a page.
 * Compatible with pagedjs (single-page document) and Electron's
 * printFromHtml / saveToPdfFromHtml path.
 */
export function buildImagePrintCss(settings: Pick<ImagePrintSettings, 'paperSize' | 'orientation' | 'margins' | 'fit' | 'rotation' | 'color'>): string {
  const marginValue = MARGIN_MAP[settings.margins] ?? MARGIN_MAP.default

  // Fit mode → CSS rules for the <img> element
  let imgFitCss: string
  switch (settings.fit) {
    case 'cover':
      imgFitCss = 'width: 100%; height: 100%; object-fit: cover;'
      break
    case 'actual':
      imgFitCss = 'max-width: none; max-height: none; width: auto; height: auto;'
      break
    case 'contain':
    default:
      imgFitCss = 'max-width: 100%; max-height: 100%; object-fit: contain;'
      break
  }

  // Rotation – CSS transform
  const rotateCss = settings.rotation && settings.rotation % 360 !== 0
    ? `transform: rotate(${settings.rotation}deg); transform-origin: center center;`
    : ''

  // Grayscale filter
  const filterCss = settings.color === 'grayscale'
    ? 'filter: grayscale(100%);'
    : ''

  return `
@page {
  size: ${settings.paperSize} ${settings.orientation};
  margin: ${marginValue};
}

body {
  margin: 0;
  padding: 0;
  background: white;
}

.iw-image-page {
  /* Use pagedjs page-content dimensions */
  width: 100%;
  height: calc(var(--pagedjs-height, 297mm) - var(--pagedjs-margin-top, 15mm) - var(--pagedjs-margin-bottom, 15mm));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}

img.iw-print-image {
  display: block;
  ${imgFitCss}
  ${rotateCss}
  ${filterCss}
}
`.trim()
}
