import { ref, computed, nextTick } from 'vue'
import { useAiStore } from '@/stores/ai'
import type { AiProviderConfig } from '@/types/ai'
import { PROVIDER_PRESETS } from '@/ai/providers/provider-presets'

export function useProviderPicker() {
  const aiStore = useAiStore()
  const providerSearch = ref('')
  const providerSearchEl = ref<HTMLInputElement>()

  function isLlmProviderUsable(cfg: AiProviderConfig): boolean {
    const models = cfg.models ?? []
    if (models.length) return true
    const preset = PROVIDER_PRESETS.find(p => p.id === cfg.presetId)
    return (preset?.models ?? []).length > 0
  }

  const filteredProviders = computed(() => {
    const search = providerSearch.value.toLowerCase()
    return aiStore.settings.providerConfigs
      .filter(c => !search || c.label.toLowerCase().includes(search))
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
    onMenuOpen, selectProvider,
  }
}
