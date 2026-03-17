<template>
  <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">

    <AgentStartupProgress
      v-if="aiStore.isConnecting"
      :agent-name="aiStore.activeProviderConfig?.label ?? 'Agent'"
      :phase="aiStore.startupPhase"
      :logs="aiStore.startupLogs"
      :elapsed-seconds="aiStore.startupElapsed"
      :show-details="aiStore.startupShowDetails"
      @cancel="aiStore.cancelConnection()"
      @toggle-details="aiStore.startupShowDetails = !aiStore.startupShowDetails"
    />

    <AgentEmptyState />

    <AgentMessageBubble
      v-for="msg in aiStore.activeThread?.messages ?? []"
      :key="msg.id"
      :message="msg"
    />

    <!-- Streaming message -->
    <div v-if="aiStore.isStreaming" class="flex gap-2.5">
      <div class="flex-shrink-0 mt-0.5">
        <div class="w-7 h-7 rounded-full flex items-center justify-center bg-gray-500">
          <IconRobot class="w-4 h-4 text-white" />
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div v-if="aiStore.streamingToolName && !aiStore.streamingText" class="mb-1.5">
          <ToolCallView :tool-name="aiStore.streamingToolName" :is-running="true" />
        </div>
        <div
          v-if="aiStore.streamingText"
          class="inline-block px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-900 break-words max-w-full"
        >
          <div class="prose prose-sm max-w-none" v-html="renderMarkdown(aiStore.streamingText)" />
          <span class="inline-block w-0.5 h-4 bg-gray-600 animate-pulse ml-0.5 align-middle" />
        </div>
        <div
          v-else-if="!aiStore.streamingToolName"
          class="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100"
        >
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
        </div>
      </div>
    </div>

    <!-- Pending edit proposals -->
    <div v-if="aiStore.pendingEditProposals.length" class="space-y-2">
      <EditProposalView
        v-for="ep in aiStore.pendingEditProposals"
        :key="ep.id"
        :proposal="ep"
        @approve="aiStore.approveEditProposal"
        @reject="aiStore.rejectEditProposal"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import { IconRobot } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'
import AgentStartupProgress from '../AgentStartupProgress.vue'
import AgentEmptyState from './AgentEmptyState.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'
import ToolCallView from '../ToolCallView.vue'
import EditProposalView from '../EditProposalView.vue'

const aiStore = useAiStore()
const messagesEl = ref<HTMLDivElement>()

watch(
  () => [aiStore.streamingText, aiStore.activeThread?.messages.length],
  () => {
    nextTick(() => {
      if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    })
  }
)

function renderMarkdown(text: string): string {
  try { return marked.parse(text, { async: false }) as string }
  catch { return text }
}
</script>
