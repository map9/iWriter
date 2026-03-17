<template>
  <div class="border-t border-gray-200 bg-white flex-shrink-0">

    <AgentContextChips
      :files="contextFiles"
      @remove="removeContextFile"
    />

    <div class="px-3 pt-2 pb-1">
      <textarea
        v-model="inputText"
        ref="inputEl"
        placeholder="发消息… (Enter 发送，Shift+Enter 换行)"
        class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        rows="3"
        @keydown="handleKeydown"
      />
    </div>

    <AgentToolbar
      :is-pending-send="pendingSend"
      :is-streaming="aiStore.isStreaming"
      :can-send="!!inputText.trim()"
      @attach-current="attachCurrentFile"
      @browse-files="browseFiles"
      @browse-folder="browseFolder"
      @send="sendMessage"
      @stop="aiStore.cancelStreaming()"
      @cancel-queued="cancelPendingSend"
      @clear-thread="clearThread"
    />

  </div>
</template>

<script setup lang="ts">
import { useAiStore } from '@/stores/ai'
import AgentContextChips from './AgentContextChips.vue'
import AgentToolbar from './AgentToolbar.vue'
import { useContextFiles } from '../composables/useContextFiles'
import { useChatSend } from '../composables/useChatSend'

const aiStore = useAiStore()

const { contextFiles, removeContextFile, attachCurrentFile, browseFiles, browseFolder } = useContextFiles()
const { inputText, inputEl, pendingSend, handleKeydown, sendMessage, cancelPendingSend } = useChatSend(contextFiles)

function clearThread() {
  if (aiStore.activeThread) {
    aiStore.updateThread({ ...aiStore.activeThread, messages: [] })
  }
}
</script>
