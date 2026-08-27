import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import type {
  AiAgentDomain,
  AiAgentMode,
  AiProviderConfig,
  AiThinkingLevel,
} from '../../../shared/ai/contracts'
import {
  resolveEffectiveModelBudget,
  type EffectiveModelBudget,
} from '../../../shared/ai/core/modelBudget'
import { createHash } from 'node:crypto'
import { createProviderConfigRevision } from '../config/ProviderConfigRevision'

export interface AgentRuntimeConfigInput {
  threadId: string
  providerConfig: AiProviderConfig
  domain: AiAgentDomain
  mode: AiAgentMode
  modelId: string
  thinkingLevel: AiThinkingLevel
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
  const providerRevision = createProviderConfigRevision(input.providerConfig)
  const resolvedKeyRevision = createHash('sha256').update(input.resolvedApiKey ?? '').digest('hex')
  const cacheKey = [
    input.threadId,
    providerRevision,
    input.domain,
    input.mode,
    input.modelId,
    input.thinkingLevel ?? '',
    resolvedKeyRevision,
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
