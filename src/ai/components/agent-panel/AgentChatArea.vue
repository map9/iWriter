<template>
  <div ref="messagesEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-base-100 px-3 pb-2 pt-1" :style="{ paddingBottom: (bottomPadding ?? 0) + 24 + 'px' }" @scroll="onScroll">
    <AgentEmptyState @suggest="handleSuggestPrompt" />

    <div
      v-if="aiStore.isSwitchingThread && !aiStore.displayMessages.length"
      class="flex gap-2.5"
    >
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="inline-flex items-center gap-2 rounded-field bg-base-200 px-3 py-2">
          <span class="loading loading-dots loading-sm text-base-content/50"></span>
          <span class="text-xs text-base-content/50">{{ t('agentPanel.chatArea.loadingSession') }}</span>
        </div>
      </div>
    </div>

    <template v-for="entry in aiStore.displayMessages" :key="entry.key">
      <ContextCompressionCard
        v-if="entry.kind === 'context-compressed'"
        :event="entry.event"
        :show-timestamp="true"
      />
      <AgentMessageBubble
        v-else
        :message="entry.message"
        :is-preview="entry.isPreview"
        :preview-status-text="entry.isPreview ? (aiStore.isInterrupted ? streamingStatusLabel : `${streamingStatusLabel} · ${formattedElapsed}`) : ''"
        :show-preview-pulse="!!entry.isPreview && !aiStore.isInterrupted"
        @resend="handleResend"
      />
    </template>

    <!-- Streaming/interrupted fallback when no preview message is available -->
    <div v-if="(aiStore.isStreaming || aiStore.isInterrupted) && !aiStore.streamingPreviewMessage" class="flex gap-2.5">
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="inline-flex items-center gap-2 rounded-field bg-base-200 px-3 py-2">
          <span v-if="!aiStore.isInterrupted" class="loading loading-dots loading-sm text-base-content/50"></span>
          <span class="text-xs text-base-content/50">
            {{ streamingStatusLabel }}<template v-if="!aiStore.isInterrupted"> · {{ formattedElapsed }}</template>
          </span>
        </div>
      </div>
    </div>

    <DomainReviewSurface />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ bottomPadding?: number }>()
const emit = defineEmits<{
  followStateChange: [state: ScrollFollowState]
}>()
import { useAiStore } from '@/ai/state/aiStore'
import AgentEmptyState from './chat-area/AgentEmptyState.vue'
import AgentMessageBubble from './chat-area/AgentMessageBubble.vue'
import DomainReviewSurface from './domains/DomainReviewSurface.vue'
import ContextCompressionCard from './chat-area/views/ContextCompressionCard.vue'

const aiStore = useAiStore()
const { t } = useI18n()

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
        if (aiStore.isInterrupted) return
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
  const key = `agentPanel.chatArea.toolNames.${toolName}`
  const translated = t(key)
  return translated === key ? toolName : translated
}

const streamingStatusLabel = computed(() => {
  if (aiStore.isInterrupted) {
    return t('agentPanel.panel.waitingApproval')
  }
  if (aiStore.liveTurnState === 'resuming') {
    return t('agentPanel.chatArea.status.resuming')
  }
  if (aiStore.streamingToolName) {
    return t('agentPanel.chatArea.status.callingTool', { tool: humanizeToolName(aiStore.streamingToolName) })
  }
  if (aiStore.streamingText || aiStore.streamingPreviewMessage?.toolCalls?.length) {
    return t('agentPanel.chatArea.status.organizingResult')
  }
  if (aiStore.streamingThinkingText) {
    return t('agentPanel.chatArea.status.thinking')
  }
  return t('agentPanel.chatArea.status.processing')
})

// ── Auto-scroll (sticky auto-follow) ──────────────────────────────────────
const messagesEl = ref<HTMLDivElement>()
type ScrollFollowState = 'following' | 'soft-paused' | 'detached'

const followState = ref<ScrollFollowState>('following')
let isProgrammaticScroll = false
let idleTimer: ReturnType<typeof setTimeout> | null = null

const STICK_THRESHOLD_PX = 40
const SOFT_PAUSE_THRESHOLD_PX = 200
const IDLE_RESUME_MS = 5000

function distanceFromBottom(): number {
  const el = messagesEl.value
  if (!el) return 0
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)
}

function setFollowState(state: ScrollFollowState) {
  if (followState.value === state) return
  followState.value = state
  emit('followStateChange', state)
}

function scrollToBottom() {
  const el = messagesEl.value
  if (!el) return
  isProgrammaticScroll = true
  el.scrollTop = el.scrollHeight
  requestAnimationFrame(() => { isProgrammaticScroll = false })
}

function scrollToTop() {
  const el = messagesEl.value
  if (!el) return
  isProgrammaticScroll = true
  el.scrollTop = 0
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
    if (followState.value !== 'soft-paused') return
    setFollowState('following')
    scrollToBottom()
  }, IDLE_RESUME_MS)
}

function onScroll() {
  if (isProgrammaticScroll) return
  const distance = distanceFromBottom()
  if (distance <= STICK_THRESHOLD_PX) {
    clearIdleTimer()
    setFollowState('following')
  } else if (isSessionActive.value && distance <= SOFT_PAUSE_THRESHOLD_PX) {
    setFollowState('soft-paused')
    scheduleIdleResume()
  } else {
    clearIdleTimer()
    setFollowState('detached')
  }
}

function scrollToLatest() {
  clearIdleTimer()
  setFollowState('following')
  scrollToBottom()
}

function resetScrollForActiveThread() {
  clearIdleTimer()
  followState.value = 'following'
  emit('followStateChange', 'following')
  nextTick(() => {
    if (aiStore.isActiveThreadDraft) {
      scrollToTop()
      return
    }
    scrollToBottom()
  })
}

defineExpose({ scrollToLatest })

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
      if (followState.value === 'following') {
        scrollToBottom()
      }
    })
  }
)

watch(
  () => aiStore.activeThreadId,
  resetScrollForActiveThread,
)

onMounted(() => {
  resetScrollForActiveThread()
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
