<template>
  <div class="p-3 bg-white border border-gray-200 rounded-lg mx-3 my-2 shadow-sm">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold text-gray-700 truncate">
        正在连接 {{ agentName }}…
      </span>
      <span class="text-[10px] font-mono text-gray-400 flex-shrink-0 ml-2">
        {{ formattedTime }}
      </span>
    </div>

    <!-- Phase status -->
    <div class="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded mb-2">
      <span class="text-sm">{{ phaseIcon }}</span>
      <span class="text-xs text-gray-600">{{ phaseText }}</span>
      <span class="ml-auto w-3 h-3 border border-gray-300 border-t-primary-500 rounded-full animate-spin flex-shrink-0" />
    </div>

    <!-- First-run hint -->
    <div v-if="isLongWait && !showDetails" class="text-[10px] text-gray-400 italic mb-2 px-1">
      首次运行可能需要较长时间（安装依赖、下载工具等）
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <button
        @click="$emit('toggleDetails')"
        class="flex-1 px-2 py-1 text-[10px] text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
      >
        {{ showDetails ? '隐藏详情 ▲' : '显示详情 ▼' }}
      </button>
      <button
        @click="$emit('cancel')"
        class="flex-1 px-2 py-1 text-[10px] text-gray-500 border border-gray-200 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-colors"
      >
        取消
      </button>
    </div>

    <!-- Log details -->
    <div v-if="showDetails" class="mt-2 border border-gray-200 rounded overflow-hidden">
      <div class="px-2 py-1 bg-gray-100 text-[10px] font-semibold text-gray-500 border-b border-gray-200">
        输出
      </div>
      <div class="max-h-32 overflow-y-auto p-1.5 bg-gray-950 font-mono text-[10px]">
        <div
          v-for="(log, i) in logs.slice(-50)"
          :key="i"
          class="text-gray-300 whitespace-pre-wrap break-all leading-relaxed"
        >
          {{ log }}
        </div>
        <div v-if="!logs.length" class="text-gray-500 italic">等待输出…</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  agentName: string
  phase: string
  logs: string[]
  elapsedSeconds: number
  showDetails: boolean
}>()

defineEmits<{
  cancel: []
  toggleDetails: []
}>()

const phaseIcon = computed(() => {
  switch (props.phase) {
    case 'starting':     return '🚀'
    case 'downloading':  return '📥'
    case 'installing':   return '📦'
    case 'building':     return '🔨'
    case 'initializing': return '⚙️'
    case 'connecting':   return '🔗'
    default:             return '⏳'
  }
})

const phaseText = computed(() => {
  switch (props.phase) {
    case 'starting':     return '正在启动进程…'
    case 'downloading':  return '正在下载依赖包…'
    case 'installing':   return '正在安装依赖…'
    case 'building':     return '正在编译构建…'
    case 'initializing': return '正在初始化 Agent…'
    case 'connecting':   return '正在连接 Agent…'
    default:             return '请稍候…'
  }
})

const formattedTime = computed(() => {
  const mins = Math.floor(props.elapsedSeconds / 60)
  const secs = props.elapsedSeconds % 60
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
})

const isLongWait = computed(() => props.elapsedSeconds > 10)
</script>
