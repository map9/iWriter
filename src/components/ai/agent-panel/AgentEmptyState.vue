<template>
  <div
    v-if="!aiStore.activeThread?.messages?.length && !aiStore.isStreaming"
    class="flex flex-col items-center justify-center h-full text-center text-gray-400 py-8"
  >
    <IconBrain class="w-10 h-10 mb-3 text-gray-300" />
    <p class="text-sm font-medium text-gray-500">AI 写作助手</p>
    <p class="text-xs mt-1">
      {{ aiStore.activeProviderConfig ? '发送消息开始对话' : '请先在设置中配置 Provider' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { IconBrain } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'

const aiStore = useAiStore()
</script>
