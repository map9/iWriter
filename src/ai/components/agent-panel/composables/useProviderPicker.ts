import { ref, computed, nextTick } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiProviderConfig } from '@/ai/types'
import { isAiProviderUsable } from '@/ai/types'
import { getProviderPresetById } from '@/ai/model/providers/provider-presets'

export function useProviderPicker() {
  const aiStore = useAiStore()
  const providerSearch = ref('')
  const providerSearchEl = ref<HTMLInputElement>()

  function isLlmProviderUsable(cfg: AiProviderConfig): boolean {
    const preset = getProviderPresetById(cfg.presetId)
    return isAiProviderUsable({
      ...cfg,
      models: cfg.models?.length ? cfg.models : preset?.models,
      defaultModelId: cfg.defaultModelId || preset?.defaultModelId || '',
    })
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
