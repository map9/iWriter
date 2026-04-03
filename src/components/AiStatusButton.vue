<template>
  <div class="flex items-center pl-2 pr-3 flex-shrink-0 no-drag">
    <button
      @click="appStore.toggleRightSidebar()"
      class="toolbar-button relative group"
      :title="robotButtonTitle"
    >
      <div
        v-if="displayMode === 'running'"
        class="blob absolute left-1/2 top-1/2"
      />

      <IconRobot class="icon-base relative z-10" :class="{
        'text-accent-primary': displayMode === 'open',
        'text-white/70': displayMode === 'running',
        'group-hover:text-accent-primary': displayMode === 'running',
        'text-status-warning': displayMode === 'waiting',
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

const appStore = useAppStore()
const aiStore = useAiStore()

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
  if (appStore.isRightSidebarVisible) return '关闭 AI StoryMate Chat'
  if (closedStatus.value === 'waiting') return 'AI StoryMate Chat：等待你确认修改，点击打开'
  if (closedStatus.value === 'running') return 'AI StoryMate Chat：正在处理，点击打开'
  return '打开 AI StoryMate Chat'
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
