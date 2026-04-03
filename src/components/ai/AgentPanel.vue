<template>
  <div class="sidebar-content flex flex-col h-full relative">

    <AgentHeader
      :history-active="showHistory"
      :settings-active="showSettings"
      :title="headerTitle"
      :show-back-button="showBackButton"
      @new-thread="createNewThread"
      @toggle-history="toggleHistory"
      @toggle-settings="toggleSettings"
      @back="handleHeaderBack"
    />

    <div v-if="showSettings" class="flex-1 overflow-hidden min-h-0">
      <ProviderSettings
        ref="providerSettingsRef"
        @view-change="onSettingsViewChange"
      />
    </div>

    <AgentHistoryPanel
      v-else-if="showHistory"
      @select="selectThread"
    />

    <template v-else>
      <AgentChatArea class="flex-1" :bottom-padding="inputAreaHeight" />
      <div ref="inputAreaRef" class="absolute bottom-0 left-0 right-0 z-10">
        <AgentInputArea />
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive, onUnmounted } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import AgentHeader from './agent-panel/AgentHeader.vue'
import AgentHistoryPanel from './agent-panel/AgentHistoryPanel.vue'
import AgentChatArea from './agent-panel/AgentChatArea.vue'
import AgentInputArea from './agent-panel/input/AgentInputArea.vue'
import ProviderSettings from './ProviderSettings.vue'

const PANEL_UI_STATE_KEY = 'iwriter-ai-panel-ui'

function loadPanelUiState(): {
  view: 'chat' | 'history' | 'settings'
  settingsSubView: 'main' | 'configure'
  settingsSubTitle: string
} {
  try {
    const raw = sessionStorage.getItem(PANEL_UI_STATE_KEY)
    if (!raw) {
      return { view: 'chat', settingsSubView: 'main', settingsSubTitle: 'AI 配置' }
    }
    const parsed = JSON.parse(raw) as Partial<{
      view: 'chat' | 'history' | 'settings'
      settingsSubView: 'main' | 'configure'
      settingsSubTitle: string
    }>
    return {
      view: parsed.view ?? 'chat',
      settingsSubView: parsed.settingsSubView ?? 'main',
      settingsSubTitle: parsed.settingsSubTitle ?? 'AI 配置',
    }
  } catch {
    return { view: 'chat', settingsSubView: 'main', settingsSubTitle: 'AI 配置' }
  }
}

const persistedPanelUi = reactive(loadPanelUiState())

const aiStore = useAiStore()

if (!aiStore.settings.providerConfigs.length) {
  persistedPanelUi.view = 'settings'
}

const inputAreaRef = ref<HTMLElement | null>(null)
const inputAreaHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

const providerSettingsRef = ref<InstanceType<typeof ProviderSettings> | null>(null)
const showHistory = computed(() => persistedPanelUi.view === 'history')
const showSettings = computed(() => persistedPanelUi.view === 'settings')

function onSettingsViewChange(info: { view: 'main' | 'configure'; title: string }) {
  persistedPanelUi.settingsSubView = info.view
  persistedPanelUi.settingsSubTitle = info.title
}

const headerTitle = computed(() => {
  if (showHistory.value) return '历史会话'
  if (showSettings.value) return persistedPanelUi.settingsSubTitle
  const thread = aiStore.activeThread
  if (!thread || !thread.messages?.length) return '新会话'
  return thread.title
})

const showBackButton = computed(() => showHistory.value || showSettings.value)

function handleHeaderBack() {
  if (showSettings.value && persistedPanelUi.settingsSubView === 'configure') {
    providerSettingsRef.value?.cancelForm()
  } else {
    persistedPanelUi.view = 'chat'
  }
}

function toggleHistory() {
  persistedPanelUi.view = showHistory.value ? 'chat' : 'history'
}

function toggleSettings() {
  persistedPanelUi.view = showSettings.value ? 'chat' : 'settings'
}

function createNewThread() {
  persistedPanelUi.view = 'chat'
  aiStore.createNewThread()
}

resizeObserver = new ResizeObserver(entries => {
  inputAreaHeight.value = entries[0]?.contentRect.height ?? 0
})

watch(inputAreaRef, el => {
  resizeObserver?.disconnect()
  if (el) resizeObserver?.observe(el)
})

async function selectThread(id: string) {
  const switched = await aiStore.selectThread(id)
  if (switched) {
    persistedPanelUi.view = 'chat'
  }
}

watch(
  () => aiStore.settings.providerConfigs.length,
  len => { if (len === 0) persistedPanelUi.view = 'settings' }
)

watch(
  persistedPanelUi,
  value => {
    sessionStorage.setItem(PANEL_UI_STATE_KEY, JSON.stringify(value))
  },
  { deep: true }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>
