import { ref, computed, watch, nextTick } from 'vue'
import { useAiStore } from '@/ai/store/ai'

export type ModelStatus = 'local' | 'cloud' | 'remote'

export interface ModelItem {
  id: string
  status?: ModelStatus
}

interface OllamaModelEntry {
  name: string
  remote_model?: string
}

export function useModelPicker() {
  const aiStore = useAiStore()
  const modelSearch = ref('')
  const modelSearchEl = ref<HTMLInputElement>()
  const ollamaFetchedModels = ref<OllamaModelEntry[]>([])
  const isLoadingOllamaModels = ref(false)

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
    return allModelItems.value.length > 1 || isOllamaProvider.value
  })

  const currentModelId = computed(() => {
    const candidate = aiStore.activeThread?.modelId || aiStore.effectiveProviderConfig?.defaultModelId || ''
    const models = aiStore.availableModels
    if (models.length && (!candidate || !models.includes(candidate))) {
      return models[0]!
    }
    return candidate
  })

  async function fetchOllamaModels() {
    const config = aiStore.effectiveProviderConfig
    if (!config) return
    isLoadingOllamaModels.value = true
    try {
      const apiBase = (config.baseUrl ?? 'http://localhost:11434/v1').replace(/\/v1\/?$/, '')
      const resp = await fetch(`${apiBase}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        const data = await resp.json()
        ollamaFetchedModels.value = (data.models ?? []) as OllamaModelEntry[]
      }
    } catch {
      ollamaFetchedModels.value = []
    } finally {
      isLoadingOllamaModels.value = false
    }
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

  function selectModel(modelId: string) {
    modelSearch.value = ''
    aiStore.setCurrentModelId(modelId)
  }

  watch(
    () => aiStore.effectiveProviderConfig?.id,
    () => { ollamaFetchedModels.value = [] }
  )

  return {
    modelSearch, modelSearchEl, isLoadingOllamaModels,
    isOllamaProvider, allModelItems, filteredModelItems,
    showModelPicker, currentModelId,
    onMenuOpen, selectModel,
  }
}
