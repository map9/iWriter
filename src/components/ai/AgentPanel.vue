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
      <AgentChatArea class="flex-1" :bottom-padding="chatBottomPadding" />
      <div
        v-if="aiStore.isStreaming && streamingTaskPlan?.items?.length"
        ref="taskPlanRef"
        class="absolute left-3 right-3 z-10"
        :style="{ bottom: `${inputAreaHeight + 2}px` }"
      >
        <TaskPlanCard
          :items="streamingTaskPlan.items"
          :is-preview="true"
        />
      </div>
      <div ref="inputAreaRef" class="absolute bottom-0 left-0 right-0 z-10">
        <AgentInputArea />
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/ai/store/ai'
import { useAppStore } from '@/stores/app'
import AgentHeader from './agent-panel/AgentHeader.vue'
import AgentHistoryPanel from './agent-panel/AgentHistoryPanel.vue'
import AgentChatArea from './agent-panel/AgentChatArea.vue'
import TaskPlanCard from './agent-panel/TaskPlanCard.vue'
import AgentInputArea from './agent-panel/AgentInputArea.vue'

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
const inputAreaHeight = ref(0)
const taskPlanRef = ref<HTMLElement | null>(null)
const taskPlanHeight = ref(0)
let resizeObserver: ResizeObserver | null = null
let taskPlanResizeObserver: ResizeObserver | null = null

const showHistory = computed(() => persistedPanelUi.view === 'history')

const headerTitle = computed(() => {
  if (showHistory.value) return t('agentPanel.panel.historyTitle')
  const thread = aiStore.activeThread
  if (!thread || !thread.messages?.length) return t('agentPanel.panel.newThreadTitle')
  return thread.title
})

const streamingTaskPlan = computed(() => aiStore.streamingPreviewMessage?.taskPlan)

const showBackButton = computed(() => showHistory.value)
const chatBottomPadding = computed(() => inputAreaHeight.value + taskPlanHeight.value)

function handleHeaderBack() {
  persistedPanelUi.view = 'chat'
}

function toggleHistory() {
  persistedPanelUi.view = showHistory.value ? 'chat' : 'history'
}

function openSettings() {
  appStore.openPreferences('ai')
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

function stopActiveThreadIfNeeded() {
  if (aiStore.isStreaming || aiStore.isInterrupted) {
    aiStore.cancelStreaming()
  }
}

function createNewThread() {
  if (!confirmThreadTermination(t('agentPanel.panel.actions.createNewThread'))) return
  stopActiveThreadIfNeeded()
  persistedPanelUi.view = 'chat'
  aiStore.createNewThread()
}

resizeObserver = new ResizeObserver(entries => {
  inputAreaHeight.value = entries[0]?.contentRect.height ?? 0
})

taskPlanResizeObserver = new ResizeObserver(entries => {
  taskPlanHeight.value = entries[0]?.contentRect.height ?? 0
})

watch(inputAreaRef, el => {
  resizeObserver?.disconnect()
  if (el) resizeObserver?.observe(el)
})

watch(taskPlanRef, el => {
  taskPlanResizeObserver?.disconnect()
  if (el) {
    taskPlanResizeObserver?.observe(el)
  } else {
    taskPlanHeight.value = 0
  }
})

async function selectThread(id: string) {
  if (id === aiStore.activeThreadId) {
    persistedPanelUi.view = 'chat'
    return
  }
  if (!confirmThreadTermination(t('agentPanel.panel.actions.switchThread'))) return
  stopActiveThreadIfNeeded()
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
  taskPlanResizeObserver?.disconnect()
})
</script>
