<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.environmentTitle') }}</h3>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-1">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.sourceControl.gitPathTitle') }}</label>
          <button
            class="iw-toolbar-btn btn-xs text-base-content/50"
            type="button"
            :aria-label="t('preferences.sourceControl.gitHelp')"
            :title="t('preferences.sourceControl.gitHelp')"
            @click="openGitWebsite"
          >
            <IconHelpCircle class="icon-xs" />
          </button>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="gitPathDraft"
            class="iw-input min-w-0 flex-1"
            :placeholder="gitPathPlaceholder"
            :disabled="gitDetecting"
            @keydown.enter.prevent="detectGitPath"
          />
          <button
            class="iw-toolbar-btn btn-xs shrink-0"
            type="button"
            :aria-label="t('common.browse')"
            :title="t('common.browse')"
            :disabled="gitDetecting"
            @click="browseGit"
          >
            <IconFolderOpen class="icon-xs" />
          </button>
          <button
            class="iw-toolbar-btn btn-xs shrink-0"
            type="button"
            :aria-label="gitDetecting ? t('common.detecting') : t('common.detect')"
            :title="gitDetecting ? t('common.detecting') : t('common.detect')"
            :disabled="gitDetecting"
            @click="detectGitPath"
          >
            <span v-if="gitDetecting" class="loading loading-spinner loading-xs"></span>
            <IconRefresh v-else class="icon-xs" />
          </button>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.identityTitle') }}</h3>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <div>
            <div class="text-sm font-medium">{{ t('preferences.sourceControl.globalIdentityTitle') }}</div>
            <div class="text-xs text-base-content/50">{{ t('preferences.sourceControl.globalIdentityDesc') }}</div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm">{{ t('sourceControl.identity.name') }}</span>
              <input
                v-model="globalName"
                class="iw-input"
                @change="saveGlobalIdentity"
                @keydown.enter.prevent="saveGlobalIdentity"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm">{{ t('sourceControl.identity.email') }}</span>
              <input
                v-model="globalEmail"
                class="iw-input"
                type="email"
                @change="saveGlobalIdentity"
                @keydown.enter.prevent="saveGlobalIdentity"
              />
            </label>
          </div>
        </div>

        <div class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <div>
            <div class="text-sm font-medium">{{ t('preferences.sourceControl.localIdentityTitle') }}</div>
            <div class="text-xs text-base-content/50">
              {{ canConfigureLocalIdentity
                ? t('preferences.sourceControl.localIdentityDesc')
                : t('preferences.sourceControl.localIdentityUnavailable') }}
            </div>
          </div>
          <label class="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span class="block text-sm font-medium">{{ t('preferences.sourceControl.localIdentityUseGlobal') }}</span>
              <span class="block text-xs text-base-content/50">{{ t('preferences.sourceControl.localIdentityUseGlobalDesc') }}</span>
            </span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-xs"
              :checked="localIdentityUsesGlobal"
              :disabled="!canConfigureLocalIdentity"
              @change="setLocalIdentityUsesGlobal(($event.target as HTMLInputElement).checked)"
            />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm">{{ t('sourceControl.identity.name') }}</span>
              <input
                v-model="localName"
                class="iw-input"
                :disabled="!canConfigureLocalIdentity || localIdentityUsesGlobal"
                @change="saveLocalIdentity"
                @keydown.enter.prevent="saveLocalIdentity"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm">{{ t('sourceControl.identity.email') }}</span>
              <input
                v-model="localEmail"
                class="iw-input"
                type="email"
                :disabled="!canConfigureLocalIdentity || localIdentityUsesGlobal"
                @change="saveLocalIdentity"
                @keydown.enter.prevent="saveLocalIdentity"
              />
            </label>
          </div>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.commitTitle') }}</h3>
      <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ t('preferences.sourceControl.commitWhenEmptyTitle') }}</div>
          <div class="text-xs text-base-content/50">{{ t('preferences.sourceControl.commitWhenEmptyDesc') }}</div>
        </div>
        <select
          class="iw-select w-56 shrink-0"
          :value="gitStore.settings.commitWhenEmpty"
          @change="patchSettings({ commitWhenEmpty: ($event.target as HTMLSelectElement).value as GitCommitWhenEmpty })"
        >
          <option value="all">{{ t('preferences.sourceControl.commitWhenEmptyAll') }}</option>
          <option value="off">{{ t('preferences.sourceControl.commitWhenEmptyOff') }}</option>
          <option value="prompt">{{ t('preferences.sourceControl.commitWhenEmptyPrompt') }}</option>
        </select>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.remoteTitle') }}</h3>
      <div class="flex flex-col gap-3">
        <label class="flex cursor-pointer items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span>
            <span class="block text-sm font-medium">{{ t('preferences.sourceControl.autoStashTitle') }}</span>
            <span class="block text-xs text-base-content/50">{{ t('preferences.sourceControl.autoStashDesc') }}</span>
          </span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-xs"
            :checked="gitStore.settings.pullAutoStash"
            @change="patchSettings({ pullAutoStash: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span>
            <span class="block text-sm font-medium">{{ t('preferences.sourceControl.fetchPruneTitle') }}</span>
            <span class="block text-xs text-base-content/50">{{ t('preferences.sourceControl.fetchPruneDesc') }}</span>
          </span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-xs"
            :checked="gitStore.settings.fetchPrune"
            @change="patchSettings({ fetchPrune: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </div>
      <p class="text-xs text-base-content/50">{{ t('preferences.sourceControl.mergeStrategyNote') }}</p>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.diffTitle') }}</h3>
      <div class="flex flex-col gap-3">
        <label class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span class="text-sm font-medium">{{ t('preferences.sourceControl.diffLayoutTitle') }}</span>
          <select
            class="iw-select w-56"
            :value="gitStore.settings.diffLayout"
            @change="patchSettings({ diffLayout: ($event.target as HTMLSelectElement).value as GitDiffLayout })"
          >
            <option value="split">{{ t('diffView.split') }}</option>
            <option value="inline">{{ t('diffView.inline') }}</option>
          </select>
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span class="text-sm font-medium">{{ t('preferences.sourceControl.diffLineNumbersTitle') }}</span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-xs"
            :checked="gitStore.settings.diffShowLineNumbers"
            @change="patchSettings({ diffShowLineNumbers: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.viewsTitle') }}</h3>
      <div class="flex flex-col gap-3">
        <div class="text-xs font-medium text-base-content/60">
          {{ t('preferences.sourceControl.changesViewTitle') }}
        </div>
        <label class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span class="text-sm">{{ t('preferences.sourceControl.showRepositoriesTitle') }}</span>
          <input type="checkbox" class="toggle toggle-primary toggle-xs" :checked="gitStore.settings.showRepositories" @change="patchSettings({ showRepositories: ($event.target as HTMLInputElement).checked })" />
        </label>
        <label class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span class="text-sm">{{ t('preferences.sourceControl.changesLayoutTitle') }}</span>
          <select class="iw-select w-56" :value="gitStore.settings.changesLayout" @change="patchSettings({ changesLayout: ($event.target as HTMLSelectElement).value as GitListLayout })">
            <option value="list">{{ t('sourceControl.graph.listView') }}</option>
            <option value="tree">{{ t('sourceControl.graph.treeView') }}</option>
          </select>
        </label>

        <div class="mt-1 text-xs font-medium text-base-content/60">
          {{ t('preferences.sourceControl.graphViewTitle') }}
        </div>
        <label class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span class="text-sm">{{ t('preferences.sourceControl.showGraphTitle') }}</span>
          <input type="checkbox" class="toggle toggle-primary toggle-xs" :checked="gitStore.settings.showGraph" @change="patchSettings({ showGraph: ($event.target as HTMLInputElement).checked })" />
        </label>
        <label class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <span class="text-sm">{{ t('preferences.sourceControl.graphFilesLayoutTitle') }}</span>
          <select class="iw-select w-56" :value="gitStore.settings.graphFilesLayout" @change="patchSettings({ graphFilesLayout: ($event.target as HTMLSelectElement).value as GitListLayout })">
            <option value="list">{{ t('sourceControl.graph.listView') }}</option>
            <option value="tree">{{ t('sourceControl.graph.treeView') }}</option>
          </select>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconFolderOpen, IconHelpCircle, IconRefresh } from '@tabler/icons-vue'
import { useGitStore } from '@/stores/git'
import { notify } from '@/utils/notifications'
import type {
  GitCommitWhenEmpty,
  GitDiffLayout,
  GitIdentityScopes,
  GitListLayout,
  SourceControlSettings,
} from '@/types/git'

const { t } = useI18n()
const gitStore = useGitStore()

const gitPathDraft = ref('')
const gitDetecting = ref(false)
const globalName = ref('')
const globalEmail = ref('')
const localName = ref('')
const localEmail = ref('')
const savedGlobalName = ref('')
const savedGlobalEmail = ref('')
const savedLocalName = ref('')
const savedLocalEmail = ref('')
const localIdentityUsesGlobal = ref(true)

const canConfigureLocalIdentity = computed(() => !!gitStore.root && gitStore.isRepo)
const gitPathPlaceholder = computed(() => {
  const availability = gitStore.availability
  if (!availability.available) return t('preferences.sourceControl.gitUnavailable')
  const detail = [
    availability.path ?? 'git',
    availability.version ? `Git ${availability.version}` : '',
  ].filter(Boolean).join(' · ')
  return t('common.autoDetected', { detail })
})

function applyIdentity(scopes: GitIdentityScopes): void {
  const nextGlobalName = scopes.global.name ?? ''
  const nextGlobalEmail = scopes.global.email ?? ''
  const nextLocalName = scopes.local?.name ?? ''
  const nextLocalEmail = scopes.local?.email ?? ''
  const hasLocalOverride = !!(nextLocalName || nextLocalEmail)

  globalName.value = nextGlobalName
  globalEmail.value = nextGlobalEmail
  savedGlobalName.value = nextGlobalName
  savedGlobalEmail.value = nextGlobalEmail

  localIdentityUsesGlobal.value = !hasLocalOverride
  localName.value = hasLocalOverride ? (scopes.effective.name ?? '') : nextGlobalName
  localEmail.value = hasLocalOverride ? (scopes.effective.email ?? '') : nextGlobalEmail
  savedLocalName.value = hasLocalOverride ? (scopes.effective.name ?? '') : ''
  savedLocalEmail.value = hasLocalOverride ? (scopes.effective.email ?? '') : ''
}

async function loadIdentity(): Promise<void> {
  try {
    applyIdentity(await window.electronAPI.git.identityGetScopes(gitStore.root))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

async function patchSettings(patch: Partial<SourceControlSettings>): Promise<void> {
  try {
    await gitStore.updateSettings(patch)
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

async function browseGit(): Promise<void> {
  const result = await window.electronAPI.showOpenDialog({
    title: t('preferences.sourceControl.chooseGit'),
    properties: ['openFile'],
  })
  const selected = result.filePaths?.[0]
  if (!result.canceled && selected) {
    gitPathDraft.value = selected
    await detectGitPath()
  }
}

function openGitWebsite(): void {
  void window.electronAPI.openExternal('https://git-scm.com/downloads')
}

async function detectGitPath(): Promise<void> {
  if (gitDetecting.value) return
  const candidatePath = gitPathDraft.value.trim()
  const nextMode = candidatePath ? 'custom' : 'auto'
  const settingsChanged = gitStore.settings.gitPathMode !== nextMode
    || gitStore.settings.gitPath !== candidatePath

  gitDetecting.value = true
  try {
    const availability = await window.electronAPI.git.detect(true, candidatePath || null)
    if (!availability.available) {
      throw new Error(availability.error || t('preferences.sourceControl.gitUnavailable'))
    }

    await gitStore.updateSettings({
      gitPathMode: nextMode,
      gitPath: candidatePath,
    })
    gitStore.availability = availability
    gitPathDraft.value = candidatePath
    if (!settingsChanged && gitStore.root) {
      await gitStore.onFolderChanged(gitStore.root)
    }
    notify.success(t('common.detectionSucceeded', { name: 'Git' }))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  } finally {
    gitDetecting.value = false
  }
}

async function saveGlobalIdentity(): Promise<void> {
  const name = globalName.value.trim()
  const email = globalEmail.value.trim()
  if (!name || !email) return
  if (name === savedGlobalName.value && email === savedGlobalEmail.value) return

  try {
    await window.electronAPI.git.identitySet(null, name, email, true)
    globalName.value = name
    globalEmail.value = email
    savedGlobalName.value = name
    savedGlobalEmail.value = email
    if (localIdentityUsesGlobal.value) {
      localName.value = name
      localEmail.value = email
    }
  } catch (error) {
    globalName.value = savedGlobalName.value
    globalEmail.value = savedGlobalEmail.value
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

async function saveLocalIdentity(): Promise<void> {
  if (!gitStore.root || localIdentityUsesGlobal.value) return
  const name = localName.value.trim()
  const email = localEmail.value.trim()
  if (!name || !email) return
  if (name === savedLocalName.value && email === savedLocalEmail.value) return

  try {
    await window.electronAPI.git.identitySet(gitStore.root, name, email, false)
    localName.value = name
    localEmail.value = email
    savedLocalName.value = name
    savedLocalEmail.value = email
  } catch (error) {
    localName.value = savedLocalName.value
    localEmail.value = savedLocalEmail.value
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

async function setLocalIdentityUsesGlobal(useGlobal: boolean): Promise<void> {
  if (!gitStore.root) return
  const previousValue = localIdentityUsesGlobal.value
  localIdentityUsesGlobal.value = useGlobal

  try {
    if (useGlobal) {
      await window.electronAPI.git.identityClearLocal(gitStore.root)
      savedLocalName.value = ''
      savedLocalEmail.value = ''
      localName.value = globalName.value.trim()
      localEmail.value = globalEmail.value.trim()
      return
    }

    const name = (localName.value || globalName.value).trim()
    const email = (localEmail.value || globalEmail.value).trim()
    localName.value = name
    localEmail.value = email
    if (!name || !email) return

    await window.electronAPI.git.identitySet(gitStore.root, name, email, false)
    savedLocalName.value = name
    savedLocalEmail.value = email
  } catch (error) {
    localIdentityUsesGlobal.value = previousValue
    localName.value = previousValue ? globalName.value : savedLocalName.value
    localEmail.value = previousValue ? globalEmail.value : savedLocalEmail.value
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

watch(() => [gitStore.root, gitStore.isRepo], () => { void loadIdentity() })

onMounted(async () => {
  await gitStore.ensureSettings()
  gitPathDraft.value = gitStore.settings.gitPathMode === 'custom'
    ? gitStore.settings.gitPath
    : ''
  gitDetecting.value = true
  try {
    await gitStore.ensureDetected()
  } finally {
    gitDetecting.value = false
  }
  await loadIdentity()
})
</script>
