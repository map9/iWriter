import type {
  FacingPageMargins,
  HeaderFooterSetup,
  MarkdownPrintOverrides,
  MarkdownPrintPreferences,
  MarkdownTheme,
  MarkdownThemeId,
  PageSetup,
  PaginationModePreset,
  PaginationSetup,
  PrintRuntimeOverrides,
  ResolvedMarkdownPrintSettings,
  RunningTitleSetup,
  SinglePageMargins,
} from '@/types'

export const MAIN_MARGIN_BOX_SLOTS = [
  'top-left',
  'top-center',
  'top-right',
  'left-top',
  'left-middle',
  'left-bottom',
  'right-top',
  'right-middle',
  'right-bottom',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export const CORNER_MARGIN_BOX_SLOTS = [
  'top-left-corner',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-right-corner',
] as const

export interface PaperSizeOption {
  value: string
  label: string
  widthMm: number
  heightMm: number
}

export const PRINT_PREFERENCES_PAPER_SIZES: PaperSizeOption[] = [
  { value: 'A3', label: 'A3 (297 × 420 mm)', widthMm: 297, heightMm: 420 },
  { value: 'A4', label: 'A4 (210 × 297 mm)', widthMm: 210, heightMm: 297 },
  { value: 'A5', label: 'A5 (148 × 210 mm)', widthMm: 148, heightMm: 210 },
  { value: 'A6', label: 'A6 (105 × 148 mm)', widthMm: 105, heightMm: 148 },
  { value: 'A7', label: 'A7 (74 × 105 mm)', widthMm: 74, heightMm: 105 },
  { value: 'A10', label: 'A10 (26 × 37 mm)', widthMm: 26, heightMm: 37 },
  { value: 'B4', label: 'B4 (250 × 353 mm)', widthMm: 250, heightMm: 353 },
  { value: 'B5', label: 'B5 (176 × 250 mm)', widthMm: 176, heightMm: 250 },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)', widthMm: 215.9, heightMm: 279.4 },
  { value: 'Legal', label: 'Legal (8.5 × 14 in)', widthMm: 215.9, heightMm: 355.6 },
  { value: 'Ledger', label: 'Ledger (11 × 17 in)', widthMm: 279.4, heightMm: 431.8 },
]

export function createSingleMargins(
  top = '20mm',
  right = '20mm',
  bottom = '20mm',
  left = '20mm',
): SinglePageMargins {
  return { top, right, bottom, left }
}

export function createFacingMargins(
  top = '20mm',
  bottom = '20mm',
  inside = '24mm',
  outside = '18mm',
): FacingPageMargins {
  return { top, bottom, inside, outside }
}

export function createPageSetup(overrides: Partial<PageSetup> = {}): PageSetup {
  return {
    size: 'A4',
    orientation: 'portrait',
    marginMode: 'single',
    margins: createSingleMargins(),
    pageSideStart: 'auto',
    background: false,
    ...overrides,
  }
}

// Per-mode preset of all sub-fields. Switching `mode` to a non-`custom` value
// in the UI replays this preset onto the target. Manually editing any sub-field
// flips `mode` to `'custom'` to signal divergence from the preset.
export const PAGINATION_MODE_PRESETS: Record<PaginationModePreset, Omit<PaginationSetup, 'mode'>> = {
  balanced: {
    keepWithNext: { headings: true, figureCaption: true, tableCaption: true },
    avoidBreakInside: {
      paragraph: false,
      blockquote: true,
      codeBlock: true,
      table: false,
      tableRow: true,
      image: true,
      listItem: false,
    },
    widows: 2,
    orphans: 2,
    chapterStartSide: 'auto',
    blankPageBehavior: 'suppress-header-footer',
  },
  compact: {
    keepWithNext: { headings: true, figureCaption: false, tableCaption: false },
    avoidBreakInside: {
      paragraph: false,
      blockquote: false,
      codeBlock: false,
      table: false,
      tableRow: false,
      image: false,
      listItem: false,
    },
    widows: 1,
    orphans: 1,
    chapterStartSide: 'auto',
    blankPageBehavior: 'allow',
  },
  'strict-book': {
    keepWithNext: { headings: true, figureCaption: true, tableCaption: true },
    avoidBreakInside: {
      paragraph: false,
      blockquote: true,
      codeBlock: true,
      table: true,
      tableRow: true,
      image: true,
      listItem: true,
    },
    widows: 3,
    orphans: 3,
    chapterStartSide: 'recto',
    blankPageBehavior: 'suppress-header-footer',
  },
}

export function applyPaginationModePreset(
  target: PaginationSetup,
  mode: PaginationModePreset,
): void {
  const preset = PAGINATION_MODE_PRESETS[mode]
  target.keepWithNext = { ...preset.keepWithNext }
  target.avoidBreakInside = { ...preset.avoidBreakInside }
  target.widows = preset.widows
  target.orphans = preset.orphans
  target.chapterStartSide = preset.chapterStartSide
  target.blankPageBehavior = preset.blankPageBehavior
}

export function createPaginationSetup(overrides: Partial<PaginationSetup> = {}): PaginationSetup {
  const mode = overrides.mode ?? 'balanced'
  const preset = mode === 'custom' ? PAGINATION_MODE_PRESETS.balanced : PAGINATION_MODE_PRESETS[mode]
  return {
    mode,
    keepWithNext: {
      ...preset.keepWithNext,
      ...(overrides.keepWithNext ?? {}),
    },
    avoidBreakInside: {
      ...preset.avoidBreakInside,
      ...(overrides.avoidBreakInside ?? {}),
    },
    widows: overrides.widows ?? preset.widows,
    orphans: overrides.orphans ?? preset.orphans,
    chapterStartSide: overrides.chapterStartSide ?? preset.chapterStartSide,
    blankPageBehavior: overrides.blankPageBehavior ?? preset.blankPageBehavior,
  }
}

export function createHeaderFooterSetup(overrides: Partial<HeaderFooterSetup> = {}): HeaderFooterSetup {
  return {
    enabled: true,
    slots: {
      'top-left': { template: '${documentTitle}' },
      'top-right': { template: '${printDate}', textAlign: 'right' },
      'bottom-center': { template: 'Page ${pageNo} of ${totalPages}', textAlign: 'center' },
      ...(overrides.slots ?? {}),
    },
    firstPageSlots: overrides.firstPageSlots ?? {},
    leftPageSlots: overrides.leftPageSlots ?? {},
    rightPageSlots: overrides.rightPageSlots ?? {},
    differentFirstPage: false,
    differentLeftRight: false,
    ...overrides,
  }
}

export function createRunningTitleSetup(overrides: Partial<RunningTitleSetup> = {}): RunningTitleSetup {
  return {
    chapterSource: 'h1',
    sectionSource: 'h2',
    ...overrides,
  }
}

const GITHUB_SCREEN_CSS = `
  .tiptap.markdown-theme-github {
    --md-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    --md-line-height: 1.6;
    --md-body-color: #1f2328;
    --md-heading-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    --md-heading-color: #0f172a;
    --md-h1-size: 2rem;
    --md-h2-size: 1.5rem;
    --md-h3-size: 1.25rem;
    --md-p-margin: 1rem 0;
    --md-list-margin: 1rem 0 1rem 0.4rem;
    --md-hr-color: #d0d7de;
    --md-link-color: #0969da;
    --md-link-hover-color: #0550ae;
    --md-blockquote-border: #d0d7de;
    --md-blockquote-color: #57606a;
    --md-blockquote-font-style: normal;
    --md-table-border-color: #d0d7de;
    --md-table-header-bg: #f6f8fa;
    --md-inline-code-bg: rgba(175, 184, 193, 0.2);
    --md-inline-code-color: #cf222e;
    --md-code-block-bg: #0d1117;
    --md-code-block-color: #e6edf3;
    --md-image-radius: 0.375rem;
  }

  .tiptap.markdown-theme-github h1,
  .tiptap.markdown-theme-github h2 {
    padding-bottom: 0.2em;
    border-bottom: 1px solid #d8dee4;
  }

  .tiptap.markdown-theme-github h2 {
    margin-top: 2rem;
  }

  .tiptap.markdown-theme-github ul,
  .tiptap.markdown-theme-github ol {
    margin-left: 0.2rem;
  }

  .tiptap.markdown-theme-github .tableWrapper table {
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .tiptap.markdown-theme-github pre {
    border: 1px solid #30363d;
    border-radius: 0.5rem;
  }
`

const PROSE_SCREEN_CSS = `
  .tiptap.markdown-theme-prose {
    --md-font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
    --md-line-height: 1.75;
    --md-body-color: #1c1917;
    --md-heading-font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
    --md-heading-color: #111827;
    --md-h1-size: 2.15rem;
    --md-h2-size: 1.6rem;
    --md-h3-size: 1.3rem;
    --md-p-margin: 1.1rem 0;
    --md-list-margin: 1.35rem 1rem 1.35rem 0.4rem;
    --md-hr-color: #cbd5e1;
    --md-link-color: #0f172a;
    --md-link-hover-color: #334155;
    --md-blockquote-border: #cbd5e1;
    --md-blockquote-color: #475569;
    --md-table-border-color: #d6d3d1;
    --md-table-header-bg: #f8fafc;
    --md-inline-code-bg: #f3f4f6;
    --md-inline-code-color: #9f1239;
    --md-code-block-bg: #111827;
    --md-code-block-color: #f8fafc;
    --md-image-radius: 0.5rem;
  }

  .tiptap.markdown-theme-prose h1 {
    letter-spacing: -0.02em;
    margin-bottom: 1.2rem;
  }

  .tiptap.markdown-theme-prose h2 {
    margin-top: 2.7rem;
    margin-bottom: 0.8rem;
  }

  .tiptap.markdown-theme-prose p {
    max-width: 68ch;
  }

  .tiptap.markdown-theme-prose blockquote {
    background: rgba(148, 163, 184, 0.08);
    padding: 0.85rem 1rem;
    border-radius: 0.5rem;
  }

  .tiptap.markdown-theme-prose .tableWrapper table th,
  .tiptap.markdown-theme-prose .tableWrapper table td {
    padding-top: 0.55rem;
    padding-bottom: 0.55rem;
  }

  .tiptap.markdown-theme-prose pre {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
`

const NOVEL_SCREEN_CSS = `
  .tiptap.markdown-theme-novel {
    --md-font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
    --md-line-height: 1.85;
    --md-body-color: #111827;
    --md-heading-font-family: "Baskerville", Georgia, serif;
    --md-heading-color: #1f2937;
    --md-h1-size: 2.25rem;
    --md-h2-size: 1.7rem;
    --md-h3-size: 1.35rem;
    --md-p-margin: 1.15rem 0;
    --md-list-margin: 1.4rem 1rem 1.4rem 0.4rem;
    --md-hr-color: #d4d4d8;
    --md-link-color: #374151;
    --md-link-hover-color: #111827;
    --md-blockquote-border: #c7c7c7;
    --md-blockquote-color: #4b5563;
    --md-table-border-color: rgba(82, 82, 91, 0.2);
    --md-table-header-bg: rgba(82, 82, 91, 0.08);
    --md-inline-code-bg: #f5f5f4;
    --md-inline-code-color: #7c2d12;
    --md-code-block-bg: #1c1917;
    --md-code-block-color: #f5f5f4;
    --md-image-radius: 0.625rem;
    --md-math-block-bg: rgba(28, 25, 23, 0.03);
  }

  .tiptap.markdown-theme-novel h1 {
    text-align: center;
    margin-bottom: 1.6rem;
  }

  .tiptap.markdown-theme-novel h2 {
    margin-top: 3rem;
    margin-bottom: 0.9rem;
  }

  .tiptap.markdown-theme-novel p {
    max-width: 72ch;
  }

  .tiptap.markdown-theme-novel ul,
  .tiptap.markdown-theme-novel ol {
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .tiptap.markdown-theme-novel blockquote {
    background: rgba(120, 113, 108, 0.08);
    padding: 0.9rem 1rem;
    border-radius: 0.5rem;
  }

  .tiptap.markdown-theme-novel pre {
    border-radius: 0.75rem;
  }
`

export const builtInMarkdownThemes: MarkdownTheme[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Technical document defaults inspired by GitHub Markdown.',
    screen: { css: GITHUB_SCREEN_CSS },
    print: {
      css: `
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.65;
          color: #1f2328;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          color: #0f172a;
        }
        h1 { font-size: 22pt; margin: 1.6em 0 0.5em; }
        h2 { font-size: 16pt; margin: 1.3em 0 0.45em; }
        h3 { font-size: 13pt; margin: 1.1em 0 0.3em; }
        h4, h5, h6 { font-size: 11pt; margin: 0.9em 0 0.2em; }
        blockquote {
          border-left: 3px solid #d0d7de;
          padding-left: 1em;
          color: #57606a;
        }
        th { background: #f6f8fa; }
        a { color: #0969da; text-decoration: underline; }
      `,
      pageDefaults: createPageSetup({
        margins: createSingleMargins('20mm', '18mm', '22mm', '18mm'),
      }),
      paginationDefaults: createPaginationSetup(),
      headerFooterDefaults: createHeaderFooterSetup(),
      runningTitleDefaults: createRunningTitleSetup(),
    },
  },
  {
    id: 'prose',
    name: 'Prose',
    description: 'Comfortable reading defaults for general articles.',
    screen: { css: PROSE_SCREEN_CSS },
    print: {
      css: `
        body {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 12pt;
          line-height: 1.72;
          color: #18181b;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
          color: #111827;
        }
        h1 { font-size: 24pt; margin: 1.8em 0 0.55em; }
        h2 { font-size: 17pt; margin: 1.4em 0 0.45em; }
        h3 { font-size: 13.5pt; margin: 1.1em 0 0.35em; }
        h4, h5, h6 { font-size: 11pt; margin: 0.9em 0 0.25em; }
        p { margin: 0 0 0.9em; }
        blockquote {
          border-left: 2px solid #cbd5e1;
          padding-left: 1em;
          color: #475569;
        }
        th { background: #f8fafc; }
        a { color: #111827; text-decoration: underline; }
      `,
      pageDefaults: createPageSetup({
        margins: createSingleMargins('22mm', '20mm', '24mm', '20mm'),
      }),
      paginationDefaults: createPaginationSetup({ mode: 'balanced' }),
      headerFooterDefaults: createHeaderFooterSetup({
        slots: {
          'top-center': { template: '${documentTitle}', textAlign: 'center' },
          'bottom-center': { template: 'Page ${pageNo}', textAlign: 'center' },
        },
      }),
      runningTitleDefaults: createRunningTitleSetup(),
    },
  },
  {
    id: 'novel',
    name: 'Novel',
    description: 'Loose body spacing for long-form and book-style output.',
    screen: { css: NOVEL_SCREEN_CSS },
    print: {
      css: `
        body {
          font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
          font-size: 12.5pt;
          line-height: 1.85;
          color: #111111;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: "Baskerville", Georgia, serif;
          font-weight: 500;
        }
        h1 { font-size: 24pt; margin: 2.2em 0 0.9em; text-align: center; }
        h2 { font-size: 17pt; margin: 1.8em 0 0.6em; }
        h3 { font-size: 14pt; margin: 1.4em 0 0.5em; }
        h4, h5, h6 { font-size: 12pt; margin: 1em 0 0.4em; }
        p { margin: 0 0 0.95em; text-align: justify; }
        blockquote {
          border-left: 2px solid #bbbbbb;
          padding-left: 1em;
          color: #444444;
          font-style: italic;
        }
      `,
      pageDefaults: createPageSetup({
        marginMode: 'facing',
        margins: createFacingMargins('24mm', '28mm', '24mm', '18mm'),
      }),
      paginationDefaults: createPaginationSetup({ mode: 'strict-book' }),
      headerFooterDefaults: createHeaderFooterSetup({
        slots: {
          'top-center': { template: '${chapterTitle}', textAlign: 'center' },
          'bottom-center': { template: '${pageNo}', textAlign: 'center' },
        },
      }),
      runningTitleDefaults: createRunningTitleSetup(),
    },
  },
]

export function getMarkdownThemeById(id: string): MarkdownTheme | undefined {
  return builtInMarkdownThemes.find(theme => theme.id === id)
}

export function getEffectivePrintThemeId(preferences: MarkdownPrintPreferences | ResolvedMarkdownPrintSettings | MarkdownPrintPreferences['themeAssignment']): MarkdownThemeId {
  const themeAssignment = 'themeAssignment' in preferences ? preferences.themeAssignment : preferences
  return themeAssignment.printUsesScreenTheme
    ? themeAssignment.screenThemeId
    : themeAssignment.printThemeId
}

export function clonePageSetup(pageSetup: PageSetup): PageSetup {
  return {
    ...pageSetup,
    margins: 'inside' in pageSetup.margins
      ? { ...pageSetup.margins }
      : { ...pageSetup.margins },
  }
}

export function clonePaginationSetup(pagination: PaginationSetup): PaginationSetup {
  return {
    ...pagination,
    keepWithNext: { ...pagination.keepWithNext },
    avoidBreakInside: { ...pagination.avoidBreakInside },
  }
}

export function cloneHeaderFooterSetup(headerFooter: HeaderFooterSetup): HeaderFooterSetup {
  return {
    ...headerFooter,
    slots: cloneMarginBoxSlots(headerFooter.slots),
    firstPageSlots: cloneMarginBoxSlots(headerFooter.firstPageSlots),
    leftPageSlots: cloneMarginBoxSlots(headerFooter.leftPageSlots),
    rightPageSlots: cloneMarginBoxSlots(headerFooter.rightPageSlots),
  }
}

export function cloneRunningTitleSetup(runningTitle: RunningTitleSetup): RunningTitleSetup {
  return { ...runningTitle }
}

function marginsEqual(
  a: SinglePageMargins | FacingPageMargins,
  b: SinglePageMargins | FacingPageMargins,
): boolean {
  if ('inside' in a && 'inside' in b) {
    return a.top === b.top && a.bottom === b.bottom && a.inside === b.inside && a.outside === b.outside
  }
  if ('left' in a && 'left' in b) {
    return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
  }
  return false
}

function cloneMarginBoxSlots(
  slots: HeaderFooterSetup['slots'] | undefined,
): NonNullable<HeaderFooterSetup['slots']> {
  const cloned: NonNullable<HeaderFooterSetup['slots']> = {}
  if (!slots) return cloned

  for (const [slot, content] of Object.entries(slots)) {
    if (!content) continue
    cloned[slot as keyof typeof cloned] = { ...content }
  }

  return cloned
}

function mergeMarginBoxSlots(
  base: HeaderFooterSetup['slots'] | undefined,
  override: HeaderFooterSetup['slots'] | undefined,
): NonNullable<HeaderFooterSetup['slots']> {
  const merged = cloneMarginBoxSlots(base)
  if (!override) return merged

  for (const [slot, content] of Object.entries(override)) {
    if (!content) continue
    merged[slot as keyof typeof merged] = { ...content }
  }

  return merged
}

export function createResolvedMarkdownPrintSettings(
  themeAssignment = DEFAULT_MARKDOWN_PRINT_PREFERENCES.themeAssignment,
): ResolvedMarkdownPrintSettings {
  const effectiveThemeId = themeAssignment.printUsesScreenTheme ? themeAssignment.screenThemeId : themeAssignment.printThemeId
  const theme = getMarkdownThemeById(effectiveThemeId) ?? builtInMarkdownThemes[0]!

  return {
    themeAssignment: { ...themeAssignment },
    pageSetup: clonePageSetup(theme.print.pageDefaults),
    pagination: clonePaginationSetup(theme.print.paginationDefaults),
    headerFooter: cloneHeaderFooterSetup(theme.print.headerFooterDefaults),
    runningTitle: cloneRunningTitleSetup(theme.print.runningTitleDefaults ?? createRunningTitleSetup()),
  }
}

export function applyMarkdownPrintOverrides(
  target: ResolvedMarkdownPrintSettings,
  overrides?: MarkdownPrintOverrides,
): ResolvedMarkdownPrintSettings {
  if (!overrides) return target

  if (overrides.pageSetup) {
    target.pageSetup = {
      ...target.pageSetup,
      ...overrides.pageSetup,
      margins: overrides.pageSetup.margins
        ? ('inside' in overrides.pageSetup.margins
          ? { ...overrides.pageSetup.margins }
          : { ...overrides.pageSetup.margins })
        : clonePageSetup(target.pageSetup).margins,
    }
  }

  if (overrides.pagination) {
    target.pagination = {
      ...target.pagination,
      ...overrides.pagination,
      keepWithNext: {
        ...target.pagination.keepWithNext,
        ...(overrides.pagination.keepWithNext ?? {}),
      },
      avoidBreakInside: {
        ...target.pagination.avoidBreakInside,
        ...(overrides.pagination.avoidBreakInside ?? {}),
      },
    }
  }

  if (overrides.headerFooter) {
    target.headerFooter = {
      ...target.headerFooter,
      ...overrides.headerFooter,
      slots: mergeMarginBoxSlots(target.headerFooter.slots, overrides.headerFooter.slots),
      firstPageSlots: mergeMarginBoxSlots(target.headerFooter.firstPageSlots, overrides.headerFooter.firstPageSlots),
      leftPageSlots: mergeMarginBoxSlots(target.headerFooter.leftPageSlots, overrides.headerFooter.leftPageSlots),
      rightPageSlots: mergeMarginBoxSlots(target.headerFooter.rightPageSlots, overrides.headerFooter.rightPageSlots),
    }
  }

  if (overrides.runningTitle) {
    target.runningTitle = {
      ...target.runningTitle,
      ...overrides.runningTitle,
    }
  }

  return target
}

export function resolveMarkdownPrintSettings(
  preferences: MarkdownPrintPreferences,
  runtimeOverrides?: PrintRuntimeOverrides,
): ResolvedMarkdownPrintSettings {
  const themeAssignment = {
    ...preferences.themeAssignment,
    ...(runtimeOverrides?.themeAssignment ?? {}),
  }
  const resolved = createResolvedMarkdownPrintSettings(themeAssignment)
  applyMarkdownPrintOverrides(resolved, preferences.printOverrides)
  applyMarkdownPrintOverrides(resolved, runtimeOverrides)
  return resolved
}

export function rebaseResolvedSettingsOnThemeChange(
  current: ResolvedMarkdownPrintSettings,
  previousAssignment: MarkdownPrintPreferences['themeAssignment'],
  nextAssignment: MarkdownPrintPreferences['themeAssignment'],
): ResolvedMarkdownPrintSettings {
  const previousBase = createResolvedMarkdownPrintSettings(previousAssignment)
  const overrides = derivePrintRuntimeOverrides(previousBase, current)
  // themeAssignment is replayed via nextAssignment, so drop it from overrides
  // to avoid resurrecting the previous selection.
  delete overrides.themeAssignment
  const rebased = createResolvedMarkdownPrintSettings(nextAssignment)
  applyMarkdownPrintOverrides(rebased, overrides)
  return rebased
}

export function deriveMarkdownPrintOverrides(
  base: ResolvedMarkdownPrintSettings,
  current: ResolvedMarkdownPrintSettings,
): MarkdownPrintOverrides {
  const overrides: MarkdownPrintOverrides = {}

  const pageSetup: Partial<PageSetup> = {}
  if (current.pageSetup.size !== base.pageSetup.size) pageSetup.size = current.pageSetup.size
  if (current.pageSetup.orientation !== base.pageSetup.orientation) pageSetup.orientation = current.pageSetup.orientation
  if (current.pageSetup.marginMode !== base.pageSetup.marginMode) pageSetup.marginMode = current.pageSetup.marginMode
  if (!marginsEqual(current.pageSetup.margins, base.pageSetup.margins)) {
    pageSetup.margins = 'inside' in current.pageSetup.margins
      ? { ...current.pageSetup.margins }
      : { ...current.pageSetup.margins }
  }
  if (current.pageSetup.pageSideStart !== base.pageSetup.pageSideStart) pageSetup.pageSideStart = current.pageSetup.pageSideStart
  if (current.pageSetup.background !== base.pageSetup.background) pageSetup.background = current.pageSetup.background
  if (Object.keys(pageSetup).length) overrides.pageSetup = pageSetup

  const pagination: Partial<PaginationSetup> = {}
  if (current.pagination.mode !== base.pagination.mode) pagination.mode = current.pagination.mode
  if (current.pagination.widows !== base.pagination.widows) pagination.widows = current.pagination.widows
  if (current.pagination.orphans !== base.pagination.orphans) pagination.orphans = current.pagination.orphans
  if (current.pagination.chapterStartSide !== base.pagination.chapterStartSide) pagination.chapterStartSide = current.pagination.chapterStartSide
  if (current.pagination.blankPageBehavior !== base.pagination.blankPageBehavior) pagination.blankPageBehavior = current.pagination.blankPageBehavior
  const keepWithNext = Object.fromEntries(
    Object.entries(current.pagination.keepWithNext).filter(([key, value]) => value !== base.pagination.keepWithNext[key as keyof typeof base.pagination.keepWithNext]),
  )
  if (Object.keys(keepWithNext).length) pagination.keepWithNext = keepWithNext as PaginationSetup['keepWithNext']
  const avoidBreakInside = Object.fromEntries(
    Object.entries(current.pagination.avoidBreakInside).filter(([key, value]) => value !== base.pagination.avoidBreakInside[key as keyof typeof base.pagination.avoidBreakInside]),
  )
  if (Object.keys(avoidBreakInside).length) pagination.avoidBreakInside = avoidBreakInside as PaginationSetup['avoidBreakInside']
  if (Object.keys(pagination).length) overrides.pagination = pagination

  const headerFooter: Partial<HeaderFooterSetup> = {}
  if (current.headerFooter.enabled !== base.headerFooter.enabled) headerFooter.enabled = current.headerFooter.enabled
  if (current.headerFooter.differentFirstPage !== base.headerFooter.differentFirstPage) headerFooter.differentFirstPage = current.headerFooter.differentFirstPage
  if (current.headerFooter.differentLeftRight !== base.headerFooter.differentLeftRight) headerFooter.differentLeftRight = current.headerFooter.differentLeftRight
  const slots = diffMarginBoxSlots(base.headerFooter.slots, current.headerFooter.slots)
  if (Object.keys(slots).length) headerFooter.slots = slots
  const firstPageSlots = diffMarginBoxSlots(base.headerFooter.firstPageSlots, current.headerFooter.firstPageSlots)
  if (Object.keys(firstPageSlots).length) headerFooter.firstPageSlots = firstPageSlots
  const leftPageSlots = diffMarginBoxSlots(base.headerFooter.leftPageSlots, current.headerFooter.leftPageSlots)
  if (Object.keys(leftPageSlots).length) headerFooter.leftPageSlots = leftPageSlots
  const rightPageSlots = diffMarginBoxSlots(base.headerFooter.rightPageSlots, current.headerFooter.rightPageSlots)
  if (Object.keys(rightPageSlots).length) headerFooter.rightPageSlots = rightPageSlots
  if (Object.keys(headerFooter).length) overrides.headerFooter = headerFooter

  const runningTitle: Partial<RunningTitleSetup> = {}
  if (current.runningTitle.chapterSource !== base.runningTitle.chapterSource) runningTitle.chapterSource = current.runningTitle.chapterSource
  if (current.runningTitle.sectionSource !== base.runningTitle.sectionSource) runningTitle.sectionSource = current.runningTitle.sectionSource
  if (Object.keys(runningTitle).length) overrides.runningTitle = runningTitle

  return overrides
}

export function derivePrintRuntimeOverrides(
  base: ResolvedMarkdownPrintSettings,
  current: ResolvedMarkdownPrintSettings,
): PrintRuntimeOverrides {
  const runtimeOverrides: PrintRuntimeOverrides = deriveMarkdownPrintOverrides(base, current)
  const themeAssignment: PrintRuntimeOverrides['themeAssignment'] = {}
  if (current.themeAssignment.printThemeId !== base.themeAssignment.printThemeId) {
    themeAssignment.printThemeId = current.themeAssignment.printThemeId
  }
  if (current.themeAssignment.printUsesScreenTheme !== base.themeAssignment.printUsesScreenTheme) {
    themeAssignment.printUsesScreenTheme = current.themeAssignment.printUsesScreenTheme
  }
  if (Object.keys(themeAssignment).length) {
    runtimeOverrides.themeAssignment = themeAssignment
  }
  return runtimeOverrides
}

function diffMarginBoxSlots(
  base: HeaderFooterSetup['slots'] | undefined,
  current: HeaderFooterSetup['slots'] | undefined,
): NonNullable<HeaderFooterSetup['slots']> {
  const diff: NonNullable<HeaderFooterSetup['slots']> = {}
  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(current ?? {}),
  ])

  for (const key of keys) {
    const baseValue = base?.[key as keyof NonNullable<HeaderFooterSetup['slots']>]
    const currentValue = current?.[key as keyof NonNullable<HeaderFooterSetup['slots']>]
    if (!baseValue && !currentValue) continue
    if (!currentValue && baseValue) {
      diff[key as keyof typeof diff] = { ...baseValue, template: '' }
      continue
    }
    if (currentValue && JSON.stringify(currentValue) !== JSON.stringify(baseValue ?? null)) {
      diff[key as keyof typeof diff] = { ...currentValue }
    }
  }

  return diff
}

const SCREEN_THEME_STYLE_ELEMENT_ID = 'iw-markdown-screen-themes'

export function buildMarkdownScreenThemeStyleSheet(): string {
  return builtInMarkdownThemes.map(theme => theme.screen.css.trim()).join('\n\n')
}

export function ensureMarkdownScreenThemeStyleSheet(): void {
  if (typeof document === 'undefined') return
  const cssText = buildMarkdownScreenThemeStyleSheet()
  const existing = document.getElementById(SCREEN_THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null
  if (existing) {
    if (existing.textContent !== cssText) {
      existing.textContent = cssText
    }
    return
  }

  const style = document.createElement('style')
  style.id = SCREEN_THEME_STYLE_ELEMENT_ID
  style.textContent = cssText
  document.head.appendChild(style)
}

export const DEFAULT_MARKDOWN_PRINT_PREFERENCES: MarkdownPrintPreferences = {
  themeAssignment: {
    screenThemeId: 'github',
    printThemeId: 'github',
    printUsesScreenTheme: false,
  },
  printOverrides: {},
}
