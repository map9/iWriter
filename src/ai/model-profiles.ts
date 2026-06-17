import type { AiModelProfile } from './types'

export const DEFAULT_DEEPSEEK_MODEL_PROFILES: Record<string, AiModelProfile> = {
  'deepseek-v4-pro': {
    maxInputTokens: 1000000,
    maxOutputTokens: 384000,
    reasoningOutput: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'deepseek-v4-flash': {
    maxInputTokens: 1000000,
    maxOutputTokens: 384000,
    reasoningOutput: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'deepseek-chat': {
    maxInputTokens: 1000000,
    maxOutputTokens: 384000,
    reasoningOutput: false,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'deepseek-reasoner': {
    maxInputTokens: 1000000,
    maxOutputTokens: 384000,
    reasoningOutput: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
}

export function getDefaultDeepSeekProfile(modelId: string): AiModelProfile | undefined {
  return DEFAULT_DEEPSEEK_MODEL_PROFILES[modelId]
}
