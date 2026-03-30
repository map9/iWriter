import { computed } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiAgentProfile } from '@/ai/types'
import { normalizeProfileForDomain, resolveAgentDomain } from '@/ai/types'

export type ModeOption = string | { value: string; label: string }

export function useModePicker() {
  const aiStore = useAiStore()

  const profileOptions: ModeOption[] = [
    { value: 'edit' as AiAgentProfile, label: 'Edit — 先读后改' },
    { value: 'minimal' as AiAgentProfile, label: 'Minimal — 无工具' },
    { value: 'creative' as AiAgentProfile, label: 'Creative — 小说创作' },
  ]

  const currentProfile = computed<AiAgentProfile>({
    get() { return aiStore.activeThread?.profile ?? aiStore.settings.defaultProfile },
    set(value) {
      const domain = resolveAgentDomain(value)
      const profile = normalizeProfileForDomain(value, domain)
      if (aiStore.activeThread) {
        aiStore.updateThread({ ...aiStore.activeThread, domain, profile })
      } else {
        aiStore.settings.defaultProfile = profile
        aiStore.saveSettings()
      }
    },
  })

  const availableModes = computed<ModeOption[]>(() => {
    if (aiStore.availableThinkModes.length) {
      return aiStore.availableThinkModes
    }
    return profileOptions
  })

  const hasModes = computed(() => availableModes.value.length > 0)

  const currentMode = computed(() => {
    if (aiStore.availableThinkModes.length) {
      return aiStore.activeThread?.thinkMode ||
        aiStore.activeProviderConfig?.lastSelectedMode ||
        aiStore.availableThinkModes[0] || ''
    }
    return aiStore.activeThread?.profile ?? aiStore.settings.defaultProfile
  })

  const modeLabel = computed(() => {
    const mode = currentMode.value
    if (!aiStore.availableThinkModes.length) {
      const map: Record<string, string> = {
        edit: 'Edit',
        minimal: 'Minimal',
        creative: 'Creative',
      }
      return map[mode] || mode
    }
    return mode || 'Mode'
  })

  function selectMode(mode: string) {
    if (!aiStore.availableThinkModes.length) {
      currentProfile.value = mode as AiAgentProfile
      aiStore.updateProviderConfig(aiStore.activeProviderConfig!.id, { lastSelectedMode: mode })
    } else {
      aiStore.setCurrentMode(mode)
    }
  }

  return { profileOptions, availableModes, hasModes, currentMode, modeLabel, selectMode }
}
