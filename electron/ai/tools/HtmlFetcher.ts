/**
 * HtmlFetcher — robust URL→Markdown fetcher for the Agent's fetch_url tool.
 *
 * Pipeline (transparent to the Agent):
 *  1. SSRF guard     — DNS-resolved IP check, blocks private/reserved ranges
 *  2. Static fetch   — fetch() with retry/backoff, content-type routing
 *  3. Readability    — jsdom + @mozilla/readability → clean article HTML
 *  4. Turndown (GFM) — article HTML → Markdown (tables, strikethrough, etc.)
 *  5. JS-render fallback — hidden Electron BrowserWindow when content is thin
 *  6. Token limit    — estimateTextTokens + truncation to max_tokens budget
 *  7. TTL/LRU cache  — 15-minute in-memory cache (50 entries)
 */

import * as dns from 'dns'
import { BrowserWindow } from 'electron'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from '@guyplusplus/turndown-plugin-gfm'
import { estimateTextTokens } from '../../../src/ai/token-estimation'

// ── Turndown singleton ────────────────────────────────────────────────────────

const _td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
_td.use(gfm)

// ── Constants ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000
const JS_RENDER_TIMEOUT_MS = 30_000
const JS_RENDER_SETTLE_MS = 2_000
/** Text below this length (chars) after static extraction triggers JS-render fallback. */
const THIN_CONTENT_THRESHOLD = 200
export const DEFAULT_MAX_TOKENS = 8_000
const MAX_BODY_BYTES = 4_000_000
const CACHE_TTL_MS = 15 * 60_000
const CACHE_MAX_SIZE = 50

// ── Public types ──────────────────────────────────────────────────────────────

export type RenderMode = 'static' | 'js' | 'raw'

export interface FetchUrlResult {
  url: string
  finalUrl: string
  status: number
  contentType: string
  title?: string
  markdown: string
  estimatedTokens: number
  truncated: boolean
  renderMode: RenderMode
  cached: boolean
}

export interface FetchUrlError {
  error: string
  hint?: string
}

// ── SSRF guard ────────────────────────────────────────────────────────────────

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => isNaN(n))) return false
  const a = parts[0]!
  const b = parts[1]!
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    a === 0
  )
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true
  // IPv4-mapped: ::ffff:a.b.c.d
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4mapped?.[1]) return isPrivateIpv4(v4mapped[1])
  // fc00::/7 unique-local, fe80::/10 link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (/^fe[89ab]/i.test(lower)) return true
  return false
}

export async function assertUrlAllowed(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Blocked: invalid URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked: protocol "${parsed.protocol}" is not allowed.`)
  }
  const host = parsed.hostname
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error('Blocked URL: private or reserved address.')
  }
  // Resolve hostnames and check all resulting IPs
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':')) {
    try {
      const addrs = await dns.promises.lookup(host, { all: true } as dns.LookupAllOptions)
      for (const { address, family } of addrs) {
        if (family === 4 && isPrivateIpv4(address)) {
          throw new Error(`Blocked: "${host}" resolves to private address ${address}.`)
        }
        if (family === 6 && isPrivateIpv6(address)) {
          throw new Error(`Blocked: "${host}" resolves to private address ${address}.`)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Blocked')) throw err
      // DNS failure → proceed; fetch() will fail naturally for non-existent domains
    }
  }
}

// ── TTL/LRU cache ─────────────────────────────────────────────────────────────

interface CachedPayload {
  url: string
  finalUrl: string
  status: number
  contentType: string
  title?: string
  renderMode: RenderMode
  fullMarkdown: string  // untruncated; truncation applied at read time
}

interface CacheEntry {
  payload: CachedPayload
  expires: number
}

const _cache = new Map<string, CacheEntry>()

function cacheGet(key: string): CachedPayload | null {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { _cache.delete(key); return null }
  return entry.payload
}

function cacheSet(key: string, payload: CachedPayload): void {
  if (_cache.size >= CACHE_MAX_SIZE) {
    const firstKey = _cache.keys().next().value
    if (firstKey) _cache.delete(firstKey)
  }
  _cache.set(key, { payload, expires: Date.now() + CACHE_TTL_MS })
}

// ── Fetch with retry/backoff ──────────────────────────────────────────────────

interface RawFetch {
  status: number
  contentType: string
  finalUrl: string
  body: Uint8Array
}

async function fetchWithRetry(url: string, maxRetries = 2): Promise<RawFetch> {
  const retryDelays = [500, 1500]
  let lastErr: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise<void>(r => setTimeout(r, retryDelays[attempt - 1] ?? 1500))
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; iWriterAgent/1.0; +https://iwriter.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      })
      const contentType = response.headers.get('content-type') ?? ''
      const finalUrl = response.url

      // Re-check SSRF after any redirect
      if (finalUrl !== url) {
        await assertUrlAllowed(finalUrl)
      }

      // 5xx → retry; 4xx → definitive
      if (response.status >= 500 && attempt < maxRetries) {
        lastErr = new Error(`HTTP ${response.status}`)
        continue
      }

      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            const remaining = MAX_BODY_BYTES - totalBytes
            if (value.byteLength > remaining) {
              chunks.push(value.slice(0, remaining))
              break
            }
            chunks.push(value)
            totalBytes += value.byteLength
          }
        }
        reader.cancel().catch(() => {})
      }

      const body = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
      let off = 0
      for (const c of chunks) { body.set(c, off); off += c.byteLength }

      return { status: response.status, contentType, finalUrl, body }
    } catch (err: unknown) {
      lastErr = (err instanceof Error && err.name === 'AbortError')
        ? new Error('Request timed out after 15 seconds.')
        : err
      if (attempt < maxRetries) continue
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr ?? new Error('Fetch failed after retries.')
}

// ── Readability extraction ────────────────────────────────────────────────────

interface Extracted {
  title: string
  markdown: string
  textLength: number
}

// Attribute names (in priority order) where lazy-loaders stash the real URL.
const LAZY_SRC_ATTRS = [
  'data-src', 'data-lazy-src', 'data-lazy', 'data-original',
  'data-url', 'data-full-url', 'data-hi-res-src', 'data-image',
]

/**
 * Readability intentionally does NOT copy data-src to src when:
 *  (a) src is a base64 placeholder with a non-jpg/jpeg/png/webp data attribute, OR
 *  (b) the real image URL has no recognised extension (avif, gif, svg, CDN query params…).
 *
 * This pass runs on article.content AFTER Readability to fix those cases.
 */
function fixLazyImages(content: string, baseUrl: string): string {
  let dom: JSDOM | null = null
  try {
    dom = new JSDOM(content, { url: baseUrl })
  } catch {
    return content
  }
  const doc = dom.window.document
  let changed = false

  doc.querySelectorAll('img').forEach(img => {
    const srcAttr = img.getAttribute('src') ?? ''
    const isPlaceholder = srcAttr.startsWith('data:') || srcAttr === ''

    if (!isPlaceholder) return  // has a real URL already

    // Search data-* attrs for the first plausible real URL
    for (const attr of LAZY_SRC_ATTRS) {
      const val = img.getAttribute(attr) ?? ''
      // Accept http/https/protocol-relative/root-relative URLs
      if (val && (val.startsWith('http') || val.startsWith('//') || val.startsWith('/'))) {
        img.setAttribute('src', val)
        changed = true
        return
      }
    }

    // No real URL found: remove the img entirely so Turndown doesn't output the base64 blob
    if (srcAttr.startsWith('data:')) {
      img.remove()
      changed = true
    }
  })

  if (!changed) return content
  return (doc as Document).body?.innerHTML ?? content
}

function extractFromHtml(html: string, baseUrl: string): Extracted | null {
  try {
    const dom = new JSDOM(html, { url: baseUrl })
    const article = new Readability(dom.window.document).parse()
    if (!article?.content) return null

    const content = fixLazyImages(article.content, baseUrl)
    const rawMd = _td.turndown(content)
    const title = article.title ?? ''
    const alreadyHasTitle = /^#\s/.test(rawMd.trimStart())
    const markdown = (title && !alreadyHasTitle) ? `# ${title}\n\n${rawMd}` : rawMd

    return { title, markdown, textLength: (article.textContent ?? '').trim().length }
  } catch {
    return null
  }
}

// ── JS render via hidden BrowserWindow ───────────────────────────────────────

async function renderInHiddenWindow(url: string): Promise<string> {
  const hidden = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('JS render timeout after 30 s')), JS_RENDER_TIMEOUT_MS)
      hidden.webContents.once('did-finish-load', () => { clearTimeout(deadline); resolve() })
      hidden.webContents.once('did-fail-load', (_, code, desc) => {
        clearTimeout(deadline)
        reject(new Error(`Load failed: ${desc} (${code})`))
      })
      hidden.loadURL(url).catch(reject)
    })
    // Settle: let JS frameworks finish rendering
    await new Promise<void>(r => setTimeout(r, JS_RENDER_SETTLE_MS))
    return await hidden.webContents.executeJavaScript(
      'document.documentElement.outerHTML'
    ) as string
  } finally {
    hidden.close()
  }
}

// ── Token truncation ──────────────────────────────────────────────────────────

function applyTokenLimit(
  markdown: string,
  maxTokens: number,
): { markdown: string; truncated: boolean; estimatedTokens: number } {
  const estimated = estimateTextTokens(markdown)
  if (estimated <= maxTokens) return { markdown, truncated: false, estimatedTokens: estimated }
  const ratio = maxTokens / estimated
  const cut = Math.floor(markdown.length * ratio)
  return {
    markdown: markdown.slice(0, cut) + `\n\n*[...content truncated — original ~${estimated} tokens, limit ${maxTokens}]*`,
    truncated: true,
    estimatedTokens: estimated,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchUrl(
  url: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<FetchUrlResult | FetchUrlError> {
  // 1. SSRF guard
  try {
    await assertUrlAllowed(url)
  } catch (err) {
    return { error: (err as Error).message }
  }

  // 2. Cache lookup (key = URL, no trailing slash)
  const cacheKey = url.replace(/\/$/, '')
  const hit = cacheGet(cacheKey)
  if (hit) {
    const { fullMarkdown, ...rest } = hit
    const { markdown, truncated, estimatedTokens } = applyTokenLimit(fullMarkdown, maxTokens)
    return { ...rest, markdown, truncated, estimatedTokens, cached: true }
  }

  // 3. Static fetch with retry
  let raw: RawFetch
  try {
    raw = await fetchWithRetry(url)
  } catch (err) {
    return { error: String(err) }
  }

  const { status, contentType, finalUrl, body } = raw
  const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(body)

  // 4. Content-type routing
  let fullMarkdown: string
  let title: string | undefined
  let renderMode: RenderMode = 'static'

  if (contentType.includes('application/pdf')) {
    return {
      error: 'This URL points to a PDF file.',
      hint: 'Download it to your computer, open it in iWriter, then use get_pdf_pages to read its content.',
    }
  }

  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    if (
      contentType.includes('text/') ||
      contentType.includes('application/json') ||
      contentType.includes('application/xml')
    ) {
      fullMarkdown = bodyText
    } else {
      fullMarkdown = '<binary content omitted>'
    }
    renderMode = 'raw'
  } else {
    // HTML: try Readability on static response
    const staticResult = extractFromHtml(bodyText, finalUrl)
    const needsJsRender = !staticResult || staticResult.textLength < THIN_CONTENT_THRESHOLD

    if (needsJsRender) {
      // 5. JS-render fallback
      try {
        const renderedHtml = await renderInHiddenWindow(finalUrl)
        const jsResult = extractFromHtml(renderedHtml, finalUrl)
        if (jsResult && jsResult.textLength >= THIN_CONTENT_THRESHOLD) {
          fullMarkdown = jsResult.markdown
          title = jsResult.title
        } else {
          // Last resort: whole-page turndown of rendered DOM
          fullMarkdown = _td.turndown(renderedHtml || bodyText)
        }
        renderMode = 'js'
      } catch {
        // JS render failed → best effort with static result
        if (staticResult) {
          fullMarkdown = staticResult.markdown
          title = staticResult.title
        } else {
          fullMarkdown = _td.turndown(bodyText)
        }
        renderMode = 'static'
      }
    } else {
      fullMarkdown = staticResult.markdown
      title = staticResult.title
      renderMode = 'static'
    }
  }

  // 6. Cache untruncated result
  cacheSet(cacheKey, { url, finalUrl, status, contentType, title, renderMode, fullMarkdown })

  // 7. Token limit + return
  const { markdown, truncated, estimatedTokens } = applyTokenLimit(fullMarkdown, maxTokens)
  return { url, finalUrl, status, contentType, title, markdown, estimatedTokens, truncated, renderMode, cached: false }
}
