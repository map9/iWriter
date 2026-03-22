import { computed } from 'vue'
import { useAiStore } from '@/stores/ai'
import type { AiAgentProfile } from '@/types/ai'

export type ModeOption = string | { value: string; label: string }

export function useModePicker() {
  const aiStore = useAiStore()

  const profileOptions: ModeOption[] = [
    { value: 'write' as AiAgentProfile, label: 'Write — 完全访问' },
    { value: 'ask' as AiAgentProfile, label: 'Ask — 只读' },
    { value: 'minimal' as AiAgentProfile, label: 'Minimal — 无工具' },
  ]

  const currentProfile = computed<AiAgentProfile>({
    get() { return aiStore.activeThread?.profile ?? aiStore.settings.defaultProfile },
    set(value) {
      if (aiStore.activeThread) {
        aiStore.updateThread({ ...aiStore.activeThread, profile: value })
      } else {
        aiStore.settings.defaultProfile = value
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
      const map: Record<string, string> = { write: 'Write', ask: 'Ask', minimal: 'Minimal' }
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
