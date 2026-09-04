import { ref, computed, watch, nextTick } from 'vue'
import { useAiStore } from '@/ai/state/aiStore'
import type { AiModelProfile, AiModelRuntimePolicy, AiThinkingLevel } from '@shared/ai/contracts'
import { DEFAULT_THINKING_LEVEL, normalizeThinkingLevel } from '@shared/ai/contracts'

export type ModelStatus = 'local' | 'cloud' | 'remote'

export interface ModelItem {
  id: string
  status?: ModelStatus
}

export interface ThinkingLevelItem {
  value: AiThinkingLevel
  labelKey: string
}

/**
 * Per-model metadata assembled from Ollama's /api/tags and /api/show responses.
 * model_info carries the physical context window (<arch>.context_length), while
 * details.families remains a fallback for capability inference.
 */
export interface OllamaModelEntry {
  name: string
  remote_model?: string
  details?: {
    family?: string
    families?: string[]
    parameter_size?: string
    quantization_level?: string
  }
  model_info?: Record<string, unknown>
  /** /api/show capabilities, e.g. ["completion", "tools", "vision"]. */
  capabilities?: string[]
}

interface OllamaRunningModelEntry {
  name?: string
  model?: string
  context_length?: number
}

interface OllamaFetchResponse {
  ok: boolean
  json(): Promise<unknown>
}

type OllamaFetch = (url: string, init?: RequestInit) => Promise<OllamaFetchResponse>

export interface OllamaModelDiscovery {
  models: OllamaModelEntry[]
  modelProfiles: Record<string, AiModelProfile>
  /** Undefined means /api/ps was unavailable; an empty object is a valid empty snapshot. */
  modelPolicies?: Record<string, AiModelRuntimePolicy>
}

interface OllamaPersistedMetadata {
  modelProfiles?: Record<string, AiModelProfile>
  modelPolicies?: Record<string, AiModelRuntimePolicy>
}

export function mergeOllamaModelMetadata(
  existing: OllamaPersistedMetadata,
  discovery: Pick<OllamaModelDiscovery, 'modelProfiles' | 'modelPolicies'>,
): Required<OllamaPersistedMetadata> {
  const modelProfiles: Record<string, AiModelProfile> = {
    ...(existing.modelProfiles ?? {}),
  }
  for (const [modelId, discovered] of Object.entries(discovery.modelProfiles)) {
    const configured = existing.modelProfiles?.[modelId] ?? {}
    const merged = { ...discovered, ...configured }
    if (discovered.maxInputTokens !== undefined) {
      merged.maxInputTokens = discovered.maxInputTokens
    }
    modelProfiles[modelId] = merged
  }

  const modelPolicies = discovery.modelPolicies === undefined
    ? { ...(existing.modelPolicies ?? {}) }
    : { ...discovery.modelPolicies }

  return { modelProfiles, modelPolicies }
}

// ── Ollama metadata → AiModelProfile inference ───────────────────────────────

/** Vision-capable families (present in `details.families` alongside the base family). */
const VISION_FAMILY_MARKERS = [
  'clip', 'vision', 'llava', 'moondream', 'minicpm', 'florence', 'pixtral',
  'internvl', 'bakllava', 'xcomposer', 'granite-vision', 'granitevision',
  'phi3.5-vision', 'phi3.5vision', 'llama3.2-vision', 'llama3.2vision',
  'qwen3-vl', 'qwen3vl', 'qwen2.5vl', 'qwen2.5-vl', 'qwen2vl', 'qwen2-vl',
  'glm-4v', 'glm-4.1v', 'glm4v', 'deepseek-vl', 'deepseekvl',
]

/** Families/names known to support OpenAI-style tool calling. */
const TOOL_CAPABLE_MARKERS = [
  'qwen', 'llama3', 'mistral', 'gemma', 'glm', 'gpt-oss', 'gptoss', 'deepseek',
  'kimi', 'nemotron', 'phi', 'granite', 'command', 'dbrx', 'exaone', 'minicpm', 'internlm',
]

/** Families/names that expose a reasoning / thinking mode. */
const REASONING_MARKERS = [
  /deepseek-r1/, /deepseekr1/, /glm-4\.7/, /glm4\.7/, /kimi-k2/, /minimax/,
  /gpt-oss/, /gptoss/, /nemotron-3/, /nemotron3/, /gemini-3/, /gemini3/,
]

function readOllamaContextLength(entry: OllamaModelEntry): number | undefined {
  const info = entry.model_info
  if (!info) return undefined
  const arch = info['general.architecture']
  if (typeof arch === 'string') {
    const direct = info[`${arch}.context_length`]
    if (typeof direct === 'number' && direct > 0) return Math.floor(direct)
  }
  // Fallback: any <arch>.context_length key (architecture key may vary).
  for (const [key, value] of Object.entries(info)) {
    if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
      return Math.floor(value)
    }
  }
  return undefined
}

function inferImageInputs(
  name: string,
  families: string[],
  capabilities: string[],
): boolean {
  if (capabilities.includes('vision')) return true
  const haystack = `${families.join(' ')} ${name}`.toLowerCase()
  return VISION_FAMILY_MARKERS.some(marker => haystack.includes(marker.toLowerCase()))
}

function inferToolCalling(
  name: string,
  families: string[],
  capabilities: string[],
): boolean {
  if (capabilities.includes('tools')) return true
  const lower = name.toLowerCase()
  // Known non-tool model families (translation / OCR / embedding only).
  if (/(translate|ocr|embed)/.test(lower)) return false
  const haystack = `${families.join(' ')} ${lower}`
  return TOOL_CAPABLE_MARKERS.some(marker => haystack.includes(marker.toLowerCase()))
}

function inferReasoningOutput(name: string, families: string[]): boolean {
  const lower = name.toLowerCase()
  if (lower.includes('coder')) return false
  if (lower.includes('qwen3')) return true
  const haystack = `${families.join(' ')} ${lower}`
  return REASONING_MARKERS.some(re => re.test(haystack))
}

/** Build the subset of AiModelProfile discoverable from Ollama model metadata. */
export function buildOllamaModelProfile(entry: OllamaModelEntry): AiModelProfile {
  const families = entry.details?.families?.length
    ? entry.details.families
    : (entry.details?.family ? [entry.details.family] : [])
  const capabilities = entry.capabilities ?? []
  const profile: AiModelProfile = {}
  const maxInputTokens = readOllamaContextLength(entry)
  if (maxInputTokens) profile.maxInputTokens = maxInputTokens
  if (inferImageInputs(entry.name, families, capabilities)) profile.imageInputs = true
  if (inferToolCalling(entry.name, families, capabilities)) profile.toolCalling = true
  if (inferReasoningOutput(entry.name, families)) profile.reasoningOutput = true
  return profile
}

/** Human-readable context window, e.g. 32768 → "32K", 1048576 → "1M". */
export function formatContextTokens(tokens: number | undefined): string {
  if (!tokens || tokens <= 0) return ''
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

export async function fetchOllamaModelDiscovery(
  configuredApiBase: string,
  fetchImpl: OllamaFetch = fetch,
): Promise<OllamaModelDiscovery> {
  const apiBase = configuredApiBase.replace(/\/v1\/?$/, '').replace(/\/$/, '')
  const tagsResponse = await fetchImpl(`${apiBase}/api/tags`, {
    signal: AbortSignal.timeout(3000),
  })
  if (!tagsResponse.ok) throw new Error('Ollama /api/tags request failed')

  const tagsData = await tagsResponse.json() as { models?: OllamaModelEntry[] }
  const models = tagsData.models ?? []
  const enrichedModels = await Promise.all(models.map(async model => {
    try {
      const showResponse = await fetchImpl(`${apiBase}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.name }),
        signal: AbortSignal.timeout(3000),
      })
      if (!showResponse.ok) return model
      const showData = await showResponse.json() as Partial<OllamaModelEntry>
      return {
        ...model,
        ...showData,
        name: model.name,
        details: showData.details ?? model.details,
      }
    } catch {
      return model
    }
  }))

  const modelProfiles: Record<string, AiModelProfile> = {}
  for (const model of enrichedModels) {
    const profile = buildOllamaModelProfile(model)
    if (Object.keys(profile).length > 0) modelProfiles[model.name] = profile
  }

  let modelPolicies: Record<string, AiModelRuntimePolicy> | undefined
  try {
    const psResponse = await fetchImpl(`${apiBase}/api/ps`, {
      signal: AbortSignal.timeout(3000),
    })
    if (psResponse.ok) {
      const psData = await psResponse.json() as { models?: OllamaRunningModelEntry[] }
      const snapshot: Record<string, AiModelRuntimePolicy> = {}
      for (const runningModel of psData.models ?? []) {
        const modelId = runningModel.name ?? runningModel.model
        const contextLength = runningModel.context_length
        if (modelId && typeof contextLength === 'number' && contextLength > 0) {
          snapshot[modelId] = { maxRequestTokens: Math.floor(contextLength) }
        }
      }
      modelPolicies = snapshot
    }
  } catch {
    // Running-model metadata is optional; /api/show profiles remain usable.
  }

  return { models, modelProfiles, modelPolicies }
}

export function useModelPicker() {
  const aiStore = useAiStore()
  const modelSearch = ref('')
  const modelSearchEl = ref<HTMLInputElement>()
  const ollamaFetchedModels = ref<OllamaModelEntry[]>([])
  const ollamaModelProfiles = ref<Record<string, AiModelProfile>>({})
  const isLoadingOllamaModels = ref(false)
  let ollamaFetchGeneration = 0

  const isOllamaProvider = computed(() => {
    const config = aiStore.effectiveProviderConfig
    return config?.presetId === 'ollama' || (config?.baseUrl?.includes(':11434') ?? false)
  })

  const allModelItems = computed<ModelItem[]>(() => {
    if (isOllamaProvider.value) {
      const fetchedIds = new Set(ollamaFetchedModels.value.map(m => m.name))
      const result: ModelItem[] = []
      for (const m of ollamaFetchedModels.value) {
        if (m.name.toLowerCase().includes('embed')) continue
        result.push({ id: m.name, status: m.remote_model ? 'cloud' : 'local' })
      }
      for (const m of aiStore.availableModels) {
        if (m.toLowerCase().includes('embed')) continue
        if (!fetchedIds.has(m)) result.push({ id: m, status: 'remote' })
      }
      return result
    }
    return aiStore.availableModels
      .filter(m => !m.toLowerCase().includes('embed'))
      .map(m => ({ id: m }))
  })

  const filteredModelItems = computed<ModelItem[]>(() => {
    const search = modelSearch.value.toLowerCase()
    if (!search) return allModelItems.value
    return allModelItems.value.filter(m => m.id.toLowerCase().includes(search))
  })

  const showModelPicker = computed(() => {
    return !!aiStore.effectiveProviderConfig
  })

  const currentModelCandidates = computed(() => {
    if (isOllamaProvider.value) return allModelItems.value.map(m => m.id)
    return aiStore.availableModels
  })

  const currentModelId = computed(() => {
    const candidate = aiStore.activeThread?.modelId || aiStore.effectiveProviderConfig?.defaultModelId || ''
    const models = currentModelCandidates.value
    if (isOllamaProvider.value && candidate && !models.includes(candidate) && !ollamaFetchedModels.value.length) {
      return candidate
    }
    if (models.length && (!candidate || !models.includes(candidate))) {
      return models[0]!
    }
    return candidate
  })

  const thinkingLevelItems: ThinkingLevelItem[] = [
    { value: 'low', labelKey: 'agentPanel.modelPicker.thinkingLevels.low' },
    { value: 'medium', labelKey: 'agentPanel.modelPicker.thinkingLevels.medium' },
    { value: 'high', labelKey: 'agentPanel.modelPicker.thinkingLevels.high' },
    { value: 'extra_high', labelKey: 'agentPanel.modelPicker.thinkingLevels.extraHigh' },
  ]

  const currentThinkingLevel = computed<AiThinkingLevel>(() => {
    return normalizeThinkingLevel(
      aiStore.activeThread?.thinkingLevel
      ?? aiStore.effectiveProviderConfig?.lastSelectedThinkingLevel
      ?? DEFAULT_THINKING_LEVEL,
    )
  })

  async function fetchOllamaModels() {
    const config = aiStore.effectiveProviderConfig
    if (!config) return
    const generation = ++ollamaFetchGeneration
    const configuredApiBase = config.baseUrl ?? 'http://localhost:11434/v1'
    const getCurrentConfig = () => {
      const currentConfig = aiStore.effectiveProviderConfig
      const isCurrent = generation === ollamaFetchGeneration
        && currentConfig?.id === config.id
        && (currentConfig.baseUrl ?? 'http://localhost:11434/v1') === configuredApiBase
      return isCurrent ? currentConfig : undefined
    }
    isLoadingOllamaModels.value = true
    try {
      const discovery = await fetchOllamaModelDiscovery(configuredApiBase)
      const currentConfig = getCurrentConfig()
      if (!currentConfig) return
      ollamaFetchedModels.value = discovery.models
      const merged = persistOllamaModelMetadata(currentConfig, discovery)
      ollamaModelProfiles.value = merged.modelProfiles
    } catch {
      if (!getCurrentConfig()) return
      ollamaFetchedModels.value = []
      ollamaModelProfiles.value = {}
    } finally {
      if (generation === ollamaFetchGeneration) {
        isLoadingOllamaModels.value = false
      }
    }
  }

  /**
   * Persist /api/show profiles and /api/ps policies for main-process budget resolution.
   * Fields unrelated to the discovered metadata remain unchanged.
   */
  function persistOllamaModelMetadata(
    config: {
      id: string
      modelProfiles?: Record<string, AiModelProfile>
      modelPolicies?: Record<string, AiModelRuntimePolicy>
    },
    discovery: OllamaModelDiscovery,
  ): Required<OllamaPersistedMetadata> {
    const merged = mergeOllamaModelMetadata(config, discovery)
    const changed = JSON.stringify(merged.modelProfiles) !== JSON.stringify(config.modelProfiles ?? {})
      || JSON.stringify(merged.modelPolicies) !== JSON.stringify(config.modelPolicies ?? {})
    if (changed) {
      aiStore.updateProviderConfig(config.id, {
        modelProfiles: merged.modelProfiles,
        modelPolicies: merged.modelPolicies,
      })
    }
    return merged
  }

  /** Best-known profile for a model: freshly fetched metadata, else persisted config. */
  function getModelProfile(modelId: string): AiModelProfile | undefined {
    return ollamaModelProfiles.value[modelId]
      ?? aiStore.effectiveProviderConfig?.modelProfiles?.[modelId]
  }

  /** Short context label for the picker, e.g. "32K"; empty string when unknown. */
  function formatModelContext(modelId: string): string {
    return formatContextTokens(getModelProfile(modelId)?.maxInputTokens)
  }

  async function onMenuOpen() {
    modelSearch.value = ''
    if (isOllamaProvider.value) {
      await fetchOllamaModels()
    }
    if (allModelItems.value.length > 10) {
      nextTick(() => modelSearchEl.value?.focus())
    }
  }

  async function selectModel(modelId: string): Promise<boolean> {
    modelSearch.value = ''
    return aiStore.setCurrentModelId(modelId)
  }

  function selectThinkingLevel(level: AiThinkingLevel): Promise<boolean> {
    return aiStore.setCurrentThinkingLevel(level)
  }

  watch(
    () => `${aiStore.effectiveProviderConfig?.id ?? ''}\u0000${aiStore.effectiveProviderConfig?.baseUrl ?? ''}`,
    () => {
      ollamaFetchGeneration++
      ollamaFetchedModels.value = []
      ollamaModelProfiles.value = {}
      isLoadingOllamaModels.value = false
    },
  )

  return {
    modelSearch, modelSearchEl, isLoadingOllamaModels,
    isOllamaProvider, allModelItems, filteredModelItems,
    showModelPicker, currentModelId,
    thinkingLevelItems, currentThinkingLevel,
    onMenuOpen, selectModel, selectThinkingLevel,
    getModelProfile, formatModelContext,
  }
}
