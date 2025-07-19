<template>
  <div class="h-full flex">
    <!-- Left side: Welcome content -->
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-xl">
        <div class="mb-8">
          <IconFileText class="w-24 h-24 mx-auto mb-4 text-text-primary" />
          <h1 class="text-2xl font-bold mb-2 text-text-primary">Welcome to iWriter</h1>
          <p class="text-base text-text-secondary">Create a new document or open an existing file to start editing</p>
        </div>
        
        <div class="flex gap-3 justify-center">
          <button 
            @click="createNewDocument"
            class="button-m button-m-primary w-44 mb-4 h-9"
          >
            <IconPlus class="icon-base" />
            <span>New Document</span>
          </button>
          
          <button 
            @click="openFile"
            class="button-m button-m-primary w-44 mb-4 h-9"
          >
            <IconFolderOpen class="icon-base" />
            <span>Open Document</span>
          </button>
          
          <button v-if="!appStore.hasOpenFolder"
            @click="openFolder"
            class="button-m button-m-primary w-44 mb-4 h-9"
          >
            <IconFolder class="icon-base" />
            <span>Open Folder</span>
          </button>
        </div>
        
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { DocumentType } from '@/types'
import { 
  IconFileText, 
  IconPlus, 
  IconFolderOpen, 
  IconFolder
} from '@tabler/icons-vue'

const appStore = useAppStore()

function createNewDocument() {
  appStore.createTab(undefined, undefined, '', DocumentType.TEXT_EDITOR)
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