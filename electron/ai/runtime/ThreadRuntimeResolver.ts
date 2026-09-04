import type { AiAgentDomain, AiAgentMode, AiProviderConfig, AiSettings, AiThinkingLevel } from '../../../shared/ai/contracts'
import {
  getDefaultModeForDomain,
  DEFAULT_THINKING_LEVEL,
  getActiveAiProviderConfig,
  isAiProviderUsable,
  normalizeAgentMode,
  normalizeModeForDomain,
  normalizeThinkingLevel,
  resolveAiProviderModelId,
  resolveAgentDomain,
} from '../../../shared/ai/contracts'
import { resolveAiApiKeyEnvVar } from '../config/AiConfigStore'
import type { SendMessageRequest } from '@shared/ai/contracts'
import type { ThreadMeta } from '../thread/ThreadListQuery'

export interface ResolvedThreadRuntime {
  providerConfig: AiProviderConfig
  domain: AiAgentDomain
  mode: AiAgentMode
  modelId: string
  thinkingLevel: AiThinkingLevel
}

function resolveExactProvider(
  settings: AiSettings,
  providerId: string,
  preferredModelId: string | undefined,
): AiProviderConfig {
  const providerConfig = settings.providerConfigs.find(config => config.id === providerId)
  if (!providerConfig || !isAiProviderUsable(providerConfig, {
    preferredModelId,
    resolveApiKey: resolveAiApiKeyEnvVar,
  })) {
    throw new Error(`AI provider is not available: ${providerId}`)
  }
  return providerConfig
}

function resolveExactModelId(
  providerConfig: AiProviderConfig,
  preferredModelId: string | undefined,
): string {
  if (preferredModelId === undefined || preferredModelId.length === 0) {
    return resolveAiProviderModelId(providerConfig)
  }

  const declaredModels = new Set([
    providerConfig.defaultModelId,
    ...(providerConfig.models ?? []),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0))
  if (!declaredModels.has(preferredModelId)) {
    throw new Error(`AI model is not available for provider ${providerConfig.id}: ${preferredModelId}`)
  }
  return preferredModelId
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
  const requiresExactRuntime = !!(requestedProviderId || metaProviderId)
  const providerConfig = providerId && requiresExactRuntime
    ? resolveExactProvider(settings, providerId, preferredModelId)
    : getActiveAiProviderConfig(
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
  const modelId = requiresExactRuntime
    ? resolveExactModelId(providerConfig, preferredModelId)
    : resolveAiProviderModelId(providerConfig, preferredModelId)
  const thinkingLevel = normalizeThinkingLevel(
    req?.threadRuntime?.thinkingLevel
    ?? meta?.thinkingLevel
    ?? providerConfig.lastSelectedThinkingLevel
    ?? DEFAULT_THINKING_LEVEL,
  )

  return { providerConfig, domain, mode, modelId, thinkingLevel }
}

export function resolveResumeThreadRuntime(
  settings: AiSettings,
  meta: ThreadMeta | null,
  resolveProviderConfigRevision: (revision: string) => AiProviderConfig | null,
): ResolvedThreadRuntime {
  const activeRuntime = meta?.activeRuntime
  if (!activeRuntime) return resolveThreadRuntime(settings, undefined, meta)

  const providerConfig = resolveProviderConfigRevision(activeRuntime.providerConfigRevision)
  if (!providerConfig) {
    throw new Error(
      `Active turn provider configuration revision is unavailable: ${activeRuntime.providerConfigRevision}`,
    )
  }

  return resolveThreadRuntime({
    ...settings,
    providerConfigs: [providerConfig],
    activeProviderConfigId: providerConfig.id,
  }, {
    domain: activeRuntime.domain,
    mode: activeRuntime.mode,
    threadRuntime: {
      providerConfigId: activeRuntime.providerConfigId,
      modelId: activeRuntime.modelId,
      thinkingLevel: activeRuntime.thinkingLevel,
    },
  }, meta)
}
