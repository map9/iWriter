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

        <button
          v-if="gitStore.availability.available"
          @click="gitStore.cloneDialogOpen = true"
          class="iw-btn btn-ghost w-full h-9"
        >
          <IconGitBranch class="icon-sm" />
          <span>{{ t('sourceControl.cloneRepo') }}</span>
        </button>

        <p class="text-left text-sm text-base-content/50">{{ t('sidebar.noFolderOpened.warning') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useGitStore } from '@/stores/git'
import {
  IconFolder,
  IconGitBranch,
} from '@tabler/icons-vue'

const appStore = useAppStore()
const gitStore = useGitStore()
const { t } = useI18n()

// 无文件夹时也检测 git，以决定是否显示「克隆仓库」
onMounted(() => { gitStore.ensureDetected() })
</script>
