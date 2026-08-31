import type { AiThinkingLevel } from './agent'

export type AiProviderType = 'openai-compat' | 'deepseek' | 'anthropic' | 'gemini'

export interface AiModelProfile {
  maxInputTokens?: number
  maxOutputTokens?: number
  imageInputs?: boolean
  imageUrlInputs?: boolean
  pdfInputs?: boolean
  audioInputs?: boolean
  videoInputs?: boolean
  imageToolMessage?: boolean
  pdfToolMessage?: boolean
  reasoningOutput?: boolean
  imageOutputs?: boolean
  audioOutputs?: boolean
  videoOutputs?: boolean
  toolCalling?: boolean
  toolChoice?: boolean
  structuredOutput?: boolean
}

export interface AiModelRuntimePolicy {
  maxRequestTokens?: number
}

export interface AiProviderConfig {
  id: string
  type: AiProviderType
  label: string
  apiKey: string
  baseUrl?: string
  defaultModelId: string
  enabled: boolean
  presetId?: string
  models?: string[]
  modelProfiles?: Record<string, AiModelProfile>
  modelPolicies?: Record<string, AiModelRuntimePolicy>
  lastSelectedThinkingLevel?: AiThinkingLevel
  fallbackModelId?: string
  maxRequestTokens?: number
}

export type ApiKeyResolver = (name: string) => string | undefined

export interface ApiKeyResolveOptions {
  resolveApiKey?: ApiKeyResolver
}

export type AiProviderUnusableReason =
  | 'disabled'
  | 'missing-model'
  | 'missing-api-key'

export interface AiProviderUsability {
  usable: boolean
  reason?: AiProviderUnusableReason
  modelId?: string
}

export interface AiProviderUsabilityOptions extends ApiKeyResolveOptions {
  preferredModelId?: string | null
}

const API_KEY_ENV_REFERENCE_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/

export function getApiKeyEnvironmentVariableName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return API_KEY_ENV_REFERENCE_RE.exec(trimmed)?.[1] ?? null
}

export function resolveApiKeyReference(
  value: string | null | undefined,
  resolveApiKey?: ApiKeyResolver,
): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''

  const envName = getApiKeyEnvironmentVariableName(trimmed)
  if (!envName) return trimmed
  if (!resolveApiKey) return trimmed

  return resolveApiKey(envName)?.trim() ?? ''
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '[::1]'
    || normalized === '::1'
}

function isLocalOpenAICompatibleEndpoint(baseUrl: string | undefined): boolean {
  if (!baseUrl?.trim()) return false
  try {
    return isLoopbackHostname(new URL(baseUrl).hostname)
  } catch {
    return false
  }
}

export function aiProviderRequiresApiKey(config: AiProviderConfig): boolean {
  if (config.type === 'openai-compat') {
    if (config.presetId === 'ollama') return false
    if (isLocalOpenAICompatibleEndpoint(config.baseUrl)) return false
  }
  return true
}

export function resolveAiProviderModelId(
  config: AiProviderConfig,
  preferredModelId?: string | null,
): string {
  const preferred = preferredModelId?.trim()
  if (preferred) return preferred
  const defaultModel = config.defaultModelId?.trim()
  if (defaultModel) return defaultModel
  return config.models?.find(model => !!model.trim())?.trim() ?? ''
}

export function getAiProviderUsability(
  config: AiProviderConfig,
  options: AiProviderUsabilityOptions = {},
): AiProviderUsability {
  if (config.enabled === false) return { usable: false, reason: 'disabled' }

  const modelId = resolveAiProviderModelId(config, options.preferredModelId)
  if (!modelId) return { usable: false, reason: 'missing-model' }

  if (aiProviderRequiresApiKey(config) && !resolveApiKeyReference(config.apiKey, options.resolveApiKey)) {
    return { usable: false, reason: 'missing-api-key', modelId }
  }

  return { usable: true, modelId }
}

export function isAiProviderUsable(
  config: AiProviderConfig,
  options: AiProviderUsabilityOptions = {},
): boolean {
  return getAiProviderUsability(config, options).usable
}

export function getDefaultAiProviderConfig(
  configs: readonly AiProviderConfig[],
  options: AiProviderUsabilityOptions = {},
): AiProviderConfig | null {
  return configs.find(config => isAiProviderUsable(config, options)) ?? null
}

export function getActiveAiProviderConfig(
  configs: readonly AiProviderConfig[],
  activeId: string | null | undefined,
  options: AiProviderUsabilityOptions = {},
): AiProviderConfig | null {
  if (activeId) {
    const active = configs.find(config => config.id === activeId)
    if (active && isAiProviderUsable(active, options)) return active
  }
  return getDefaultAiProviderConfig(configs, options)
}

export function isOpenAIResponsesProtocol(type: AiProviderType, baseUrl?: string): boolean {
  if (type !== 'openai-compat') return false
  if (!baseUrl) return true
  return /api\.openai\.com/i.test(baseUrl)
}
