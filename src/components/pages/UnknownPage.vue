<template>
  <div class="flex flex-1 items-center justify-center">
    <div class="flex flex-1 items-center justify-center">
      <div class="max-w-xl text-center p-3">
        <div class="mb-8">
          <IconAlertTriangle class="size-20 mx-auto mb-4 text-warning" />
          <h1 class="text-xl font-semibold tracking-tight text-base-content mb-2">{{ t('unknownPage.title') }}</h1>
          <p class="text-md text-base-content/50">{{ t('unknownPage.desc') }}</p>
        </div>
        
        <div class="flex flex-wrap justify-center gap-3">
          <button 
            @click="openWithShell(fileUrl)"
            class="iw-btn btn-primary w-44 h-9"
          >
            <IconFolderOpen class="icon-sm" />
            <span>{{ t('unknownPage.openAnyway') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileTab } from '@/types'
import { notify } from '@/utils/notifications'

import { 
  IconAlertTriangle,
  IconFolderOpen, 
} from '@tabler/icons-vue'

// Props
interface Props {
  tab: FileTab
}

const props = defineProps<Props>()
const { t } = useI18n()

// Computed
const fileUrl = computed(() => {
  if (props.tab.path) {
    return props.tab.path
  }
  return ''
})

async function openWithShell(filePath: string | undefined) {
  if (!filePath) return
  
  try {
    await window.electronAPI.openWithShell(filePath)
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.operation'))
  }
}

</script>

<style scoped>
</style>
