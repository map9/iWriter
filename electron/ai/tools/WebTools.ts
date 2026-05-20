import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import TurndownService from 'turndown'

const SSRF_BLOCKED = /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return true
    const host = parsed.hostname.toLowerCase()
    return SSRF_BLOCKED.test(host)
  } catch {
    return true
  }
}

function stripHtmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  return td.turndown(html)
}

const DEFAULT_MAX_BYTES = 500_000
const FETCH_TIMEOUT_MS = 15_000

const fetchUrlTool = new DynamicStructuredTool({
  name: 'fetch_url',
  description: 'Fetches the content of a URL. HTML is converted to Markdown. Returns up to max_bytes of text. Use for reading web pages, Wikipedia articles, or online text sources.',
  schema: z.object({
    url: z.string().url().describe('The URL to fetch'),
    max_bytes: z.number().int().positive().max(2_000_000).optional()
      .describe('Maximum bytes to read (default 500000)'),
  }),
  func: async ({ url, max_bytes = DEFAULT_MAX_BYTES }) => {
    if (isBlockedUrl(url)) {
      return JSON.stringify({ error: 'Blocked URL: private or local addresses are not allowed.' })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(url, { signal: controller.signal })
      const contentType = response.headers.get('content-type') ?? ''
      const finalUrl = response.url

      const reader = response.body?.getReader()
      if (!reader) {
        return JSON.stringify({ status: response.status, contentType, finalUrl, text: '', truncated: false })
      }

      const chunks: Uint8Array[] = []
      let totalBytes = 0
      let truncated = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          const remaining = max_bytes - totalBytes
          if (value.byteLength > remaining) {
            chunks.push(value.slice(0, remaining))
            truncated = true
            break
          }
          chunks.push(value)
          totalBytes += value.byteLength
        }
      }
      reader.cancel().catch(() => {})

      const bytes = new Uint8Array(totalBytes + chunks.reduce((acc, c) => acc + c.byteLength, 0) - totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      const rawText = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

      let text: string
      if (contentType.includes('text/html')) {
        text = stripHtmlToMarkdown(rawText)
      } else if (
        contentType.includes('text/') ||
        contentType.includes('application/json') ||
        contentType.includes('application/xml')
      ) {
        text = rawText
      } else {
        text = '<binary content omitted>'
      }

      return JSON.stringify({ status: response.status, contentType, finalUrl, text, truncated })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return JSON.stringify({ error: 'Request timed out after 15 seconds.' })
      }
      return JSON.stringify({ error: String(err) })
    } finally {
      clearTimeout(timer)
    }
  },
})

const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Searches the web using Tavily. Requires TAVILY_API_KEY environment variable. Returns titles, URLs, and snippets for matching results.',
  schema: z.object({
    query: z.string().min(1).describe('The search query'),
    max_results: z.number().int().min(1).max(10).default(5).describe('Number of results to return (default 5)'),
    topic: z.enum(['general', 'news']).optional().describe('Search topic type'),
  }),
  func: async ({ query, max_results = 5, topic }) => {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) {
      return JSON.stringify({
        error: 'TAVILY_API_KEY not configured',
        hint: 'Set the TAVILY_API_KEY environment variable before launching iWriter to enable web search.',
      })
    }

    try {
      const body: Record<string, unknown> = {
        api_key: apiKey,
        query,
        max_results,
        search_depth: 'basic',
        include_raw_content: false,
      }
      if (topic) body.topic = topic

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return JSON.stringify({ error: `Tavily API error ${response.status}: ${text.slice(0, 200)}` })
      }

      const data = await response.json() as { results?: { title: string; url: string; content: string }[] }
      const results = (data.results ?? []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      }))
      console.log(`[web_search] query="${query}" results=${results.length}`)
      return JSON.stringify({ results })
    } catch (err: unknown) {
      return JSON.stringify({ error: String(err) })
    }
  },
})

export function buildWebTools(): readonly DynamicStructuredTool[] {
  return [fetchUrlTool, webSearchTool] as const
}
