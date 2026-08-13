import { computed, ref, toRaw } from 'vue'
import type {
  AiAgentMode,
  AiProviderConfig,
  AiSettings,
  AiThinkingLevel,
  AiThread,
  WebSearchProviderConfig,
} from '@shared/ai/contracts'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_THINKING_LEVEL,
  getActiveAiProviderConfig,
  normalizeAgentMode,
  normalizeModeForDomain,
  normalizeThinkingLevel,
  normalizeWebSearchProviderConfigs,
  resolveAiProviderModelId,
  resolveAgentDomain,
} from '@shared/ai/contracts'
import {
  getProviderPresetById,
  getProviderPresets,
  type ProviderPreset,
} from '@/ai/model/providers/provider-presets'
import { agentClient } from '@/ai/client/AgentClient'

const STORAGE_KEY_SETTINGS = 'iwriter-ai-settings'

function resolveDefaultModelProfiles(
  config: AiProviderConfig,
  preset?: ProviderPreset,
): AiProviderConfig['modelProfiles'] {
  if (preset?.id === 'openai') return undefined
  return config.modelProfiles ?? preset?.modelProfiles
}

function normalizeOpenAiPresetConfig(
  config: AiProviderConfig,
  preset: ProviderPreset,
): AiProviderConfig {
  const presetModels = preset.models ?? []
  const isPresetModel = (modelId: string | undefined): boolean => {
    const normalized = modelId?.trim()
    return !!normalized && presetModels.includes(normalized)
  }

  return {
    ...config,
    defaultModelId: isPresetModel(config.defaultModelId) ? config.defaultModelId : preset.defaultModelId,
    models: presetModels,
    modelProfiles: undefined,
    lastSelectedModelId: isPresetModel(config.lastSelectedModelId) ? config.lastSelectedModelId : undefined,
    fallbackModelId: isPresetModel(config.fallbackModelId) ? config.fallbackModelId : undefined,
  }
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS)
    if (!raw) {
      return {
        ...DEFAULT_AI_SETTINGS,
        webSearchProviderConfigs: normalizeWebSearchProviderConfigs(undefined),
      }
    }
    const merged = { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) } as AiSettings
    merged.defaultMode = normalizeAgentMode(merged.defaultMode)
    merged.webSearchProviderConfigs = normalizeWebSearchProviderConfigs(merged.webSearchProviderConfigs)
    merged.activeWebSearchProviderConfigId = merged.activeWebSearchProviderConfigId ?? null
    merged.providerConfigs = (merged.providerConfigs ?? []).map(config => {
      const preset = getProviderPresetById(config.presetId)
      const normalizedPresetConfig = preset?.id === 'openai'
        ? normalizeOpenAiPresetConfig(config, preset)
        : config
      return {
        ...normalizedPresetConfig,
        modelProfiles: resolveDefaultModelProfiles(normalizedPresetConfig, preset),
        lastSelectedThinkingLevel: normalizeThinkingLevel(normalizedPresetConfig.lastSelectedThinkingLevel),
      }
    })
    return merged
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}

function saveSettingsToStorage(settings: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings))
  } catch (error) {
    console.error('[ai settings] Failed to persist settings:', error)
  }
}

function seedProviderPresets(settings: AiSettings): AiSettings {
  if (settings.providerConfigs.length > 0) return settings
  settings.providerConfigs = getProviderPresets().map((preset: ProviderPreset) => ({
    id: `preset-${preset.id}`,
    enabled: true,
    type: preset.type,
    label: preset.label,
    apiKey: '',
    baseUrl: preset.baseUrl,
    defaultModelId: preset.defaultModelId,
    presetId: preset.id,
    models: preset.models,
    modelProfiles: preset.id === 'openai' ? undefined : preset.modelProfiles,
    lastSelectedThinkingLevel: DEFAULT_THINKING_LEVEL,
  }))
  settings.activeProviderConfigId = settings.providerConfigs[0]?.id ?? null
  saveSettingsToStorage(settings)
  return settings
}

export function createAiSettingsState(deps: {
  getActiveThread: () => AiThread | null
  updateThread: (thread: AiThread) => void
}) {
  const settings = ref<AiSettings>(seedProviderPresets(loadAiSettings()))

  const activeProviderConfig = computed<AiProviderConfig | null>(() =>
    getActiveAiProviderConfig(
      settings.value.providerConfigs,
      settings.value.activeProviderConfigId,
    ),
  )

  const effectiveProviderConfig = computed<AiProviderConfig | null>(() => {
    const thread = deps.getActiveThread()
    if (thread?.providerConfigId) {
      return getActiveAiProviderConfig(
        settings.value.providerConfigs,
        thread.providerConfigId,
        { preferredModelId: thread.modelId },
      ) ?? activeProviderConfig.value
    }
    return activeProviderConfig.value
  })

  const availableModels = computed<string[]>(() => {
    const config = effectiveProviderConfig.value
    if (!config) return []
    if (config.models?.length) return config.models
    const presetModels = getProviderPresetById(config.presetId)?.models ?? []
    if (presetModels.length) return presetModels
    return [resolveAiProviderModelId(config)].filter(Boolean)
  })

  function saveSettings(): void {
    saveSettingsToStorage(settings.value)
    agentClient.updateConfig(JSON.parse(JSON.stringify(toRaw(settings.value))))
  }

  function reloadSettings(): void {
    settings.value = seedProviderPresets(loadAiSettings())
  }

  function updateWebSearchProviderConfig(id: string, updates: Partial<WebSearchProviderConfig>): void {
    const index = settings.value.webSearchProviderConfigs.findIndex(config => config.id === id)
    if (index < 0) return
    settings.value.webSearchProviderConfigs[index] = {
      ...settings.value.webSearchProviderConfigs[index]!,
      ...updates,
    }
    saveSettings()
  }

  function setActiveWebSearchProviderConfig(id: string | null): void {
    settings.value.activeWebSearchProviderConfigId = id
    saveSettings()
  }

  function addProviderConfig(config: AiProviderConfig): void {
    settings.value.providerConfigs.push(config)
    settings.value.activeProviderConfigId ||= config.id
    saveSettings()
  }

  function updateProviderConfig(id: string, updates: Partial<AiProviderConfig>): void {
    const index = settings.value.providerConfigs.findIndex(config => config.id === id)
    if (index < 0) return
    settings.value.providerConfigs[index] = {
      ...settings.value.providerConfigs[index]!,
      ...updates,
    }
    saveSettings()
  }

  function removeProviderConfig(id: string): void {
    settings.value.providerConfigs = settings.value.providerConfigs.filter(config => config.id !== id)
    if (settings.value.activeProviderConfigId === id) {
      settings.value.activeProviderConfigId = settings.value.providerConfigs[0]?.id ?? null
    }
    saveSettings()
  }

  function setActiveProvider(id: string): void {
    settings.value.activeProviderConfigId = id
    saveSettings()
    const nextProvider = settings.value.providerConfigs.find(config => config.id === id) ?? null
    const thread = deps.getActiveThread()
    if (!thread) return
    deps.updateThread({
      ...thread,
      providerConfigId: id,
      modelId: nextProvider?.lastSelectedModelId || nextProvider?.defaultModelId || thread.modelId,
      thinkingLevel: normalizeThinkingLevel(nextProvider?.lastSelectedThinkingLevel),
    })
  }

  function setCurrentModelId(modelId: string): void {
    const config = effectiveProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { defaultModelId: modelId, lastSelectedModelId: modelId })
    }
    const thread = deps.getActiveThread()
    if (thread) deps.updateThread({ ...thread, modelId })
  }

  function setCurrentThinkingLevel(level: AiThinkingLevel): void {
    const normalizedLevel = normalizeThinkingLevel(level)
    const config = effectiveProviderConfig.value
    if (config) updateProviderConfig(config.id, { lastSelectedThinkingLevel: normalizedLevel })
    const thread = deps.getActiveThread()
    if (thread) deps.updateThread({ ...thread, thinkingLevel: normalizedLevel })
  }

  function setCurrentMode(mode: AiAgentMode): void {
    const domain = resolveAgentDomain(mode)
    const normalizedMode = normalizeModeForDomain(mode, domain)
    const thread = deps.getActiveThread()
    if (thread) {
      deps.updateThread({ ...thread, domain, mode: normalizedMode })
      return
    }
    settings.value.defaultMode = normalizedMode
    saveSettings()
  }

  return {
    settings,
    activeProviderConfig,
    effectiveProviderConfig,
    availableModels,
    saveSettings,
    reloadSettings,
    updateWebSearchProviderConfig,
    setActiveWebSearchProviderConfig,
    addProviderConfig,
    updateProviderConfig,
    removeProviderConfig,
    setActiveProvider,
    setCurrentModelId,
    setCurrentThinkingLevel,
    setCurrentMode,
  }
}
