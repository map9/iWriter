import type { AiModelProfile } from './types'

export const SUMMARIZATION_TRIGGER_FRACTION = 0.85
export const SUMMARIZATION_KEEP_FRACTION = 0.1
export const SUMMARIZATION_FALLBACK_TRIGGER_TOKENS = 170000
export const SUMMARIZATION_FALLBACK_KEEP_MESSAGES = 6

export interface ModelBudgetInfo {
  maxInputTokens?: number
  triggerTokens: number
  usesFallback: boolean
}

export function getModelBudgetInfo(profile?: Pick<AiModelProfile, 'maxInputTokens'> | null): ModelBudgetInfo {
  const maxInputTokens = profile?.maxInputTokens
  if (typeof maxInputTokens === 'number' && Number.isFinite(maxInputTokens) && maxInputTokens > 0) {
    return {
      maxInputTokens,
      triggerTokens: Math.floor(maxInputTokens * SUMMARIZATION_TRIGGER_FRACTION),
      usesFallback: false,
    }
  }

  return {
    triggerTokens: SUMMARIZATION_FALLBACK_TRIGGER_TOKENS,
    usesFallback: true,
  }
}
