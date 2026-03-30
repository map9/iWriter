import type { AiAgentProfile, AiProviderConfig, AiSettings } from '../../../src/types/ai'
import type { SendMessageRequest } from '../ipc/protocol'
import type { ThreadMeta } from '../thread/ThreadListQuery'

export interface ResolvedThreadRuntime {
  providerConfig: AiProviderConfig
  profile: AiAgentProfile
  modelId: string
  thinkMode?: string
}

export function resolveThreadRuntime(
  settings: AiSettings,
  req?: SendMessageRequest,
  meta?: ThreadMeta | null,
): ResolvedThreadRuntime {
  const requestedProviderId = req?.threadRuntime?.providerConfigId
  const metaProviderId = meta?.providerConfigId
  const activeProviderId = settings.activeProviderConfigId ?? undefined
  const providerId = requestedProviderId || metaProviderId || activeProviderId
  const providerConfig = settings.providerConfigs.find(c => c.id === providerId && c.enabled)
    ?? settings.providerConfigs.find(c => c.enabled)

  if (!providerConfig) {
    throw new Error('No active AI provider configured. Please add a provider in settings.')
  }

  const profile = meta?.profile ?? req?.profile ?? 'write'
  const modelId =
    req?.threadRuntime?.modelId
    || meta?.modelId
    || providerConfig.lastSelectedModelId
    || providerConfig.defaultModelId
    || providerConfig.models?.[0]
    || ''
  const thinkMode = req?.threadRuntime?.thinkMode ?? meta?.thinkMode

  return { providerConfig, profile, modelId, thinkMode }
}
