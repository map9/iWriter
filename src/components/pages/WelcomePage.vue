<template>
  <div class="document-page">
    <div class="flex flex-1 items-center justify-center">
      <div class="max-w-xl text-center p-3">
        <div class="mb-8">
          <IconFileText class="size-20 mx-auto mb-4 text-primary" />
          <h1 class="text-xl font-semibold tracking-tight text-base-content mb-2">{{ t('welcomePage.title') }}</h1>
          <p class="text-md text-base-content opacity-50">{{ t('welcomePage.desc') }}</p>
        </div>
        
        <div class="flex flex-wrap justify-center gap-3">
          <button 
            @click="createNewDocument"
            class="iw-btn btn-primary w-44 h-9"
          >
            <IconPlus class="icon-sm" />
            <span>{{ t('welcomePage.newDocument') }}</span>
          </button>
          
          <button 
            @click="openFile"
            class="iw-btn btn-primary w-44 h-9"
          >
            <IconFolderOpen class="icon-sm" />
            <span>{{ t('welcomePage.openDocument') }}</span>
          </button>
          
          <button v-if="!appStore.hasOpenFolder"
            @click="openFolder"
            class="iw-btn btn-primary w-44 h-9"
          >
            <IconFolder class="icon-sm" />
            <span>{{ t('welcomePage.openFolder') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { DocumentType } from '@/types'
import { 
  IconFileText, 
  IconPlus, 
  IconFolderOpen, 
  IconFolder
} from '@tabler/icons-vue'

const appStore = useAppStore()
const { t } = useI18n()

function createNewDocument() {
  appStore.createTab(undefined, undefined, DocumentType.MARKDOWN_EDITOR)
}

function openFile() {
  appStore.openFileDialog()
}

function openFolder() {
  appStore.openFolder()
}
</script>

<style scoped>
</style>
