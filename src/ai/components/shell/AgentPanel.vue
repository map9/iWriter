<template>
  <div class="flex flex-1 flex-col h-full relative overflow-hidden">

    <AgentHeader
      :history-active="showHistory"
      :title="headerTitle"
      :show-back-button="showBackButton"
      @new-thread="createNewThread"
      @toggle-history="toggleHistory"
      @open-settings="openSettings"
      @back="handleHeaderBack"
    />

    <AgentHistoryPanel
      v-if="showHistory"
      @select="selectThread"
    />

    <template v-else>
      <AgentChatArea
        ref="chatAreaRef"
        class="flex-1"
        :bottom-padding="chatBottomPadding"
        @follow-state-change="handleFollowStateChange"
      />
      <div
        v-if="showBottomOverlay"
        ref="bottomOverlayRef"
        class="absolute left-3 right-3 z-10 flex flex-col gap-2"
        :style="{ bottom: `${inputAreaHeight + 2}px` }"
      >
        <TaskPlanCard
          v-if="showTaskPlan"
          :items="streamingTaskPlan?.items ?? []"
          :is-preview="true"
        />
        <PendingCommandList
          v-if="showPendingCommands"
          :commands="aiStore.pendingCommands"
        />
      </div>
      <button
        v-if="showScrollToLatest"
        type="button"
        class="btn btn-sm absolute left-1/2 z-20 h-7 min-h-0 -translate-x-1/2 gap-1 rounded-full border-base-300 bg-base-100 px-2.5 text-xs font-normal text-base-content shadow-md hover:bg-base-200"
        :style="{ bottom: `${scrollToLatestBottom}px` }"
        :aria-label="t('agentPanel.chatArea.scrollToLatest')"
        :title="t('agentPanel.chatArea.scrollToLatest')"
        @click="scrollToLatest"
      >
        <IconArrowDown class="icon-2xs shrink-0" />
        <span>{{ t('agentPanel.chatArea.scrollToLatest') }}</span>
      </button>
      <div ref="inputAreaRef" class="absolute bottom-0 left-0 right-0 z-10">
        <AgentInputArea />
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconArrowDown } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/state/aiStore'
import { useAppStore } from '@/stores/app'
import AgentHeader from '../agent-panel/AgentHeader.vue'
import AgentHistoryPanel from '../agent-panel/AgentHistoryPanel.vue'
import AgentChatArea from '../agent-panel/AgentChatArea.vue'
import TaskPlanCard from '../agent-panel/TaskPlanCard.vue'
import PendingCommandList from '../agent-panel/PendingCommandList.vue'
import AgentInputArea from '../agent-panel/AgentInputArea.vue'
import { formatThreadHeaderTitle } from '@/ai/thread/threadPresentation'
import { resolveAgentDomain } from '@shared/ai/contracts'

const PANEL_UI_STATE_KEY = 'iwriter-ai-panel-ui'

function loadPanelUiState(): {
  view: 'chat' | 'history'
} {
  try {
    const raw = sessionStorage.getItem(PANEL_UI_STATE_KEY)
    if (!raw) {
      return { view: 'chat' }
    }
    const parsed = JSON.parse(raw) as Partial<{
      view: 'chat' | 'history'
    }>
    return {
      view: parsed.view ?? 'chat',
    }
  } catch {
    return { view: 'chat' }
  }
}

const persistedPanelUi = reactive(loadPanelUiState())

const aiStore = useAiStore()
const appStore = useAppStore()
const { t } = useI18n()

const inputAreaRef = ref<HTMLElement | null>(null)
const chatAreaRef = ref<{ scrollToLatest: () => void } | null>(null)
const inputAreaHeight = ref(0)
const bottomOverlayRef = ref<HTMLElement | null>(null)
const bottomOverlayHeight = ref(0)
let resizeObserver: ResizeObserver | null = null
let bottomOverlayResizeObserver: ResizeObserver | null = null

type ChatFollowState = 'following' | 'soft-paused' | 'detached'
const chatFollowState = ref<ChatFollowState>('following')

const showHistory = computed(() => persistedPanelUi.view === 'history')

const headerTitle = computed(() => {
  if (showHistory.value) return t('agentPanel.panel.historyTitle')
  const thread = aiStore.activeThread
  const originalTitle = thread?.title ?? t('agentPanel.panel.newThreadTitle')
  const domain = thread?.domain ?? resolveAgentDomain(aiStore.settings?.defaultMode ?? 'edit')
  const domainLabel = domain === 'creative'
    ? t('agentPanel.modePicker.options.creative')
    : t('agentPanel.modePicker.options.edit')
  return formatThreadHeaderTitle(domainLabel, originalTitle)
})

const streamingTaskPlan = computed(() => aiStore.streamingPreviewMessage?.taskPlan)
const showTaskPlan = computed(() => aiStore.isStreaming && !!streamingTaskPlan.value?.items?.length)
const showPendingCommands = computed(
  () => !aiStore.isInterrupted && aiStore.pendingCommands.length > 0,
)
const showBottomOverlay = computed(() => showTaskPlan.value || showPendingCommands.value)
const showScrollToLatest = computed(() => chatFollowState.value !== 'following')
const scrollToLatestBottom = computed(
  () => inputAreaHeight.value + bottomOverlayHeight.value + 10,
)

const showBackButton = computed(() => showHistory.value)
const chatBottomPadding = computed(() => inputAreaHeight.value + bottomOverlayHeight.value)

function handleHeaderBack() {
  persistedPanelUi.view = 'chat'
}

function toggleHistory() {
  persistedPanelUi.view = showHistory.value ? 'chat' : 'history'
}

function openSettings() {
  appStore.openPreferences('ai')
}

function handleFollowStateChange(state: ChatFollowState) {
  chatFollowState.value = state
}

function scrollToLatest() {
  chatAreaRef.value?.scrollToLatest()
}

function confirmThreadTermination(actionLabel: string): boolean {
  const activeThread = aiStore.activeThread
  if (!activeThread || aiStore.liveTurnThreadId !== activeThread.id) return true

  const statusText = aiStore.isInterrupted
    ? t('agentPanel.panel.waitingApproval')
    : aiStore.isStreaming
      ? t('agentPanel.panel.threadRunning')
      : ''

  if (!statusText) return true

  return confirm(t('agentPanel.panel.terminateConfirm', { status: statusText, action: actionLabel }))
}

async function stopActiveThreadIfNeeded(): Promise<boolean> {
  if (aiStore.isStreaming || aiStore.isInterrupted) {
    return aiStore.cancelStreaming()
  }
  return true
}

async function createNewThread() {
  if (!confirmThreadTermination(t('agentPanel.panel.actions.createNewThread'))) return
  if (!await stopActiveThreadIfNeeded()) return
  persistedPanelUi.view = 'chat'
  aiStore.createNewThread()
}

resizeObserver = new ResizeObserver(entries => {
  inputAreaHeight.value = entries[0]?.contentRect.height ?? 0
})

bottomOverlayResizeObserver = new ResizeObserver(entries => {
  bottomOverlayHeight.value = entries[0]?.contentRect.height ?? 0
})

watch(inputAreaRef, el => {
  resizeObserver?.disconnect()
  if (el) resizeObserver?.observe(el)
})

watch(bottomOverlayRef, el => {
  bottomOverlayResizeObserver?.disconnect()
  if (el) {
    bottomOverlayResizeObserver?.observe(el)
  } else {
    bottomOverlayHeight.value = 0
  }
})

async function selectThread(id: string) {
  if (id === aiStore.activeThreadId) {
    persistedPanelUi.view = 'chat'
    return
  }
  if (!confirmThreadTermination(t('agentPanel.panel.actions.switchThread'))) return
  if (!await stopActiveThreadIfNeeded()) return
  const switched = await aiStore.selectThread(id)
  if (switched) {
    persistedPanelUi.view = 'chat'
  }
}

watch(
  persistedPanelUi,
  value => {
    sessionStorage.setItem(PANEL_UI_STATE_KEY, JSON.stringify(value))
  },
  { deep: true }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  bottomOverlayResizeObserver?.disconnect()
})
</script>
