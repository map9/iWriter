<template>
  <!-- Streaming: stop button -->
  <button
    v-if="isStreaming"
    @click="$emit('stop')"
    class="btn btn-sm btn-square btn-error"
    :title="t('agentPanel.sendButton.stoppingTitle')"
  >
    <IconPlayerStop class="icon-xs" />
  </button>
  <!-- Normal send -->
  <button
    v-else
    @click="$emit('send')"
    :disabled="!canSend"
    class="btn btn-sm btn-square btn-primary"
    :title="t('agentPanel.sendButton.sendTitle')"
  >
    <IconSend class="icon-xs" />
  </button>
</template>

<script setup lang="ts">
import { IconSend, IconPlayerStop } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  isStreaming: boolean
  canSend: boolean
}>()

defineEmits<{
  send: []
  stop: []
}>()

const { t } = useI18n()
</script>
