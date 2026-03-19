<template>
  <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" :style="{ paddingBottom: (bottomPadding ?? 0) + 24 + 'px' }">

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
      @resend="handleResend"
    />

    <!-- Streaming message -->
    <div v-if="aiStore.isStreaming" class="flex gap-2.5">
      <div class="flex-1 min-w-0">
        <!-- Active tool call chip -->
        <div v-if="aiStore.streamingToolName" class="mb-1.5">
          <ToolCallView :tool-call="streamingToolCall" />
        </div>

        <!-- Streaming text with character count -->
        <div
          v-if="aiStore.streamingText"
          class="inline-block px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-900 break-words max-w-full"
        >
          <div class="prose prose-sm max-w-none" v-html="renderMarkdown(aiStore.streamingText)" />
          <div class="flex items-center gap-2 mt-1">
            <span class="inline-block w-0.5 h-3.5 bg-gray-500 animate-pulse align-middle" />
            <span class="text-xs text-gray-400">已生成 {{ streamingCharCount }} 字</span>
          </div>
        </div>

        <!-- Thinking / waiting state with elapsed timer -->
        <div
          v-else-if="!aiStore.streamingToolName"
          class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100"
        >
          <div class="flex items-center gap-0.5">
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
          </div>
          <span class="text-xs text-gray-500">{{ thinkingLabel }} · {{ elapsedSeconds }}s</span>
        </div>
      </div>
    </div>

    <!-- Proposal navigator: shown after streaming ends when there are pending proposals -->
    <ProposalNavigator
      v-if="!aiStore.isStreaming && aiStore.allPendingProposals.length"
      :proposals="aiStore.allPendingProposals"
      @approve="aiStore.approveEditProposal"
      @reject="aiStore.rejectEditProposal"
      @approve-all="aiStore.approveAllProposals"
      @reject-all="aiStore.rejectAllProposals"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'

const props = defineProps<{ bottomPadding?: number }>()
import { marked } from 'marked'
import { useAiStore } from '@/stores/ai'
import { inferToolKind } from '@/types/ai'
import type { AiToolCall } from '@/types/ai'
import AgentStartupProgress from '../AgentStartupProgress.vue'
import AgentEmptyState from './AgentEmptyState.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'
import ToolCallView from '../ToolCallView.vue'
import ProposalNavigator from '../ProposalNavigator.vue'

const aiStore = useAiStore()

const streamingToolCall = computed<AiToolCall>(() => ({
  id: 'streaming',
  name: aiStore.streamingToolName ?? '',
  kind: inferToolKind(aiStore.streamingToolName ?? ''),
  title: aiStore.streamingToolName ?? '',
  status: 'in_progress',
  arguments: {},
}))

// ── Elapsed timer ─────────────────────────────────────────────────────────
const elapsedSeconds = ref(0)
let elapsedInterval: ReturnType<typeof setInterval> | null = null

watch(() => aiStore.isStreaming, streaming => {
  if (streaming) {
    elapsedSeconds.value = 0
    elapsedInterval = setInterval(() => { elapsedSeconds.value++ }, 1000)
  } else {
    if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  }
})

onUnmounted(() => {
  if (elapsedInterval) clearInterval(elapsedInterval)
})

// ── Status label: changes when a tool round completes ─────────────────────
const thinkingLabel = computed(() => {
  // If LLM had already called tools in this session, it's "processing results"
  if ((aiStore.activeThread?.messages.length ?? 0) > 0) return '正在处理'
  return '思考中'
})

// ── Character count for streaming text ────────────────────────────────────
const streamingCharCount = computed(() => {
  const text = aiStore.streamingText
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const latin = (text.match(/\b\w+\b/g) ?? []).length
  return cjk + latin
})

// ── Auto-scroll ────────────────────────────────────────────────────────────
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

async function handleResend(messageId: string, newContent: string) {
  const thread = aiStore.activeThread
  if (!thread) return
  const idx = thread.messages.findIndex(m => m.id === messageId)
  if (idx < 0) return
  aiStore.updateThread({ ...thread, messages: thread.messages.slice(0, idx) })
  await aiStore.sendMessage(newContent)
}
</script>
