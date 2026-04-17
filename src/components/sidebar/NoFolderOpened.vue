<template>
  <div class="h-full flex flex-col">
    <!-- No Folder Header -->
    <div class=" iw-sidebar-section">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          Start
        </span>
      </div>
    </div>
    
    <!-- Content -->
    <div class="flex flex-1 flex-col justify-top p-2 gap-2">
        <p class="text-left text-sm text-base-content opacity-50">You have not yet opened folder.</p>
        <button
          @click="appStore.openFolder()"
          class="iw-btn btn-primary w-full h-9"
        >
          <IconFolder class="icon-sm" />
          <span>Open Folder</span>
        </button>

        <p class="text-left text-sm text-base-content opacity-50">Opening a folder will close all currently open editors.</p>
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
