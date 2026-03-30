/**
 * ModelFactory — creates LangChain BaseChatModel instances from AiProviderConfig.
 *
 * Replaces the renderer-side ProviderRegistry / HTTP-based providers.
 * Uses official LangChain packages: @langchain/openai, @langchain/anthropic, @langchain/google-genai.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AiProviderConfig } from '../../../src/types/ai'

export interface ChatModelRuntimeOptions {
  modelId?: string
  thinkMode?: string
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
      console.log('[ModelFactory] openai-compat key:', key.slice(0, 4) + '...' + key.slice(-4), 'baseUrl:', config.baseUrl)
      return new ChatOpenAI({
        model: modelId,
        apiKey: key,
        configuration: config.baseUrl
          ? { baseURL: config.baseUrl }
          : undefined,
        streaming: true,
      }) as BaseChatModel
    }

    case 'anthropic': {
      const { ChatAnthropic } = require('@langchain/anthropic')
      return new ChatAnthropic({
        model: modelId,
        anthropicApiKey: config.apiKey,
        streaming: true,
      }) as BaseChatModel
    }

    case 'gemini': {
      const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
      return new ChatGoogleGenerativeAI({
        model: modelId,
        apiKey: config.apiKey,
        streaming: true,
      }) as BaseChatModel
    }

    default:
      throw new Error(`Unknown provider type: ${(config as AiProviderConfig).type}`)
  }
}
