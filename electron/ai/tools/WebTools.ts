import { z } from 'zod'
import { tool, DynamicStructuredTool } from '@langchain/core/tools'
import { AiConfigStore } from '../config/AiConfigStore'
import { fetchUrl, DEFAULT_MAX_TOKENS } from './HtmlFetcher'

const fetchUrlTool = tool(
  async ({ url, max_tokens = DEFAULT_MAX_TOKENS }) => {
    const result = await fetchUrl(url, max_tokens)
    return JSON.stringify(result)
  },
  {
    name: 'fetch_url',
    description:
      'Fetches the content of a URL and returns clean Markdown. ' +
      'Automatically handles static pages, JavaScript-rendered SPAs (via headless browser), and non-HTML content. ' +
      'Strips ads, navigation, and boilerplate — returns title, paragraphs, tables, and image links. ' +
      'Image links extracted from the page are returned in the `imageLinks` field, preserved even when the page text is truncated. ' +
      'For a direct image URL (e.g. a .jpg/.png link), returns an `isImage: true` validation result with the resolved `finalUrl` — use this to verify an image link is real before embedding it. ' +
      'For local PDF files use get_pdf_pages instead. ' +
      'Use for web pages, Wikipedia articles, documentation, blog posts, and other online text sources.',
    schema: z.object({
      url: z.string().url().describe('The URL to fetch'),
      max_tokens: z.number().int().positive().max(50_000).optional()
        .describe(`Maximum tokens to return (default ${DEFAULT_MAX_TOKENS}). Larger values include more content.`),
    }),
  }
)

const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Searches the web using the configured search provider (Tavily, SearXNG, or custom). Returns titles, URLs, and snippets for matching results. When using Tavily, also returns `image_urls` — a list of direct embeddable image links with descriptions — that can be used directly as `![alt](url)` in documents without further fetching. Configure the provider in AI Preferences → Web Search Engine.',
  schema: z.object({
    query: z.string().min(1).describe('The search query'),
    max_results: z.number().int().min(1).max(10).default(5).describe('Number of results to return (default 5)'),
    topic: z.enum(['general', 'news']).optional().describe('Search topic type'),
  }),
  func: async ({ query, max_results = 5, topic }) => {
    const cfg = AiConfigStore.loadSettings().webSearch

    // Resolve provider type and credentials, falling back to env vars
    const providerType = cfg?.type ?? 'tavily'
    const enabled = cfg?.enabled !== false

    if (!enabled) {
      return JSON.stringify({
        error: 'Web search is disabled.',
        hint: 'Enable it in AI Preferences → Web Search Engine.',
      })
    }

    try {
      if (providerType === 'tavily') {
        const apiKey = cfg?.apiKey?.trim() || process.env.TAVILY_API_KEY
        if (!apiKey) {
          return JSON.stringify({
            error: 'Tavily API key not configured.',
            hint: 'Set the API key in AI Preferences → Web Search Engine, or set TAVILY_API_KEY environment variable.',
          })
        }
        const baseUrl = cfg?.baseUrl?.trim() || 'https://api.tavily.com/search'
        const body: Record<string, unknown> = {
          api_key: apiKey,
          query,
          max_results,
          search_depth: 'basic',
          include_raw_content: false,
          include_images: true,
          include_image_descriptions: true,
        }
        if (topic) body.topic = topic

        const response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          return JSON.stringify({ error: `Tavily API error ${response.status}: ${text.slice(0, 200)}` })
        }
        const data = await response.json() as {
          results?: { title: string; url: string; content: string }[]
          images?: Array<string | { url: string; description?: string }>
        }
        const results = (data.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.content }))
        // Normalise images: Tavily returns strings when include_image_descriptions is unsupported,
        // or { url, description } objects when supported. Always emit the richer form.
        const rawImages = data.images ?? []
        const image_urls = rawImages.map(img =>
          typeof img === 'string' ? { url: img, description: '' } : { url: img.url, description: img.description ?? '' }
        )
        console.log(`[web_search] tavily query="${query}" results=${results.length} images=${image_urls.length}`)
        return JSON.stringify({ provider: 'tavily', results, ...(image_urls.length ? { image_urls } : {}) })
      }

      if (providerType === 'searxng' || providerType === 'custom') {
        const baseUrl = cfg?.baseUrl?.trim()
        if (!baseUrl) {
          return JSON.stringify({
            error: `${providerType === 'searxng' ? 'SearXNG' : 'Custom'} search requires a base URL.`,
            hint: 'Set the URL in AI Preferences → Web Search Engine.',
          })
        }
        const url = new URL('/search', baseUrl)
        url.searchParams.set('q', query)
        url.searchParams.set('format', 'json')
        url.searchParams.set('categories', topic === 'news' ? 'news' : 'general')

        const headers: Record<string, string> = { 'Accept': 'application/json' }
        if (cfg?.apiKey?.trim()) headers['Authorization'] = `Bearer ${cfg.apiKey.trim()}`

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          return JSON.stringify({ error: `Search engine error ${response.status}: ${text.slice(0, 200)}` })
        }
        const data = await response.json() as { results?: { title: string; url: string; content?: string; snippet?: string }[] }
        const results = (data.results ?? []).slice(0, max_results).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content ?? r.snippet ?? '',
        }))
        console.log(`[web_search] ${providerType} query="${query}" results=${results.length}`)
        return JSON.stringify({ provider: providerType, results })
      }

      return JSON.stringify({ error: `Unknown web search provider type: ${providerType}` })
    } catch (err: unknown) {
      return JSON.stringify({ error: String(err) })
    }
  },
})

export function buildWebTools(): readonly DynamicStructuredTool[] {
  return [fetchUrlTool, webSearchTool] as const
}
