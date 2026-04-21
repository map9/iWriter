<template>
  <!-- Queued: waiting for agent init -->
  <button
    v-if="isPendingSend"
    @click="$emit('cancel-queued')"
    class="btn btn-sm btn-square rounded-field btn-warning"
    :title="t('agentPanel.sendButton.pendingTitle')"
  >
    <span class="icon-xs border-2 border-warning/40 border-t-warning rounded-full animate-spin inline-block" />
  </button>
  <!-- Streaming: stop button -->
  <button
    v-else-if="isStreaming"
    @click="$emit('stop')"
    class="btn btn-sm btn-square rounded-field btn-error"
    :title="t('agentPanel.sendButton.stoppingTitle')"
  >
    <IconPlayerStop class="icon-xs" />
  </button>
  <!-- Normal send -->
  <button
    v-else
    @click="$emit('send')"
    :disabled="!canSend"
    class="btn btn-sm btn-square rounded-field btn-primary"
    :title="t('agentPanel.sendButton.sendTitle')"
  >
    <IconSend class="icon-xs" />
  </button>
</template>

<script setup lang="ts">
import { IconSend, IconPlayerStop } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()
</script>
