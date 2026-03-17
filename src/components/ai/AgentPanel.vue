<template>
  <div class="sidebar-content flex flex-col h-full relative">

    <AgentHeader
      :history-active="showHistory"
      :settings-active="showSettings"
      @new-thread="aiStore.createNewThread()"
      @toggle-history="showHistory = !showHistory; showSettings = false"
      @toggle-settings="showSettings = !showSettings; showHistory = false"
      @close="appStore.toggleRightSidebar()"
    />

    <div v-if="showSettings" class="flex-1 overflow-hidden min-h-0">
      <ProviderSettings @close="showSettings = false" />
    </div>

    <AgentHistoryPanel
      v-else-if="showHistory"
      @select="selectThread"
    />

    <template v-else>
      <AgentChatArea />
      <QuickActions :disabled="aiStore.isStreaming" />
      <AgentInputArea />
    </template>

    <AgentPermissionDialog />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAiStore } from '@/stores/ai'
import { useAppStore } from '@/stores/app'
import AgentHeader from './agent-panel/AgentHeader.vue'
import AgentHistoryPanel from './agent-panel/AgentHistoryPanel.vue'
import AgentChatArea from './agent-panel/AgentChatArea.vue'
import AgentPermissionDialog from './agent-panel/AgentPermissionDialog.vue'
import AgentInputArea from './agent-panel/input/AgentInputArea.vue'
import ProviderSettings from './ProviderSettings.vue'
import QuickActions from './QuickActions.vue'

const aiStore = useAiStore()
const appStore = useAppStore()

const showHistory = ref(false)
const showSettings = ref(!aiStore.settings.providerConfigs.length)

onMounted(() => {
  const cfg = aiStore.activeProviderConfig
  if (cfg?.kind === 'agent' && aiStore.currentAgentInitStatus === 'idle') {
    aiStore.initAgentProvider(cfg)
  }
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
