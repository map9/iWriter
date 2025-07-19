<template>
  <div class="h-full flex flex-col">
    <!-- No Folder Header -->
    <div class="sidebar-header h-9 flex-shrink-0 select-none">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-text-primary uppercase tracking-wide">
          Start
        </span>
      </div>
    </div>
    
    <!-- Content -->
    <div class="p-4 flex-1 flex flex-col justify-top">
      <div>
        <p class="mb-2 text-sm text-left text-text-secondary">You have not yet opened folder.</p>
        <button
          @click="appStore.openFolder()"
          class="button-m button-m-primary w-full mb-2 h-9"
        >
          <IconFolder class="icon-base" />
          <span>Open Folder</span>
        </button>

        <div class="mb-2 text-sm text-left text-text-secondary">
          <p>Opening a folder will close all currently open editors.</p>
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