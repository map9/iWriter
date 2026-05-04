import * as fs from 'fs'
import * as path from 'path'
import { app, shell } from 'electron'
import chokidar from 'chokidar'
import type { CustomThemeManifest, RawCustomTheme } from '../src/types/markdown-theme'

const BUILT_IN_THEME_IDS = new Set(['github', 'github-dark', 'prose', 'novel'])
const THEMES_DIR = path.join(app.getPath('home'), '.iwriter', 'markdown', 'themes')

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

export class CustomThemeLoader {
  readonly themesDir: string = THEMES_DIR

  ensureThemesDir(): void {
    if (!fs.existsSync(this.themesDir)) {
      fs.mkdirSync(this.themesDir, { recursive: true })
    }
  }

  load(): RawCustomTheme[] {
    this.ensureThemesDir()
    const results: RawCustomTheme[] = []

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.themesDir, { withFileTypes: true })
    } catch {
      return results
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

      const folderPath = path.join(this.themesDir, entry.name)
      const raw = this.loadSingleTheme(entry.name, folderPath)
      if (raw) results.push(raw)
    }

    return results
  }

  private loadSingleTheme(folderName: string, folderPath: string): RawCustomTheme | null {
    const errors: string[] = []

    // Reject names that collide with built-in IDs
    if (BUILT_IN_THEME_IDS.has(folderName)) {
      errors.push(`Theme ID "${folderName}" conflicts with a built-in theme and will be skipped.`)
      return { id: folderName, folderPath, screenCss: '', printCss: '', manifest: { name: folderName }, errors }
    }

    // Read theme.json (optional — fallback to folder name)
    const manifestPath = path.join(folderPath, 'theme.json')
    let manifest: CustomThemeManifest = { name: folderName }
    if (fs.existsSync(manifestPath)) {
      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          manifest = { name: folderName, ...parsed }
        }
      } catch (e) {
        errors.push(`theme.json parse error: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // Read screen.css (required)
    const screenCssPath = path.join(folderPath, 'screen.css')
    let screenCss = ''
    if (fs.existsSync(screenCssPath)) {
      try {
        screenCss = fs.readFileSync(screenCssPath, 'utf-8')
      } catch (e) {
        errors.push(`screen.css read error: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      errors.push('screen.css not found')
    }

    // Read print.css (optional)
    const printCssPath = path.join(folderPath, 'print.css')
    let printCss = ''
    if (fs.existsSync(printCssPath)) {
      try {
        printCss = fs.readFileSync(printCssPath, 'utf-8')
      } catch (e) {
        errors.push(`print.css read error: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return { id: folderName, folderPath, screenCss, printCss, manifest, errors }
  }

  watchThemes(onChanged: (themes: RawCustomTheme[]) => void): () => void {
    this.ensureThemesDir()

    const reload = debounce(() => {
      onChanged(this.load())
    }, 500)

    const watcher = chokidar.watch(this.themesDir, {
      depth: 2,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    watcher.on('all', reload)
    return () => { watcher.close() }
  }

  openFolder(): void {
    this.ensureThemesDir()
    shell.openPath(this.themesDir)
  }

  createExampleTheme(): void {
    this.ensureThemesDir()
    const exampleDir = path.join(this.themesDir, 'my-first-theme')
    if (fs.existsSync(exampleDir)) return
    fs.mkdirSync(exampleDir, { recursive: true })

    const manifest = {
      name: 'My First Theme',
      description: 'A custom theme for iWriter',
      version: '1.0.0',
      author: 'Your Name',
      print: {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        marginMode: 'single',
        marginTop: '20mm',
        marginRight: '18mm',
        marginBottom: '22mm',
        marginLeft: '18mm',
        background: false,
        paginationMode: 'balanced',
        headerFooterEnabled: true,
        headerLeft: '${documentTitle}',
        headerRight: '${printDate}',
        footerCenter: 'Page ${pageNo} of ${totalPages}',
        differentFirstPage: false,
        differentLeftRight: false,
        chapterSource: 'h1',
        sectionSource: 'h2',
      },
    }
    fs.writeFileSync(path.join(exampleDir, 'theme.json'), JSON.stringify(manifest, null, 2), 'utf-8')

    const screenCss = `/*
 * iWriter Custom Theme: My First Theme
 * Theme class: .tiptap.markdown-theme-my-first-theme
 *
 * The folder name determines the theme ID and CSS class suffix.
 * Rename this folder to change both. Reload via Preferences → Custom Themes.
 */

.tiptap.markdown-theme-my-first-theme {

  /* ── Typography ─────────────────────────────── */
  --md-font-family: Georgia, "Times New Roman", serif;
  --md-heading-font-family: "Helvetica Neue", Arial, sans-serif;
  --md-line-height: 1.7;

  /* ── Colors ──────────────────────────────────── */
  --md-body-color: #2d2d2d;
  --md-heading-color: #1a1a1a;

  /* ── Headings ────────────────────────────────── */
  --md-h1-size: 2rem;
  --md-h2-size: 1.6rem;
  --md-h3-size: 1.3rem;
  --md-h4-size: 1.1rem;
  --md-h5-size: 1rem;

  /* ── Paragraphs & Lists ──────────────────────── */
  --md-p-margin: 1rem 0;
  --md-list-margin: 1rem 0 1rem 0.4rem;
  --md-list-padding-x: 1rem;
  --md-bullet-margin: 1rem;
  --md-bullet-padding-left: 1.5rem;

  /* ── Horizontal rule ─────────────────────────── */
  --md-hr-color: #d1d5db;

  /* ── Highlight ───────────────────────────────── */
  --md-mark-bg: #fef08a;

  /* ── Links ───────────────────────────────────── */
  --md-link-color: #1a56db;
  --md-link-hover-color: #1239a4;

  /* ── Blockquote ──────────────────────────────── */
  --md-blockquote-border: #9ca3af;
  --md-blockquote-color: #6b7280;
  --md-blockquote-font-style: italic;

  /* ── Tables ──────────────────────────────────── */
  --md-table-border-color: #d1d5db;
  --md-table-header-bg: #f9fafb;

  /* ── Inline code ─────────────────────────────── */
  --md-inline-code-bg: #f3f4f6;
  --md-inline-code-color: #be185d;

  /* ── Code block ──────────────────────────────── */
  --md-code-block-bg: #1e1e2e;
  --md-code-block-color: #cdd6f4;

  /* ── Images ──────────────────────────────────── */
  --md-image-radius: 0.375rem;

  /* ── Math blocks ─────────────────────────────── */
  --md-math-block-bg: rgba(0, 0, 0, 0.03);
}

/* Add any additional element-specific styles below */
/* .tiptap.markdown-theme-my-first-theme h1 { } */
`
    fs.writeFileSync(path.join(exampleDir, 'screen.css'), screenCss, 'utf-8')

    const printCss = `/*
 * iWriter Custom Theme: My First Theme (Print / PDF)
 *
 * Standalone CSS injected into the print document.
 * No scoping needed — all rules apply to the document body directly.
 */

body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 12pt;
  line-height: 1.7;
  color: #2d2d2d;
}

h1, h2, h3, h4, h5, h6 {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.25;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
}
h1 { font-size: 22pt; margin-top: 0; }
h2 { font-size: 17pt; }
h3 { font-size: 13.5pt; }
h4 { font-size: 12pt; }
h5 { font-size: 11.5pt; }
h6 { font-size: 11pt; color: #6b7280; }

p { margin: 0 0 0.9em; }

ul, ol { margin: 0 0 0.9em; padding-left: 1.8em; }
li { margin: 0.2em 0; }
li > ul, li > ol { margin-top: 0.2em; margin-bottom: 0; }

ul[data-type="taskList"] { list-style: none; padding-left: 0; }
ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.2em; flex-shrink: 0; }

blockquote {
  border-left: 3px solid #9ca3af;
  padding-left: 1em;
  color: #6b7280;
  margin: 1.25em 0;
  font-style: italic;
}

table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 11pt; }
th, td { border: 1px solid #d1d5db; padding: 6px 12px; text-align: left; }
th { background: #f9fafb; font-weight: 600; }
tr:nth-child(even) td { background: #fafafa; }

code {
  font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
  font-size: 0.875em;
  background: #f3f4f6;
  color: #be185d;
  padding: 0.1em 0.25em;
  border-radius: 3px;
}
pre {
  font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
  font-size: 9.5pt;
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 1em;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 1em 0;
}
pre code { background: none; color: inherit; padding: 0; border-radius: 0; }

img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 1.25em auto; }
hr { border: none; border-top: 1px solid #d1d5db; margin: 2em 0; }
mark { background: #fef08a; padding: 0.1em 0.15em; }
a { color: #1a56db; text-decoration: underline; }
del { color: #6b7280; }
sub { font-size: 0.75em; vertical-align: sub; }
sup { font-size: 0.75em; vertical-align: super; }
strong { font-weight: 700; }
em { font-style: italic; }
`
    fs.writeFileSync(path.join(exampleDir, 'print.css'), printCss, 'utf-8')
  }
}
