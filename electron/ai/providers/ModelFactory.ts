/**
 * ModelFactory — creates LangChain BaseChatModel instances from AiProviderConfig.
 *
 * Replaces the renderer-side ProviderRegistry / HTTP-based providers.
 * Uses official LangChain packages: @langchain/openai, @langchain/anthropic, @langchain/google-genai.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import type { AiProviderConfig } from '../../../src/types/ai'
import { ChatDeepSeek } from './ChatDeepSeek'

export interface ChatModelRuntimeOptions {
  modelId?: string
  thinkMode?: string
}

function isOpenAIHostedBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return true
  return /api\.openai\.com/i.test(baseUrl)
}

function isOpenAIReasoningModel(modelId: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(modelId)
}

function mapThinkModeToReasoningEffort(thinkMode?: string): 'low' | 'medium' | 'high' | undefined {
  const normalized = thinkMode?.trim().toLowerCase()
  if (!normalized || normalized === 'normal') return undefined
  if (normalized === 'think') return 'medium'
  if (normalized === 'low') return 'low'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'high') return 'high'
  return 'medium'
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

  switch (config.type) {
    case 'openai-compat': {
      // Lazy import to avoid loading unused providers
      const { ChatOpenAI } = require('@langchain/openai')
      const key = config.apiKey || 'no-key'
      const isTrueOpenAI = isOpenAIHostedBaseUrl(config.baseUrl)
      const useOpenAIReasoning = isTrueOpenAI && isOpenAIReasoningModel(modelId)
      const reasoningEffort = mapThinkModeToReasoningEffort(runtime.thinkMode)
      const model = new ChatOpenAI({
        model: modelId,
        apiKey: key,
        configuration: config.baseUrl
          ? { baseURL: config.baseUrl }
          : undefined,
        streaming: true,
        ...(useOpenAIReasoning
          ? {
              useResponsesApi: true,
              reasoning: {
                summary: 'auto',
                ...(reasoningEffort ? { effort: reasoningEffort } : {}),
              },
            }
          : {}),
      }) as BaseChatModel
      return applyProfileOverride(model, getProfileOverride(config, modelId))
    }

    case 'deepseek': {
      const key = config.apiKey || 'no-key'
      return new ChatDeepSeek({
        model: modelId,
        apiKey: key,
        baseUrl: config.baseUrl,
        streaming: true,
        profile: getProfileOverride(config, modelId),
      }) as BaseChatModel
    }

    case 'anthropic': {
      const { ChatAnthropic } = require('@langchain/anthropic')
      return applyProfileOverride(new ChatAnthropic({
        model: modelId,
        anthropicApiKey: config.apiKey,
        streaming: true,
      }) as BaseChatModel, getProfileOverride(config, modelId))
    }

    case 'gemini': {
      const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
      return applyProfileOverride(new ChatGoogleGenerativeAI({
        model: modelId,
        apiKey: config.apiKey,
        streaming: true,
      }) as BaseChatModel, getProfileOverride(config, modelId))
    }

    default:
      throw new Error(`Unknown provider type: ${(config as AiProviderConfig).type}`)
  }
}
