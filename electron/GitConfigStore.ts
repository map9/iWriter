import Store from 'electron-store'
import {
  DEFAULT_SOURCE_CONTROL_SETTINGS,
  type SourceControlSettings,
} from '../src/types/git'

interface GitConfigSchema {
  settings: SourceControlSettings
}

function normalizeSettings(value?: Partial<SourceControlSettings>): SourceControlSettings {
  const merged = { ...DEFAULT_SOURCE_CONTROL_SETTINGS, ...(value ?? {}) }
  return {
    gitPathMode: merged.gitPathMode === 'custom' ? 'custom' : 'auto',
    gitPath: typeof merged.gitPath === 'string' ? merged.gitPath.trim() : '',
    commitWhenEmpty: ['all', 'off', 'prompt'].includes(merged.commitWhenEmpty)
      ? merged.commitWhenEmpty
      : 'all',
    pullAutoStash: merged.pullAutoStash !== false,
    fetchPrune: merged.fetchPrune !== false,
    diffLayout: merged.diffLayout === 'inline' ? 'inline' : 'split',
    diffShowLineNumbers: merged.diffShowLineNumbers !== false,
    showRepositories: merged.showRepositories !== false,
    showGraph: merged.showGraph !== false,
    changesLayout: merged.changesLayout === 'tree' ? 'tree' : 'list',
    graphFilesLayout: merged.graphFilesLayout === 'tree' ? 'tree' : 'list',
  }
}

export class GitConfigStore {
  private readonly store = new Store<GitConfigSchema>({
    name: 'git-config',
    defaults: {
      settings: DEFAULT_SOURCE_CONTROL_SETTINGS,
    },
  })

  getSettings(): SourceControlSettings {
    return normalizeSettings(this.store.get('settings'))
  }

  updateSettings(patch: Partial<SourceControlSettings>): SourceControlSettings {
    const settings = normalizeSettings({ ...this.getSettings(), ...patch })
    this.store.set('settings', settings)
    return settings
  }
}
