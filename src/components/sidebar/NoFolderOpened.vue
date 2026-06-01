<template>
  <div class="h-full flex flex-col">
    <!-- No Folder Header -->
    <div class=" iw-sidebar-section">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          {{ t('sidebar.noFolderOpened.title') }}
        </span>
      </div>
    </div>
    
    <!-- Content -->
    <div class="flex flex-1 flex-col justify-top p-2 gap-2">
        <p class="text-left text-sm text-base-content/50">{{ t('sidebar.noFolderOpened.description') }}</p>
        <button
          @click="appStore.openFolder()"
          class="iw-btn btn-primary w-full h-9"
        >
          <IconFolder class="icon-sm" />
          <span>{{ t('sidebar.noFolderOpened.openFolder') }}</span>
        </button>

        <p class="text-left text-sm text-base-content/50">{{ t('sidebar.noFolderOpened.warning') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { 
  IconFolder 
} from '@tabler/icons-vue'

const appStore = useAppStore()
const { t } = useI18n()
</script>
