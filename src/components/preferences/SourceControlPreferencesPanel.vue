<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.environmentTitle') }}</h3>
      <div class="flex flex-col gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-medium">{{ t('preferences.sourceControl.gitStatusTitle') }}</div>
            <div class="break-all text-xs text-base-content/50">
              {{ availabilityText }}
            </div>
          </div>
          <button class="iw-btn btn-outline btn-sm shrink-0" @click="recheckGit">
            {{ t('preferences.sourceControl.recheck') }}
          </button>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('preferences.sourceControl.gitPathModeTitle') }}</span>
          <select
            class="iw-select w-full"
            :value="gitPathModeDraft"
            @change="setPathMode(($event.target as HTMLSelectElement).value as 'auto' | 'custom')"
          >
            <option value="auto">{{ t('preferences.sourceControl.gitPathAuto') }}</option>
            <option value="custom">{{ t('preferences.sourceControl.gitPathCustom') }}</option>
          </select>
        </label>

        <div v-if="gitPathModeDraft === 'custom'" class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('preferences.sourceControl.gitPathTitle') }}</span>
          <div class="flex gap-2">
            <input
              v-model="gitPathDraft"
              class="iw-input min-w-0 flex-1"
              :placeholder="t('preferences.sourceControl.gitPathPlaceholder')"
              @keydown.enter.prevent="applyCustomPath"
            />
            <button class="iw-btn btn-outline btn-sm shrink-0" @click="browseGit">
              {{ t('common.browse') }}
            </button>
            <button class="iw-btn btn-primary btn-sm shrink-0" :disabled="!gitPathDraft.trim()" @click="applyCustomPath">
              {{ t('common.apply') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.identityTitle') }}</h3>
      <div class="grid grid-cols-2 gap-3">
        <form class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3" @submit.prevent="saveGlobalIdentity">
          <div>
            <div class="text-sm font-medium">{{ t('preferences.sourceControl.globalIdentityTitle') }}</div>
            <div class="text-xs text-base-content/50">{{ t('preferences.sourceControl.globalIdentityDesc') }}</div>
          </div>
          <input v-model="globalName" class="iw-input" :placeholder="t('sourceControl.identity.name')" required />
          <input v-model="globalEmail" class="iw-input" type="email" :placeholder="t('sourceControl.identity.email')" required />
          <button class="iw-btn btn-primary btn-sm self-end" type="submit" :disabled="!globalName.trim() || !globalEmail.trim()">
            {{ t('sourceControl.identity.save') }}
          </button>
        </form>

        <form
          class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3"
          :class="{ 'opacity-60': !canConfigureLocalIdentity }"
          @submit.prevent="saveLocalIdentity"
        >
          <div>
            <div class="text-sm font-medium">{{ t('preferences.sourceControl.localIdentityTitle') }}</div>
            <div class="text-xs text-base-content/50">
              {{ canConfigureLocalIdentity
                ? t('preferences.sourceControl.localIdentityDesc')
                : t('preferences.sourceControl.localIdentityUnavailable') }}
            </div>
          </div>
          <input v-model="localName" class="iw-input" :placeholder="t('sourceControl.identity.name')" :disabled="!canConfigureLocalIdentity" required />
          <input v-model="localEmail" class="iw-input" type="email" :placeholder="t('sourceControl.identity.email')" :disabled="!canConfigureLocalIdentity" required />
          <div class="flex justify-end gap-2">
            <button class="iw-btn btn-ghost btn-sm" type="button" :disabled="!canConfigureLocalIdentity" @click="clearLocalIdentity">
              {{ t('preferences.sourceControl.clearLocalIdentity') }}
            </button>
            <button class="iw-btn btn-primary btn-sm" type="submit" :disabled="!canConfigureLocalIdentity || !localName.trim() || !localEmail.trim()">
              {{ t('sourceControl.identity.save') }}
            </button>
          </div>
        </form>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.commitTitle') }}</h3>
      <div class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <div>
          <div class="text-sm font-medium">{{ t('preferences.sourceControl.commitWhenEmptyTitle') }}</div>
          <div class="text-xs text-base-content/50">{{ t('preferences.sourceControl.commitWhenEmptyDesc') }}</div>
        </div>
        <select
          class="iw-select w-full"
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
      <div class="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 px-4">
        <label class="flex cursor-pointer items-center justify-between gap-4 py-3">
          <span>
            <span class="block text-sm font-medium">{{ t('preferences.sourceControl.autoStashTitle') }}</span>
            <span class="block text-xs text-base-content/50">{{ t('preferences.sourceControl.autoStashDesc') }}</span>
          </span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :checked="gitStore.settings.pullAutoStash"
            @change="patchSettings({ pullAutoStash: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-4 py-3">
          <span>
            <span class="block text-sm font-medium">{{ t('preferences.sourceControl.fetchPruneTitle') }}</span>
            <span class="block text-xs text-base-content/50">{{ t('preferences.sourceControl.fetchPruneDesc') }}</span>
          </span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :checked="gitStore.settings.fetchPrune"
            @change="patchSettings({ fetchPrune: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </div>
      <p class="text-xs text-base-content/50">{{ t('preferences.sourceControl.mergeStrategyNote') }}</p>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.diffTitle') }}</h3>
      <div class="grid grid-cols-2 gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('preferences.sourceControl.diffLayoutTitle') }}</span>
          <select
            class="iw-select"
            :value="gitStore.settings.diffLayout"
            @change="patchSettings({ diffLayout: ($event.target as HTMLSelectElement).value as GitDiffLayout })"
          >
            <option value="split">{{ t('diffView.split') }}</option>
            <option value="inline">{{ t('diffView.inline') }}</option>
          </select>
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-4 self-end pb-2">
          <span class="text-sm font-medium">{{ t('preferences.sourceControl.diffLineNumbersTitle') }}</span>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :checked="gitStore.settings.diffShowLineNumbers"
            @change="patchSettings({ diffShowLineNumbers: ($event.target as HTMLInputElement).checked })"
          />
        </label>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.sourceControl.viewsTitle') }}</h3>
      <div class="grid grid-cols-2 gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm">{{ t('preferences.sourceControl.showRepositoriesTitle') }}</span>
          <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="gitStore.settings.showRepositories" @change="patchSettings({ showRepositories: ($event.target as HTMLInputElement).checked })" />
        </label>
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm">{{ t('preferences.sourceControl.showGraphTitle') }}</span>
          <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="gitStore.settings.showGraph" @change="patchSettings({ showGraph: ($event.target as HTMLInputElement).checked })" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm">{{ t('preferences.sourceControl.changesLayoutTitle') }}</span>
          <select class="iw-select" :value="gitStore.settings.changesLayout" @change="patchSettings({ changesLayout: ($event.target as HTMLSelectElement).value as GitListLayout })">
            <option value="list">{{ t('sourceControl.graph.listView') }}</option>
            <option value="tree">{{ t('sourceControl.graph.treeView') }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm">{{ t('preferences.sourceControl.graphFilesLayoutTitle') }}</span>
          <select class="iw-select" :value="gitStore.settings.graphFilesLayout" @change="patchSettings({ graphFilesLayout: ($event.target as HTMLSelectElement).value as GitListLayout })">
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

const gitPathModeDraft = ref<'auto' | 'custom'>('auto')
const gitPathDraft = ref('')
const globalName = ref('')
const globalEmail = ref('')
const localName = ref('')
const localEmail = ref('')

const canConfigureLocalIdentity = computed(() => !!gitStore.root && gitStore.isRepo)
const availabilityText = computed(() => {
  const availability = gitStore.availability
  if (!availability.available) return t('preferences.sourceControl.gitUnavailable')
  return `${availability.version ?? ''} · ${availability.path ?? 'git'}`
})

function applyIdentity(scopes: GitIdentityScopes): void {
  globalName.value = scopes.global.name ?? ''
  globalEmail.value = scopes.global.email ?? ''
  localName.value = scopes.local?.name ?? ''
  localEmail.value = scopes.local?.email ?? ''
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

async function setPathMode(mode: 'auto' | 'custom'): Promise<void> {
  gitPathModeDraft.value = mode
  if (mode === 'custom' && !gitPathDraft.value.trim()) return
  await patchSettings({
    gitPathMode: mode,
    ...(mode === 'custom' ? { gitPath: gitPathDraft.value.trim() } : {}),
  })
}

async function applyCustomPath(): Promise<void> {
  const value = gitPathDraft.value.trim()
  if (!value) return
  await patchSettings({ gitPathMode: 'custom', gitPath: value })
}

async function browseGit(): Promise<void> {
  const result = await window.electronAPI.showOpenDialog({
    title: t('preferences.sourceControl.chooseGit'),
    properties: ['openFile'],
  })
  const selected = result.filePaths?.[0]
  if (!result.canceled && selected) {
    gitPathDraft.value = selected
    await applyCustomPath()
  }
}

async function recheckGit(): Promise<void> {
  gitStore.availability = await window.electronAPI.git.detect(true)
  if (gitStore.root) await gitStore.onFolderChanged(gitStore.root)
}

async function saveGlobalIdentity(): Promise<void> {
  try {
    await window.electronAPI.git.identitySet(null, globalName.value.trim(), globalEmail.value.trim(), true)
    await loadIdentity()
    notify.success(t('preferences.sourceControl.identitySaved'))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

async function saveLocalIdentity(): Promise<void> {
  if (!gitStore.root) return
  try {
    await window.electronAPI.git.identitySet(gitStore.root, localName.value.trim(), localEmail.value.trim(), false)
    await loadIdentity()
    notify.success(t('preferences.sourceControl.identitySaved'))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

async function clearLocalIdentity(): Promise<void> {
  if (!gitStore.root) return
  try {
    await window.electronAPI.git.identityClearLocal(gitStore.root)
    await loadIdentity()
    notify.success(t('preferences.sourceControl.localIdentityCleared'))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  }
}

watch(() => [gitStore.root, gitStore.isRepo], () => { void loadIdentity() })

onMounted(async () => {
  await gitStore.ensureSettings()
  gitPathModeDraft.value = gitStore.settings.gitPathMode
  gitPathDraft.value = gitStore.settings.gitPath
  await gitStore.ensureDetected()
  await loadIdentity()
})
</script>
