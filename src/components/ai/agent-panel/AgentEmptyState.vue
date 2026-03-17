<template>
  <div
    v-if="!aiStore.activeThread?.messages.length && !aiStore.isStreaming && !aiStore.isConnecting"
    class="flex flex-col items-center justify-center h-full text-center text-gray-400 py-8"
  >
    <template v-if="aiStore.currentAgentInitStatus === 'failed'">
      <div class="w-10 h-10 mb-3 rounded-full bg-red-50 flex items-center justify-center">
        <span class="text-red-400 text-lg">✗</span>
      </div>
      <p class="text-sm font-medium text-gray-500">连接失败</p>
      <p class="text-xs mt-1 text-gray-400">{{ aiStore.activeProviderConfig?.label }} 初始化未成功</p>
      <button
        @click="handleRetryInit"
        class="mt-3 px-3 py-1.5 text-xs bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
      >
        重新连接
      </button>
    </template>

    <template v-else>
      <IconBrain class="w-10 h-10 mb-3 text-gray-300" />
      <p class="text-sm font-medium text-gray-500">AI 写作助手</p>
      <p class="text-xs mt-1">
        {{ aiStore.activeProviderConfig ? '发送消息开始对话' : '请先在设置中配置 Provider' }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { IconBrain } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'

const aiStore = useAiStore()

function handleRetryInit() {
  const cfg = aiStore.activeProviderConfig
  if (cfg?.kind === 'agent') aiStore.initAgentProvider(cfg)
}
</script>
