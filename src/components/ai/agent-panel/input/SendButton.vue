<template>
  <!-- Queued: waiting for agent init -->
  <button
    v-if="isPendingSend"
    @click="$emit('cancel-queued')"
    class="p-1.5 rounded-md bg-status-warning/10 text-status-warning hover:bg-status-warning/20 transition-colors flex-shrink-0"
    title="等待初始化完成后发送，点击取消"
  >
    <span class="w-4 h-4 border-2 border-status-warning/40 border-t-status-warning rounded-full animate-spin inline-block" />
  </button>
  <!-- Streaming: stop button -->
  <button
    v-else-if="isStreaming"
    @click="$emit('stop')"
    class="p-1.5 rounded-md bg-status-error/10 text-status-error hover:bg-status-error/20 transition-colors flex-shrink-0"
    title="停止"
  >
    <IconPlayerStop class="w-4 h-4" />
  </button>
  <!-- Normal send -->
  <button
    v-else
    @click="$emit('send')"
    :disabled="!canSend"
    class="p-1.5 rounded-md transition-colors flex-shrink-0"
    :class="canSend ? 'bg-accent-primary text-white hover:bg-accent-primary/90 cursor-pointer' : 'bg-interactive-hover text-text-tertiary cursor-not-allowed'"
    title="发送"
  >
    <IconSend class="w-4 h-4" />
  </button>
</template>

<script setup lang="ts">
import { IconSend, IconPlayerStop } from '@tabler/icons-vue'

defineProps<{
  isPendingSend: boolean
  isStreaming: boolean
  canSend: boolean
}>()

defineEmits<{
  send: []
  stop: []
  'cancel-queued': []
}>()
</script>
