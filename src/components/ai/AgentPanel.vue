<template>
  <div class="sidebar-content flex flex-col h-full relative">

    <AgentHeader
      :history-active="showHistory"
      :settings-active="showSettings"
      :title="headerTitle"
      :show-back-button="showBackButton"
      @new-thread="aiStore.createNewThread()"
      @toggle-history="showHistory = !showHistory; showSettings = false"
      @toggle-settings="showSettings = !showSettings; showHistory = false"
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

    <AgentPermissionDialog />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useAiStore } from '@/stores/ai'
import AgentHeader from './agent-panel/AgentHeader.vue'
import AgentHistoryPanel from './agent-panel/AgentHistoryPanel.vue'
import AgentChatArea from './agent-panel/AgentChatArea.vue'
import AgentPermissionDialog from './agent-panel/AgentPermissionDialog.vue'
import AgentInputArea from './agent-panel/input/AgentInputArea.vue'
import ProviderSettings from './ProviderSettings.vue'

const aiStore = useAiStore()

const showHistory = ref(false)
const showSettings = ref(!aiStore.settings.providerConfigs.length)

const inputAreaRef = ref<HTMLElement | null>(null)
const inputAreaHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

const providerSettingsRef = ref<InstanceType<typeof ProviderSettings> | null>(null)
const settingsSubView = ref<'main' | 'configure'>('main')
const settingsSubTitle = ref('AI Provider 配置')

function onSettingsViewChange(info: { view: 'main' | 'configure'; title: string }) {
  settingsSubView.value = info.view
  settingsSubTitle.value = info.title
}

watch(showSettings, (val) => {
  if (!val) {
    settingsSubView.value = 'main'
    settingsSubTitle.value = 'AI Provider 配置'
  }
})

const headerTitle = computed(() => {
  if (showHistory.value) return '历史会话'
  if (showSettings.value) return settingsSubTitle.value
  const thread = aiStore.activeThread
  if (!thread || thread.messages.length === 0) return '新会话'
  return thread.title
})

const showBackButton = computed(() => showHistory.value || showSettings.value)

function handleHeaderBack() {
  if (showSettings.value && settingsSubView.value === 'configure') {
    providerSettingsRef.value?.cancelForm()
  } else {
    showHistory.value = false
    showSettings.value = false
  }
}

onMounted(() => {
  const cfg = aiStore.activeProviderConfig
  if (cfg?.kind === 'agent' && aiStore.currentAgentInitStatus === 'idle') {
    aiStore.initAgentProvider(cfg)
  }

  resizeObserver = new ResizeObserver(entries => {
    inputAreaHeight.value = entries[0]?.contentRect.height ?? 0
  })
})

watch(inputAreaRef, el => {
  resizeObserver?.disconnect()
  if (el) resizeObserver?.observe(el)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

function selectThread(id: string) {
  aiStore.selectThread(id)
  showHistory.value = false
}

watch(
  () => aiStore.settings.providerConfigs.length,
  len => { if (len === 0) showSettings.value = true }
)
</script>
