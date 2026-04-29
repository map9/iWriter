export interface PrintThemeDefinition {
  id: string
  name: string
  description?: string
  css: string
}

export const PRINT_THEME_DOCUMENT_TITLE_TOKEN = '__IW_DOCUMENT_TITLE__'
export const PRINT_THEME_PRINT_DATE_TOKEN = '__IW_PRINT_DATE__'
export const PRINT_THEME_PAGE_NUMBER_TOKEN = '__IW_PAGE_NUMBER__'

export const builtInPrintThemes: PrintThemeDefinition[] = [
  {
    id: 'default',
    name: '默认',
    description: '标准文稿排版，带标题、日期与页码。',
    css: `
      @page {
        margin: 20mm;
        @top-left {
          content: "${PRINT_THEME_DOCUMENT_TITLE_TOKEN}";
          font-size: 8pt;
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          color: #666;
        }
        @top-right {
          content: "${PRINT_THEME_PRINT_DATE_TOKEN}";
          font-size: 8pt;
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          color: #666;
        }
        @bottom-center {
          content: "${PRINT_THEME_PAGE_NUMBER_TOKEN}";
          font-size: 8pt;
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          color: #666;
        }
      }

      body {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #000;
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
        break-after: avoid;
        page-break-after: avoid;
      }

      h1 { font-size: 22pt; margin: 1.5em 0 0.5em; }
      h2 { font-size: 16pt; margin: 1.2em 0 0.4em; }
      h3 { font-size: 13pt; margin: 1em 0 0.3em; }
      h4, h5, h6 { font-size: 11pt; margin: 0.8em 0 0.3em; }

      p { margin: 0 0 0.8em; }

      blockquote {
        border-left: 3px solid #ccc;
        margin: 0.8em 0;
        padding: 0.4em 0 0.4em 1em;
        color: #555;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      th { background: #f0f0f0; font-weight: bold; }
      a { color: #000; text-decoration: underline; }
    `,
  },
  {
    id: 'novel',
    name: '小说',
    description: '更宽松的正文留白，适合长篇阅读。',
    css: `
      @page {
        margin: 24mm 22mm 28mm;
        @top-center {
          content: "${PRINT_THEME_DOCUMENT_TITLE_TOKEN}";
          font-size: 9pt;
          font-family: Georgia, "Times New Roman", serif;
          letter-spacing: 0.08em;
          color: #777;
        }
        @bottom-center {
          content: "${PRINT_THEME_PAGE_NUMBER_TOKEN}";
          font-size: 9pt;
          font-family: Georgia, "Times New Roman", serif;
          color: #666;
        }
      }

      body {
        font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
        font-size: 12.5pt;
        line-height: 1.85;
        color: #111;
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: "Baskerville", Georgia, serif;
        font-weight: 500;
        break-after: avoid;
        page-break-after: avoid;
      }

      h1 { font-size: 24pt; margin: 2.2em 0 0.9em; text-align: center; }
      h2 { font-size: 17pt; margin: 1.8em 0 0.6em; }
      h3 { font-size: 14pt; margin: 1.4em 0 0.5em; }
      h4, h5, h6 { font-size: 12pt; margin: 1em 0 0.4em; }

      p {
        margin: 0 0 0.95em;
        text-align: justify;
      }

      blockquote {
        border-left: 2px solid #bbb;
        margin: 1em 0;
        padding: 0.3em 0 0.3em 1em;
        color: #444;
        font-style: italic;
      }

      code, pre {
        font-family: "SFMono-Regular", "Cascadia Code", Consolas, monospace;
      }
    `,
  },
  {
    id: 'minimal',
    name: '极简',
    description: '干净紧凑，弱化装饰元素。',
    css: `
      @page {
        margin: 16mm;
        @bottom-center {
          content: "${PRINT_THEME_PAGE_NUMBER_TOKEN}";
          font-size: 8pt;
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          color: #777;
        }
      }

      body {
        font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.55;
        color: #111;
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
        font-weight: 650;
        break-after: avoid;
        page-break-after: avoid;
      }

      h1 { font-size: 21pt; margin: 1.2em 0 0.45em; }
      h2 { font-size: 15pt; margin: 1em 0 0.35em; }
      h3 { font-size: 12.5pt; margin: 0.9em 0 0.25em; }
      h4, h5, h6 { font-size: 11pt; margin: 0.7em 0 0.2em; }

      p { margin: 0 0 0.65em; }

      blockquote {
        border-left: 2px solid #ddd;
        margin: 0.7em 0;
        padding: 0.25em 0 0.25em 0.9em;
        color: #444;
      }

      th { background: #f7f7f7; font-weight: 600; }
      a { color: #111; text-decoration: none; border-bottom: 1px solid #bbb; }
    `,
  },
]

export function getPrintThemeById(id: string): PrintThemeDefinition | undefined {
  return builtInPrintThemes.find((theme) => theme.id === id)
}
