<template>
  <div class="border-2 border-accent-primary rounded-lg my-2 mx-3 bg-white flex-shrink-0 shadow-lg">

    <AgentContextChips
      :files="contextFiles"
      @remove="removeContextFile"
    />

    <div class="px-3 pt-2 pb-1">
      <textarea
        v-model="inputText"
        ref="inputEl"
        placeholder="发消息… (Enter 发送，Shift+Enter 换行)"
        class="w-full text-sm border-none rounded-md resize-none focus:outline-none focus:border-transparent"
        rows="1"
        :style="{ maxHeight: maxTextareaHeight }"
        @keydown="handleKeydown"
        @input="autoResize"
      />
    </div>

    <div class="mx-2 border-t border-gray-200" />

    <AgentToolbar
      :is-pending-send="pendingSend"
      :is-streaming="aiStore.isStreaming"
      :can-send="!!inputText.trim()"
      :show-compact="showCompact"
      :is-compacting="isCompacting"
      :current-session-tokens="currentSessionTokens"
      :compact-progress-ratio="compactProgressRatio"
      :compact-trigger-tokens="compactTriggerTokens"
      :max-input-tokens="maxInputTokens"
      @browse-files="browseFiles"
      @browse-folder="browseFolder"
      @compact="compactInput"
      @send="sendMessage"
      @stop="aiStore.cancelStreaming()"
      @cancel-queued="cancelPendingSend"
    />

  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import AgentContextChips from './AgentContextChips.vue'
import AgentToolbar from './AgentToolbar.vue'
import { useContextFiles } from '../composables/useContextFiles'
import { useChatSend } from '../composables/useChatSend'

const aiStore = useAiStore()

const { contextFiles, removeContextFile, browseFiles, browseFolder } = useContextFiles()
const {
  inputText,
  inputEl,
  pendingSend,
  isCompacting,
  showCompact,
  currentSessionTokens,
  compactTriggerTokens,
  compactProgressRatio,
  maxInputTokens,
  handleKeydown,
  sendMessage,
  compactInput,
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
