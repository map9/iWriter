import { shallowRef } from 'vue'
import type {
  FacingPageMargins,
  HeaderFooterSetup,
  MarkdownPrintOverrides,
  MarkdownPrintPreferences,
  MarkdownTheme,
  MarkdownThemeId,
  MarginBoxSlot,
  MarginBoxContent,
  PageSetup,
  PaginationModePreset,
  PaginationSetup,
  PrintRuntimeOverrides,
  RawCustomTheme,
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
    color-scheme: light;
    --md-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --md-monospace-font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    --md-line-height: 1.5;
    --md-body-color: #1f2328;
    --md-heading-font-family: var(--md-font-family);
    --md-heading-color: #1f2328;
    --md-h1-size: 2rem;
    --md-h2-size: 1.5rem;
    --md-h3-size: 1.25rem;
    --md-h4-size: 1rem;
    --md-h5-size: 0.875rem;
    --md-h6-size: 0.85rem;
    --md-p-margin: 0 0 1rem;
    --md-list-margin: 0 0 1rem;
    --md-list-padding-x: 2rem;
    --md-bullet-margin: 0 0 1rem;
    --md-bullet-padding-left: 2rem;
    --md-hr-color: #d1d9e0;
    --md-link-color: #0969da;
    --md-link-hover-color: #0550ae;
    --md-blockquote-border: #d1d9e0;
    --md-blockquote-color: #59636e;
    --md-blockquote-font-style: normal;
    --md-table-border-color: #d1d9e0;
    --md-table-header-bg: #f6f8fa;
    --md-inline-code-bg: #818b981f;
    --md-inline-code-color: #1f2328;
    --md-code-block-bg: #f6f8fa;
    --md-code-block-color: #1f2328;
    --md-image-radius: 0;
    --md-mark-bg: #fff8c5;
    --md-mark-color: #1f2328;
    --md-math-block-bg: #f6f8fa;
    --md-placeholder-color: #59636e;
    --md-focus-color: #0969da;
    --md-kbd-bg: #f6f8fa;
    --md-kbd-border: #d1d9e0;
    --md-alert-note: #0969da;
    --md-alert-important: #8250df;
    --md-alert-warning: #9a6700;
    --md-alert-tip: #1a7f37;
    --md-alert-caution: #d1242f;
    background-color: #ffffff;
    font-size: 16px;
    font-weight: 400;
    word-wrap: break-word;
  }

  .tiptap.markdown-theme-github > *:first-child {
    margin-top: 0 !important;
  }

  .tiptap.markdown-theme-github > *:last-child {
    margin-bottom: 0 !important;
  }

  .tiptap.markdown-theme-github strong,
  .tiptap.markdown-theme-github b {
    font-weight: 600;
  }

  .tiptap.markdown-theme-github small {
    font-size: 90%;
  }

  .tiptap.markdown-theme-github sub,
  .tiptap.markdown-theme-github sup {
    font-size: 75%;
    line-height: 0;
    position: relative;
    vertical-align: baseline;
  }

  .tiptap.markdown-theme-github sub {
    bottom: -0.25em;
  }

  .tiptap.markdown-theme-github sup {
    top: -0.5em;
  }

  .tiptap.markdown-theme-github h1,
  .tiptap.markdown-theme-github h2,
  .tiptap.markdown-theme-github h3,
  .tiptap.markdown-theme-github h4,
  .tiptap.markdown-theme-github h5,
  .tiptap.markdown-theme-github h6 {
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .tiptap.markdown-theme-github h1 {
    padding-bottom: 0.3em;
    border-bottom: 1px solid #d1d9e0b3;
  }

  .tiptap.markdown-theme-github h2 {
    padding-bottom: 0.3em;
    border-bottom: 1px solid #d1d9e0b3;
  }

  .tiptap.markdown-theme-github h6 {
    color: #59636e;
  }

  .tiptap.markdown-theme-github h1 code,
  .tiptap.markdown-theme-github h2 code,
  .tiptap.markdown-theme-github h3 code,
  .tiptap.markdown-theme-github h4 code,
  .tiptap.markdown-theme-github h5 code,
  .tiptap.markdown-theme-github h6 code {
    padding: 0 0.2em;
    font-size: inherit;
  }

  .tiptap.markdown-theme-github p,
  .tiptap.markdown-theme-github blockquote,
  .tiptap.markdown-theme-github ul,
  .tiptap.markdown-theme-github ol,
  .tiptap.markdown-theme-github dl,
  .tiptap.markdown-theme-github .tableWrapper,
  .tiptap.markdown-theme-github pre,
  .tiptap.markdown-theme-github details,
  .tiptap.markdown-theme-github div[data-youtube-video],
  .tiptap.markdown-theme-github .tiptap-mathematics-render[data-type='block-math'] {
    margin-top: 0;
    margin-bottom: 1rem;
  }

  .tiptap.markdown-theme-github ul,
  .tiptap.markdown-theme-github ol {
    margin-left: 0;
  }

  .tiptap.markdown-theme-github ul ul,
  .tiptap.markdown-theme-github ul ol,
  .tiptap.markdown-theme-github ol ol,
  .tiptap.markdown-theme-github ol ul {
    margin-top: 0;
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github ol ol,
  .tiptap.markdown-theme-github ul ol {
    list-style-type: lower-roman;
  }

  .tiptap.markdown-theme-github ul ul ol,
  .tiptap.markdown-theme-github ul ol ol,
  .tiptap.markdown-theme-github ol ul ol,
  .tiptap.markdown-theme-github ol ol ol {
    list-style-type: lower-alpha;
  }

  .tiptap.markdown-theme-github li > p {
    margin-top: 1rem;
  }

  .tiptap.markdown-theme-github li + li {
    margin-top: 0.25em;
  }

  .tiptap.markdown-theme-github blockquote {
    margin: 0 0 1rem;
    padding: 0 1em;
    border-left-width: 0.25em;
  }

  .tiptap.markdown-theme-github blockquote > :first-child {
    margin-top: 0;
  }

  .tiptap.markdown-theme-github blockquote > :last-child {
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github a {
    text-decoration: none;
    text-underline-offset: 0.2rem;
  }

  .tiptap.markdown-theme-github a:hover {
    text-decoration: underline;
  }

  .tiptap.markdown-theme-github mark {
    color: var(--md-mark-color);
  }

  .tiptap.markdown-theme-github hr {
    height: 0.25em;
    padding: 0;
    margin: 1.5rem 0;
    background-color: var(--md-hr-color);
    border: 0;
  }

  .tiptap.markdown-theme-github hr.ProseMirror-selectednode {
    background-color: var(--md-focus-color);
    border-top: 0;
  }

  .tiptap.markdown-theme-github .tableWrapper table {
    display: block;
    width: max-content;
    max-width: 100%;
    overflow: auto;
    border-spacing: 0;
    border-collapse: collapse;
    font-variant: tabular-nums;
    table-layout: auto;
  }

  .tiptap.markdown-theme-github .tableWrapper table th,
  .tiptap.markdown-theme-github .tableWrapper table td {
    padding: 6px 13px;
    border: 1px solid var(--md-table-border-color);
  }

  .tiptap.markdown-theme-github .tableWrapper table th {
    font-weight: 600;
  }

  .tiptap.markdown-theme-github .tableWrapper table tr {
    background-color: #ffffff;
    border-top: 1px solid #d1d9e0b3;
  }

  .tiptap.markdown-theme-github .tableWrapper table tr:nth-child(2n) {
    background-color: #f6f8fa;
  }

  .tiptap.markdown-theme-github .tableWrapper table td > :last-child {
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github .tableWrapper table .selectedCell::after {
    background: #0969da1f;
  }

  .tiptap.markdown-theme-github .tableWrapper table .column-resize-handle {
    background-color: var(--md-focus-color);
  }

  .tiptap.markdown-theme-github code,
  .tiptap.markdown-theme-github pre,
  .tiptap.markdown-theme-github kbd,
  .tiptap.markdown-theme-github samp {
    font-family: var(--md-monospace-font-family);
  }

  .tiptap.markdown-theme-github code {
    padding: 0.2em 0.4em;
    margin: 0;
    font-size: 85%;
    white-space: break-spaces;
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github pre {
    padding: 1rem;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    word-wrap: normal;
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github pre code {
    display: inline;
    padding: 0;
    margin: 0;
    overflow: visible;
    font-size: 100%;
    line-height: inherit;
    word-break: normal;
    white-space: pre;
    word-wrap: normal;
    background-color: transparent;
    border: 0;
  }

  .tiptap.markdown-theme-github kbd {
    display: inline-block;
    padding: 0.25rem;
    font: 11px var(--md-monospace-font-family);
    line-height: 10px;
    color: #1f2328;
    vertical-align: middle;
    background-color: var(--md-kbd-bg);
    border: solid 1px var(--md-kbd-border);
    border-bottom-color: var(--md-kbd-border);
    border-radius: 6px;
    box-shadow: inset 0 -1px 0 var(--md-kbd-border);
  }

  .tiptap.markdown-theme-github img {
    box-sizing: content-box;
    border-style: none;
    background-color: transparent;
  }

  .tiptap.markdown-theme-github img[align='right'] {
    padding-left: 20px;
  }

  .tiptap.markdown-theme-github img[align='left'] {
    padding-right: 20px;
  }

  .tiptap.markdown-theme-github div[data-youtube-video] {
    margin-left: 0;
    margin-right: 0;
  }

  .tiptap.markdown-theme-github div[data-youtube-video] iframe {
    border-color: #d1d9e0;
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github ul[data-type='taskList'] {
    margin-left: 0;
    padding-left: 0;
  }

  .tiptap.markdown-theme-github ul[data-type='taskList'] li {
    list-style-type: none;
  }

  .tiptap.markdown-theme-github ul[data-type='taskList'] label {
    font-weight: 400;
  }

  .tiptap.markdown-theme-github ul[data-type='taskList'] input[type='checkbox'] {
    margin: 0.25em 0.5em 0.25em 0;
    accent-color: #0969da;
  }

  .tiptap.markdown-theme-github details summary {
    cursor: pointer;
  }

  .tiptap.markdown-theme-github summary h1,
  .tiptap.markdown-theme-github summary h2,
  .tiptap.markdown-theme-github summary h3,
  .tiptap.markdown-theme-github summary h4,
  .tiptap.markdown-theme-github summary h5,
  .tiptap.markdown-theme-github summary h6 {
    display: inline-block;
  }

  .tiptap.markdown-theme-github summary h1,
  .tiptap.markdown-theme-github summary h2 {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .tiptap.markdown-theme-github dl {
    padding: 0;
  }

  .tiptap.markdown-theme-github dl dt {
    padding: 0;
    margin-top: 1rem;
    font-size: 1em;
    font-style: italic;
    font-weight: 600;
  }

  .tiptap.markdown-theme-github dl dd {
    padding: 0 1rem;
    margin-bottom: 1rem;
  }

  .tiptap.markdown-theme-github .footnotes {
    font-size: 12px;
    color: #59636e;
    border-top: 1px solid #d1d9e0;
  }

  .tiptap.markdown-theme-github .footnotes ol {
    padding-left: 1rem;
  }

  .tiptap.markdown-theme-github [data-footnote-ref]::before {
    content: "[";
  }

  .tiptap.markdown-theme-github [data-footnote-ref]::after {
    content: "]";
  }

  .tiptap.markdown-theme-github .markdown-alert {
    padding: 0.5rem 1rem;
    margin-bottom: 1rem;
    color: inherit;
    border-left: 0.25em solid #d1d9e0;
  }

  .tiptap.markdown-theme-github .markdown-alert > :first-child {
    margin-top: 0;
  }

  .tiptap.markdown-theme-github .markdown-alert > :last-child {
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github .markdown-alert .markdown-alert-title {
    display: flex;
    align-items: center;
    font-weight: 500;
    line-height: 1;
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-note {
    border-left-color: var(--md-alert-note);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-note .markdown-alert-title {
    color: var(--md-alert-note);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-important {
    border-left-color: var(--md-alert-important);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-important .markdown-alert-title {
    color: var(--md-alert-important);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-warning {
    border-left-color: var(--md-alert-warning);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-warning .markdown-alert-title {
    color: var(--md-alert-warning);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-tip {
    border-left-color: var(--md-alert-tip);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-tip .markdown-alert-title {
    color: var(--md-alert-tip);
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-caution {
    border-left-color: #cf222e;
  }

  .tiptap.markdown-theme-github .markdown-alert.markdown-alert-caution .markdown-alert-title {
    color: var(--md-alert-caution);
  }

  .tiptap.markdown-theme-github .tiptap-mathematics-render[data-type='inline-math'] {
    padding: 0 0.2em;
  }

  .tiptap.markdown-theme-github .tiptap-mathematics-render[data-type='block-math'] {
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github .tiptap-mathematics-render.inline-math-error,
  .tiptap.markdown-theme-github .tiptap-mathematics-render.block-math-error {
    color: #d1242f;
    background: #ffebe9;
    border-color: #cf222e;
  }

  .tiptap.markdown-theme-github .hljs-comment,
  .tiptap.markdown-theme-github .hljs-quote {
    color: #59636e;
  }

  .tiptap.markdown-theme-github .hljs-keyword,
  .tiptap.markdown-theme-github .hljs-selector-tag,
  .tiptap.markdown-theme-github .hljs-subst {
    color: #cf222e;
  }

  .tiptap.markdown-theme-github .hljs-number,
  .tiptap.markdown-theme-github .hljs-literal,
  .tiptap.markdown-theme-github .hljs-variable,
  .tiptap.markdown-theme-github .hljs-template-variable,
  .tiptap.markdown-theme-github .hljs-tag .hljs-attr {
    color: #0550ae;
  }

  .tiptap.markdown-theme-github .hljs-string,
  .tiptap.markdown-theme-github .hljs-doctag {
    color: #0a3069;
  }

  .tiptap.markdown-theme-github .hljs-title,
  .tiptap.markdown-theme-github .hljs-section,
  .tiptap.markdown-theme-github .hljs-selector-id {
    color: #6639ba;
  }

  .tiptap.markdown-theme-github .hljs-type,
  .tiptap.markdown-theme-github .hljs-class .hljs-title {
    color: #953800;
  }

  .tiptap.markdown-theme-github .hljs-tag,
  .tiptap.markdown-theme-github .hljs-name,
  .tiptap.markdown-theme-github .hljs-attribute {
    color: #116329;
  }

  .tiptap.markdown-theme-github .hljs-regexp,
  .tiptap.markdown-theme-github .hljs-link {
    color: #0a3069;
  }

  .tiptap.markdown-theme-github .hljs-symbol,
  .tiptap.markdown-theme-github .hljs-bullet {
    color: #953800;
  }

  .tiptap.markdown-theme-github .hljs-built_in,
  .tiptap.markdown-theme-github .hljs-builtin-name {
    color: #8250df;
  }

  .tiptap.markdown-theme-github .hljs-meta {
    color: #59636e;
  }

  .tiptap.markdown-theme-github .hljs-deletion {
    color: #82071e;
    background-color: #ffebe9;
  }

  .tiptap.markdown-theme-github .hljs-addition {
    color: #116329;
    background-color: #dafbe1;
  }

  .tiptap.markdown-theme-github .is-empty::before,
  .tiptap.markdown-theme-github p.is-editor-empty:first-child::before {
    color: var(--md-placeholder-color);
    opacity: 1;
  }
`

const GITHUB_DARK_SCREEN_CSS = `
  .tiptap.markdown-theme-github-dark {
    color-scheme: dark;
    --md-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --md-monospace-font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    --md-line-height: 1.5;
    --md-body-color: #f0f6fc;
    --md-heading-font-family: var(--md-font-family);
    --md-heading-color: #f0f6fc;
    --md-h1-size: 2rem;
    --md-h2-size: 1.5rem;
    --md-h3-size: 1.25rem;
    --md-h4-size: 1rem;
    --md-h5-size: 0.875rem;
    --md-h6-size: 0.85rem;
    --md-p-margin: 0 0 1rem;
    --md-list-margin: 0 0 1rem;
    --md-list-padding-x: 2rem;
    --md-bullet-margin: 0 0 1rem;
    --md-bullet-padding-left: 2rem;
    --md-hr-color: #3d444d;
    --md-mark-bg: #bb800926;
    --md-mark-color: #f0f6fc;
    --md-link-color: #4493f8;
    --md-link-hover-color: #4493f8;
    --md-blockquote-border: #3d444d;
    --md-blockquote-color: #9198a1;
    --md-blockquote-font-style: normal;
    --md-table-border-color: #3d444d;
    --md-table-header-bg: #151b23;
    --md-inline-code-bg: #656c7633;
    --md-inline-code-color: #f0f6fc;
    --md-code-block-bg: #151b23;
    --md-code-block-color: #f0f6fc;
    --md-image-radius: 0;
    --md-math-block-bg: #151b23;
    --md-placeholder-color: #9198a1;
    --md-focus-color: #1f6feb;
    --md-kbd-bg: #151b23;
    --md-kbd-border: #3d444d;
    --md-alert-note: #4493f8;
    --md-alert-important: #ab7df8;
    --md-alert-warning: #d29922;
    --md-alert-tip: #3fb950;
    --md-alert-caution: #f85149;
    background-color: #0d1117;
    font-size: 16px;
    font-weight: 400;
    word-wrap: break-word;
  }

  .tiptap.markdown-theme-github-dark > *:first-child {
    margin-top: 0 !important;
  }

  .tiptap.markdown-theme-github-dark > *:last-child {
    margin-bottom: 0 !important;
  }

  .tiptap.markdown-theme-github-dark strong,
  .tiptap.markdown-theme-github-dark b {
    font-weight: 600;
  }

  .tiptap.markdown-theme-github-dark small {
    font-size: 90%;
  }

  .tiptap.markdown-theme-github-dark sub,
  .tiptap.markdown-theme-github-dark sup {
    font-size: 75%;
    line-height: 0;
    position: relative;
    vertical-align: baseline;
  }

  .tiptap.markdown-theme-github-dark sub {
    bottom: -0.25em;
  }

  .tiptap.markdown-theme-github-dark sup {
    top: -0.5em;
  }

  .tiptap.markdown-theme-github-dark h1,
  .tiptap.markdown-theme-github-dark h2,
  .tiptap.markdown-theme-github-dark h3,
  .tiptap.markdown-theme-github-dark h4,
  .tiptap.markdown-theme-github-dark h5,
  .tiptap.markdown-theme-github-dark h6 {
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .tiptap.markdown-theme-github-dark h1,
  .tiptap.markdown-theme-github-dark h2 {
    padding-bottom: 0.3em;
    border-bottom: 1px solid #3d444db3;
  }

  .tiptap.markdown-theme-github-dark h6 {
    color: #9198a1;
  }

  .tiptap.markdown-theme-github-dark h1 code,
  .tiptap.markdown-theme-github-dark h2 code,
  .tiptap.markdown-theme-github-dark h3 code,
  .tiptap.markdown-theme-github-dark h4 code,
  .tiptap.markdown-theme-github-dark h5 code,
  .tiptap.markdown-theme-github-dark h6 code {
    padding: 0 0.2em;
    font-size: inherit;
  }

  .tiptap.markdown-theme-github-dark p,
  .tiptap.markdown-theme-github-dark blockquote,
  .tiptap.markdown-theme-github-dark ul,
  .tiptap.markdown-theme-github-dark ol,
  .tiptap.markdown-theme-github-dark dl,
  .tiptap.markdown-theme-github-dark .tableWrapper,
  .tiptap.markdown-theme-github-dark pre,
  .tiptap.markdown-theme-github-dark details,
  .tiptap.markdown-theme-github-dark div[data-youtube-video],
  .tiptap.markdown-theme-github-dark .tiptap-mathematics-render[data-type='block-math'] {
    margin-top: 0;
    margin-bottom: 1rem;
  }

  .tiptap.markdown-theme-github-dark ul,
  .tiptap.markdown-theme-github-dark ol {
    margin-left: 0;
  }

  .tiptap.markdown-theme-github-dark ul ul,
  .tiptap.markdown-theme-github-dark ul ol,
  .tiptap.markdown-theme-github-dark ol ol,
  .tiptap.markdown-theme-github-dark ol ul {
    margin-top: 0;
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github-dark ol ol,
  .tiptap.markdown-theme-github-dark ul ol {
    list-style-type: lower-roman;
  }

  .tiptap.markdown-theme-github-dark ul ul ol,
  .tiptap.markdown-theme-github-dark ul ol ol,
  .tiptap.markdown-theme-github-dark ol ul ol,
  .tiptap.markdown-theme-github-dark ol ol ol {
    list-style-type: lower-alpha;
  }

  .tiptap.markdown-theme-github-dark li > p {
    margin-top: 1rem;
  }

  .tiptap.markdown-theme-github-dark li + li {
    margin-top: 0.25em;
  }

  .tiptap.markdown-theme-github-dark blockquote {
    margin: 0 0 1rem;
    padding: 0 1em;
    border-left-width: 0.25em;
  }

  .tiptap.markdown-theme-github-dark blockquote > :first-child {
    margin-top: 0;
  }

  .tiptap.markdown-theme-github-dark blockquote > :last-child {
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github-dark a {
    text-decoration: none;
    text-underline-offset: 0.2rem;
  }

  .tiptap.markdown-theme-github-dark a:hover {
    text-decoration: underline;
  }

  .tiptap.markdown-theme-github-dark mark {
    color: var(--md-mark-color);
  }

  .tiptap.markdown-theme-github-dark hr {
    height: 0.25em;
    padding: 0;
    margin: 1.5rem 0;
    background-color: var(--md-hr-color);
    border: 0;
  }

  .tiptap.markdown-theme-github-dark hr.ProseMirror-selectednode {
    background-color: var(--md-focus-color);
    border-top: 0;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table {
    display: block;
    width: max-content;
    max-width: 100%;
    overflow: auto;
    border-spacing: 0;
    border-collapse: collapse;
    font-variant: tabular-nums;
    table-layout: auto;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table th,
  .tiptap.markdown-theme-github-dark .tableWrapper table td {
    padding: 6px 13px;
    border: 1px solid var(--md-table-border-color);
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table th {
    font-weight: 600;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table tr {
    background-color: #0d1117;
    border-top: 1px solid #3d444db3;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table tr:nth-child(2n) {
    background-color: #151b23;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table td > :last-child {
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table .selectedCell::after {
    background: #1f6feb26;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table .column-resize-handle {
    background-color: var(--md-focus-color);
  }

  .tiptap.markdown-theme-github-dark code,
  .tiptap.markdown-theme-github-dark pre,
  .tiptap.markdown-theme-github-dark kbd,
  .tiptap.markdown-theme-github-dark samp {
    font-family: var(--md-monospace-font-family);
  }

  .tiptap.markdown-theme-github-dark code {
    padding: 0.2em 0.4em;
    margin: 0;
    font-size: 85%;
    white-space: break-spaces;
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github-dark pre {
    padding: 1rem;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    word-wrap: normal;
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github-dark pre code {
    display: inline;
    padding: 0;
    margin: 0;
    overflow: visible;
    font-size: 100%;
    line-height: inherit;
    word-break: normal;
    white-space: pre;
    word-wrap: normal;
    background-color: transparent;
    border: 0;
  }

  .tiptap.markdown-theme-github-dark kbd {
    display: inline-block;
    padding: 0.25rem;
    font: 11px var(--md-monospace-font-family);
    line-height: 10px;
    color: #f0f6fc;
    vertical-align: middle;
    background-color: var(--md-kbd-bg);
    border: solid 1px var(--md-kbd-border);
    border-bottom-color: var(--md-kbd-border);
    border-radius: 6px;
    box-shadow: inset 0 -1px 0 var(--md-kbd-border);
  }

  .tiptap.markdown-theme-github-dark img {
    box-sizing: content-box;
    border-style: none;
    background-color: transparent;
  }

  .tiptap.markdown-theme-github-dark img[align='right'] {
    padding-left: 20px;
  }

  .tiptap.markdown-theme-github-dark img[align='left'] {
    padding-right: 20px;
  }

  .tiptap.markdown-theme-github-dark div[data-youtube-video] {
    margin-left: 0;
    margin-right: 0;
  }

  .tiptap.markdown-theme-github-dark div[data-youtube-video] iframe {
    border-color: #3d444d;
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github-dark ul[data-type='taskList'] {
    margin-left: 0;
    padding-left: 0;
  }

  .tiptap.markdown-theme-github-dark ul[data-type='taskList'] li {
    list-style-type: none;
  }

  .tiptap.markdown-theme-github-dark ul[data-type='taskList'] label {
    font-weight: 400;
  }

  .tiptap.markdown-theme-github-dark ul[data-type='taskList'] input[type='checkbox'] {
    margin: 0.25em 0.5em 0.25em 0;
    accent-color: #1f6feb;
  }

  .tiptap.markdown-theme-github-dark details summary {
    cursor: pointer;
  }

  .tiptap.markdown-theme-github-dark summary h1,
  .tiptap.markdown-theme-github-dark summary h2,
  .tiptap.markdown-theme-github-dark summary h3,
  .tiptap.markdown-theme-github-dark summary h4,
  .tiptap.markdown-theme-github-dark summary h5,
  .tiptap.markdown-theme-github-dark summary h6 {
    display: inline-block;
  }

  .tiptap.markdown-theme-github-dark summary h1,
  .tiptap.markdown-theme-github-dark summary h2 {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .tiptap.markdown-theme-github-dark dl {
    padding: 0;
  }

  .tiptap.markdown-theme-github-dark dl dt {
    padding: 0;
    margin-top: 1rem;
    font-size: 1em;
    font-style: italic;
    font-weight: 600;
  }

  .tiptap.markdown-theme-github-dark dl dd {
    padding: 0 1rem;
    margin-bottom: 1rem;
  }

  .tiptap.markdown-theme-github-dark .footnotes {
    font-size: 12px;
    color: #9198a1;
    border-top: 1px solid #3d444d;
  }

  .tiptap.markdown-theme-github-dark .footnotes ol {
    padding-left: 1rem;
  }

  .tiptap.markdown-theme-github-dark [data-footnote-ref]::before {
    content: "[";
  }

  .tiptap.markdown-theme-github-dark [data-footnote-ref]::after {
    content: "]";
  }

  .tiptap.markdown-theme-github-dark .markdown-alert {
    padding: 0.5rem 1rem;
    margin-bottom: 1rem;
    color: inherit;
    border-left: 0.25em solid #3d444d;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert > :first-child {
    margin-top: 0;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert > :last-child {
    margin-bottom: 0;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert .markdown-alert-title {
    display: flex;
    align-items: center;
    font-weight: 500;
    line-height: 1;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-note {
    border-left-color: #1f6feb;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-note .markdown-alert-title {
    color: var(--md-alert-note);
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-important {
    border-left-color: #8957e5;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-important .markdown-alert-title {
    color: var(--md-alert-important);
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-warning {
    border-left-color: #9e6a03;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-warning .markdown-alert-title {
    color: var(--md-alert-warning);
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-tip {
    border-left-color: #238636;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-tip .markdown-alert-title {
    color: var(--md-alert-tip);
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-caution {
    border-left-color: #da3633;
  }

  .tiptap.markdown-theme-github-dark .markdown-alert.markdown-alert-caution .markdown-alert-title {
    color: var(--md-alert-caution);
  }

  .tiptap.markdown-theme-github-dark .tiptap-mathematics-render[data-type='inline-math'] {
    padding: 0 0.2em;
  }

  .tiptap.markdown-theme-github-dark .tiptap-mathematics-render[data-type='block-math'] {
    border-radius: 6px;
  }

  .tiptap.markdown-theme-github-dark .tiptap-mathematics-render.inline-math-error,
  .tiptap.markdown-theme-github-dark .tiptap-mathematics-render.block-math-error {
    color: #ffdcd7;
    background: #67060c;
    border-color: #da3633;
  }

  .tiptap.markdown-theme-github-dark .hljs-comment,
  .tiptap.markdown-theme-github-dark .hljs-quote {
    color: #9198a1;
  }

  .tiptap.markdown-theme-github-dark .hljs-keyword,
  .tiptap.markdown-theme-github-dark .hljs-selector-tag,
  .tiptap.markdown-theme-github-dark .hljs-subst {
    color: #ff7b72;
  }

  .tiptap.markdown-theme-github-dark .hljs-number,
  .tiptap.markdown-theme-github-dark .hljs-literal,
  .tiptap.markdown-theme-github-dark .hljs-variable,
  .tiptap.markdown-theme-github-dark .hljs-template-variable,
  .tiptap.markdown-theme-github-dark .hljs-tag .hljs-attr {
    color: #79c0ff;
  }

  .tiptap.markdown-theme-github-dark .hljs-string,
  .tiptap.markdown-theme-github-dark .hljs-doctag {
    color: #a5d6ff;
  }

  .tiptap.markdown-theme-github-dark .hljs-title,
  .tiptap.markdown-theme-github-dark .hljs-section,
  .tiptap.markdown-theme-github-dark .hljs-selector-id {
    color: #d2a8ff;
  }

  .tiptap.markdown-theme-github-dark .hljs-type,
  .tiptap.markdown-theme-github-dark .hljs-class .hljs-title {
    color: #ffa657;
  }

  .tiptap.markdown-theme-github-dark .hljs-tag,
  .tiptap.markdown-theme-github-dark .hljs-name,
  .tiptap.markdown-theme-github-dark .hljs-attribute {
    color: #7ee787;
  }

  .tiptap.markdown-theme-github-dark .hljs-regexp,
  .tiptap.markdown-theme-github-dark .hljs-link {
    color: #a5d6ff;
  }

  .tiptap.markdown-theme-github-dark .hljs-symbol,
  .tiptap.markdown-theme-github-dark .hljs-bullet {
    color: #ffa657;
  }

  .tiptap.markdown-theme-github-dark .hljs-built_in,
  .tiptap.markdown-theme-github-dark .hljs-builtin-name {
    color: #d2a8ff;
  }

  .tiptap.markdown-theme-github-dark .hljs-meta {
    color: #9198a1;
  }

  .tiptap.markdown-theme-github-dark .hljs-deletion {
    color: #ffdcd7;
    background-color: #67060c;
  }

  .tiptap.markdown-theme-github-dark .hljs-addition {
    color: #aff5b4;
    background-color: #033a16;
  }

  .tiptap.markdown-theme-github-dark .is-empty::before,
  .tiptap.markdown-theme-github-dark p.is-editor-empty:first-child::before {
    color: var(--md-placeholder-color);
    opacity: 1;
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
    --md-h4-size: 1.1rem;
    --md-h5-size: 1rem;
    --md-list-padding-x: 1rem;
    --md-bullet-margin: 1.1rem;
    --md-bullet-padding-left: 1.5rem;
    --md-mark-bg: #fef08a;
    --md-blockquote-font-style: normal;
    --md-math-block-bg: rgba(248, 250, 252, 0.7);
  }

  .tiptap.markdown-theme-prose h6 {
    color: #475569;
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
    --md-h4-size: 1.15rem;
    --md-h5-size: 1.05rem;
    --md-list-padding-x: 1rem;
    --md-bullet-margin: 1.2rem;
    --md-bullet-padding-left: 1.5rem;
    --md-blockquote-font-style: italic;
  }

  .tiptap.markdown-theme-novel h6 {
    color: #4b5563;
    font-style: italic;
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
          color-scheme: light;
          background: #ffffff;
          color: #1f2328;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
          font-size: 11pt;
          font-weight: 400;
          line-height: 1.5;
          word-wrap: break-word;
        }
        body > *:first-child { margin-top: 0 !important; }
        body > *:last-child { margin-bottom: 0 !important; }
        h1, h2, h3, h4, h5, h6 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
          font-weight: 600;
          color: #1f2328;
          line-height: 1.25;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        h1 { font-size: 22pt; border-bottom: 1px solid #d1d9e0b3; padding-bottom: 0.3em; margin-top: 0; }
        h2 { font-size: 16.5pt; border-bottom: 1px solid #d1d9e0b3; padding-bottom: 0.3em; }
        h3 { font-size: 13.75pt; }
        h4 { font-size: 11pt; }
        h5 { font-size: 9.75pt; }
        h6 { font-size: 9.5pt; color: #59636e; }
        h1 code, h2 code, h3 code, h4 code, h5 code, h6 code { padding: 0 0.2em; font-size: inherit; }
        p, blockquote, ul, ol, dl, table, pre, details { margin-top: 0; margin-bottom: 1rem; }
        ul, ol { padding-left: 2em; }
        ul ul, ul ol, ol ol, ol ul { margin-top: 0; margin-bottom: 0; }
        ol ol, ul ol { list-style-type: lower-roman; }
        ul ul ol, ul ol ol, ol ul ol, ol ol ol { list-style-type: lower-alpha; }
        li > p { margin-top: 1rem; }
        li + li { margin-top: 0.25em; }
        ul[data-type="taskList"], ul.contains-task-list { list-style: none; padding-left: 0; }
        ul[data-type="taskList"] li, li.task-list-item { display: flex; align-items: flex-start; gap: 0.5em; list-style-type: none; }
        ul[data-type="taskList"] li input[type="checkbox"], .task-list-item-checkbox { margin-top: 0.25em; flex-shrink: 0; accent-color: #0969da; }
        blockquote { border-left: 0.25em solid #d1d9e0; padding: 0 1em; color: #59636e; margin: 0 0 1rem; }
        blockquote > :first-child { margin-top: 0; }
        blockquote > :last-child { margin-bottom: 0; }
        table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; font-size: 10.5pt; font-variant: tabular-nums; }
        th, td { border: 1px solid #d1d9e0; padding: 6px 13px; text-align: left; vertical-align: top; }
        th { background: #f6f8fa; font-weight: 600; }
        tr { background: #ffffff; border-top: 1px solid #d1d9e0b3; }
        tr:nth-child(even) td { background: #f6f8fa; }
        td > :last-child { margin-bottom: 0; }
        code {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 85%;
          background: #818b981f;
          color: #1f2328;
          padding: 0.2em 0.4em;
          border-radius: 6px;
          white-space: break-spaces;
        }
        pre {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 9.5pt;
          line-height: 1.45;
          background: #f6f8fa;
          color: #1f2328;
          padding: 1rem;
          overflow: auto;
          border-radius: 6px;
          white-space: pre-wrap;
          word-break: normal;
        }
        pre code { display: inline; background: transparent; color: inherit; padding: 0; margin: 0; border: 0; border-radius: 0; font-size: 100%; white-space: pre-wrap; }
        kbd {
          display: inline-block;
          padding: 0.25rem;
          font: 11px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          line-height: 10px;
          color: #1f2328;
          vertical-align: middle;
          background: #f6f8fa;
          border: 1px solid #d1d9e0;
          border-radius: 6px;
          box-shadow: inset 0 -1px 0 #d1d9e0;
        }
        img { max-width: 100%; height: auto; display: block; margin: 1rem auto; box-sizing: content-box; border-style: none; }
        img[align="right"] { padding-left: 20px; }
        img[align="left"] { padding-right: 20px; }
        hr { height: 0.25em; padding: 0; margin: 1.5rem 0; background: #d1d9e0; border: 0; }
        mark { background: #fff8c5; color: #1f2328; padding: 0.1em 0.15em; }
        a { color: #0969da; text-decoration: none; text-underline-offset: 0.2rem; }
        a:hover { text-decoration: underline; }
        del { color: #59636e; }
        sub, sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; }
        sub { bottom: -0.25em; }
        sup { top: -0.5em; }
        strong { font-weight: 600; }
        em { font-style: italic; }
        dl { padding: 0; }
        dl dt { padding: 0; margin-top: 1rem; font-size: 1em; font-style: italic; font-weight: 600; }
        dl dd { padding: 0 1rem; margin-bottom: 1rem; }
        details summary { cursor: pointer; }
        .footnotes { font-size: 12px; color: #59636e; border-top: 1px solid #d1d9e0; }
        .footnotes ol { padding-left: 1rem; }
        [data-footnote-ref]::before { content: "["; }
        [data-footnote-ref]::after { content: "]"; }
        .markdown-alert { padding: 0.5rem 1rem; margin-bottom: 1rem; color: inherit; border-left: 0.25em solid #d1d9e0; }
        .markdown-alert > :first-child { margin-top: 0; }
        .markdown-alert > :last-child { margin-bottom: 0; }
        .markdown-alert .markdown-alert-title { display: flex; align-items: center; font-weight: 500; line-height: 1; }
        .markdown-alert.markdown-alert-note { border-left-color: #0969da; }
        .markdown-alert.markdown-alert-note .markdown-alert-title { color: #0969da; }
        .markdown-alert.markdown-alert-important { border-left-color: #8250df; }
        .markdown-alert.markdown-alert-important .markdown-alert-title { color: #8250df; }
        .markdown-alert.markdown-alert-warning { border-left-color: #9a6700; }
        .markdown-alert.markdown-alert-warning .markdown-alert-title { color: #9a6700; }
        .markdown-alert.markdown-alert-tip { border-left-color: #1a7f37; }
        .markdown-alert.markdown-alert-tip .markdown-alert-title { color: #1a7f37; }
        .markdown-alert.markdown-alert-caution { border-left-color: #cf222e; }
        .markdown-alert.markdown-alert-caution .markdown-alert-title { color: #d1242f; }
        .tiptap-mathematics-render[data-type="block-math"] { display: block; margin: 0 0 1rem; padding: 1rem; text-align: center; background: #f6f8fa; border-radius: 6px; }
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
    id: 'github-dark',
    name: 'GitHub Dark',
    description: 'Dark variant of GitHub Markdown — faithful to GitHub\'s dark mode design tokens.',
    screen: { css: GITHUB_DARK_SCREEN_CSS },
    print: {
      css: `
        body {
          color-scheme: dark;
          background: #0d1117;
          color: #f0f6fc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
          font-size: 11pt;
          font-weight: 400;
          line-height: 1.5;
          word-wrap: break-word;
        }
        body > *:first-child { margin-top: 0 !important; }
        body > *:last-child { margin-bottom: 0 !important; }
        h1, h2, h3, h4, h5, h6 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
          font-weight: 600;
          color: #f0f6fc;
          line-height: 1.25;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        h1 { font-size: 22pt; border-bottom: 1px solid #3d444db3; padding-bottom: 0.3em; margin-top: 0; }
        h2 { font-size: 16.5pt; border-bottom: 1px solid #3d444db3; padding-bottom: 0.3em; }
        h3 { font-size: 13.75pt; }
        h4 { font-size: 11pt; }
        h5 { font-size: 9.75pt; }
        h6 { font-size: 9.5pt; color: #9198a1; }
        h1 code, h2 code, h3 code, h4 code, h5 code, h6 code { padding: 0 0.2em; font-size: inherit; }
        p, blockquote, ul, ol, dl, table, pre, details { margin-top: 0; margin-bottom: 1rem; }
        ul, ol { padding-left: 2em; }
        ul ul, ul ol, ol ol, ol ul { margin-top: 0; margin-bottom: 0; }
        ol ol, ul ol { list-style-type: lower-roman; }
        ul ul ol, ul ol ol, ol ul ol, ol ol ol { list-style-type: lower-alpha; }
        li > p { margin-top: 1rem; }
        li + li { margin-top: 0.25em; }
        ul[data-type="taskList"], ul.contains-task-list { list-style: none; padding-left: 0; }
        ul[data-type="taskList"] li, li.task-list-item { display: flex; align-items: flex-start; gap: 0.5em; list-style-type: none; }
        ul[data-type="taskList"] li input[type="checkbox"], .task-list-item-checkbox { margin-top: 0.25em; flex-shrink: 0; accent-color: #1f6feb; }
        blockquote { border-left: 0.25em solid #3d444d; padding: 0 1em; color: #9198a1; margin: 0 0 1rem; }
        blockquote > :first-child { margin-top: 0; }
        blockquote > :last-child { margin-bottom: 0; }
        table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; font-size: 10.5pt; font-variant: tabular-nums; }
        th, td { border: 1px solid #3d444d; padding: 6px 13px; text-align: left; vertical-align: top; }
        th { background: #151b23; font-weight: 600; }
        tr { background: #0d1117; border-top: 1px solid #3d444db3; }
        tr:nth-child(even) td { background: #151b23; }
        td > :last-child { margin-bottom: 0; }
        code {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 85%;
          background: #656c7633;
          color: #f0f6fc;
          padding: 0.2em 0.4em;
          border-radius: 6px;
          white-space: break-spaces;
        }
        pre {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 9.5pt;
          line-height: 1.45;
          background: #151b23;
          color: #f0f6fc;
          padding: 1rem;
          overflow: auto;
          border-radius: 6px;
          white-space: pre-wrap;
          word-break: normal;
        }
        pre code { display: inline; background: transparent; color: inherit; padding: 0; margin: 0; border: 0; border-radius: 0; font-size: 100%; white-space: pre-wrap; }
        kbd {
          display: inline-block;
          padding: 0.25rem;
          font: 11px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          line-height: 10px;
          color: #f0f6fc;
          vertical-align: middle;
          background: #151b23;
          border: 1px solid #3d444d;
          border-radius: 6px;
          box-shadow: inset 0 -1px 0 #3d444d;
        }
        img { max-width: 100%; height: auto; display: block; margin: 1rem auto; box-sizing: content-box; border-style: none; }
        img[align="right"] { padding-left: 20px; }
        img[align="left"] { padding-right: 20px; }
        hr { height: 0.25em; padding: 0; margin: 1.5rem 0; background: #3d444d; border: 0; }
        mark { background: #bb800926; color: #f0f6fc; padding: 0.1em 0.15em; }
        a { color: #4493f8; text-decoration: none; text-underline-offset: 0.2rem; }
        a:hover { text-decoration: underline; }
        del { color: #9198a1; }
        sub, sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; }
        sub { bottom: -0.25em; }
        sup { top: -0.5em; }
        strong { font-weight: 600; }
        em { font-style: italic; }
        dl { padding: 0; }
        dl dt { padding: 0; margin-top: 1rem; font-size: 1em; font-style: italic; font-weight: 600; }
        dl dd { padding: 0 1rem; margin-bottom: 1rem; }
        details summary { cursor: pointer; }
        .footnotes { font-size: 12px; color: #9198a1; border-top: 1px solid #3d444d; }
        .footnotes ol { padding-left: 1rem; }
        [data-footnote-ref]::before { content: "["; }
        [data-footnote-ref]::after { content: "]"; }
        .markdown-alert { padding: 0.5rem 1rem; margin-bottom: 1rem; color: inherit; border-left: 0.25em solid #3d444d; }
        .markdown-alert > :first-child { margin-top: 0; }
        .markdown-alert > :last-child { margin-bottom: 0; }
        .markdown-alert .markdown-alert-title { display: flex; align-items: center; font-weight: 500; line-height: 1; }
        .markdown-alert.markdown-alert-note { border-left-color: #1f6feb; }
        .markdown-alert.markdown-alert-note .markdown-alert-title { color: #4493f8; }
        .markdown-alert.markdown-alert-important { border-left-color: #8957e5; }
        .markdown-alert.markdown-alert-important .markdown-alert-title { color: #ab7df8; }
        .markdown-alert.markdown-alert-warning { border-left-color: #9e6a03; }
        .markdown-alert.markdown-alert-warning .markdown-alert-title { color: #d29922; }
        .markdown-alert.markdown-alert-tip { border-left-color: #238636; }
        .markdown-alert.markdown-alert-tip .markdown-alert-title { color: #3fb950; }
        .markdown-alert.markdown-alert-caution { border-left-color: #da3633; }
        .markdown-alert.markdown-alert-caution .markdown-alert-title { color: #f85149; }
        .tiptap-mathematics-render[data-type="block-math"] { display: block; margin: 0 0 1rem; padding: 1rem; text-align: center; background: #151b23; border-radius: 6px; }
      `,
      pageDefaults: createPageSetup({
        margins: createSingleMargins('20mm', '18mm', '22mm', '18mm'),
        background: true,
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
          font-weight: 600;
          color: #111827;
          line-height: 1.2;
          margin-top: 1.8em;
          margin-bottom: 0.5em;
        }
        h1 { font-size: 24pt; margin-top: 0; margin-bottom: 1em; }
        h2 { font-size: 17pt; }
        h3 { font-size: 13.5pt; }
        h4 { font-size: 12pt; }
        h5 { font-size: 11.5pt; }
        h6 { font-size: 11pt; color: #475569; }
        p { margin: 0 0 0.9em; }
        ul, ol { margin: 0 0 0.9em; padding-left: 1.8em; }
        li { margin: 0.25em 0; }
        li > ul, li > ol { margin-top: 0.25em; margin-bottom: 0; }
        ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
        ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.25em; flex-shrink: 0; }
        blockquote {
          border-left: 2px solid #cbd5e1;
          padding: 0.5em 1em;
          color: #475569;
          margin: 1.25em 0;
          background: rgba(148, 163, 184, 0.06);
          border-radius: 0 4px 4px 0;
        }
        table { border-collapse: collapse; width: 100%; margin: 1.25em 0; font-size: 11pt; }
        th, td { border: 1px solid #d6d3d1; padding: 8px 14px; text-align: left; }
        th { background: #f8fafc; font-weight: 600; }
        tr:nth-child(even) td { background: #fafafa; }
        code {
          font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
          font-size: 0.875em;
          background: #f3f4f6;
          color: #9f1239;
          padding: 0.1em 0.3em;
          border-radius: 3px;
        }
        pre {
          font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
          font-size: 9.5pt;
          background: #111827;
          color: #f8fafc;
          padding: 1em 1.2em;
          border-radius: 6px;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 1.25em 0;
        }
        pre code { background: none; color: inherit; padding: 0; border-radius: 0; }
        img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 1.25em auto; }
        hr { border: none; border-top: 1px solid #cbd5e1; margin: 2em 0; }
        mark { background: #fef08a; padding: 0.1em 0.15em; }
        a { color: #111827; text-decoration: underline; }
        del { color: #475569; }
        sub { font-size: 0.75em; vertical-align: sub; }
        sup { font-size: 0.75em; vertical-align: super; }
        strong { font-weight: 700; }
        em { font-style: italic; }
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
          color: #1f2937;
          line-height: 1.2;
        }
        h1 { font-size: 24pt; margin: 2.2em 0 0.9em; text-align: center; letter-spacing: 0.02em; }
        h2 { font-size: 17pt; margin: 1.8em 0 0.6em; }
        h3 { font-size: 14pt; margin: 1.4em 0 0.5em; }
        h4 { font-size: 12.5pt; margin: 1.2em 0 0.4em; font-style: italic; }
        h5 { font-size: 12pt; margin: 1em 0 0.35em; }
        h6 { font-size: 12pt; margin: 0.9em 0 0.3em; font-style: italic; color: #4b5563; }
        p { margin: 0 0 0.95em; text-align: justify; }
        ul, ol { margin: 1em 0; padding-left: 2em; }
        li { margin: 0.3em 0; }
        li > ul, li > ol { margin-top: 0.3em; margin-bottom: 0; }
        ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; text-align: left; }
        ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.3em; flex-shrink: 0; }
        blockquote {
          border-left: 2px solid #bbbbbb;
          padding: 0.5em 1em;
          color: #444444;
          margin: 1.5em 2em;
          font-style: italic;
        }
        table { border-collapse: collapse; width: 100%; margin: 1.5em 0; font-size: 11.5pt; }
        th, td { border: 1px solid rgba(82, 82, 91, 0.3); padding: 8px 14px; text-align: left; }
        th { background: rgba(82, 82, 91, 0.08); font-weight: 600; }
        tr:nth-child(even) td { background: rgba(82, 82, 91, 0.03); }
        code {
          font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
          font-size: 0.85em;
          background: #f5f5f4;
          color: #7c2d12;
          padding: 0.1em 0.3em;
          border-radius: 3px;
        }
        pre {
          font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
          font-size: 9pt;
          background: #1c1917;
          color: #f5f5f4;
          padding: 1em 1.2em;
          border-radius: 8px;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 1.5em 0;
        }
        pre code { background: none; color: inherit; padding: 0; border-radius: 0; }
        img { max-width: 100%; height: auto; border-radius: 5px; display: block; margin: 1.5em auto; }
        hr { border: none; border-top: 1px solid #d4d4d8; margin: 2.5em auto; width: 40%; }
        mark { background: #fef3c7; padding: 0.1em 0.15em; }
        a { color: #374151; text-decoration: underline; }
        del { color: #6b7280; }
        sub { font-size: 0.75em; vertical-align: sub; }
        sup { font-size: 0.75em; vertical-align: super; }
        strong { font-weight: 700; }
        em { font-style: italic; }
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

// ── Custom theme registry ─────────────────────────────────────────────────────

const _customThemes = shallowRef<MarkdownTheme[]>([])
const _rawCustomThemes = shallowRef<RawCustomTheme[]>([])

export function registerCustomThemes(themes: MarkdownTheme[], raw: RawCustomTheme[] = []): void {
  _customThemes.value = themes
  _rawCustomThemes.value = raw
  ensureMarkdownScreenThemeStyleSheet()
}

export function getAllMarkdownThemes(): MarkdownTheme[] {
  return [...builtInMarkdownThemes, ..._customThemes.value]
}

export function getRawCustomThemes(): readonly RawCustomTheme[] {
  return _rawCustomThemes.value
}

export function buildMarkdownThemeFromRaw(raw: RawCustomTheme): MarkdownTheme {
  const p = raw.manifest.print ?? {}

  const marginMode = p.marginMode ?? 'single'
  const margins = marginMode === 'facing'
    ? createFacingMargins(p.marginTop, p.marginBottom, p.marginInside, p.marginOutside)
    : createSingleMargins(p.marginTop, p.marginRight, p.marginBottom, p.marginLeft)

  const pageOverrides: Partial<PageSetup> = { marginMode, margins }
  if (p.pageSize) pageOverrides.size = p.pageSize
  if (p.pageOrientation) pageOverrides.orientation = p.pageOrientation
  if (p.pageSideStart) pageOverrides.pageSideStart = p.pageSideStart
  if (p.background !== undefined) pageOverrides.background = p.background

  const slots: Partial<Record<MarginBoxSlot, MarginBoxContent>> = {}
  if (p.headerLeft !== undefined) slots['top-left'] = { template: p.headerLeft }
  if (p.headerCenter !== undefined) slots['top-center'] = { template: p.headerCenter, textAlign: 'center' }
  if (p.headerRight !== undefined) slots['top-right'] = { template: p.headerRight, textAlign: 'right' }
  if (p.footerLeft !== undefined) slots['bottom-left'] = { template: p.footerLeft }
  if (p.footerCenter !== undefined) slots['bottom-center'] = { template: p.footerCenter, textAlign: 'center' }
  if (p.footerRight !== undefined) slots['bottom-right'] = { template: p.footerRight, textAlign: 'right' }

  const hfOverrides: Partial<HeaderFooterSetup> = {}
  if (p.headerFooterEnabled !== undefined) hfOverrides.enabled = p.headerFooterEnabled
  if (p.differentFirstPage !== undefined) hfOverrides.differentFirstPage = p.differentFirstPage
  if (p.differentLeftRight !== undefined) hfOverrides.differentLeftRight = p.differentLeftRight
  if (Object.keys(slots).length > 0) hfOverrides.slots = slots

  return {
    id: raw.id,
    name: raw.manifest.name,
    description: raw.manifest.description,
    screen: { css: raw.screenCss },
    print: {
      css: raw.printCss,
      pageDefaults: createPageSetup(pageOverrides),
      paginationDefaults: createPaginationSetup(p.paginationMode ? { mode: p.paginationMode } : {}),
      headerFooterDefaults: createHeaderFooterSetup(hfOverrides),
      runningTitleDefaults: createRunningTitleSetup({
        chapterSource: p.chapterSource,
        sectionSource: p.sectionSource,
      }),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function getMarkdownThemeById(id: string): MarkdownTheme | undefined {
  return getAllMarkdownThemes().find(theme => theme.id === id)
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
  const theme = getMarkdownThemeById(effectiveThemeId) ?? getAllMarkdownThemes()[0]!

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
  return getAllMarkdownThemes().map(theme => theme.screen.css.trim()).join('\n\n')
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
