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
    --md-h4-size: 1rem;
    --md-h5-size: 0.875rem;
    --md-list-padding-x: 1rem;
    --md-bullet-margin: 1rem;
    --md-bullet-padding-left: 1.5rem;
    --md-mark-bg: #fff8c5;
    --md-math-block-bg: #f6f8fa;
  }

  .tiptap.markdown-theme-github h6 {
    color: #57606a;
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

const GITHUB_DARK_SCREEN_CSS = `
  .tiptap.markdown-theme-github-dark {
    --md-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    --md-line-height: 1.6;
    --md-body-color: #e6edf3;
    --md-heading-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    --md-heading-color: #e6edf3;
    --md-h1-size: 2rem;
    --md-h2-size: 1.5rem;
    --md-h3-size: 1.25rem;
    --md-h4-size: 1rem;
    --md-h5-size: 0.875rem;
    --md-p-margin: 1rem 0;
    --md-list-margin: 1rem 0 1rem 0.4rem;
    --md-list-padding-x: 1rem;
    --md-bullet-margin: 1rem;
    --md-bullet-padding-left: 1.5rem;
    --md-hr-color: #30363d;
    --md-mark-bg: #bb8009;
    --md-link-color: #58a6ff;
    --md-link-hover-color: #79b8ff;
    --md-blockquote-border: #3b434b;
    --md-blockquote-color: #8b949e;
    --md-blockquote-font-style: normal;
    --md-table-border-color: #30363d;
    --md-table-header-bg: #161b22;
    --md-inline-code-bg: rgba(110, 118, 129, 0.4);
    --md-inline-code-color: #ff7b72;
    --md-code-block-bg: #161b22;
    --md-code-block-color: #e6edf3;
    --md-image-radius: 0.375rem;
    --md-math-block-bg: rgba(22, 27, 34, 0.6);
    background-color: #0d1117;
  }

  .tiptap.markdown-theme-github-dark h6 {
    color: #8b949e;
  }

  .tiptap.markdown-theme-github-dark h1,
  .tiptap.markdown-theme-github-dark h2 {
    padding-bottom: 0.2em;
    border-bottom: 1px solid #21262d;
  }

  .tiptap.markdown-theme-github-dark h2 {
    margin-top: 2rem;
  }

  .tiptap.markdown-theme-github-dark ul,
  .tiptap.markdown-theme-github-dark ol {
    margin-left: 0.2rem;
  }

  .tiptap.markdown-theme-github-dark .tableWrapper table {
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .tiptap.markdown-theme-github-dark pre {
    border: 1px solid #30363d;
    border-radius: 0.5rem;
  }

  .tiptap.markdown-theme-github-dark hr {
    border-top-color: #30363d;
  }

  .tiptap.markdown-theme-github-dark mark {
    color: #e6edf3;
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
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.65;
          color: #1f2328;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          font-weight: 600;
          color: #0f172a;
          line-height: 1.25;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }
        h1 { font-size: 22pt; border-bottom: 1px solid #d8dee4; padding-bottom: 0.2em; margin-top: 0; }
        h2 { font-size: 16pt; border-bottom: 1px solid #d8dee4; padding-bottom: 0.2em; }
        h3 { font-size: 13pt; }
        h4 { font-size: 11.5pt; }
        h5 { font-size: 11pt; }
        h6 { font-size: 11pt; color: #57606a; }
        p { margin: 0 0 0.85em; }
        ul, ol { margin: 0 0 0.85em; padding-left: 2em; }
        li { margin: 0.2em 0; }
        li > ul, li > ol { margin-top: 0.2em; margin-bottom: 0; }
        ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
        ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.2em; flex-shrink: 0; }
        blockquote {
          border-left: 3px solid #d0d7de;
          padding-left: 1em;
          color: #57606a;
          margin: 1em 0;
        }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 10.5pt; }
        th, td { border: 1px solid #d0d7de; padding: 6px 13px; text-align: left; }
        th { background: #f6f8fa; font-weight: 600; }
        tr:nth-child(even) td { background: #f6f8fa; }
        code {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 0.875em;
          background: rgba(175, 184, 193, 0.2);
          color: #cf222e;
          padding: 0.1em 0.25em;
          border-radius: 3px;
        }
        pre {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 9pt;
          background: #0d1117;
          color: #e6edf3;
          padding: 1em;
          border-radius: 6px;
          border: 1px solid #30363d;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 1em 0;
        }
        pre code { background: none; color: inherit; padding: 0; border-radius: 0; }
        img { max-width: 100%; height: auto; border-radius: 3px; display: block; margin: 1em auto; }
        hr { border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
        mark { background: #fff8c5; padding: 0.1em 0.15em; }
        a { color: #0969da; text-decoration: underline; }
        del { color: #57606a; }
        sub { font-size: 0.75em; vertical-align: sub; }
        sup { font-size: 0.75em; vertical-align: super; }
        strong { font-weight: 600; }
        em { font-style: italic; }
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
          background: #0d1117;
          color: #e6edf3;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.65;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          font-weight: 600;
          color: #e6edf3;
          line-height: 1.25;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }
        h1 { font-size: 22pt; border-bottom: 1px solid #30363d; padding-bottom: 0.2em; margin-top: 0; }
        h2 { font-size: 16pt; border-bottom: 1px solid #30363d; padding-bottom: 0.2em; }
        h3 { font-size: 13pt; }
        h4 { font-size: 11.5pt; }
        h5 { font-size: 11pt; }
        h6 { font-size: 11pt; color: #8b949e; }
        p { margin: 0 0 0.85em; }
        ul, ol { margin: 0 0 0.85em; padding-left: 2em; }
        li { margin: 0.2em 0; }
        li > ul, li > ol { margin-top: 0.2em; margin-bottom: 0; }
        ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
        ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.2em; flex-shrink: 0; }
        blockquote {
          border-left: 3px solid #3b434b;
          padding-left: 1em;
          color: #8b949e;
          margin: 1em 0;
        }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 10.5pt; }
        th, td { border: 1px solid #30363d; padding: 6px 13px; text-align: left; }
        th { background: #161b22; font-weight: 600; }
        tr:nth-child(even) td { background: #161b22; }
        code {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 0.875em;
          background: rgba(110, 118, 129, 0.4);
          color: #ff7b72;
          padding: 0.1em 0.25em;
          border-radius: 3px;
        }
        pre {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 9pt;
          background: #161b22;
          color: #e6edf3;
          padding: 1em;
          border-radius: 6px;
          border: 1px solid #30363d;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 1em 0;
        }
        pre code { background: none; color: inherit; padding: 0; border-radius: 0; }
        img { max-width: 100%; height: auto; border-radius: 3px; display: block; margin: 1em auto; }
        hr { border: none; border-top: 1px solid #30363d; margin: 1.5em 0; }
        mark { background: #bb8009; color: #e6edf3; padding: 0.1em 0.15em; }
        a { color: #58a6ff; text-decoration: underline; }
        del { color: #8b949e; }
        sub { font-size: 0.75em; vertical-align: sub; }
        sup { font-size: 0.75em; vertical-align: super; }
        strong { font-weight: 600; }
        em { font-style: italic; }
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
