<template>
  <div class="no-drag flex shrink-0 items-center">
    <button
      @click="appStore.toggleRightSidebar()"
      class="btn btn-ghost btn-square btn-sm relative group"
      :title="robotButtonTitle"
    >
      <div
        v-if="displayMode === 'running'"
        class="blob absolute left-1/2 top-1/2"
      />

      <IconRobot class="relative z-10 icon-sm" :class="{
        'text-primary': displayMode === 'open',
        'text-base-content/70': displayMode === 'running',
        'group-hover:text-primary': displayMode === 'running',
        'text-warning': displayMode === 'waiting',
        'animate-bounce': displayMode === 'waiting',
      }" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAiStore } from '@/ai/store/ai'
import { IconRobot } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'

const appStore = useAppStore()
const aiStore = useAiStore()
const { t } = useI18n()

const closedStatus = computed<'idle' | 'running' | 'waiting'>(() => {
  if (aiStore.isInterrupted) return 'waiting'
  if (aiStore.isStreaming || aiStore.liveTurnState === 'resuming') return 'running'
  return 'idle'
})

const displayMode = computed<'open' | 'idle' | 'running' | 'waiting'>(() => {
  if (appStore.isRightSidebarVisible) return 'open'
  return closedStatus.value
})

const robotButtonTitle = computed(() => {
  if (appStore.isRightSidebarVisible) return t('agentPanel.statusButton.close')
  if (closedStatus.value === 'waiting') return t('agentPanel.statusButton.waiting')
  if (closedStatus.value === 'running') return t('agentPanel.statusButton.running')
  return t('agentPanel.statusButton.open')
})
</script>

<style scoped>
.blob {
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
  opacity: 1;
  filter: blur(0.5px);
  animation: blob 4.2s infinite ease-in-out, colorShift 5.8s infinite linear;
}

@keyframes blob {
  0%  { border-radius: 70% 30% 68% 32% / 60% 25% 75% 40%; }
  20% { border-radius: 52% 48% 51% 49% / 70% 53% 47% 30%; }
  40% { border-radius: 35% 65% 27% 73% / 46% 63% 37% 54%; }
  60% { border-radius: 57% 43% 24% 76% / 62% 79% 21% 38%; }
  80% { border-radius: 65% 35% 61% 39% / 75% 56% 55% 35%; }
  100%{ border-radius: 70% 30% 68% 32% / 60% 25% 75% 40%; }
}

@keyframes colorShift {
  0%  { background: linear-gradient(30deg, oklch(0.4 0.4 300) 10%, oklch(0.7 0.4 330)); }
  33% { background: linear-gradient(30deg, oklch(0.4 0.4 330) 10%, oklch(0.7 0.4 300)); }
  66% { background: linear-gradient(30deg, oklch(0.4 0.4 360) 10%, oklch(0.7 0.4 270)); }
  100%{ background: linear-gradient(30deg, oklch(0.4 0.4 390) 10%, oklch(0.7 0.4 240)); }
}

.group:hover .blob {
  animation: none;
  background: none;
  opacity: 1;
  filter: none;
}
</style>
