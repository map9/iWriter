import type { AiAgentMode, AiToolPermission } from './agent'
import type { ApiKeyResolveOptions, AiProviderConfig } from './provider'
import { resolveApiKeyReference } from './provider'

export type WebSearchProviderType = 'bocha' | 'exa' | 'serper' | 'tavily'
export type WebSearchProviderPresetId = 'bocha' | 'exa' | 'serper' | 'tavily'

export interface WebSearchProviderConfig {
  id: string
  type: WebSearchProviderType
  label: string
  presetId?: WebSearchProviderPresetId
  baseUrl?: string
  apiKey?: string
}

export const DEFAULT_WEB_SEARCH_PROVIDER_CONFIGS: WebSearchProviderConfig[] = [
  { id: 'web-search-bocha', type: 'bocha', label: 'Bocha', presetId: 'bocha' },
  { id: 'web-search-exa', type: 'exa', label: 'Exa', presetId: 'exa' },
  { id: 'web-search-serper', type: 'serper', label: 'Serper', presetId: 'serper' },
  { id: 'web-search-tavily', type: 'tavily', label: 'Tavily', presetId: 'tavily' },
]

export function cloneDefaultWebSearchProviderConfigs(): WebSearchProviderConfig[] {
  return DEFAULT_WEB_SEARCH_PROVIDER_CONFIGS.map(config => ({ ...config }))
}

export function isWebSearchProviderUsable(
  config: WebSearchProviderConfig,
  options: ApiKeyResolveOptions = {},
): boolean {
  return !!resolveApiKeyReference(config.apiKey, options.resolveApiKey)
}

export function getDefaultWebSearchProviderConfig(
  configs: readonly WebSearchProviderConfig[],
  options: ApiKeyResolveOptions = {},
): WebSearchProviderConfig | null {
  return configs.find(config => isWebSearchProviderUsable(config, options)) ?? null
}

export function getActiveWebSearchProviderConfig(
  configs: readonly WebSearchProviderConfig[],
  activeId: string | null | undefined,
  options: ApiKeyResolveOptions = {},
): WebSearchProviderConfig | null {
  if (activeId) {
    const active = configs.find(config => config.id === activeId)
    if (active && isWebSearchProviderUsable(active, options)) return active
  }
  return getDefaultWebSearchProviderConfig(configs, options)
}

export function normalizeWebSearchProviderConfigs(
  configs: readonly (WebSearchProviderConfig & { enabled?: boolean })[] | undefined | null,
): WebSearchProviderConfig[] {
  const byPresetId = new Map<string, WebSearchProviderConfig & { enabled?: boolean }>()
  for (const config of configs ?? []) {
    if (config?.presetId) byPresetId.set(config.presetId, config)
  }
  return DEFAULT_WEB_SEARCH_PROVIDER_CONFIGS.map(preset => {
    const existing = byPresetId.get(preset.presetId!)
    if (!existing) return { ...preset }
    return {
      ...preset,
      label: existing.label || preset.label,
      baseUrl: existing.baseUrl,
      apiKey: existing.apiKey,
    }
  })
}

export interface FetchUrlConfig {
  jsRenderFallback?: boolean
  timeoutMs?: number
  defaultMaxTokens?: number
}

export interface AiSettings {
  providerConfigs: AiProviderConfig[]
  activeProviderConfigId: string | null
  defaultMode: AiAgentMode
  toolPermissions: Record<string, AiToolPermission>
  webSearchProviderConfigs: WebSearchProviderConfig[]
  activeWebSearchProviderConfigId: string | null
  fetchUrl?: FetchUrlConfig
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerConfigs: [],
  activeProviderConfigId: null,
  defaultMode: 'edit',
  webSearchProviderConfigs: cloneDefaultWebSearchProviderConfigs(),
  activeWebSearchProviderConfigId: null,
  fetchUrl: { jsRenderFallback: true, timeoutMs: 15_000, defaultMaxTokens: 8_000 },
  toolPermissions: {
    get_document_outline: 'allow',
    get_section: 'allow',
    get_sections: 'allow',
    get_blocks: 'allow',
    get_block_context: 'allow',
    edit_block: 'allow',
    insert_block: 'allow',
    delete_block: 'allow',
    replace_range: 'allow',
    create_document: 'allow',
  },
}
