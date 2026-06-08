/**
 * PdfTools — LangChain tools for reading PDF files.
 *
 * Provides `get_pdf_outline` and `get_pdf_pages`, mirroring the style of
 * DocumentTools (optional file_path defaulting to the active file, JSON returns,
 * pagination, unified path resolution with helpful error messages).
 *
 * Both tools run in the Electron main process using pdfjs-dist/legacy (Node build).
 * Workers are disabled to avoid Electron context issues.
 */

import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { IWriterAgentContext } from '../runtime/AgentContext'

// ── pdf.js lazy loader (avoids loading ~3 MB at module init) ─────────────

interface PdfOutlineItem {
  title?: string
  dest?: string | unknown[] | null
  items?: PdfOutlineItem[]
}

interface PdfDocumentProxy {
  numPages: number
  getPage(n: number): Promise<PdfPageProxy>
  getOutline(): Promise<PdfOutlineItem[] | null>
  getDestination(name: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
}

interface PdfPageProxy {
  getTextContent(): Promise<{ items: Array<{ str: string; hasEOL?: boolean }> }>
}

interface PdfLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(opts: { data: ArrayBuffer; useWorkerFetch: boolean; isEvalSupported: boolean; disableFontFace: boolean }): {
    promise: Promise<PdfDocumentProxy>
  }
}

let _pdfLib: PdfLib | null = null

async function getPdfLib(): Promise<PdfLib> {
  if (_pdfLib) return _pdfLib

  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfLib

  // pdfjs-dist v4+ requires a non-empty workerSrc even in Node.js fake-worker mode.
  // Resolve the worker file path via createRequire (works in dev and packaged Electron).
  try {
    const _require = createRequire(import.meta.url)
    const workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  } catch {
    // Fallback: derive path relative to this file's location.
    const workerPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    )
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  }

  _pdfLib = mod
  return _pdfLib
}

// ── In-memory document cache (path → proxy) ──────────────────────────────

const _docCache = new Map<string, { proxy: PdfDocumentProxy; mtime: number }>()
const MAX_CACHE_SIZE = 5

async function loadPdfDocument(filePath: string): Promise<PdfDocumentProxy> {
  let mtime = 0
  try {
    mtime = fs.statSync(filePath).mtimeMs
  } catch {
    // stat may fail; skip cache on error
  }

  const cached = _docCache.get(filePath)
  if (cached && cached.mtime === mtime) return cached.proxy

  const pdfLib = await getPdfLib()
  const data = fs.readFileSync(filePath).buffer as ArrayBuffer
  const task = pdfLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true })
  const proxy = await task.promise

  if (_docCache.size >= MAX_CACHE_SIZE) {
    const firstKey = _docCache.keys().next().value
    if (firstKey) _docCache.delete(firstKey)
  }
  _docCache.set(filePath, { proxy, mtime })
  return proxy
}

// ── Shared path resolution ────────────────────────────────────────────────

function getRuntimeActiveFilePath(runtime: unknown): string | null {
  return (runtime as { context?: IWriterAgentContext } | undefined)?.context?.activeFilePath ?? null
}

type PdfPathResolution =
  | { ok: true; filePath: string }
  | { ok: false; error: string }

function resolvePdfPathForRuntime(argFilePath: string | undefined, runtime: unknown): PdfPathResolution {
  const activeFilePath = getRuntimeActiveFilePath(runtime)
  const requested = (argFilePath?.trim() || activeFilePath) ?? null

  if (!requested) {
    return { ok: false, error: 'Error: No file_path given and no PDF file is currently open.' }
  }

  if (!path.isAbsolute(requested)) {
    return {
      ok: false,
      error: `Error: file_path must be an absolute host path. Relative paths are not allowed: "${requested}".`,
    }
  }

  if (!fs.existsSync(requested)) {
    return { ok: false, error: `Error: file_path does not exist on disk: "${requested}".` }
  }

  if (path.extname(requested).toLowerCase() !== '.pdf') {
    return {
      ok: false,
      error: `Error: file_path must point to a .pdf file, got: "${requested}". Use document tools (get_document_outline, etc.) for .md/.txt/.iwt files.`,
    }
  }

  return { ok: true, filePath: requested }
}

// ── Outline helpers ───────────────────────────────────────────────────────

interface FlatOutlineItem {
  title: string
  level: number
  page: number
}

async function resolveOutlinePageNumber(doc: PdfDocumentProxy, dest: string | unknown[] | null | undefined): Promise<number> {
  if (!dest) return 0
  try {
    const resolved = typeof dest === 'string'
      ? await doc.getDestination(dest)
      : dest as unknown[] | null

    if (!resolved || !Array.isArray(resolved) || resolved.length === 0) return 0

    const target = resolved[0]
    if (typeof target === 'number') return target + 1
    if (target && typeof target === 'object') {
      try {
        const pageIndex = await doc.getPageIndex(target)
        return pageIndex + 1
      } catch {
        return 0
      }
    }
  } catch {
    // ignore
  }
  return 0
}

async function flattenOutline(doc: PdfDocumentProxy, nodes: PdfOutlineItem[], depth = 1): Promise<FlatOutlineItem[]> {
  const results: FlatOutlineItem[] = []
  for (const node of nodes) {
    const title = (node.title ?? '').trim() || `Section ${results.length + 1}`
    const page = await resolveOutlinePageNumber(doc, node.dest)
    results.push({ title, level: depth, page })
    if (node.items && node.items.length > 0) {
      const children = await flattenOutline(doc, node.items, depth + 1)
      results.push(...children)
    }
  }
  return results
}

// ── Page text extraction ──────────────────────────────────────────────────

async function extractPageText(page: PdfPageProxy): Promise<string> {
  const content = await page.getTextContent()
  const lines: string[] = []
  let currentLine = ''
  for (const item of content.items) {
    currentLine += item.str
    if (item.hasEOL) {
      lines.push(currentLine)
      currentLine = ''
    }
  }
  if (currentLine.trim()) lines.push(currentLine)
  return lines.join('\n')
}

// ── Tool 1: get_pdf_outline ───────────────────────────────────────────────

const MAX_PAGES_PER_CALL = 20

const getPdfOutline = tool(
  async ({ file_path }: { file_path?: string }, runtime) => {
    const resolved = resolvePdfPathForRuntime(file_path, runtime)
    if (!resolved.ok) return resolved.error

    try {
      const doc = await loadPdfDocument(resolved.filePath)
      const totalPages = doc.numPages
      const rawOutline = await doc.getOutline()

      if (!rawOutline || rawOutline.length === 0) {
        return JSON.stringify({
          file_path: resolved.filePath,
          total_pages: totalPages,
          has_outline: false,
          message: `This PDF has no bookmarks/outline. Use get_pdf_pages with start_page and end_page to read its content (max ${MAX_PAGES_PER_CALL} pages per call).`,
        })
      }

      const outline = await flattenOutline(doc, rawOutline)
      return JSON.stringify({
        file_path: resolved.filePath,
        total_pages: totalPages,
        has_outline: true,
        outline,
      })
    } catch (err: unknown) {
      return `Error reading PDF "${resolved.filePath}": ${err instanceof Error ? err.message : String(err)}`
    }
  },
  {
    name: 'get_pdf_outline',
    description:
      'Get the outline (table of contents) and total page count of a PDF file. ' +
      'Always call this first to understand the PDF structure before reading pages. ' +
      'Returns a flat list of { title, level, page } entries with the page number each section starts on. ' +
      'If the PDF has no bookmarks, returns total_pages and instructs how to use get_pdf_pages. ' +
      'Omit file_path to use the currently active PDF.',
    schema: z.object({
      file_path: z
        .string()
        .optional()
        .describe(
          'Real absolute host path to a .pdf file. Omit to use the currently active PDF tab.'
        ),
    }),
  }
)

// ── Tool 2: get_pdf_pages ─────────────────────────────────────────────────

const getPdfPages = tool(
  async ({ file_path, start_page, end_page }: { file_path?: string; start_page: number; end_page?: number }, runtime) => {
    const resolved = resolvePdfPathForRuntime(file_path, runtime)
    if (!resolved.ok) return resolved.error

    try {
      const doc = await loadPdfDocument(resolved.filePath)
      const totalPages = doc.numPages

      const start = Math.max(1, Math.floor(start_page))
      let end = end_page !== undefined ? Math.floor(end_page) : start
      end = Math.min(end, totalPages)

      if (start > totalPages) {
        return JSON.stringify({
          error: `start_page ${start} exceeds total_pages ${totalPages}. Use get_pdf_outline first.`,
          total_pages: totalPages,
        })
      }

      let truncated = false
      if (end - start + 1 > MAX_PAGES_PER_CALL) {
        end = start + MAX_PAGES_PER_CALL - 1
        truncated = true
      }

      const pages: Array<{ page: number; text: string }> = []
      for (let n = start; n <= end; n++) {
        const page = await doc.getPage(n)
        const text = await extractPageText(page)
        pages.push({ page: n, text })
      }

      return JSON.stringify({ file_path: resolved.filePath, total_pages: totalPages, pages, truncated })
    } catch (err: unknown) {
      return `Error reading PDF "${resolved.filePath}": ${err instanceof Error ? err.message : String(err)}`
    }
  },
  {
    name: 'get_pdf_pages',
    description:
      `Get the text content of one or more PDF pages. ` +
      `Use get_pdf_outline first to learn the page structure. ` +
      `Returns each page's text with "--- Page N ---" separators. ` +
      `Maximum ${MAX_PAGES_PER_CALL} pages per call; if end_page - start_page + 1 exceeds this, the result is truncated. ` +
      'Omit file_path to use the currently active PDF.',
    schema: z.object({
      file_path: z
        .string()
        .optional()
        .describe('Real absolute host path to a .pdf file. Omit to use the currently active PDF tab.'),
      start_page: z.number().int().min(1).describe('First page to read (1-based).'),
      end_page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(`Last page to read (inclusive, 1-based). Defaults to start_page. Maximum range: ${MAX_PAGES_PER_CALL} pages per call.`),
    }),
  }
)

// ── Builder ───────────────────────────────────────────────────────────────

export function buildPdfTools() {
  return [getPdfOutline, getPdfPages] as const
}
