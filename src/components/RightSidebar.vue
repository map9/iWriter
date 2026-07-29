<template>
  <div
    class="relative flex h-full shrink-0 flex-col overflow-hidden border-base-300 bg-base-100 min-w-80 border-l"
    :style="{ width: `${appStore.rightSidebarWidth}px` }"
  >
    <!-- Resizable handle on left edge -->
    <div
      class="absolute top-0 z-10 h-full w-1 cursor-ew-resize bg-transparent transition-colors hover:bg-primary left-0"
      @mousedown="startResize"
    ></div>

    <AgentPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import AgentPanel from './ai/AgentPanel.vue'

const appStore = useAppStore()
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

function startResize(event: MouseEvent) {
  isResizing.value = true
  startX.value = event.clientX
  startWidth.value = appStore.rightSidebarWidth

  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)

  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ew-resize'
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value) return

  // Right sidebar grows leftward: dragging left increases width
  const deltaX = startX.value - event.clientX
  const newWidth = startWidth.value + deltaX

  if (newWidth > 50) {
    appStore.setRightSidebarWidth(newWidth)
    if (!appStore.isRightSidebarVisible) {
      stopResize()
    }
  }
}

function stopResize() {
  isResizing.value = false

  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)

  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>
