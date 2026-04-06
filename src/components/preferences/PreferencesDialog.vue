<template>
  <div
    v-if="visible"
    class="preferences-overlay"
    @click="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="preferences-dialog" @click.stop>
      <!-- Left sidebar: Tab list -->
      <div class="preferences-sidebar">
        <div class="preferences-title">Preferences</div>
        <nav class="preferences-nav">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="preferences-nav-item"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="w-5 h-5" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>
      </div>

      <!-- Right content area -->
      <div class="preferences-content">

        <!-- ── Themes ── -->
        <div v-show="activeTab === 'themes'" class="preferences-pane">
          <h2 class="pane-title">Themes</h2>

          <section class="pref-section">
            <h3 class="section-label">Theme</h3>
            <div class="theme-cards">
              <button
                v-for="theme in availableThemes"
                :key="theme.id"
                class="theme-card"
                :class="{ active: appStore.currentThemeId === theme.id }"
                @click="appStore.setTheme(theme.id)"
              >
                <div class="theme-preview" :class="`theme-preview-${theme.id}`">
                  <div class="theme-preview-sidebar" />
                  <div class="theme-preview-content">
                    <div class="theme-preview-bar" />
                    <div class="theme-preview-text" />
                    <div class="theme-preview-text short" />
                  </div>
                </div>
                <span class="theme-label">{{ theme.name }}</span>
                <span v-if="appStore.currentThemeId === theme.id" class="theme-check">✓</span>
              </button>
            </div>
          </section>
        </div>

        <!-- ── Editor ── -->
        <div v-show="activeTab === 'editor'" class="preferences-pane">
          <h2 class="pane-title">Editor</h2>

          <section class="pref-section">
            <h3 class="section-label">Saving</h3>
            <div class="pref-row">
              <div class="pref-row-info">
                <span class="pref-row-label">Auto Save</span>
                <span class="pref-row-desc">Automatically save documents after changes</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="appStore.autoSaveEnabled"
                  @change="appStore.autoSaveEnabled = ($event.target as HTMLInputElement).checked"
                />
                <span class="toggle-track" />
              </label>
            </div>
          </section>

          <section class="pref-section">
            <h3 class="section-label">Line Ending</h3>
            <div class="radio-group">
              <label class="radio-item">
                <input
                  type="radio"
                  value="LF"
                  :checked="appStore.globalEditSetting.lineEnding === 'LF'"
                  @change="appStore.globalEditSetting.lineEnding = 'LF'"
                />
                <span>Unix LF</span>
                <span class="radio-desc">Recommended for most platforms</span>
              </label>
              <label class="radio-item">
                <input
                  type="radio"
                  value="CRLF"
                  :checked="appStore.globalEditSetting.lineEnding === 'CRLF'"
                  @change="appStore.globalEditSetting.lineEnding = 'CRLF'"
                />
                <span>Windows CRLF</span>
                <span class="radio-desc">Required for some Windows applications</span>
              </label>
            </div>
          </section>

          <section class="pref-section">
            <h3 class="section-label">Display</h3>
            <div class="pref-row">
              <div class="pref-row-info">
                <span class="pref-row-label">First Line Indent</span>
                <span class="pref-row-desc">Indent the first line of each paragraph</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="appStore.globalEditSetting.firstLineIndent"
                  @change="appStore.globalEditSetting.firstLineIndent = ($event.target as HTMLInputElement).checked"
                />
                <span class="toggle-track" />
              </label>
            </div>
            <div class="pref-row">
              <div class="pref-row-info">
                <span class="pref-row-label">Show Invisible Characters</span>
                <span class="pref-row-desc">Display spaces, line breaks and other invisible characters</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="appStore.globalEditSetting.invisibleCharacters"
                  @change="appStore.globalEditSetting.invisibleCharacters = ($event.target as HTMLInputElement).checked"
                />
                <span class="toggle-track" />
              </label>
            </div>
          </section>

          <section class="pref-section">
            <h3 class="section-label">Text Replacement</h3>
            <div class="pref-row">
              <div class="pref-row-info">
                <span class="pref-row-label">Smart Punctuation</span>
                <span class="pref-row-desc">Automatically convert straight quotes to curly quotes</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="appStore.globalEditSetting.smartPunctuation"
                  @change="appStore.globalEditSetting.smartPunctuation = ($event.target as HTMLInputElement).checked"
                />
                <span class="toggle-track" />
              </label>
            </div>
          </section>
        </div>

        <!-- ── Spelling & Grammar ── -->
        <div v-show="activeTab === 'spelling'" class="preferences-pane">
          <h2 class="pane-title">Spelling &amp; Grammar</h2>

          <section class="pref-section">
            <h3 class="section-label">Checking</h3>
            <div class="pref-row">
              <div class="pref-row-info">
                <span class="pref-row-label">Check Spelling &amp; Grammar while Typing</span>
                <span class="pref-row-desc">Underline errors as you type</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="appStore.globalEditSetting.proofread"
                  @change="appStore.globalEditSetting.proofread = ($event.target as HTMLInputElement).checked"
                />
                <span class="toggle-track" />
              </label>
            </div>
            <div class="pref-row">
              <div class="pref-row-info">
                <span class="pref-row-label">Show Spelling &amp; Grammar Errors</span>
                <span class="pref-row-desc">Highlight detected errors in the document</span>
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="appStore.globalEditSetting.showProofreadErrors"
                  @change="appStore.globalEditSetting.showProofreadErrors = ($event.target as HTMLInputElement).checked"
                />
                <span class="toggle-track" />
              </label>
            </div>
          </section>

          <section class="pref-section">
            <h3 class="section-label">Engine</h3>
            <div class="info-banner">
              <IconInfoCircle class="w-4 h-4 flex-shrink-0" />
              <span>Engine changes take effect when you reopen a document.</span>
            </div>
            <div class="radio-group">
              <label class="radio-item">
                <input
                  type="radio"
                  value="languagetool"
                  :checked="appStore.globalEditSetting.proofreadEngineType === 'languagetool'"
                  @change="appStore.globalEditSetting.proofreadEngineType = 'languagetool'"
                />
                <span>LanguageTool</span>
                <span class="radio-desc">Online grammar and style checker (default)</span>
              </label>
              <label class="radio-item">
                <input
                  type="radio"
                  value="typo"
                  :checked="appStore.globalEditSetting.proofreadEngineType === 'typo'"
                  @change="appStore.globalEditSetting.proofreadEngineType = 'typo'"
                />
                <span>Typo.js</span>
                <span class="radio-desc">Offline spell checker — English only</span>
              </label>
            </div>
          </section>

          <section
            v-if="appStore.globalEditSetting.proofreadEngineType !== 'typo'"
            class="pref-section"
          >
            <h3 class="section-label">LanguageTool Options</h3>
            <div class="form-field">
              <label class="field-label">Language</label>
              <input
                type="text"
                class="field-input"
                placeholder="e.g. en-US, zh-CN, de-DE"
                :value="appStore.globalEditSetting.proofreadLanguage"
                @input="appStore.globalEditSetting.proofreadLanguage = ($event.target as HTMLInputElement).value"
              />
            </div>
            <div class="form-field">
              <label class="field-label">API URL</label>
              <input
                type="text"
                class="field-input"
                placeholder="https://api.languagetool.org/v2/check"
                :value="appStore.globalEditSetting.proofreadApiUrl"
                @input="appStore.globalEditSetting.proofreadApiUrl = ($event.target as HTMLInputElement).value"
              />
              <span class="field-hint">Leave as default to use the free public API</span>
            </div>
            <div class="form-field">
              <label class="field-label">API Key <span class="field-optional">(optional)</span></label>
              <input
                type="password"
                class="field-input"
                placeholder="Premium API key"
                :value="appStore.globalEditSetting.proofreadApiKey"
                @input="appStore.globalEditSetting.proofreadApiKey = ($event.target as HTMLInputElement).value"
              />
              <span class="field-hint">Only required for LanguageTool Premium</span>
            </div>
          </section>
        </div>

        <!-- ── AI ── -->
        <div v-show="activeTab === 'ai'" class="preferences-pane">
          <h2 class="pane-title">AI</h2>
          <div class="ai-provider-wrapper">
            <ProviderSettings @view-change="onAiViewChange" />
          </div>
        </div>

        <!-- ── Updates ── -->
        <div v-show="activeTab === 'updates'" class="preferences-pane">
          <h2 class="pane-title">Updates</h2>

          <div v-if="!updaterConfig" class="loading-state">
            Loading update settings…
          </div>

          <template v-else>
            <section class="pref-section">
              <h3 class="section-label">Automatic Updates</h3>
              <div class="pref-row">
                <div class="pref-row-info">
                  <span class="pref-row-label">Enable Automatic Updates</span>
                  <span class="pref-row-desc">Keep iWriter up to date automatically</span>
                </div>
                <label class="toggle">
                  <input
                    type="checkbox"
                    :checked="updaterConfig.enabled"
                    @change="patchUpdaterConfig({ enabled: ($event.target as HTMLInputElement).checked })"
                  />
                  <span class="toggle-track" />
                </label>
              </div>
              <div class="pref-row">
                <div class="pref-row-info">
                  <span class="pref-row-label">Check for Updates on Startup</span>
                  <span class="pref-row-desc">Check for new versions when iWriter launches</span>
                </div>
                <label class="toggle">
                  <input
                    type="checkbox"
                    :checked="updaterConfig.checkOnStartup"
                    @change="patchUpdaterConfig({ checkOnStartup: ($event.target as HTMLInputElement).checked })"
                  />
                  <span class="toggle-track" />
                </label>
              </div>
              <div class="pref-row">
                <div class="pref-row-info">
                  <span class="pref-row-label">Auto Download Updates</span>
                  <span class="pref-row-desc">Download updates in the background automatically</span>
                </div>
                <label class="toggle">
                  <input
                    type="checkbox"
                    :checked="updaterConfig.autoDownload"
                    @change="patchUpdaterConfig({ autoDownload: ($event.target as HTMLInputElement).checked })"
                  />
                  <span class="toggle-track" />
                </label>
              </div>
              <div class="pref-row">
                <div class="pref-row-info">
                  <span class="pref-row-label">Auto Install Updates</span>
                  <span class="pref-row-desc">Install updates automatically after downloading</span>
                </div>
                <label class="toggle">
                  <input
                    type="checkbox"
                    :checked="updaterConfig.autoInstall"
                    @change="patchUpdaterConfig({ autoInstall: ($event.target as HTMLInputElement).checked })"
                  />
                  <span class="toggle-track" />
                </label>
              </div>
            </section>

            <section class="pref-section">
              <h3 class="section-label">Update Channel</h3>
              <div class="radio-group">
                <label class="radio-item">
                  <input
                    type="radio"
                    value="stable"
                    :checked="updaterConfig.channel === 'stable'"
                    @change="patchUpdaterConfig({ channel: 'stable' })"
                  />
                  <span>Stable</span>
                  <span class="radio-desc">Recommended — tested, production-ready releases</span>
                </label>
                <label class="radio-item">
                  <input
                    type="radio"
                    value="beta"
                    :checked="updaterConfig.channel === 'beta'"
                    @change="patchUpdaterConfig({ channel: 'beta' })"
                  />
                  <span>Beta</span>
                  <span class="radio-desc">Early access to new features, may contain bugs</span>
                </label>
              </div>
            </section>

            <section class="pref-section">
              <h3 class="section-label">Check Interval</h3>
              <div class="form-field">
                <label class="field-label">Check every (hours)</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  class="field-input narrow"
                  :value="updaterConfig.checkInterval"
                  @change="patchUpdaterConfig({ checkInterval: Number(($event.target as HTMLInputElement).value) })"
                />
              </div>
            </section>

            <section class="pref-section">
              <h3 class="section-label">Actions</h3>
              <div class="action-row">
                <button class="btn-secondary" @click="checkForUpdates">
                  Check for Updates Now
                </button>
              </div>
            </section>
          </template>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  IconPalette,
  IconEdit,
  IconTextSpellcheck,
  IconRobot,
  IconDownload,
  IconInfoCircle,
} from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import { availableThemes } from '@/utils/themes'
import updaterService from '@/updater/UpdaterService'
import type { UpdaterConfig } from '@/updater/types'
import { notify } from '@/utils/notifications'
import ProviderSettings from '@/components/ai/ProviderSettings.vue'

type TabId = 'editor' | 'spelling' | 'themes' | 'ai' | 'updates'

interface Props {
  visible: boolean
  initialTab?: TabId
}

const props = withDefaults(defineProps<Props>(), {
  initialTab: 'editor',
})

const emit = defineEmits<{ close: [] }>()

const appStore = useAppStore()

const tabs = [
  { id: 'editor' as TabId,   label: 'Editor',             icon: IconEdit },
  { id: 'spelling' as TabId, label: 'Spelling & Grammar', icon: IconTextSpellcheck },
  { id: 'themes' as TabId,   label: 'Themes',             icon: IconPalette },
  { id: 'ai' as TabId,       label: 'AI',                 icon: IconRobot },
  { id: 'updates' as TabId,  label: 'Updates',            icon: IconDownload },
]

const activeTab = ref<TabId>(props.initialTab)

// Sync active tab when dialog opens with a new initialTab
watch(() => props.initialTab, (tab) => {
  activeTab.value = tab
})
watch(() => props.visible, (visible) => {
  if (visible) {
    activeTab.value = props.initialTab
    loadUpdaterConfig()
  }
})

// ── Updates ──────────────────────────────────────────────────────────────────
const updaterConfig = computed(() => updaterService.config.value)

function patchUpdaterConfig(patch: Partial<UpdaterConfig>) {
  updaterService.updateConfig(patch).catch((err) => {
    console.error('Failed to update config:', err)
    notify.error('Failed to save update settings')
  })
}

async function loadUpdaterConfig() {
  // updaterService loads config on construction; nothing extra needed,
  // but if config is null (first open before load), trigger a reload.
  if (!updaterService.config.value) {
    try {
      await updaterService['loadConfig']?.()
    } catch { /* ignore */ }
  }
}

async function checkForUpdates() {
  try {
    await updaterService.checkForUpdates()
  } catch (err) {
    notify.error(err instanceof Error ? err.message : String(err), 'Update check failed')
  }
}

// ── AI ───────────────────────────────────────────────────────────────────────
function onAiViewChange(_info: { view: string; title: string }) {
  // ProviderSettings manages its own internal view state; no action needed here.
}

onMounted(() => {
  loadUpdaterConfig()
})
</script>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────────────── */
.preferences-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

/* ── Dialog shell ─────────────────────────────────────────────────────────── */
.preferences-dialog {
  display: flex;
  width: 780px;
  max-width: 92vw;
  height: 560px;
  max-height: 88vh;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
  background: var(--color-background-content);
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.preferences-sidebar {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-background-window);
  border-right: 1px solid var(--color-border-separator);
  padding: 20px 0 12px;
  -webkit-app-region: drag;
}

.preferences-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 0 16px 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preferences-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
  -webkit-app-region: no-drag;
}

.preferences-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.12s;
  text-align: left;
  width: 100%;
}

.preferences-nav-item:hover {
  background: var(--color-interactive-hover);
}

.preferences-nav-item.active {
  background: var(--color-background-selected);
  color: white;
}

/* ── Content area ─────────────────────────────────────────────────────────── */
.preferences-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preferences-pane {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pane-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

/* ── Section ─────────────────────────────────────────────────────────────── */
.pref-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-secondary);
  margin: 0;
}

/* ── Row (toggle setting) ─────────────────────────────────────────────────── */
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--color-background-window);
  border: 1px solid var(--color-border-separator);
}

.pref-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pref-row-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.pref-row-desc {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* ── Toggle ──────────────────────────────────────────────────────────────── */
.toggle {
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.toggle input[type='checkbox'] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  display: block;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--color-border-separator);
  transition: background 0.15s;
  position: relative;
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}

.toggle input:checked + .toggle-track {
  background: var(--color-accent-primary);
}

.toggle input:checked + .toggle-track::after {
  transform: translateX(16px);
}

/* ── Radio group ─────────────────────────────────────────────────────────── */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--color-background-window);
  border: 1px solid var(--color-border-separator);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.radio-item input[type='radio'] {
  accent-color: var(--color-accent-primary);
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.radio-desc {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: auto;
}

/* ── Form fields ─────────────────────────────────────────────────────────── */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.field-optional {
  font-weight: 400;
  color: var(--color-text-secondary);
}

.field-input {
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border-separator);
  background: var(--color-background-window);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.12s;
}

.field-input:focus {
  border-color: var(--color-accent-primary);
}

.field-input.narrow {
  width: 100px;
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* ── Info banner ─────────────────────────────────────────────────────────── */
.info-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(0, 122, 255, 0.08);
  border: 1px solid rgba(0, 122, 255, 0.2);
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* ── Theme cards ─────────────────────────────────────────────────────────── */
.theme-cards {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 2px solid var(--color-border-separator);
  background: var(--color-background-window);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  position: relative;
  min-width: 110px;
}

.theme-card:hover {
  border-color: var(--color-accent-primary);
}

.theme-card.active {
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}

.theme-check {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-accent-primary);
}

.theme-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.theme-preview {
  width: 90px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

/* System theme preview */
.theme-preview-system {
  background: linear-gradient(135deg, #ececec 50%, #1e1e1e 50%);
}
.theme-preview-system .theme-preview-sidebar {
  width: 28px;
  background: linear-gradient(135deg, #d4d4d4 50%, #2a2a2a 50%);
}
.theme-preview-system .theme-preview-content {
  flex: 1;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.theme-preview-system .theme-preview-bar {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(135deg, #999 50%, #555 50%);
}
.theme-preview-system .theme-preview-text {
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(135deg, #bbb 50%, #444 50%);
}
.theme-preview-system .theme-preview-text.short { width: 60%; }

/* Light theme preview */
.theme-preview-light { background: #ffffff; }
.theme-preview-light .theme-preview-sidebar {
  width: 28px;
  background: #ececec;
}
.theme-preview-light .theme-preview-content {
  flex: 1;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.theme-preview-light .theme-preview-bar {
  height: 4px;
  border-radius: 2px;
  background: #999;
}
.theme-preview-light .theme-preview-text {
  height: 3px;
  border-radius: 2px;
  background: #ccc;
}
.theme-preview-light .theme-preview-text.short { width: 60%; }

/* Dark theme preview */
.theme-preview-dark { background: #1e1e1e; }
.theme-preview-dark .theme-preview-sidebar {
  width: 28px;
  background: #2a2a2a;
}
.theme-preview-dark .theme-preview-content {
  flex: 1;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.theme-preview-dark .theme-preview-bar {
  height: 4px;
  border-radius: 2px;
  background: #555;
}
.theme-preview-dark .theme-preview-text {
  height: 3px;
  border-radius: 2px;
  background: #444;
}
.theme-preview-dark .theme-preview-text.short { width: 60%; }

/* ── AI pane ─────────────────────────────────────────────────────────────── */
.ai-provider-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border-separator);
  border-radius: 8px;
  background: var(--color-background-window);
}

/* ── Loading state ───────────────────────────────────────────────────────── */
.loading-state {
  padding: 24px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* ── Action row ──────────────────────────────────────────────────────────── */
.action-row {
  display: flex;
  gap: 10px;
}

.btn-secondary {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border-separator);
  background: var(--color-background-window);
  color: var(--color-text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
}

.btn-secondary:hover {
  background: var(--color-interactive-hover);
}
</style>
