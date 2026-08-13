import type { AiAgentDomain, AiAgentMode, AiProviderConfig, AiSettings, AiThinkingLevel } from '../../../shared/ai/contracts'
import {
  getDefaultModeForDomain,
  DEFAULT_THINKING_LEVEL,
  getActiveAiProviderConfig,
  normalizeAgentMode,
  normalizeModeForDomain,
  normalizeThinkingLevel,
  resolveAiProviderModelId,
  resolveAgentDomain,
} from '../../../shared/ai/contracts'
import { resolveAiApiKeyEnvVar } from '../config/AiConfigStore'
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
  req?: Pick<SendMessageRequest, 'domain' | 'mode' | 'threadRuntime'>,
  meta?: ThreadMeta | null,
): ResolvedThreadRuntime {
  const requestedProviderId = req?.threadRuntime?.providerConfigId
  const metaProviderId = meta?.providerConfigId
  const activeProviderId = settings.activeProviderConfigId ?? undefined
  const providerId = requestedProviderId || metaProviderId || activeProviderId
  const preferredModelId = req?.threadRuntime?.modelId || meta?.modelId
  const providerConfig = getActiveAiProviderConfig(
    settings.providerConfigs,
    providerId,
    {
      preferredModelId,
      resolveApiKey: resolveAiApiKeyEnvVar,
    },
  )

  if (!providerConfig) {
    throw new Error('No usable AI provider configured. Please add an API key and model in settings.')
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
    resolveAiProviderModelId(providerConfig, preferredModelId)
  const thinkingLevel = normalizeThinkingLevel(
    req?.threadRuntime?.thinkingLevel
    ?? meta?.thinkingLevel
    ?? providerConfig.lastSelectedThinkingLevel
    ?? DEFAULT_THINKING_LEVEL,
  )

  return { providerConfig, domain, mode, modelId, thinkingLevel }
}
