import type { AiModelProfile } from './types'

export const DEFAULT_OPENAI_MODEL_PROFILES: Record<string, AiModelProfile> = {
  'gpt-5.4-2026-03-05': {
    maxInputTokens: 400000,
    maxOutputTokens: 128000,
    reasoningOutput: true,
    imageInputs: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'gpt-5.4-pro-2026-03-05': {
    maxInputTokens: 400000,
    maxOutputTokens: 128000,
    reasoningOutput: true,
    imageInputs: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'gpt-5-mini-2025-08-07': {
    maxInputTokens: 400000,
    maxOutputTokens: 128000,
    reasoningOutput: true,
    imageInputs: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'gpt-5-nano-2025-08-07': {
    maxInputTokens: 400000,
    maxOutputTokens: 128000,
    reasoningOutput: true,
    imageInputs: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'gpt-5-2025-08-07': {
    maxInputTokens: 400000,
    maxOutputTokens: 128000,
    reasoningOutput: true,
    imageInputs: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'gpt-4.1-2025-04-14': {
    maxInputTokens: 1047576,
    maxOutputTokens: 32768,
    reasoningOutput: false,
    imageInputs: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
}

export const DEFAULT_DEEPSEEK_MODEL_PROFILES: Record<string, AiModelProfile> = {
  'deepseek-chat': {
    maxInputTokens: 128000,
    maxOutputTokens: 8000,
    reasoningOutput: false,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
  'deepseek-reasoner': {
    maxInputTokens: 128000,
    maxOutputTokens: 64000,
    reasoningOutput: true,
    toolCalling: true,
    toolChoice: true,
    structuredOutput: true,
  },
}

export function getDefaultDeepSeekProfile(modelId: string): AiModelProfile | undefined {
  return DEFAULT_DEEPSEEK_MODEL_PROFILES[modelId]
}
