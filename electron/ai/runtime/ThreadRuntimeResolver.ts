import type { AiAgentDomain, AiAgentMode, AiProviderConfig, AiSettings } from '../../../src/types/ai'
import {
  getDefaultModeForDomain,
  normalizeAgentMode,
  normalizeModeForDomain,
  resolveAgentDomain,
} from '../../../src/types/ai'
import type { SendMessageRequest } from '../ipc/protocol'
import type { ThreadMeta } from '../thread/ThreadListQuery'

export interface ResolvedThreadRuntime {
  providerConfig: AiProviderConfig
  domain: AiAgentDomain
  mode: AiAgentMode
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

  const requestedMode = normalizeAgentMode(req?.mode)
  const fallbackMode = normalizeAgentMode(settings.defaultMode)
  const domain =
    req?.domain
    ?? (requestedMode ? resolveAgentDomain(requestedMode) : undefined)
    ?? meta?.domain
    ?? resolveAgentDomain(normalizeAgentMode(meta?.mode ?? fallbackMode))
  const mode = normalizeModeForDomain(
    requestedMode
      ?? normalizeAgentMode(meta?.mode)
      ?? getDefaultModeForDomain(domain),
    domain,
  )
  const modelId =
    req?.threadRuntime?.modelId
    || meta?.modelId
    || providerConfig.lastSelectedModelId
    || providerConfig.defaultModelId
    || providerConfig.models?.[0]
    || ''
  const thinkMode = req?.threadRuntime?.thinkMode ?? meta?.thinkMode

  return { providerConfig, domain, mode, modelId, thinkMode }
}
