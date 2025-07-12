<template>
  <div class="h-full flex bg-gray-50">
    <!-- Left side: Welcome content -->
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-xl">
        <div class="mb-8">
          <IconFileText class="w-24 h-24 mx-auto mb-4 text-gray-300" />
          <h1 class="text-2xl font-bold text-gray-700 mb-2">Welcome to iWriter</h1>
          <p class="text-gray-500">Create a new document or open an existing file to start editing</p>
        </div>
        
        <div class="flex gap-3 justify-center">
          <button 
            @click="createNewDocument"
            class="btn btn-primary w-44 mb-4 h-9 items-center justify-center space-x-2 whitespace-nowrap"
          >
            <IconPlus class="w-5 h-5" />
            <span>New Document</span>
          </button>
          
          <button 
            @click="openFile"
            class="btn btn-primary w-44 mb-4 h-9 items-center justify-center space-x-2 whitespace-nowrap"
          >
            <IconFolderOpen class="w-5 h-5" />
            <span>Open Document</span>
          </button>
          
          <button 
            @click="openFolder"
            class="btn btn-primary w-44 mb-4 h-9 items-center justify-center space-x-2 whitespace-nowrap"
          >
            <IconFolder class="w-5 h-5" />
            <span>Open Folder</span>
          </button>
        </div>
        
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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
.btn {
  @apply px-3 py-1.5 rounded transition-colors font-medium text-sm flex items-center gap-1;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700;
}

.btn-secondary {
  @apply bg-gray-200 text-gray-700 hover:bg-gray-300;
}

.btn-xs {
  @apply px-2 py-1 text-xs;
}
</style>