import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const viteConfig = readFileSync('vite.config.ts', 'utf8')
const pdfViewer = readFileSync('src/components/pages/PDFViewerPage.vue', 'utf8')
const pdfProvider = readFileSync('src/services/pdf-render/PdfJsPageRenderProvider.ts', 'utf8')
const pdfWorker = readFileSync('src/services/pdf-render/pdfWorker.ts', 'utf8')

test('all lazily discovered PDF.js entry points are prebundled in development', () => {
  assert.match(pdfViewer, /from 'pdfjs-dist\/web\/pdf_viewer\.mjs'/)
  assert.match(pdfProvider, /from 'pdfjs-dist'/)
  assert.match(pdfWorker, /import 'pdfjs-dist\/build\/pdf\.worker\.min\.mjs'/)

  for (const dependency of [
    'pdfjs-dist',
    'pdfjs-dist/web/pdf_viewer.mjs',
    'pdfjs-dist/build/pdf.worker.min.mjs',
  ]) {
    assert.match(viteConfig, new RegExp(`"${dependency.replaceAll('.', '\\.').replaceAll('/', '\\/')}"`))
  }
})
