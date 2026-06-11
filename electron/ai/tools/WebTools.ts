import { z } from 'zod'
import { tool, DynamicStructuredTool } from '@langchain/core/tools'
import { AiConfigStore, resolveAiApiKeyEnvVar } from '../config/AiConfigStore'
import { fetchUrl, DEFAULT_MAX_TOKENS } from './HtmlFetcher'
import { getActiveWebSearchProviderConfig, resolveApiKeyReference } from '../../../src/types/ai'

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

const WEB_SEARCH_TIMEOUT_MS = 15_000

interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

interface WebSearchImage {
  url: string
  description: string
}

const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Searches the web using the configured search provider (Bocha, Exa, Serper, or Tavily). Returns titles, URLs, and snippets for matching results. Providers that support it (Tavily, Bocha) also return `image_urls` — a list of direct embeddable image links with descriptions — that can be used directly as `![alt](url)` in documents without further fetching. Configure the provider in AI Preferences → Web Search Engine.',
  schema: z.object({
    query: z.string().min(1).describe('The search query'),
    max_results: z.number().int().min(1).max(10).default(5).describe('Number of results to return (default 5)'),
    topic: z.enum(['general', 'news']).optional().describe('Search topic type'),
  }),
  func: async ({ query, max_results = 5, topic }) => {
    const settings = AiConfigStore.loadSettings()
    const cfg = getActiveWebSearchProviderConfig(
      settings.webSearchProviderConfigs,
      settings.activeWebSearchProviderConfigId,
      { resolveApiKey: resolveAiApiKeyEnvVar },
    )

    if (!cfg) {
      return JSON.stringify({
        error: 'Web search is unavailable.',
        hint: 'Configure at least one usable search engine in AI Preferences → Web Search.',
      })
    }

    const apiKey = resolveApiKeyReference(cfg.apiKey, resolveAiApiKeyEnvVar)
    if (!apiKey) {
      return JSON.stringify({
        error: `${cfg.label} API key not configured.`,
        hint: 'Set the API key in AI Preferences → Web Search.',
      })
    }

    try {
      switch (cfg.type) {
        case 'tavily': {
          const baseUrl = cfg.baseUrl?.trim() || 'https://api.tavily.com/search'
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
            signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
          })
          if (!response.ok) {
            const text = await response.text().catch(() => '')
            return JSON.stringify({ error: `Tavily API error ${response.status}: ${text.slice(0, 200)}` })
          }
          const data = await response.json() as {
            results?: { title: string; url: string; content: string }[]
            images?: Array<string | { url: string; description?: string }>
          }
          const results: WebSearchResult[] = (data.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.content }))
          // Normalise images: Tavily returns strings when include_image_descriptions is unsupported,
          // or { url, description } objects when supported. Always emit the richer form.
          const rawImages = data.images ?? []
          const image_urls: WebSearchImage[] = rawImages.map(img =>
            typeof img === 'string' ? { url: img, description: '' } : { url: img.url, description: img.description ?? '' }
          )
          console.log(`[web_search] tavily query="${query}" results=${results.length} images=${image_urls.length}`)
          return JSON.stringify({ provider: 'tavily', results, ...(image_urls.length ? { image_urls } : {}) })
        }

        case 'bocha': {
          const baseUrl = cfg.baseUrl?.trim() || 'https://api.bochaai.com/v1/web-search'
          const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ query, count: max_results, summary: true }),
            signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
          })
          if (!response.ok) {
            const text = await response.text().catch(() => '')
            return JSON.stringify({ error: `Bocha API error ${response.status}: ${text.slice(0, 200)}` })
          }
          const data = await response.json() as {
            data?: {
              webPages?: { value?: { name: string; url: string; snippet?: string; summary?: string }[] }
              images?: { value?: { contentUrl: string; name?: string }[] }
            }
          }
          const results: WebSearchResult[] = (data.data?.webPages?.value ?? []).slice(0, max_results).map(r => ({
            title: r.name,
            url: r.url,
            snippet: r.summary ?? r.snippet ?? '',
          }))
          const rawImages = data.data?.images?.value ?? []
          const image_urls: WebSearchImage[] = rawImages.map(img => ({ url: img.contentUrl, description: img.name ?? '' }))
          console.log(`[web_search] bocha query="${query}" results=${results.length} images=${image_urls.length}`)
          return JSON.stringify({ provider: 'bocha', results, ...(image_urls.length ? { image_urls } : {}) })
        }

        case 'serper': {
          const baseUrl = cfg.baseUrl?.trim() || 'https://google.serper.dev/search'
          const body: Record<string, unknown> = { q: query, num: max_results }
          if (topic === 'news') body.type = 'news'

          const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-KEY': apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
          })
          if (!response.ok) {
            const text = await response.text().catch(() => '')
            return JSON.stringify({ error: `Serper API error ${response.status}: ${text.slice(0, 200)}` })
          }
          const data = await response.json() as {
            organic?: { title: string; link: string; snippet?: string }[]
            news?: { title: string; link: string; snippet?: string }[]
          }
          const items = (topic === 'news' ? data.news : data.organic) ?? data.organic ?? []
          const results: WebSearchResult[] = items.slice(0, max_results).map(r => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet ?? '',
          }))
          console.log(`[web_search] serper query="${query}" results=${results.length}`)
          return JSON.stringify({ provider: 'serper', results })
        }

        case 'exa': {
          const baseUrl = cfg.baseUrl?.trim() || 'https://api.exa.ai/search'
          const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
            },
            body: JSON.stringify({
              query,
              numResults: max_results,
              contents: { text: true },
            }),
            signal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
          })
          if (!response.ok) {
            const text = await response.text().catch(() => '')
            return JSON.stringify({ error: `Exa API error ${response.status}: ${text.slice(0, 200)}` })
          }
          const data = await response.json() as {
            results?: { title?: string; url: string; text?: string }[]
          }
          const results: WebSearchResult[] = (data.results ?? []).slice(0, max_results).map(r => ({
            title: r.title ?? '',
            url: r.url,
            snippet: r.text ?? '',
          }))
          console.log(`[web_search] exa query="${query}" results=${results.length}`)
          return JSON.stringify({ provider: 'exa', results })
        }

        default:
          return JSON.stringify({ error: `Unknown web search provider type: ${cfg.type}` })
      }
    } catch (err: unknown) {
      return JSON.stringify({ error: String(err) })
    }
  },
})

export function buildWebTools(): readonly DynamicStructuredTool[] {
  return [fetchUrlTool, webSearchTool] as const
}
