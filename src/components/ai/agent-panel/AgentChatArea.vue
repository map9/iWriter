<template>
  <div ref="messagesEl" class="flex-1 overflow-y-auto px-3 pb-3 pt-1 space-y-3 min-h-0" :style="{ paddingBottom: (bottomPadding ?? 0) + 24 + 'px' }">
    <ChatContextPill />

    <AgentEmptyState @suggest="handleSuggestPrompt" />

    <div
      v-if="aiStore.isSwitchingThread && !aiStore.displayMessages.length"
      class="flex gap-2.5"
    >
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100">
          <div class="flex items-center gap-0.5">
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
          </div>
          <span class="text-xs text-gray-500">正在载入会话…</span>
        </div>
      </div>
    </div>

    <AgentMessageBubble
      v-for="entry in aiStore.displayMessages"
      :key="entry.key"
      :message="entry.message"
      :is-preview="entry.isPreview"
      :preview-status-text="entry.isPreview ? `${streamingStatusLabel} · ${formattedElapsed}` : ''"
      :show-preview-pulse="!!entry.isPreview"
      @resend="handleResend"
    />

    <!-- Streaming message -->
    <div v-if="aiStore.isStreaming && !aiStore.streamingPreviewMessage" class="flex gap-2.5">
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100">
          <div class="flex items-center gap-0.5">
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
          </div>
          <span class="text-xs text-gray-500">{{ streamingStatusLabel }} · {{ formattedElapsed }}</span>
        </div>
      </div>
    </div>

    <ProposalNavigator
      v-if="showFallbackProposalNavigator"
      :proposals="aiStore.allPendingProposals"
      :reviewed-entries="aiStore.reviewedBatchEntries"
      :review-summary="aiStore.reviewBatchSummary"
      :is-streaming="aiStore.isStreaming"
      @approve="aiStore.approveEditProposal"
      @edit-approve="({ id, editedArgs }) => aiStore.editAndApproveProposal(id, editedArgs)"
      @approve-all="aiStore.approveAllProposals"
      @rework="({ id, reason }) => aiStore.requestProposalRework(id, reason)"
      @end-round="payload => aiStore.endReviewRound(payload?.id)"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'

defineProps<{ bottomPadding?: number }>()
import { useAiStore } from '@/ai/store/ai'
import { buildEditSessionForMessage } from '@/ai/edit-session'
import ChatContextPill from './ChatContextPill.vue'
import AgentEmptyState from './AgentEmptyState.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'
import ProposalNavigator from '../ProposalNavigator.vue'

const aiStore = useAiStore()

// ── Elapsed timer ─────────────────────────────────────────────────────────
const elapsedMs = ref(0)
let elapsedInterval: ReturnType<typeof setInterval> | null = null
let runStartedAt = 0

const isSessionActive = computed(() =>
  !!aiStore.liveTurnState || aiStore.isStreaming || aiStore.isInterrupted
)

watch(isSessionActive, active => {
  if (active) {
    if (!runStartedAt) {
      runStartedAt = aiStore.liveTurnStartedAt ?? Date.now()
      elapsedMs.value = 0
    }
    if (!elapsedInterval) {
      elapsedInterval = setInterval(() => {
        elapsedMs.value = Math.max(0, Date.now() - runStartedAt)
      }, 1000)
    }
  } else {
    if (elapsedInterval) {
      clearInterval(elapsedInterval)
      elapsedInterval = null
    }
    runStartedAt = 0
    elapsedMs.value = 0
  }
})

watch(
  () => aiStore.liveTurnStartedAt,
  startedAt => {
    if (!startedAt) return
    runStartedAt = startedAt
    elapsedMs.value = Math.max(0, Date.now() - startedAt)
  }
)

onUnmounted(() => {
  if (elapsedInterval) clearInterval(elapsedInterval)
})

const formattedElapsed = computed(() => {
  const totalSeconds = Math.floor(elapsedMs.value / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${minutes}m ${seconds}s`
})

function humanizeToolName(toolName: string | null | undefined): string {
  if (!toolName) return ''
  const map: Record<string, string> = {
    get_document_outline: '读取文档大纲',
    get_section: '读取章节',
    get_blocks: '读取段落',
    get_block_context: '读取上下文',
    search_document_blocks: '在文档中搜索段落',
    search_document_sections: '在文档中搜索章节',
    search_workspace_documents: '在目录中搜索文档内容',
    search_in_document: '在文档中搜索章节',
    search_in_directory: '在目录中搜索文档内容',
    search_blocks_in_document: '在文档中搜索段落',
    search_sections_in_document: '在文档中搜索章节',
    read_file: '读取文件',
    list_directory: '查看目录',
    ls: '查看目录',
    glob: '匹配文件',
    grep: '搜索内容',
    execute: '执行命令',
    write_file: '写入文件',
    edit_file: '编辑文件',
    list_story_assets: '列出故事资产',
    read_story_asset: '读取故事资产',
    save_story_asset: '保存故事资产',
  }
  return map[toolName] || toolName
}

const streamingStatusLabel = computed(() => {
  if (aiStore.liveTurnState === 'resuming') {
    return '正在继续处理已确认修改'
  }
  if (aiStore.streamingToolName) {
    return `正在调用工具 · ${humanizeToolName(aiStore.streamingToolName)}`
  }
  if (aiStore.streamingText || aiStore.streamingPreviewMessage?.toolCalls?.length) {
    return '正在整理结果'
  }
  if (aiStore.streamingThinkingText) {
    return '思考中'
  }
  return '正在处理'
})

const showFallbackProposalNavigator = computed(() => {
  if (!aiStore.allPendingProposals.length) return false

  const hasInlineReviewSurface = aiStore.displayMessages.some(entry => {
    if (entry.message.role !== 'assistant') return false
    const session = buildEditSessionForMessage({
      message: entry.message,
      mode: aiStore.activeThread?.mode,
      pendingProposals: aiStore.allPendingProposals,
      isInterrupted: aiStore.isInterrupted,
      interruptedTurnId: aiStore.interruptedTurnId,
      isLatestAssistantMessage: aiStore.latestPersistedAssistantMessageId === entry.message.id,
      assistantMessageIds: aiStore.persistedAssistantMessageIds,
      editToolCalls: entry.message.toolCalls?.filter(toolCall => toolCall.kind === 'edit') ?? [],
    })
    return session?.phase === 'review_ready'
  })

  return !hasInlineReviewSurface
})

// ── Auto-scroll ────────────────────────────────────────────────────────────
const messagesEl = ref<HTMLDivElement>()

watch(
  () => [
    aiStore.streamingText,
    aiStore.streamingCurrentText,
    aiStore.streamingBlocks.length,
    aiStore.liveTurnState,
    aiStore.displayMessages.length,
  ],
  () => {
    nextTick(() => {
      if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    })
  }
)

async function handleResend(messageId: string, newContent: string) {
  const truncated = aiStore.truncateActiveThreadBeforeMessage(messageId)
  if (!truncated) return
  await aiStore.sendMessage(newContent)
}

function handleSuggestPrompt(prompt: string) {
  aiStore.setDraftInput(prompt)
}
</script>
