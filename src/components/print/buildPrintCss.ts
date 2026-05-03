import type {
  HeaderFooterSetup,
  MarginBoxContent,
  MarginBoxSlot,
  MarkdownTheme,
  PageSetup,
  PaginationSetup,
  RunningTitleSetup,
} from '@/types'

export const PRINT_THEME_PAGE_NUMBER_TOKEN = '__IW_PAGE_NUMBER__'

export interface BuildPrintCssOptions {
  theme: MarkdownTheme
  documentTitle: string
  printDate: string
  pageSetup: PageSetup
  pagination: PaginationSetup
  headerFooter: HeaderFooterSetup
  runningTitle: RunningTitleSetup
  zoomFactor: number
  colorMode: 'color' | 'grayscale'
}

export interface BuildPrintCssResult {
  css: string
  enablePageNumberFix: boolean
  pageNumberTemplatesByBox: Record<string, string>
}

const BASE_PRINT_CSS = `
  body {
    margin: 0;
    padding: 0;
  }

  code {
    font-family: "Courier New", Courier, monospace;
    font-size: 10pt;
    background: #f4f4f4;
    padding: 1px 4px;
    border-radius: 2px;
  }

  pre {
    font-family: "Courier New", Courier, monospace;
    font-size: 9pt;
    background: #f4f4f4;
    padding: 10px 14px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  pre code {
    background: none;
    padding: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }

  th, td {
    border: 1px solid #ccc;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }

  img {
    max-width: 100%;
  }

  ul, ol {
    margin: 0 0 0.8em;
    padding-left: 1.8em;
  }

  li {
    margin-bottom: 0.2em;
  }

  hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 1.2em 0;
  }

  .task-list-item {
    list-style: none;
  }

  .task-list-item input[type="checkbox"] {
    margin-right: 0.4em;
  }
`

function escapeCssString(value: string): string {
  // CSS string literals can't contain raw newlines or unescaped quotes/backslashes.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, ' ')
}

function formatPageSize(pageSetup: PageSetup): string {
  return pageSetup.size
}

function buildPageSetupCss(pageSetup: PageSetup): string {
  const sizeRule = `size: ${formatPageSize(pageSetup)} ${pageSetup.orientation};`
  const startSideRule = pageSetup.pageSideStart === 'recto'
    ? 'body { break-before: right; page-break-before: right; }'
    : pageSetup.pageSideStart === 'verso'
      ? 'body { break-before: left; page-break-before: left; }'
      : ''

  if (pageSetup.marginMode === 'facing') {
    const margins = pageSetup.margins as { top: string; bottom: string; inside: string; outside: string }
    return `
      @page {
        ${sizeRule}
        margin-top: ${margins.top};
        margin-bottom: ${margins.bottom};
      }
      @page :left {
        margin-left: ${margins.outside};
        margin-right: ${margins.inside};
      }
      @page :right {
        margin-left: ${margins.inside};
        margin-right: ${margins.outside};
      }
      ${startSideRule}
    `
  }

  const margins = pageSetup.margins as { top: string; right: string; bottom: string; left: string }
  return `
    @page {
      ${sizeRule}
      margin-top: ${margins.top};
      margin-right: ${margins.right};
      margin-bottom: ${margins.bottom};
      margin-left: ${margins.left};
    }
    ${startSideRule}
  `
}

function buildRunningTitleCss(runningTitle: RunningTitleSetup): string {
  const rules: string[] = []

  if (runningTitle.chapterSource !== 'none') {
    rules.push(`${runningTitle.chapterSource} { string-set: iw-chapter-title content(text); }`)
  }
  if (runningTitle.sectionSource !== 'none') {
    rules.push(`${runningTitle.sectionSource} { string-set: iw-section-title content(text); }`)
  }

  return rules.join('\n')
}

function buildPaginationCss(pagination: PaginationSetup): string {
  const rules: string[] = []

  if (pagination.keepWithNext.headings) {
    rules.push('h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }')
  }
  if (pagination.keepWithNext.figureCaption) {
    rules.push('figcaption { break-after: avoid; page-break-after: avoid; }')
  }
  if (pagination.keepWithNext.tableCaption) {
    rules.push('caption { break-after: avoid; page-break-after: avoid; }')
  }

  const avoidSelectors = [
    pagination.avoidBreakInside.paragraph ? 'p' : '',
    pagination.avoidBreakInside.blockquote ? 'blockquote' : '',
    pagination.avoidBreakInside.codeBlock ? 'pre' : '',
    pagination.avoidBreakInside.table ? 'table' : '',
    pagination.avoidBreakInside.tableRow ? 'tr' : '',
    pagination.avoidBreakInside.image ? 'img, figure' : '',
    pagination.avoidBreakInside.listItem ? 'li' : '',
  ].filter(Boolean)

  if (avoidSelectors.length) {
    rules.push(`${avoidSelectors.join(', ')} { break-inside: avoid; page-break-inside: avoid; }`)
  }

  const widowsRules: string[] = []
  if (pagination.widows !== null) widowsRules.push(`widows: ${pagination.widows};`)
  if (pagination.orphans !== null) widowsRules.push(`orphans: ${pagination.orphans};`)
  if (widowsRules.length) {
    rules.push(`p, li, blockquote { ${widowsRules.join(' ')} }`)
  }

  if (pagination.chapterStartSide === 'recto') {
    rules.push('h1 { break-before: right; page-break-before: right; }')
  } else if (pagination.chapterStartSide === 'verso') {
    rules.push('h1 { break-before: left; page-break-before: left; }')
  }

  if (pagination.blankPageBehavior === 'suppress-header-footer') {
    rules.push(`
      @page :blank {
        @top-left-corner { content: none; }
        @top-left { content: none; }
        @top-center { content: none; }
        @top-right { content: none; }
        @top-right-corner { content: none; }
        @left-top { content: none; }
        @left-middle { content: none; }
        @left-bottom { content: none; }
        @right-top { content: none; }
        @right-middle { content: none; }
        @right-bottom { content: none; }
        @bottom-left-corner { content: none; }
        @bottom-left { content: none; }
        @bottom-center { content: none; }
        @bottom-right { content: none; }
        @bottom-right-corner { content: none; }
      }
    `)
  }

  return rules.join('\n')
}

function compileTemplateToCssContent(template: string, documentTitle: string, printDate: string): { content: string; usesPageCounter: boolean } {
  const tokenPattern = /\$\{(documentTitle|chapterTitle|sectionTitle|printDate|pageNo|totalPages)\}/g
  const parts: string[] = []
  let usesPageCounter = false
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(template)) !== null) {
    const preceding = template.slice(lastIndex, match.index)
    if (preceding) {
      parts.push(`"${escapeCssString(preceding)}"`)
    }
    switch (match[1]) {
      case 'documentTitle':
        parts.push(`"${escapeCssString(documentTitle)}"`)
        break
      case 'chapterTitle':
        parts.push('string(iw-chapter-title)')
        break
      case 'sectionTitle':
        parts.push('string(iw-section-title)')
        break
      case 'printDate':
        parts.push(`"${escapeCssString(printDate)}"`)
        break
      case 'pageNo':
        parts.push(PRINT_THEME_PAGE_NUMBER_TOKEN)
        usesPageCounter = true
        break
      case 'totalPages':
        parts.push('counter(pages)')
        usesPageCounter = true
        break
    }
    lastIndex = tokenPattern.lastIndex
  }

  const trailing = template.slice(lastIndex)
  if (trailing) {
    parts.push(`"${escapeCssString(trailing)}"`)
  }

  return {
    content: parts.length ? parts.join(' ') : 'none',
    usesPageCounter,
  }
}

function buildMarginBoxCss(
  slots: Partial<Record<MarginBoxSlot, MarginBoxContent>>,
  pageSelector: string,
  documentTitle: string,
  printDate: string,
  pageNumberTemplatesByBox: Record<string, string>,
): string {
  const rules: string[] = []

  for (const [slot, slotContent] of Object.entries(slots) as Array<[MarginBoxSlot, MarginBoxContent]>) {
    if (!slotContent || !slotContent.template.trim()) continue
    const compiled = compileTemplateToCssContent(slotContent.template, documentTitle, printDate)
    if (compiled.usesPageCounter) {
      pageNumberTemplatesByBox[slot] = slotContent.template
    }
    const contentExpression = compiled.content.split(PRINT_THEME_PAGE_NUMBER_TOKEN).join('counter(page)')
    const alignRule = slotContent.textAlign && slotContent.textAlign !== 'auto'
      ? `text-align: ${slotContent.textAlign};`
      : ''
    rules.push(`
      @page${pageSelector} {
        @${slot} {
          content: ${contentExpression};
          ${alignRule}
        }
      }
    `)
  }

  return rules.join('\n')
}

function buildHeaderFooterCss(
  headerFooterInput: HeaderFooterSetup,
  documentTitle: string,
  printDate: string,
): { css: string; pageNumberTemplatesByBox: Record<string, string> } {
  if (!headerFooterInput.enabled) {
    return { css: '', pageNumberTemplatesByBox: {} }
  }

  const pageNumberTemplatesByBox: Record<string, string> = {}
  const cssParts = [
    buildMarginBoxCss(headerFooterInput.slots, '', documentTitle, printDate, pageNumberTemplatesByBox),
  ]

  if (headerFooterInput.differentFirstPage) {
    cssParts.push(buildMarginBoxCss(headerFooterInput.firstPageSlots ?? {}, ':first', documentTitle, printDate, pageNumberTemplatesByBox))
  }
  if (headerFooterInput.differentLeftRight) {
    cssParts.push(buildMarginBoxCss(headerFooterInput.leftPageSlots ?? {}, ':left', documentTitle, printDate, pageNumberTemplatesByBox))
    cssParts.push(buildMarginBoxCss(headerFooterInput.rightPageSlots ?? {}, ':right', documentTitle, printDate, pageNumberTemplatesByBox))
  }

  return {
    css: cssParts.join('\n'),
    pageNumberTemplatesByBox,
  }
}

function buildDialogOverrideCss(options: BuildPrintCssOptions): string {
  const grayscaleRule = options.colorMode === 'grayscale'
    ? 'html { filter: grayscale(1); }'
    : ''

  const scaleRule = `
    .iw-print-scale-root {
      zoom: ${options.zoomFactor};
      transform-origin: top left;
    }
  `

  return [grayscaleRule, scaleRule].join('\n')
}

export function buildPrintCss(options: BuildPrintCssOptions): BuildPrintCssResult {
  const headerFooterCss = buildHeaderFooterCss(options.headerFooter, options.documentTitle, options.printDate)

  return {
    css: [
      BASE_PRINT_CSS,
      options.theme.print.css,
      buildPageSetupCss(options.pageSetup),
      buildRunningTitleCss(options.runningTitle),
      buildPaginationCss(options.pagination),
      headerFooterCss.css,
      buildDialogOverrideCss(options),
    ].join('\n'),
    enablePageNumberFix: Object.keys(headerFooterCss.pageNumberTemplatesByBox).length > 0,
    pageNumberTemplatesByBox: headerFooterCss.pageNumberTemplatesByBox,
  }
}
