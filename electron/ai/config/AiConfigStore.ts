/**
 * AiConfigStore — persists AI provider settings in the main process using electron-store.
 *
 * Replaces the renderer-side ThreadStore.loadSettings() / saveSettings() pattern.
 * All reads/writes happen in the main process; the renderer accesses via IPC.
 */

import Store from 'electron-store'
import type { AiSettings } from '../../../src/types/ai'
import { DEFAULT_AI_SETTINGS, normalizeWebSearchProviderConfigs } from '../../../src/types/ai'

interface ConfigStoreSchema {
  settings: AiSettings
}

let _store: Store<ConfigStoreSchema> | null = null

function getStore(): Store<ConfigStoreSchema> {
  if (!_store) {
    _store = new Store<ConfigStoreSchema>({
      name: 'ai-config',
      defaults: {
        settings: DEFAULT_AI_SETTINGS,
      },
    })
  }
  return _store
}

export const AiConfigStore = {
  loadSettings(): AiSettings {
    try {
      const stored = getStore().get('settings') as AiSettings | undefined
      if (!stored) return { ...DEFAULT_AI_SETTINGS }
      // Merge with defaults to handle new fields added in updates
      const merged = { ...DEFAULT_AI_SETTINGS, ...stored }
      merged.webSearchProviderConfigs = normalizeWebSearchProviderConfigs(merged.webSearchProviderConfigs)
      merged.activeWebSearchProviderConfigId = merged.activeWebSearchProviderConfigId ?? null
      return merged
    } catch (err) {
      console.error('[AiConfigStore] Failed to load settings:', err)
      return { ...DEFAULT_AI_SETTINGS }
    }
  },

  saveSettings(settings: AiSettings): void {
    try {
      getStore().set('settings', settings)
    } catch (err) {
      console.error('[AiConfigStore] Failed to save settings:', err)
    }
  },

  updateSettings(partial: Partial<AiSettings>): void {
    const current = this.loadSettings()
    this.saveSettings({ ...current, ...partial })
  },
}

export function resolveAiApiKeyEnvVar(name: string): string | undefined {
  return process.env[name]
}
