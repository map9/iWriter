<template>
  <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" :style="{ paddingBottom: (bottomPadding ?? 0) + 24 + 'px' }">

    <AgentEmptyState />

    <AgentMessageBubble
      v-for="msg in aiStore.activeThread?.messages ?? []"
      :key="msg.id"
      :message="msg"
      @resend="handleResend"
    />

    <!-- Streaming message -->
    <div v-if="aiStore.isStreaming" class="flex gap-2.5">
      <div class="flex-1 min-w-0 space-y-1.5">
        <AgentMessageBubble
          v-if="streamingPreviewMessage"
          :message="streamingPreviewMessage"
          :is-preview="true"
          :preview-status-text="`${thinkingLabel} · ${elapsedSeconds}s`"
          :show-preview-pulse="true"
        />

        <div
          v-else
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
      v-if="aiStore.allPendingProposals.length"
      :proposals="aiStore.allPendingProposals"
      :is-streaming="aiStore.isStreaming"
      @approve="aiStore.approveEditProposal"
      @reject="aiStore.rejectEditProposal"
      @approve-all="aiStore.approveAllProposals"
      @reject-all="aiStore.rejectAllProposals"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'
import type { ThreadMessage, MessageContentBlock, AiToolCall } from '@/ai/types'

defineProps<{ bottomPadding?: number }>()
import { useAiStore } from '@/ai/store/ai'
import AgentEmptyState from './AgentEmptyState.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'
import ProposalNavigator from '../ProposalNavigator.vue'

const aiStore = useAiStore()

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
  if ((aiStore.activeThread?.messages?.length ?? 0) > 0) return '正在处理'
  return '思考中'
})

const streamingPreviewMessage = computed<ThreadMessage | null>(() => {
  const contentBlocks: MessageContentBlock[] = []
  const toolCalls: AiToolCall[] = []
  let content = ''

  for (const block of aiStore.streamingBlocks) {
    if (block.type === 'text' && block.text) {
      contentBlocks.push({ type: 'text', text: block.text })
      content += block.text
      continue
    }
    if (block.type === 'tool_call') {
      contentBlocks.push({ type: 'tool_call', toolCallId: block.toolCall.id })
      toolCalls.push(block.toolCall)
    }
  }

  if (aiStore.streamingCurrentText) {
    contentBlocks.push({ type: 'text', text: aiStore.streamingCurrentText })
    content += aiStore.streamingCurrentText
  }

  if (!contentBlocks.length && !aiStore.streamingThinkingText) {
    return null
  }

  return {
    id: 'streaming-preview',
    role: 'assistant',
    content,
    timestamp: Date.now(),
    thinkingContent: aiStore.streamingThinkingText || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    contentBlocks: contentBlocks.length ? contentBlocks : undefined,
  }
})



// ── Auto-scroll ────────────────────────────────────────────────────────────
const messagesEl = ref<HTMLDivElement>()

watch(
  () => [aiStore.streamingText, aiStore.activeThread?.messages?.length],
  () => {
    nextTick(() => {
      if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    })
  }
)

async function handleResend(messageId: string, newContent: string) {
  const thread = aiStore.activeThread
  if (!thread) return
  const idx = (thread.messages ?? []).findIndex(m => m.id === messageId)
  if (idx < 0) return
  aiStore.updateThread({ ...thread, messages: (thread.messages ?? []).slice(0, idx) })
  await aiStore.sendMessage(newContent)
}
</script>
