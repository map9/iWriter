import { ref, computed, nextTick } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiProviderConfig } from '@/ai/types'
import { getProviderPresetById } from '@/ai/providers/provider-presets'

export function useProviderPicker() {
  const aiStore = useAiStore()
  const providerSearch = ref('')
  const providerSearchEl = ref<HTMLInputElement>()

  function isLlmProviderUsable(cfg: AiProviderConfig): boolean {
    const models = cfg.models ?? []
    if (models.length) return true
    const preset = getProviderPresetById(cfg.presetId)
    return (preset?.models ?? []).length > 0
  }

  function getProviderDisplayLabel(cfg: AiProviderConfig): string {
    if (!cfg.presetId) return cfg.label
    return getProviderPresetById(cfg.presetId)?.label ?? cfg.label
  }

  const filteredProviders = computed(() => {
    const search = providerSearch.value.toLowerCase()
    return aiStore.settings.providerConfigs
      .filter(c => !search || getProviderDisplayLabel(c).toLowerCase().includes(search))
  })

  function onMenuOpen() {
    providerSearch.value = ''
    nextTick(() => providerSearchEl.value?.focus())
  }

  function selectProvider(id: string) {
    providerSearch.value = ''
    aiStore.setActiveProvider(id)
  }

  return {
    providerSearch, providerSearchEl,
    isLlmProviderUsable, filteredProviders,
    getProviderDisplayLabel,
    onMenuOpen, selectProvider,
  }
}
