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
}

type ChatAnthropicFields = ConstructorParameters<typeof ChatAnthropic>[0]
type ChatGoogleGenerativeAIFields = ConstructorParameters<typeof ChatGoogleGenerativeAI>[0]

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

function applyProfileOverride<T extends BaseChatModel>(model: T, profile?: ModelProfile): T {
  if (!profile || Object.keys(profile).length === 0) return model

  const baseProfile = (() => {
    try {
      const current = (model as T & { profile?: ModelProfile }).profile
      return current && typeof current === 'object' ? current : {}
    } catch {
      return {}
    }
  })()

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

export function createChatModel(
  config: AiProviderConfig,
  runtime: ChatModelRuntimeOptions = {},
): BaseChatModel {
  const modelId = runtime.modelId || config.lastSelectedModelId || config.defaultModelId
  const thinkingLevel = normalizeThinkingLevel(runtime.thinkingLevel ?? config.lastSelectedThinkingLevel)
  const parameters = normalizeProviderParameters(config.parameters)
  const parameterSupport = getProviderParameterSupport(config.type, config.baseUrl)
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
        ...(isTrueOpenAI
          ? {
              useResponsesApi: true,
              reasoning: {
                summary: 'auto',
                effort: reasoningEffort,
              },
            }
          : {
              modelKwargs: {
                reasoning_effort: reasoningEffort,
                ...(parameterSupport.frequencyPenalty ? { frequency_penalty: parameters.frequencyPenalty } : {}),
                ...(parameterSupport.presencePenalty ? { presence_penalty: parameters.presencePenalty } : {}),
              },
            }),
      }) as BaseChatModel
      return applyProfileOverride(model, getProfileOverride(config, modelId))
    }

    case 'deepseek': {
      const key = resolvedApiKey || 'no-key'
      const model = new ChatDeepSeek({
        model: modelId,
        apiKey: key,
        baseUrl: config.baseUrl,
        streaming: true,
        thinkingLevel,
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
        maxTokens: thinkingBudget + 2048,
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        },
      } as ChatAnthropicFields) as BaseChatModel, getProfileOverride(config, modelId))
    }

    case 'gemini': {
      return applyProfileOverride(new ChatGoogleGenerativeAI({
        model: modelId,
        apiKey: resolvedApiKey,
        streaming: true,
        ...(parameterSupport.temperature ? { temperature: parameters.temperature } : {}),
        ...(parameterSupport.topP ? { topP: parameters.topP } : {}),
        ...(parameterSupport.frequencyPenalty ? { frequencyPenalty: parameters.frequencyPenalty } : {}),
        ...(parameterSupport.presencePenalty ? { presencePenalty: parameters.presencePenalty } : {}),
        thinkingConfig: {
          thinkingBudget: mapThinkingLevelToBudget(thinkingLevel),
        },
      } as ChatGoogleGenerativeAIFields) as BaseChatModel, getProfileOverride(config, modelId))
    }

    default:
      throw new Error(`Unknown provider type: ${(config as AiProviderConfig).type}`)
  }
}
