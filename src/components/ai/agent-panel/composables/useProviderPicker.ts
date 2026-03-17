import { ref, computed, nextTick } from 'vue'
import { useAiStore } from '@/stores/ai'
import type { AiProviderConfig } from '@/types/ai'
import { PROVIDER_PRESETS } from '@/ai/providers/provider-presets'

export function useProviderPicker() {
  const aiStore = useAiStore()
  const providerSearch = ref('')
  const providerSearchEl = ref<HTMLInputElement>()

  function isLlmProviderUsable(cfg: AiProviderConfig): boolean {
    if ((cfg.kind ?? 'llm') !== 'llm') return true
    const models = cfg.models ?? []
    if (models.length) return true
    const preset = PROVIDER_PRESETS.find(p => p.id === cfg.presetId)
    return (preset?.models ?? []).length > 0
  }

  const filteredLlmProviders = computed(() => {
    const search = providerSearch.value.toLowerCase()
    return aiStore.settings.providerConfigs
      .filter(c => (c.kind ?? 'llm') === 'llm')
      .filter(c => !search || c.label.toLowerCase().includes(search))
  })

  const filteredAgentProviders = computed(() => {
    const search = providerSearch.value.toLowerCase()
    return aiStore.settings.providerConfigs
      .filter(c => c.kind === 'agent')
      .filter(c => !search || c.label.toLowerCase().includes(search))
  })

  function onMenuOpen() {
    providerSearch.value = ''
    nextTick(() => providerSearchEl.value?.focus())
  }

  function selectProvider(id: string) {
    providerSearch.value = ''
    aiStore.setActiveProvider(id)
    const cfg = aiStore.settings.providerConfigs.find(c => c.id === id)
    if (cfg?.kind === 'agent') {
      aiStore.initAgentProvider(cfg)
    }
  }

  return {
    providerSearch, providerSearchEl,
    isLlmProviderUsable, filteredLlmProviders, filteredAgentProviders,
    onMenuOpen, selectProvider,
  }
}
