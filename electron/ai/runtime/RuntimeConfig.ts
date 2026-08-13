import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import type {
  AiAgentDomain,
  AiAgentMode,
  AiProviderConfig,
  AiThinkingLevel,
} from '../../../shared/ai/contracts'
import type { DetectedInputLanguage } from '../../../shared/ai/core/detectInputLanguage'
import {
  resolveEffectiveModelBudget,
  type EffectiveModelBudget,
} from '../../../shared/ai/core/modelBudget'

export interface AgentRuntimeConfigInput {
  threadId: string
  providerConfig: AiProviderConfig
  domain: AiAgentDomain
  mode: AiAgentMode
  modelId: string
  thinkingLevel: AiThinkingLevel
  language: DetectedInputLanguage
  workspacePath: string | null
  skillSources: readonly string[]
  resolvedApiKey: string
}

export interface AgentRuntimeConfig extends AgentRuntimeConfigInput {
  skillSources: string[]
  cacheKey: string
}

export function createAgentRuntimeConfig(input: AgentRuntimeConfigInput): AgentRuntimeConfig {
  const skillSources = [...input.skillSources]
  const filesystemFingerprint = `${input.workspacePath ?? ''}:${skillSources.join('|') || 'no-skills'}`
  const keyFingerprint = input.resolvedApiKey ? input.resolvedApiKey.slice(-8) : ''
  const budgetFingerprint = JSON.stringify([
    input.providerConfig.maxRequestTokens ?? null,
    input.providerConfig.modelPolicies?.[input.modelId]?.maxRequestTokens ?? null,
  ])
  const cacheKey = [
    input.threadId,
    input.providerConfig.id,
    input.domain,
    input.mode,
    input.modelId,
    input.thinkingLevel ?? '',
    input.language,
    keyFingerprint,
    input.providerConfig.baseUrl ?? '',
    input.providerConfig.fallbackModelId ?? '',
    budgetFingerprint,
    filesystemFingerprint,
  ].join(':')

  return {
    ...input,
    skillSources,
    cacheKey,
  }
}

function readModelProfile(model: BaseChatModel): ModelProfile | undefined {
  try {
    const profile = (model as BaseChatModel & { profile?: ModelProfile }).profile
    return profile && typeof profile === 'object' ? profile : undefined
  } catch {
    return undefined
  }
}

export function getEffectiveModelBudget(
  config: AiProviderConfig,
  modelId: string,
  model: BaseChatModel,
): EffectiveModelBudget {
  return resolveEffectiveModelBudget(config, modelId, readModelProfile(model))
}
