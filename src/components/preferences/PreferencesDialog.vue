<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      class="flex h-140 w-200 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      @click.stop
    >
      <aside class="drag-region flex w-52 shrink-0 flex-col border-r border-base-300 bg-base-200 px-3 py-4">
        <div class="pb-4 text-xs font-semibold uppercase text-base-content/60">
          Preferences
        </div>
        <nav class="no-drag">
          <ul class="menu gap-1 rounded-box p-0">
            <li v-for="tab in tabs" :key="tab.id">
              <button
                class="btn h-10 justify-start gap-3 rounded-field border-none text-sm font-medium whitespace-nowrap"
                :class="activeTab === tab.id ? 'btn-primary' : 'btn-ghost'"
                @click="activeTab = tab.id"
              >
                <component :is="tab.icon" class="icon-sm" />
                <span>{{ tab.label }}</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div v-show="activeTab === 'themes'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">Themes</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              aria-label="Close"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Theme</h3>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="theme in availableThemes"
                :key="theme.id"
                class="card gap-3 rounded-box border bg-base-100 p-3 text-left transition-colors"
                :class="appStore.currentThemeId === theme.id
                  ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
                  : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                @click="appStore.setTheme(theme.id)"
              >
                <ThemePreviewSample :theme-id="themePreviewThemeId(theme.id)" />
                <div class="flex items-center justify-between gap-2">
                  <span class="min-w-0 whitespace-nowrap text-sm font-medium text-base-content">{{ theme.name }}</span>
                  <span v-if="appStore.currentThemeId === theme.id" class="badge badge-primary badge-sm shrink-0">
                    Active
                  </span>
                </div>
              </button>
            </div>
          </section>
          </div>
        </div>

        <div v-show="activeTab === 'editor'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">Editor</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              aria-label="Close"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Saving</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">Auto Save</div>
                <div class="text-xs text-base-content/65">Automatically save documents after changes</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.autoSaveEnabled"
                  @change="appStore.autoSaveEnabled = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Line Ending</h3>
            <div class="flex flex-col gap-2">
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="LF"
                  :checked="appStore.globalEditSetting.lineEnding === 'LF'"
                  @change="appStore.globalEditSetting.lineEnding = 'LF'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">Unix LF</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">Recommended for most platforms</span>
              </label>
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="CRLF"
                  :checked="appStore.globalEditSetting.lineEnding === 'CRLF'"
                  @change="appStore.globalEditSetting.lineEnding = 'CRLF'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">Windows CRLF</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">Required for some Windows applications</span>
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Display</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">First Line Indent</div>
                <div class="text-xs text-base-content/65">Indent the first line of each paragraph</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.firstLineIndent"
                  @change="appStore.globalEditSetting.firstLineIndent = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">Show Invisible Characters</div>
                <div class="text-xs text-base-content/65">Display spaces, line breaks and other invisible characters</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.invisibleCharacters"
                  @change="appStore.globalEditSetting.invisibleCharacters = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Text Replacement</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">Smart Punctuation</div>
                <div class="text-xs text-base-content/65">Automatically convert straight quotes to curly quotes</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.smartPunctuation"
                  @change="appStore.globalEditSetting.smartPunctuation = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>
          </div>
        </div>

        <div v-show="activeTab === 'spelling'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">Spelling &amp; Grammar</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              aria-label="Close"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Checking</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">Check Spelling &amp; Grammar while Typing</div>
                <div class="text-xs text-base-content/65">Underline errors as you type</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.proofread"
                  @change="appStore.globalEditSetting.proofread = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">Show Spelling &amp; Grammar Errors</div>
                <div class="text-xs text-base-content/65">Highlight detected errors in the document</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.showProofreadErrors"
                  @change="appStore.globalEditSetting.showProofreadErrors = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">Engine</h3>
            <div class="alert border-info/25 bg-info/10 text-info-content/80">
              <IconInfoCircle class="icon-xs shrink-0" />
              <span>Engine changes take effect when you reopen a document.</span>
            </div>
            <div class="flex flex-col gap-2">
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="languagetool"
                  :checked="appStore.globalEditSetting.proofreadEngineType === 'languagetool'"
                  @change="appStore.globalEditSetting.proofreadEngineType = 'languagetool'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">LanguageTool</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">Online grammar and style checker (default)</span>
              </label>
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="typo"
                  :checked="appStore.globalEditSetting.proofreadEngineType === 'typo'"
                  @change="appStore.globalEditSetting.proofreadEngineType = 'typo'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">Typo.js</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">Offline spell checker - English only</span>
              </label>
            </div>
          </section>

          <section
            v-if="appStore.globalEditSetting.proofreadEngineType !== 'typo'"
            class="flex flex-col gap-3"
          >
            <h3 class="text-xs font-semibold uppercase text-base-content/60">LanguageTool Options</h3>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">Language</label>
              <input
                type="text"
                class="iw-input"
                placeholder="e.g. en-US, zh-CN, de-DE"
                :value="appStore.globalEditSetting.proofreadLanguage"
                @input="appStore.globalEditSetting.proofreadLanguage = ($event.target as HTMLInputElement).value"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">API URL</label>
              <input
                type="text"
                class="iw-input"
                placeholder="https://api.languagetool.org/v2/check"
                :value="appStore.globalEditSetting.proofreadApiUrl"
                @input="appStore.globalEditSetting.proofreadApiUrl = ($event.target as HTMLInputElement).value"
              />
              <span class="text-xs text-base-content/65">Leave as default to use the free public API</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">API Key <span class="font-normal text-base-content/65">(optional)</span></label>
              <input
                type="password"
                class="iw-input"
                placeholder="Premium API key"
                :value="appStore.globalEditSetting.proofreadApiKey"
                @input="appStore.globalEditSetting.proofreadApiKey = ($event.target as HTMLInputElement).value"
              />
              <span class="text-xs text-base-content/65">Only required for LanguageTool Premium</span>
            </div>
          </section>
          </div>
        </div>

        <div v-show="activeTab === 'ai'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 border-b border-base-300 bg-base-200 px-7">
            <div class="flex h-full min-w-0 items-center pr-36">
              <div class="flex min-w-0 items-end gap-3">
                <h2 class="shrink-0 text-xl font-semibold text-base-content">AI</h2>
                <div class="truncate pb-0.5 text-sm text-base-content/65">{{ aiViewTitle }}</div>
              </div>
            </div>
            <button
              v-if="aiView === 'configure'"
              class="iw-btn btn-ghost absolute right-14 top-1/2 -translate-y-1/2 px-2"
              @click="providerSettingsRef?.cancelForm()"
            >
              <IconChevronLeft class="icon-xs" />
              <span>Back</span>
            </button>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              aria-label="Close"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProviderSettings ref="providerSettingsRef" @view-change="onAiViewChange" />
          </div>
        </div>

        <div v-show="activeTab === 'updates'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">Updates</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              aria-label="Close"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <div v-if="!updaterConfig" class="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm text-base-content/70">
            Loading update settings…
          </div>

          <template v-else>
            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">Automatic Updates</h3>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">Enable Automatic Updates</div>
                  <div class="text-xs text-base-content/65">Keep iWriter up to date automatically</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.enabled"
                    @change="patchUpdaterConfig({ enabled: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">Check for Updates on Startup</div>
                  <div class="text-xs text-base-content/65">Check for new versions when iWriter launches</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.checkOnStartup"
                    @change="patchUpdaterConfig({ checkOnStartup: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">Auto Download Updates</div>
                  <div class="text-xs text-base-content/65">Download updates in the background automatically</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.autoDownload"
                    @change="patchUpdaterConfig({ autoDownload: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">Auto Install Updates</div>
                  <div class="text-xs text-base-content/65">Install updates automatically after downloading</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.autoInstall"
                    @change="patchUpdaterConfig({ autoInstall: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">Update Channel</h3>
              <div class="flex flex-col gap-2">
                <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                  <input
                    type="radio"
                    class="radio radio-primary radio-xs"
                    value="stable"
                    :checked="updaterConfig.channel === 'stable'"
                    @change="patchUpdaterConfig({ channel: 'stable' })"
                  />
                  <span class="min-w-0 text-sm font-medium text-base-content">Stable</span>
                  <span class="min-w-0 text-xs leading-5 text-base-content/65">Recommended - tested, production-ready releases</span>
                </label>
                <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                  <input
                    type="radio"
                    class="radio radio-primary radio-xs"
                    value="beta"
                    :checked="updaterConfig.channel === 'beta'"
                    @change="patchUpdaterConfig({ channel: 'beta' })"
                  />
                  <span class="min-w-0 text-sm font-medium text-base-content">Beta</span>
                  <span class="min-w-0 text-xs leading-5 text-base-content/65">Early access to new features, may contain bugs</span>
                </label>
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">Check Interval</h3>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-base-content">Check every (hours)</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  class="input input-sm w-28"
                  :value="updaterConfig.checkInterval"
                  @change="patchUpdaterConfig({ checkInterval: Number(($event.target as HTMLInputElement).value) })"
                />
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">Actions</h3>
              <div class="flex items-center gap-3">
                <button class="iw-btn btn-outline btn-primary" @click="checkForUpdates">
                  Check for Updates Now
                </button>
              </div>
            </section>
          </template>
          </div>
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
  IconChevronLeft,
  IconX,
} from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import ThemePreviewSample from '@/components/preferences/ThemePreviewSample.vue'
import { availableThemes, getThemePreviewThemeId } from '@/utils/themes'
import updaterService from '@/updater/UpdaterService'
import type { UpdaterConfig } from '@/updater/types'
import { notify } from '@/utils/notifications'
import ProviderSettings from '@/components/ai/ProviderSettings.vue'

type TabId = 'editor' | 'spelling' | 'themes' | 'ai' | 'updates'
type AiView = 'main' | 'configure'

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
  { id: 'editor' as TabId, label: 'Editor', icon: IconEdit },
  { id: 'spelling' as TabId, label: 'Spelling & Grammar', icon: IconTextSpellcheck },
  { id: 'themes' as TabId, label: 'Themes', icon: IconPalette },
  { id: 'ai' as TabId, label: 'AI', icon: IconRobot },
  { id: 'updates' as TabId, label: 'Updates', icon: IconDownload },
]

const activeTab = ref<TabId>(props.initialTab)
const providerSettingsRef = ref<InstanceType<typeof ProviderSettings> | null>(null)
const aiView = ref<AiView>('main')
const aiViewTitle = ref('')

watch(() => props.initialTab, (tab) => {
  activeTab.value = tab
})

watch(() => props.visible, (visible) => {
  if (visible) {
    activeTab.value = props.initialTab
    loadUpdaterConfig()
  }
})

const updaterConfig = computed(() => updaterService.config.value)

function themePreviewThemeId(themeId: string) {
  return getThemePreviewThemeId(themeId, appStore.systemPrefersDark)
}

function patchUpdaterConfig(patch: Partial<UpdaterConfig>) {
  updaterService.updateConfig(patch).catch((err) => {
    console.error('Failed to update config:', err)
    notify.error('Failed to save update settings')
  })
}

async function loadUpdaterConfig() {
  if (!updaterService.config.value) {
    try {
      await updaterService['loadConfig']?.()
    } catch {
      // ignore
    }
  }
}

async function checkForUpdates() {
  try {
    await updaterService.checkForUpdates()
  } catch (err) {
    notify.error(err instanceof Error ? err.message : String(err), 'Update check failed')
  }
}

function onAiViewChange(info: { view: string; title: string }) {
  aiView.value = info.view as AiView
  aiViewTitle.value = info.title
}

onMounted(() => {
  loadUpdaterConfig()
})
</script>
