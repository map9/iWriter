<template>
  <div
    v-if="gitStore.cloneDialogOpen"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click.self="close"
  >
    <form
      class="w-96 max-w-[90vw] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      @submit.prevent="confirmClone"
    >
      <div class="border-b border-base-300 px-4 py-3 text-sm font-semibold">{{ t('sourceControl.clone.title') }}</div>
      <div class="px-4 py-4">
        <label class="mb-1 block text-xs text-base-content/60">{{ t('sourceControl.clone.url') }}</label>
        <input v-model="cloneUrl" type="text" class="iw-input w-full" :placeholder="t('sourceControl.clone.urlPlaceholder')" autofocus />
      </div>
      <div class="flex justify-end gap-2 border-t border-base-300 px-4 py-3">
        <button type="button" class="iw-btn btn-ghost btn-sm" @click="close">{{ t('common.cancel') }}</button>
        <button type="submit" class="iw-btn btn-primary btn-sm" :disabled="!cloneUrl.trim() || gitStore.busy === 'clone'">
          <span v-if="gitStore.busy === 'clone'" class="loading loading-spinner loading-xs"></span>
          {{ gitStore.busy === 'clone' ? t('sourceControl.clone.cloning') : t('sourceControl.clone.chooseDir') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGitStore } from '@/stores/git'
import { useAppStore } from '@/stores/app'
import pathUtils from '@/utils/pathUtils'

const { t } = useI18n()
const gitStore = useGitStore()
const appStore = useAppStore()
const cloneUrl = ref('')

function close() {
  if (gitStore.busy === 'clone') return
  gitStore.cloneDialogOpen = false
}

async function confirmClone() {
  const url = cloneUrl.value.trim()
  if (!url || gitStore.busy) return
  const res = await window.electronAPI.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled || !res.filePaths.length) return
  const repoName = url.replace(/\.git$/, '').split(/[/\\]/).pop() || 'repo'
  const dir = pathUtils.join(res.filePaths[0]!, repoName)
  const cloned = await gitStore.clone(url, dir)
  if (cloned) {
    gitStore.cloneDialogOpen = false
    cloneUrl.value = ''
    await appStore.openFolderByPath(cloned)
  }
}
</script>
