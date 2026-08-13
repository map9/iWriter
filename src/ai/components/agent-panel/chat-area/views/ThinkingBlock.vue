<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownContentView from './MarkdownContentView.vue'

defineProps<{
  content: string
  size?: 'xs' | 'sm'
}>()

const { t } = useI18n()
const expanded = ref(false)
</script>

<template>
  <div class="inline-flex max-w-full flex-col items-start gap-1">
    <button
      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-base-content hover:bg-base-300 hover:text-base-content/50 transition-colors"
      @click="expanded = !expanded"
    >
      <span>💭</span>
      <span>{{ expanded ? t('agentPanel.messageBubble.hideThinking') : t('agentPanel.messageBubble.showThinking') }}</span>
    </button>
    <div
      v-if="expanded"
      class="w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 text-base-content"
    >
      <MarkdownContentView :content="content" mode="markdown" :size="size ?? 'xs'" />
    </div>
  </div>
</template>
