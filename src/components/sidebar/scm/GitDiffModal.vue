<template>
  <div
    v-if="gitStore.diffOpen"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click.self="gitStore.closeDiff()"
  >
    <div class="flex h-[80vh] w-[80vw] max-w-6xl flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl">
      <!-- 头部 -->
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
        <h2 class="min-w-0 truncate text-sm font-semibold" :title="gitStore.diffTitle">{{ gitStore.diffTitle }}</h2>
        <button class="iw-toolbar-btn btn-sm shrink-0 px-2" :title="t('common.close')" @click="gitStore.closeDiff()">
          <IconX class="icon-xs" />
        </button>
      </div>

      <!-- 内容 -->
      <div class="min-h-0 flex-1 overflow-auto">
        <div v-if="gitStore.diffLoading" class="flex h-full items-center justify-center">
          <span class="loading loading-spinner loading-md"></span>
        </div>
        <div v-else-if="!gitStore.diffPayload" class="flex h-full items-center justify-center text-sm text-base-content/50">
          {{ t('sourceControl.noChanges') }}
        </div>
        <div v-else-if="gitStore.diffPayload.isBinary" class="flex h-full items-center justify-center text-sm text-base-content/50">
          {{ t('sourceControl.binaryFile') }}
        </div>
        <DiffSplitView
          v-else
          :old-content="gitStore.diffPayload.oldContent"
          :new-content="gitStore.diffPayload.newContent"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { IconX } from '@tabler/icons-vue'
import DiffSplitView from '@/components/ai/agent-panel/chat-area/views/DiffSplitView.vue'
import { useGitStore } from '@/stores/git'

const { t } = useI18n()
const gitStore = useGitStore()
</script>
