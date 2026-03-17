<template>
  <!-- Queued: waiting for agent init -->
  <button
    v-if="isPendingSend"
    @click="$emit('cancel-queued')"
    class="p-1.5 rounded-md bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors flex-shrink-0"
    title="等待初始化完成后发送，点击取消"
  >
    <span class="w-4 h-4 border-2 border-amber-400 border-t-amber-600 rounded-full animate-spin inline-block" />
  </button>
  <!-- Streaming: stop button -->
  <button
    v-else-if="isStreaming"
    @click="$emit('stop')"
    class="p-1.5 rounded-md bg-red-100 text-red-600 hover:bg-red-200 transition-colors flex-shrink-0"
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
    :class="canSend ? 'bg-primary-500 text-white hover:bg-primary-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
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
