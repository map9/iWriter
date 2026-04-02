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

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import { useAppStore } from '@/stores/app'
import AgentHeader from './agent-panel/AgentHeader.vue'
import AgentHistoryPanel from './agent-panel/AgentHistoryPanel.vue'
import AgentChatArea from './agent-panel/AgentChatArea.vue'
import AgentInputArea from './agent-panel/input/AgentInputArea.vue'
import ProviderSettings from './ProviderSettings.vue'
import type { SnapshotRequestEvent } from '@/ai/ipc'
import { buildSerializedSnapshot } from '@/ai/snapshot/SnapshotSerializer'

const aiStore = useAiStore()
const appStore = useAppStore()

const showHistory = ref(false)
const showSettings = ref(!aiStore.settings.providerConfigs.length)

const inputAreaRef = ref<HTMLElement | null>(null)
const inputAreaHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

const providerSettingsRef = ref<InstanceType<typeof ProviderSettings> | null>(null)
const settingsSubView = ref<'main' | 'configure'>('main')
const settingsSubTitle = ref('AI 配置')

function onSettingsViewChange(info: { view: 'main' | 'configure'; title: string }) {
  settingsSubView.value = info.view
  settingsSubTitle.value = info.title
}

watch(showSettings, (val) => {
  if (!val) {
    settingsSubView.value = 'main'
    settingsSubTitle.value = 'AI 配置'
  }
})

const headerTitle = computed(() => {
  if (showHistory.value) return '历史会话'
  if (showSettings.value) return settingsSubTitle.value
  const thread = aiStore.activeThread
  if (!thread || !thread.messages?.length) return '新会话'
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
  resizeObserver = new ResizeObserver(entries => {
    inputAreaHeight.value = entries[0]?.contentRect.height ?? 0
  })

  // Register IPC listeners for main-process AgentEngine
  aiStore.init()

  // Handle snapshot requests from main process document tools
  window.electronAPI.onAiRequestSnapshot?.(async (req: SnapshotRequestEvent) => {
    type TipTapEditor = import('@tiptap/core').Editor
    let editor: TipTapEditor | null = null
    let editorFilePath: string | null = null

    if (!req.filePath) {
      // No file_path → use active tab
      const activeTab = appStore.activeTab
      editor = activeTab?.editorInstance as TipTapEditor | null ?? null
      editorFilePath = activeTab?.path ?? null
    } else {
      // file_path provided → look for it across all open tabs
      const target = req.filePath.replace(/\\/g, '/').toLowerCase()
      const matchingTab = appStore.tabs.find(tab => {
        const tabPath = tab.path?.replace(/\\/g, '/').toLowerCase()
        return tabPath === target
      })
      if (matchingTab) {
        editor = matchingTab.editorInstance as TipTapEditor | null ?? null
        editorFilePath = matchingTab.path ?? null
      }
      // If no matching tab, editor stays null → buildSerializedSnapshot loads from disk
    }

    const snapshot = await buildSerializedSnapshot(
      req.filePath,
      editor,
      editorFilePath,
      null
    )
    window.electronAPI.aiSnapshotResponse?.({
      requestId: req.requestId,
      filePath: req.filePath,
      snapshot,
    })
  })
})

watch(inputAreaRef, el => {
  resizeObserver?.disconnect()
  if (el) resizeObserver?.observe(el)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  aiStore.teardown()
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
