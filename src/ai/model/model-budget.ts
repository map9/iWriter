import type { AiModelProfile, AiProviderConfig } from '../types'

export const SUMMARIZATION_TRIGGER_FRACTION = 0.85
export const SUMMARIZATION_KEEP_FRACTION = 0.1
export const UNKNOWN_MODEL_REQUEST_BUDGET_TOKENS = 32000

const MIN_SUMMARIZATION_KEEP_TOKENS = 1000
const MAX_SUMMARIZATION_KEEP_TOKENS = 100000

export type ModelBudgetSource =
  | 'model-override'
  | 'provider-override'
  | 'builtin-model'
  | 'builtin-provider'
  | 'unknown-model'

export interface EffectiveModelBudget {
  /** Physical input-context limit reported by LangChain/modelProfiles, when known. */
  maxInputTokens?: number
  /** Runtime request size iWriter targets before provider/model quota becomes risky. */
  requestBudgetTokens: number
  /** DeepAgents automatic summarization trigger. */
  triggerTokens: number
  /** Recent context DeepAgents preserves after summarization. */
  keepTokens: number
  source: ModelBudgetSource
}

interface ConfiguredRequestBudget {
  value: number
  source: ModelBudgetSource
}

/**
 * Conservative application defaults. They are runtime policies, not model capabilities:
 * LangChain ModelProfile remains the source of physical context-window metadata.
 *
 * Per-model exceptions belong here only when a model family has a materially different request
 * quota. Provider-wide defaults let newly released models work without requiring user setup.
 */
const BUILTIN_MODEL_REQUEST_BUDGETS: Readonly<Record<string, number>> = {
  'openai:gpt-5.4-pro': 12000,
}

const BUILTIN_PROVIDER_REQUEST_BUDGETS: Readonly<Record<string, number>> = {
  openai: 200000,
  deepseek: 600000,
  anthropic: 800000,
  gemini: 128000,
}

function asPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined
}

function isOfficialOpenAI(config: Pick<AiProviderConfig, 'type' | 'presetId' | 'baseUrl'>): boolean {
  if (config.type !== 'openai-compat') return false
  if (config.presetId === 'openai') return true
  if (!config.baseUrl?.trim()) return true

  try {
    return new URL(config.baseUrl).hostname.toLowerCase() === 'api.openai.com'
  } catch {
    return false
  }
}

function getBuiltinProviderKey(
  config: Pick<AiProviderConfig, 'type' | 'presetId' | 'baseUrl'>,
): keyof typeof BUILTIN_PROVIDER_REQUEST_BUDGETS | null {
  if (isOfficialOpenAI(config)) return 'openai'
  if (config.type === 'deepseek' || config.type === 'anthropic' || config.type === 'gemini') {
    return config.type
  }
  return null
}

function resolveConfiguredRequestBudget(
  config: Pick<
    AiProviderConfig,
    'type' | 'presetId' | 'baseUrl' | 'modelPolicies' | 'maxRequestTokens'
  >,
  modelId: string,
  hasKnownContextLimit: boolean,
): ConfiguredRequestBudget {
  const modelOverride = asPositiveInteger(config.modelPolicies?.[modelId]?.maxRequestTokens)
  if (modelOverride) return { value: modelOverride, source: 'model-override' }

  const providerOverride = asPositiveInteger(config.maxRequestTokens)
  if (providerOverride) return { value: providerOverride, source: 'provider-override' }

  const providerKey = getBuiltinProviderKey(config)
  if (providerKey) {
    const modelBudget = BUILTIN_MODEL_REQUEST_BUDGETS[`${providerKey}:${modelId}`]
    if (modelBudget) return { value: modelBudget, source: 'builtin-model' }

    if (hasKnownContextLimit) {
      return {
        value: BUILTIN_PROVIDER_REQUEST_BUDGETS[providerKey]!,
        source: 'builtin-provider',
      }
    }
  }

  return {
    value: UNKNOWN_MODEL_REQUEST_BUDGET_TOKENS,
    source: 'unknown-model',
  }
}

/**
 * Resolve the single effective budget used by automatic summarization, request validation,
 * token progress, and the Compact tooltip.
 *
 * Runtime policy is capped by the physical model context when LangChain (or a user profile
 * override) provides one. Provider quotas are deliberately not stored in ModelProfile.
 */
export function resolveEffectiveModelBudget(
  config: Pick<
    AiProviderConfig,
    'type' | 'presetId' | 'baseUrl' | 'modelPolicies' | 'maxRequestTokens'
  >,
  modelId: string,
  profile?: Pick<AiModelProfile, 'maxInputTokens'>,
): EffectiveModelBudget {
  const maxInputTokens = asPositiveInteger(profile?.maxInputTokens)
  const configured = resolveConfiguredRequestBudget(config, modelId, !!maxInputTokens)
  const requestBudgetTokens = maxInputTokens
    ? Math.min(configured.value, maxInputTokens)
    : configured.value
  const triggerTokens = Math.max(1, Math.floor(
    requestBudgetTokens * SUMMARIZATION_TRIGGER_FRACTION,
  ))
  const preferredKeepTokens = Math.floor(
    requestBudgetTokens * SUMMARIZATION_KEEP_FRACTION,
  )
  const keepTokens = Math.min(
    Math.max(1, triggerTokens - 1),
    MAX_SUMMARIZATION_KEEP_TOKENS,
    Math.max(MIN_SUMMARIZATION_KEEP_TOKENS, preferredKeepTokens),
  )

  return {
    maxInputTokens,
    requestBudgetTokens,
    triggerTokens,
    keepTokens,
    source: configured.source,
  }
}
