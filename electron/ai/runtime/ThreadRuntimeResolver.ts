import type { AiAgentDomain, AiAgentMode, AiProviderConfig, AiSettings, AiThinkingLevel } from '../../../src/types/ai'
import {
  getDefaultModeForDomain,
  DEFAULT_THINKING_LEVEL,
  normalizeAgentMode,
  normalizeModeForDomain,
  normalizeThinkingLevel,
  resolveAgentDomain,
} from '../../../src/types/ai'
import type { SendMessageRequest } from '../ipc/protocol'
import type { ThreadMeta } from '../thread/ThreadListQuery'

export interface ResolvedThreadRuntime {
  providerConfig: AiProviderConfig
  domain: AiAgentDomain
  mode: AiAgentMode
  modelId: string
  thinkingLevel: AiThinkingLevel
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

  const requestedMode = req?.mode ? normalizeAgentMode(req.mode) : undefined
  const metaMode = meta?.mode ? normalizeAgentMode(meta.mode) : undefined
  const fallbackMode = normalizeAgentMode(settings.defaultMode)
  const domain =
    req?.domain
    ?? (requestedMode ? resolveAgentDomain(requestedMode) : undefined)
    ?? meta?.domain
    ?? resolveAgentDomain(metaMode ?? fallbackMode)
  const mode = normalizeModeForDomain(
    requestedMode
      ?? metaMode
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
  const thinkingLevel = normalizeThinkingLevel(
    req?.threadRuntime?.thinkingLevel
    ?? meta?.thinkingLevel
    ?? providerConfig.lastSelectedThinkingLevel
    ?? DEFAULT_THINKING_LEVEL,
  )

  return { providerConfig, domain, mode, modelId, thinkingLevel }
}
