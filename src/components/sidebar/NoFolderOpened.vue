<template>
  <div class="h-full flex flex-col">
    <!-- No Folder Header -->
    <div class="px-3 h-9 border-b border-gray-200 bg-gray-50 flex items-center">
      <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
        Start
      </span>
    </div>
    
    <!-- Content -->
    <div class="p-4 flex-1 flex flex-col justify-top">
      <div class="text-left text-gray-600">
        <p class="mb-2 text-sm">You have not yet opened folder.</p>
        <button
          @click="appStore.openFolder()"
          class="btn btn-primary w-full mb-4 h-9 items-center justify-center space-x-2 whitespace-nowrap"
        >
          <IconFolder class="w-5 h-5" />
          <span>Open Folder</span>
        </button>

        <div class="mb-2 text-sm">
          <p>Opening a folder will close all currently open editors.</p>
          <p>To keep them open, add a folder instead.</p>
          <p>You can clone a repository locally.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { 
  IconFolder 
} from '@tabler/icons-vue'

const appStore = useAppStore()
</script>