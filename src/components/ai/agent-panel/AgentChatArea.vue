<template>
  <div ref="messagesEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-base-100 px-3 pb-2 pt-1" :style="{ paddingBottom: (bottomPadding ?? 0) + 24 + 'px' }" @scroll="onScroll">
    <ChatContextPill />

    <AgentEmptyState @suggest="handleSuggestPrompt" />

    <div
      v-if="aiStore.isSwitchingThread && !aiStore.displayMessages.length"
      class="flex gap-2.5"
    >
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="inline-flex items-center gap-2 rounded-field bg-base-200 px-3 py-2">
          <span class="loading loading-dots loading-sm text-base-content opacity-50"></span>
          <span class="text-xs text-base-content opacity-50">Loading session...</span>
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

    <!-- Streaming fallback when no preview message is available -->
    <div v-if="aiStore.isStreaming && !aiStore.streamingPreviewMessage" class="flex gap-2.5">
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="inline-flex items-center gap-2 rounded-field bg-base-200 px-3 py-2">
          <span class="loading loading-dots loading-sm text-base-content opacity-50"></span>
          <span class="text-xs text-base-content opacity-50">{{ streamingStatusLabel }} · {{ formattedElapsed }}</span>
        </div>
      </div>
    </div>

    <DomainReviewSurface />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'

defineProps<{ bottomPadding?: number }>()
import { useAiStore } from '@/ai/store/ai'
import ChatContextPill from './chat-area/ChatContextPill.vue'
import AgentEmptyState from './chat-area/AgentEmptyState.vue'
import AgentMessageBubble from './chat-area/AgentMessageBubble.vue'
import DomainReviewSurface from './domains/DomainReviewSurface.vue'

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
  clearIdleTimer()
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
    search_blocks_in_document: '在文档中搜索段落',
    search_sections_in_document: '在文档中搜索章节',
    search_in_directory: '在目录中搜索文档内容',
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

// ── Auto-scroll (sticky auto-follow) ──────────────────────────────────────
const messagesEl = ref<HTMLDivElement>()
const isAutoFollow = ref(true)
const pendingNewContent = ref(false)
let isProgrammaticScroll = false
let idleTimer: ReturnType<typeof setTimeout> | null = null

const STICK_THRESHOLD_PX = 40
const IDLE_RESUME_MS = 3000

function isNearBottom(): boolean {
  const el = messagesEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX
}

function scrollToBottom() {
  const el = messagesEl.value
  if (!el) return
  isProgrammaticScroll = true
  el.scrollTop = el.scrollHeight
  requestAnimationFrame(() => { isProgrammaticScroll = false })
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleResume() {
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (pendingNewContent.value) {
      isAutoFollow.value = true
      pendingNewContent.value = false
      scrollToBottom()
    }
  }, IDLE_RESUME_MS)
}

function onScroll() {
  if (isProgrammaticScroll) return
  if (isNearBottom()) {
    isAutoFollow.value = true
    pendingNewContent.value = false
    clearIdleTimer()
  } else {
    isAutoFollow.value = false
    scheduleIdleResume()
  }
}

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
      if (isAutoFollow.value) {
        scrollToBottom()
      } else {
        pendingNewContent.value = true
      }
    })
  }
)

watch(
  () => aiStore.activeThreadId,
  () => {
    clearIdleTimer()
    isAutoFollow.value = true
    pendingNewContent.value = false
    nextTick(() => scrollToBottom())
  }
)

onMounted(() => {
  nextTick(() => scrollToBottom())
})

async function handleResend(messageId: string, newContent: string) {
  const truncated = aiStore.truncateActiveThreadBeforeMessage(messageId)
  if (!truncated) return
  await aiStore.sendMessage(newContent)
}

function handleSuggestPrompt(prompt: string) {
  aiStore.setDraftInput(prompt)
}
</script>
