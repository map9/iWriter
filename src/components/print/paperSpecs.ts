// Shared paper specification constants and helpers.
// Used by PrintDialog.vue (Markdown HTML printing) and PdfPrintSettingsForm.vue (PDF printing).

export type PaperSpec = {
  value: string
  label: string
  widthMm: number
  heightMm: number
  cupsMediaIds?: string[]
  electronPrintKeyword?: boolean
  showInUi?: boolean
}

export const PAPER_SPECS: PaperSpec[] = [
  { value: 'A0',     label: 'A0 (841 × 1189 mm)',  widthMm: 841,   heightMm: 1189,  cupsMediaIds: ['iso_a0_841x1189mm'],      electronPrintKeyword: true, showInUi: false },
  { value: 'A1',     label: 'A1 (594 × 841 mm)',   widthMm: 594,   heightMm: 841,   cupsMediaIds: ['iso_a1_594x841mm'],       electronPrintKeyword: true, showInUi: false },
  { value: 'A2',     label: 'A2 (420 × 594 mm)',   widthMm: 420,   heightMm: 594,   cupsMediaIds: ['iso_a2_420x594mm'],       electronPrintKeyword: true, showInUi: false },
  { value: 'A3',     label: 'A3 (297 × 420 mm)',   widthMm: 297,   heightMm: 420,   cupsMediaIds: ['iso_a3_297x420mm'],       electronPrintKeyword: true, showInUi: true  },
  { value: 'A4',     label: 'A4 (210 × 297 mm)',   widthMm: 210,   heightMm: 297,   cupsMediaIds: ['iso_a4_210x297mm'],       electronPrintKeyword: true, showInUi: true  },
  { value: 'A5',     label: 'A5 (148 × 210 mm)',   widthMm: 148,   heightMm: 210,   cupsMediaIds: ['iso_a5_148x210mm'],       electronPrintKeyword: true, showInUi: true  },
  { value: 'A6',     label: 'A6 (105 × 148 mm)',   widthMm: 105,   heightMm: 148,   cupsMediaIds: ['iso_a6_105x148mm'],       electronPrintKeyword: true, showInUi: true  },
  { value: 'A7',     label: 'A7 (74 × 105 mm)',    widthMm: 74,    heightMm: 105,   cupsMediaIds: ['iso_a7_74x105mm'],        showInUi: true  },
  { value: 'A10',    label: 'A10 (26 × 37 mm)',    widthMm: 26,    heightMm: 37,    cupsMediaIds: ['iso_a10_26x37mm'],        showInUi: true  },
  { value: 'B4',     label: 'B4 (250 × 353 mm)',   widthMm: 250,   heightMm: 353,   cupsMediaIds: ['iso_b4_250x353mm'],       showInUi: true  },
  { value: 'B5',     label: 'B5 (176 × 250 mm)',   widthMm: 176,   heightMm: 250,   cupsMediaIds: ['iso_b5_176x250mm'],       showInUi: true  },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)',widthMm: 215.9, heightMm: 279.4, cupsMediaIds: ['na_letter_8.5x11in'],     electronPrintKeyword: true, showInUi: true  },
  { value: 'Legal',  label: 'Legal (8.5 × 14 in)', widthMm: 215.9, heightMm: 355.6, cupsMediaIds: ['na_legal_8.5x14in'],      electronPrintKeyword: true, showInUi: true  },
  { value: 'Ledger', label: 'Ledger (11 × 17 in)', widthMm: 279.4, heightMm: 431.8, cupsMediaIds: ['na_ledger_11x17in'],      showInUi: true  },
]

export const STANDARD_PAPER_SIZES = PAPER_SPECS
  .filter(spec => spec.showInUi !== false)
  .map(spec => ({ value: spec.value, label: spec.label }))

export const CUPS_MEDIA_MAP: Record<string, string> = Object.fromEntries(
  PAPER_SPECS.flatMap(spec => (spec.cupsMediaIds ?? []).map(mediaId => [mediaId, spec.value])),
)

const PAPER_DIMS_MM: Record<string, { widthMm: number; heightMm: number }> = Object.fromEntries(
  PAPER_SPECS.map(spec => [spec.value, { widthMm: spec.widthMm, heightMm: spec.heightMm }]),
)

export const ELECTRON_PRINT_KEYWORDS = new Set(
  PAPER_SPECS.filter(spec => spec.electronPrintKeyword).map(spec => spec.value),
)

export function getPaperDimensionsMm(size: string): { widthMm: number; heightMm: number } {
  return PAPER_DIMS_MM[size] ?? PAPER_DIMS_MM['A4'] ?? { widthMm: 210, heightMm: 297 }
}

export function detectColorSupport(info: Electron.PrinterInfo | null): boolean {
  if (!info) return true
  const opts = (info.options ?? {}) as Record<string, string>
  // CUPS printer-type bitmask: bit 3 (0x8) = color capability
  const pt = opts['printer-type']
  if (pt) {
    const n = parseInt(pt, pt.toLowerCase().startsWith('0x') ? 16 : 10)
    if (!isNaN(n)) return (n & 0x8) !== 0
  }
  // Explicit CUPS attribute
  const cs = opts['color-supported']
  if (cs !== undefined) return cs !== 'false' && cs !== '0'
  return true
}

export function getPrinterPaperSizes(info: Electron.PrinterInfo | null): typeof STANDARD_PAPER_SIZES {
  if (!info) return STANDARD_PAPER_SIZES
  const opts = (info.options ?? {}) as Record<string, string>
  const mediaStr = opts['media-supported']
  if (!mediaStr) return STANDARD_PAPER_SIZES

  const seen = new Set<string>()
  const result: typeof STANDARD_PAPER_SIZES = []

  for (const id of mediaStr.split(/\s+/)) {
    const val = CUPS_MEDIA_MAP[id.trim()]
    if (!val || seen.has(val)) continue
    seen.add(val)
    const entry = STANDARD_PAPER_SIZES.find(s => s.value === val)
    if (entry) result.push(entry)
  }

  return result.length > 0 ? result : STANDARD_PAPER_SIZES
}

/** Normalised printer state derived from CUPS options or the runtime status field. */
export type PrinterState = 'ready' | 'printing' | 'offline' | 'unknown'

export function getPrinterState(info: Electron.PrinterInfo | null): PrinterState {
  if (!info) return 'unknown'
  const opts = (info.options ?? {}) as Record<string, string>

  // printer-is-accepting-jobs is the most reliable offline signal
  if (opts['printer-is-accepting-jobs'] === 'false') return 'offline'

  // printer-state-reasons may contain offline/disconnected keywords
  const reasons = (opts['printer-state-reasons'] ?? '').toLowerCase()
  if (
    reasons.includes('offline') ||
    reasons.includes('disconnected') ||
    reasons.includes('com-apple') ||        // macOS unavailable reasons
    reasons.includes('connection-error')
  ) {
    return 'offline'
  }

  // CUPS `printer-state` attribute (string "3" | "4" | "5")
  const cupsState = opts['printer-state']
  if (cupsState === '5') return 'offline'
  if (cupsState === '4') return 'printing'
  if (cupsState === '3') return 'ready'

  // Chromium exposes a numeric `status` field at runtime (not in TS type)
  const runtimeStatus = (info as unknown as { status?: number }).status
  if (runtimeStatus === 5) return 'offline'
  if (runtimeStatus === 4) return 'printing'
  if (runtimeStatus === 3) return 'ready'

  return 'unknown'
}

/** Returns true if the printer is not known to be offline. */
export function isPrinterConnectable(info: Electron.PrinterInfo): boolean {
  return getPrinterState(info) !== 'offline'
}

// ── N-up layout helpers (matches buildPreviewDoc.ts buildNUpLayout logic) ───────

/** Grid columns/rows for a given pages-per-sheet and user orientation. */
export function getNUpGrid(pps: number, orientation: 'portrait' | 'landscape'): { cols: number; rows: number } {
  if (pps === 2) return orientation === 'portrait' ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 }
  if (pps === 4) return { cols: 2, rows: 2 }
  if (pps === 6) return orientation === 'portrait' ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 }
  if (pps === 9) return { cols: 3, rows: 3 }
  return { cols: 1, rows: 1 }
}

/** Whether the physical SHEET is landscape.  Only pps=2 and pps=6 flip the orientation. */
export function getSheetIsLandscape(pps: number, orientation: 'portrait' | 'landscape'): boolean {
  const logical = orientation === 'landscape'
  return (pps === 2 || pps === 6) ? !logical : logical
}

/** Sheet width/height in mm for an N-up layout. */
export function getSheetDimsMm(pps: number, orientation: 'portrait' | 'landscape', paperSize: string): { w: number; h: number } {
  const base = getPaperDimensionsMm(paperSize)
  const landscape = getSheetIsLandscape(pps, orientation)
  return landscape
    ? { w: Math.max(base.widthMm, base.heightMm), h: Math.min(base.widthMm, base.heightMm) }
    : { w: Math.min(base.widthMm, base.heightMm), h: Math.max(base.widthMm, base.heightMm) }
}

export function parseCustomPageRangeInput(input: string, pageCount: number): number[] {
  if (pageCount <= 0) return []

  const pages = new Set<number>()
  for (const part of input.split(',')) {
    const token = part.trim()
    if (!token) continue
    if (token.includes('-')) {
      const segs = token.split('-')
      const a = parseInt(segs[0]?.trim() ?? '')
      const b = parseInt(segs[1]?.trim() ?? '')
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      const start = Math.max(Math.min(a, b), 1)
      const end = Math.min(Math.max(a, b), pageCount)
      for (let page = start; page <= end; page += 1) pages.add(page)
      continue
    }

    const page = parseInt(token)
    if (Number.isFinite(page) && page >= 1 && page <= pageCount) {
      pages.add(page)
    }
  }

  return Array.from(pages).sort((a, b) => a - b)
}
