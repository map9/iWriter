<template>
  <div
    v-if="gitStore.identityPromptOpen"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click.self="gitStore.cancelIdentity()"
  >
    <div class="w-96 max-w-[90vw] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl">
      <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
        <h2 class="text-sm font-semibold">{{ t('sourceControl.identity.title') }}</h2>
        <button class="iw-toolbar-btn btn-sm px-2" @click="gitStore.cancelIdentity()"><IconX class="icon-xs" /></button>
      </div>
      <form class="flex flex-col gap-3 px-4 py-4" @submit.prevent="save">
        <p class="text-xs text-base-content/60">{{ t('sourceControl.identity.desc') }}</p>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/60">{{ t('sourceControl.identity.name') }}</span>
          <input v-model="name" type="text" class="iw-input" required />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/60">{{ t('sourceControl.identity.email') }}</span>
          <input v-model="email" type="email" class="iw-input" required />
        </label>
        <div class="flex flex-col gap-1.5 text-xs">
          <label class="flex items-center gap-2">
            <input v-model="global" type="radio" :value="false" class="radio radio-xs" />
            {{ t('sourceControl.identity.thisRepo') }}
          </label>
          <label class="flex items-center gap-2">
            <input v-model="global" type="radio" :value="true" class="radio radio-xs" />
            {{ t('sourceControl.identity.global') }}
          </label>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="iw-btn btn-ghost btn-sm" @click="gitStore.cancelIdentity()">{{ t('common.cancel') }}</button>
          <button type="submit" class="iw-btn btn-primary btn-sm" :disabled="!name || !email">{{ t('sourceControl.identity.save') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconX } from '@tabler/icons-vue'
import { useGitStore } from '@/stores/git'

const { t } = useI18n()
const gitStore = useGitStore()

const name = ref('')
const email = ref('')
const global = ref(false)

// 打开时预填现有全局配置（若有）
watch(() => gitStore.identityPromptOpen, async (open) => {
  if (open && gitStore.root) {
    const id = await window.electronAPI.git.identityGet(gitStore.root)
    name.value = id.name ?? ''
    email.value = id.email ?? ''
  }
})

function save() {
  if (!name.value || !email.value) return
  gitStore.submitIdentity(name.value, email.value, global.value)
}
</script>
