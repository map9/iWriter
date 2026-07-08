/**
 * ModelFactory — creates LangChain BaseChatModel instances from AiProviderConfig.
 *
 * Replaces the renderer-side ProviderRegistry / HTTP-based providers.
 * Uses official LangChain packages: @langchain/openai, @langchain/anthropic, @langchain/google-genai.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import type { AiProviderConfig, AiThinkingLevel } from '../../../src/types/ai'
import {
  getProviderParameterSupport,
  isOpenAIResponsesProtocol,
  normalizeProviderParameters,
  normalizeThinkingLevel,
  resolveApiKeyReference,
} from '../../../src/types/ai'
import { resolveAiApiKeyEnvVar } from '../config/AiConfigStore'
import { ChatDeepSeek } from './ChatDeepSeek'

export interface ChatModelRuntimeOptions {
  modelId?: string
  thinkingLevel?: AiThinkingLevel
  disableThinking?: boolean
}

type ChatAnthropicFields = ConstructorParameters<typeof ChatAnthropic>[0]
type ChatGoogleGenerativeAIFields = ConstructorParameters<typeof ChatGoogleGenerativeAI>[0]
type GeminiBindableModel = BaseChatModel & {
  bindTools?: (...args: unknown[]) => unknown
  invocationParams?: (...args: unknown[]) => Record<string, unknown>
}
type JsonRecord = Record<string, unknown>

function mapThinkingLevelToOpenAIReasoningEffort(thinkingLevel?: AiThinkingLevel): 'low' | 'medium' | 'high' | 'xhigh' {
  const normalized = normalizeThinkingLevel(thinkingLevel)
  if (normalized === 'extra_high') return 'xhigh'
  return normalized
}


const THINKING_TOKEN_BUDGETS: Record<AiThinkingLevel, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
  extra_high: 16384,
}

function mapThinkingLevelToBudget(thinkingLevel?: AiThinkingLevel): number {
  return THINKING_TOKEN_BUDGETS[normalizeThinkingLevel(thinkingLevel)]
}

function normalizeAnthropicThinkingTopP(topP: number): number | undefined {
  if (topP < 0.95 || topP > 1) return undefined
  return topP
}

function getProfileOverride(config: AiProviderConfig, modelId: string): ModelProfile | undefined {
  return config.modelProfiles?.[modelId] as ModelProfile | undefined
}

function readModelProfile(model: BaseChatModel): ModelProfile {
  try {
    const profile = (model as BaseChatModel & { profile?: ModelProfile }).profile
    return profile && typeof profile === 'object' ? profile : {}
  } catch {
    return {}
  }
}

function hasModelProfile(profile: ModelProfile): boolean {
  return Object.keys(profile).length > 0
}

function shouldUseProfileOverride(
  config: AiProviderConfig,
  model: BaseChatModel,
): boolean {
  if (!isOpenAIResponsesProtocol(config.type, config.baseUrl)) return true
  return !hasModelProfile(readModelProfile(model))
}

function applyProfileOverride<T extends BaseChatModel>(model: T, profile?: ModelProfile): T {
  if (!profile || Object.keys(profile).length === 0) return model

  const baseProfile = readModelProfile(model)

  Object.defineProperty(model, 'profile', {
    configurable: true,
    enumerable: true,
    get() {
      return {
        ...baseProfile,
        ...profile,
      }
    },
  })

  return model
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeGeminiToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeGeminiToolSchema)
  }

  if (!isPlainRecord(value)) return value

  const sanitized: JsonRecord = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') continue
    sanitized[key] = sanitizeGeminiToolSchema(child)
  }
  return sanitized
}

function sanitizeGeminiToolsParam<T extends Record<string, unknown>>(params: T): T {
  if (!Array.isArray(params.tools)) return params
  return {
    ...params,
    tools: sanitizeGeminiToolSchema(params.tools),
  }
}

function applyGeminiToolSchemaSanitizer<T extends BaseChatModel>(model: T): T {
  const geminiModel = model as GeminiBindableModel
  const originalBindTools = geminiModel.bindTools?.bind(geminiModel)
  if (originalBindTools) {
    geminiModel.bindTools = ((...args: unknown[]) => {
      const bound = originalBindTools(...args)
      if (isPlainRecord(bound) && isPlainRecord(bound.config)) {
        bound.config = sanitizeGeminiToolsParam(bound.config)
      }
      return bound
    }) as GeminiBindableModel['bindTools']
  }

  const originalInvocationParams = geminiModel.invocationParams?.bind(geminiModel)
  if (originalInvocationParams) {
    geminiModel.invocationParams = ((...args: unknown[]) =>
      sanitizeGeminiToolsParam(originalInvocationParams(...args))) as GeminiBindableModel['invocationParams']
  }

  return model
}


export function createChatModel(
  config: AiProviderConfig,
  runtime: ChatModelRuntimeOptions = {},
): BaseChatModel {
  const modelId = runtime.modelId || config.lastSelectedModelId || config.defaultModelId
  const thinkingLevel = normalizeThinkingLevel(runtime.thinkingLevel ?? config.lastSelectedThinkingLevel)
  const disableThinking = runtime.disableThinking === true
  const parameters = normalizeProviderParameters(config.parameters)
  const parameterSupport = getProviderParameterSupport(config.type, config.baseUrl, {
    modelId,
    modelProfiles: config.modelProfiles,
  })
  const resolvedApiKey = resolveApiKeyReference(config.apiKey, resolveAiApiKeyEnvVar)

  switch (config.type) {
    case 'openai-compat': {
      const key = resolvedApiKey || 'no-key'
      const isTrueOpenAI = isOpenAIResponsesProtocol(config.type, config.baseUrl)
      const reasoningEffort = mapThinkingLevelToOpenAIReasoningEffort(thinkingLevel)
      const model = new ChatOpenAI({
        model: modelId,
        apiKey: key,
        configuration: config.baseUrl
          ? { baseURL: config.baseUrl }
          : undefined,
        streaming: true,
        ...(parameterSupport.temperature ? { temperature: parameters.temperature } : {}),
        ...(parameterSupport.topP ? { topP: parameters.topP } : {}),
        ...(!disableThinking && isTrueOpenAI
          ? {
              useResponsesApi: true,
              reasoning: {
                summary: 'auto',
                effort: reasoningEffort,
              },
            }
          : !disableThinking
            ? {
              modelKwargs: {
                reasoning_effort: reasoningEffort,
                ...(parameterSupport.frequencyPenalty ? { frequency_penalty: parameters.frequencyPenalty } : {}),
                ...(parameterSupport.presencePenalty ? { presence_penalty: parameters.presencePenalty } : {}),
              },
            }
            : {}),
      }) as BaseChatModel
      return shouldUseProfileOverride(config, model)
        ? applyProfileOverride(model, getProfileOverride(config, modelId))
        : model
    }

    case 'deepseek': {
      const key = resolvedApiKey || 'no-key'
      const thinkingBudget = mapThinkingLevelToBudget(thinkingLevel)
      const model = new ChatDeepSeek({
        model: modelId,
        apiKey: key,
        baseUrl: config.baseUrl,
        streaming: true,
        thinkingLevel,
        budgetTokens: thinkingBudget,
        disableThinking,
        ...(parameterSupport.temperature ? { temperature: parameters.temperature } : {}),
        ...(parameterSupport.topP ? { topP: parameters.topP } : {}),
        ...(parameterSupport.frequencyPenalty ? { frequencyPenalty: parameters.frequencyPenalty } : {}),
        ...(parameterSupport.presencePenalty ? { presencePenalty: parameters.presencePenalty } : {}),
      }) as BaseChatModel
      return applyProfileOverride(model, getProfileOverride(config, modelId))
    }

    case 'anthropic': {
      const thinkingBudget = mapThinkingLevelToBudget(thinkingLevel)
      return applyProfileOverride(new ChatAnthropic({
        model: modelId,
        anthropicApiKey: resolvedApiKey,
        streaming: true,
        ...(parameterSupport.topP && normalizeAnthropicThinkingTopP(parameters.topP) != null
          ? { topP: normalizeAnthropicThinkingTopP(parameters.topP) }
          : {}),
        maxTokens: disableThinking ? 2048 : thinkingBudget + 2048,
        ...(!disableThinking
          ? {
              thinking: {
                type: 'enabled',
                budget_tokens: thinkingBudget,
              },
            }
          : {}),
      } as ChatAnthropicFields) as BaseChatModel, getProfileOverride(config, modelId))
    }

    case 'gemini': {
      return applyProfileOverride(applyGeminiToolSchemaSanitizer(new ChatGoogleGenerativeAI({
        model: modelId,
        apiKey: resolvedApiKey,
        streaming: true,
        ...(parameterSupport.temperature ? { temperature: parameters.temperature } : {}),
        ...(parameterSupport.topP ? { topP: parameters.topP } : {}),
        ...(parameterSupport.frequencyPenalty ? { frequencyPenalty: parameters.frequencyPenalty } : {}),
        ...(parameterSupport.presencePenalty ? { presencePenalty: parameters.presencePenalty } : {}),
        ...(!disableThinking
          ? {
              thinkingConfig: {
                thinkingBudget: mapThinkingLevelToBudget(thinkingLevel),
              },
            }
          : {}),
      } as ChatGoogleGenerativeAIFields) as BaseChatModel), getProfileOverride(config, modelId))
    }

    default:
      throw new Error(`Unknown provider type: ${(config as AiProviderConfig).type}`)
  }
}
