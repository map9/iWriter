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

        <!-- Thinking content (collapsible, shown when model is reasoning) -->
        <div
          v-if="aiStore.streamingThinkingText"
          class="w-full border border-purple-200 bg-purple-50 rounded-lg overflow-hidden text-xs"
        >
          <button
            class="w-full flex items-center gap-1.5 px-3 py-1.5 text-purple-700 font-medium text-left hover:bg-purple-100 transition-colors"
            @click="thinkingExpanded = !thinkingExpanded"
          >
            <span>💭</span>
            <span>思考过程</span>
            <span class="ml-auto">{{ thinkingExpanded ? '▲' : '▼' }}</span>
          </button>
          <div v-if="thinkingExpanded" class="px-3 py-2 text-purple-800 whitespace-pre-wrap leading-relaxed border-t border-purple-200">
            {{ aiStore.streamingThinkingText }}
          </div>
        </div>

        <!-- Committed streaming blocks: interleaved text segments and tool calls -->
        <template v-for="(block, idx) in aiStore.streamingBlocks" :key="idx">
          <div
            v-if="block.type === 'text'"
            class="inline-block px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-900 break-words max-w-full"
          >
            <div class="prose prose-sm max-w-none" v-html="renderMarkdown(block.text)" />
          </div>
          <ToolCallView v-else-if="block.type === 'tool_call'" :tool-call="block.toolCall" />
        </template>

        <!-- Currently streaming text (not yet committed to a block) -->
        <div
          v-if="aiStore.streamingCurrentText"
          class="inline-block px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-900 break-words max-w-full"
        >
          <div class="prose prose-sm max-w-none" v-html="renderMarkdown(aiStore.streamingCurrentText)" />
          <div class="flex items-center gap-2 mt-1">
            <div class="flex items-center gap-0.5">
              <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
              <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
              <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
            </div>
            <span class="text-xs text-gray-500">{{ thinkingLabel }} · {{ elapsedSeconds }}s</span>
          </div>
        </div>

        <!-- Waiting state: no current text (tool running or waiting for first response) -->
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

defineProps<{ bottomPadding?: number }>()
import { marked } from 'marked'
import { useAiStore } from '@/stores/ai'
import AgentEmptyState from './AgentEmptyState.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'
import ToolCallView from '../ToolCallView.vue'
import ProposalNavigator from '../ProposalNavigator.vue'

const aiStore = useAiStore()

const thinkingExpanded = ref(false)

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

function renderMarkdown(text: string): string {
  try { return marked.parse(text, { async: false }) as string }
  catch { return text }
}

async function handleResend(messageId: string, newContent: string) {
  const thread = aiStore.activeThread
  if (!thread) return
  const idx = (thread.messages ?? []).findIndex(m => m.id === messageId)
  if (idx < 0) return
  aiStore.updateThread({ ...thread, messages: (thread.messages ?? []).slice(0, idx) })
  await aiStore.sendMessage(newContent)
}
</script>
