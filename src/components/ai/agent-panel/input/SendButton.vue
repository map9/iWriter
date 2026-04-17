<template>
  <!-- Queued: waiting for agent init -->
  <button
    v-if="isPendingSend"
    @click="$emit('cancel-queued')"
    class="btn btn-sm btn-square rounded-field btn-warning"
    title="Message queued, waiting for agent initialization. Click to cancel."
  >
    <span class="icon-xs border-2 border-warning/40 border-t-warning rounded-full animate-spin inline-block" />
  </button>
  <!-- Streaming: stop button -->
  <button
    v-else-if="isStreaming"
    @click="$emit('stop')"
    class="btn btn-sm btn-square rounded-field btn-error"
    title="Stopping the response..."
  >
    <IconPlayerStop class="icon-xs" />
  </button>
  <!-- Normal send -->
  <button
    v-else
    @click="$emit('send')"
    :disabled="!canSend"
    class="btn btn-sm btn-square rounded-field btn-primary"
    title="Send Message"
  >
    <IconSend class="icon-xs" />
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
