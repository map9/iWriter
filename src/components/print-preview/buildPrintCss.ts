import {
  PRINT_THEME_DOCUMENT_TITLE_TOKEN,
  PRINT_THEME_PAGE_NUMBER_TOKEN,
  PRINT_THEME_PRINT_DATE_TOKEN,
  type PrintThemeDefinition,
} from './printThemes'

export interface BuildPrintCssOptions {
  theme: PrintThemeDefinition
  documentTitle: string
  printDate: string
  pageSize: string
  margin: string | null
  zoomFactor: number
  colorMode: 'color' | 'grayscale'
  printHeaderFooter: boolean
}

export interface BuildPrintCssResult {
  css: string
  enablePageNumberFix: boolean
  pageNumberMarginBoxes: string[]
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
    break-inside: avoid;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-all;
  }

  pre code {
    background: none;
    padding: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    break-inside: auto;
    page-break-inside: auto;
  }

  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  th, td {
    border: 1px solid #ccc;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }

  img {
    max-width: 100%;
    break-inside: avoid;
    page-break-inside: avoid;
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

function escapeCssContent(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

function replaceToken(css: string, token: string, value: string): string {
  return css.split(token).join(value)
}

function collectPageNumberMarginBoxes(css: string): string[] {
  const matches = css.matchAll(/@([a-z-]+)\s*\{[^{}]*__IW_PAGE_NUMBER__[^{}]*\}/g)
  const boxes = new Set<string>()
  for (const match of matches) {
    const box = match[1]?.trim()
    if (box) boxes.add(box)
  }
  return Array.from(boxes)
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

  const marginRule = options.margin
    ? `@page { size: ${options.pageSize}; margin: ${options.margin}; }`
    : `@page { size: ${options.pageSize}; }`

  const disableHeaderFooterRule = options.printHeaderFooter
    ? ''
    : `
      @page {
        @top-left { content: none; }
        @top-center { content: none; }
        @top-right { content: none; }
        @bottom-left { content: none; }
        @bottom-center { content: none; }
        @bottom-right { content: none; }
      }
    `

  return [
    marginRule,
    grayscaleRule,
    scaleRule,
    disableHeaderFooterRule,
  ].join('\n')
}

export function buildPrintCss(options: BuildPrintCssOptions): BuildPrintCssResult {
  const escapedTitle = escapeCssContent(options.documentTitle)
  const escapedDate = escapeCssContent(options.printDate)
  const pageNumberMarginBoxes = options.printHeaderFooter
    ? collectPageNumberMarginBoxes(options.theme.css)
    : []
  const usesPageNumberToken = pageNumberMarginBoxes.length > 0

  let themeCss = options.theme.css
  themeCss = replaceToken(themeCss, PRINT_THEME_DOCUMENT_TITLE_TOKEN, escapedTitle)
  themeCss = replaceToken(themeCss, PRINT_THEME_PRINT_DATE_TOKEN, escapedDate)
  themeCss = replaceToken(themeCss, PRINT_THEME_PAGE_NUMBER_TOKEN, usesPageNumberToken ? ' ' : '')

  return {
    css: [
      BASE_PRINT_CSS,
      themeCss,
      buildDialogOverrideCss(options),
    ].join('\n'),
    enablePageNumberFix: usesPageNumberToken,
    pageNumberMarginBoxes,
  }
}
