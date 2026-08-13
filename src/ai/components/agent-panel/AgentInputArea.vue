<template>
  <div class="border-2 border-primary rounded-field bg-base-100 mx-3 my-2 shrink-0 shadow-sm">

    <AgentContextChips
      :files="contextFiles"
      @remove="removeContextFile"
    />

    <div class="px-3 pb-1 pt-2">
      <textarea
        v-model="inputText"
        ref="inputEl"
        :placeholder="t('agentPanel.input.sendMessagePlaceholder')"
        class="w-full resize-none border-none bg-transparent text-sm focus:outline-none"
        rows="1"
        :style="{ maxHeight: maxTextareaHeight }"
        @keydown="handleKeydown"
        @input="autoResize"
      />
    </div>

    <div class="mx-3 border-t border-base-300" />

    <AgentToolbar
      :is-pending-send="pendingSend"
      :is-streaming="aiStore.isStreaming"
      :can-send="!!inputText.trim()"
      :show-compact="showCompact"
      :current-session-tokens="currentSessionTokens"
      :compact-progress-ratio="compactProgressRatio"
      :compact-trigger-tokens="compactTriggerTokens"
      :request-budget-tokens="requestBudgetTokens"
      :max-input-tokens="maxInputTokens"
      :session-usage="sessionUsage"
      @browse-files="browseFiles"
      @browse-folder="browseFolder"
      @send="sendMessage"
      @stop="aiStore.cancelStreaming()"
      @cancel-queued="cancelPendingSend"
    />

  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/ai/state/aiStore'
import AgentContextChips from './input/AgentContextChips.vue'
import AgentToolbar from './input/AgentToolbar.vue'
import { useContextFiles } from './composables/useContextFiles'
import { useChatSend } from './composables/useChatSend'

const aiStore = useAiStore()
const { t } = useI18n()

const { contextFiles, removeContextFile, browseFiles, browseFolder } = useContextFiles()
const {
  inputText,
  inputEl,
  pendingSend,
  showCompact,
  currentSessionTokens,
  compactTriggerTokens,
  requestBudgetTokens,
  compactProgressRatio,
  maxInputTokens,
  sessionUsage,
  handleKeydown,
  sendMessage,
  cancelPendingSend,
} = useChatSend(contextFiles)

// text-sm line-height is 1.25rem = 20px; 5 lines = 100px
const maxTextareaHeight = '100px'

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}

// Reset height when input is cleared (e.g. after send)
watch(inputText, (val) => {
  if (!val && inputEl.value) {
    inputEl.value.style.height = 'auto'
  }
})
</script>
