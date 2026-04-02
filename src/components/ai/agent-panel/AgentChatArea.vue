<template>
  <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" :style="{ paddingBottom: (bottomPadding ?? 0) + 24 + 'px' }">

    <AgentEmptyState />

    <AgentMessageBubble
      v-for="msg in aiStore.activeThread?.messages ?? []"
      :key="msg.id"
      :message="msg"
      @resend="handleResend"
    />

    <!-- Streaming message -->
    <div v-if="aiStore.isStreaming" class="flex gap-2.5">
      <div class="flex-1 min-w-0 space-y-1.5">
        <AgentMessageBubble
          v-if="aiStore.streamingPreviewMessage"
          :message="aiStore.streamingPreviewMessage"
          :is-preview="true"
          :preview-status-text="`${streamingStatusLabel} · ${formattedElapsed}`"
          :show-preview-pulse="true"
        />

        <div
          v-else
          class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100"
        >
          <div class="flex items-center gap-0.5">
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
          </div>
          <span class="text-xs text-gray-500">{{ streamingStatusLabel }} · {{ formattedElapsed }}</span>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'

defineProps<{ bottomPadding?: number }>()
import { useAiStore } from '@/ai/store/ai'
import AgentEmptyState from './AgentEmptyState.vue'
import AgentMessageBubble from './AgentMessageBubble.vue'

const aiStore = useAiStore()

// ── Elapsed timer ─────────────────────────────────────────────────────────
const elapsedMs = ref(0)
let elapsedInterval: ReturnType<typeof setInterval> | null = null
let runStartedAt = 0

const isSessionActive = computed(() => aiStore.isStreaming || aiStore.isInterrupted)

watch(isSessionActive, active => {
  if (active) {
    if (!runStartedAt) {
      runStartedAt = Date.now()
      elapsedMs.value = 0
    }
    if (!elapsedInterval) {
      elapsedInterval = setInterval(() => {
        elapsedMs.value = Math.max(0, Date.now() - runStartedAt)
      }, 1000)
    }
  } else {
    if (elapsedInterval) {
      clearInterval(elapsedInterval)
      elapsedInterval = null
    }
    runStartedAt = 0
    elapsedMs.value = 0
  }
})

onUnmounted(() => {
  if (elapsedInterval) clearInterval(elapsedInterval)
})

const formattedElapsed = computed(() => {
  const totalSeconds = Math.floor(elapsedMs.value / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${minutes}m ${seconds}s`
})

function humanizeToolName(toolName: string | null | undefined): string {
  if (!toolName) return ''
  const map: Record<string, string> = {
    get_document_outline: '读取文档大纲',
    get_section: '读取章节',
    get_blocks: '读取段落',
    get_block_context: '读取上下文',
    search_document_sections: '搜索章节',
    search_workspace_documents: '搜索工作区',
    read_file: '读取文件',
    list_directory: '查看目录',
    ls: '查看目录',
    glob: '匹配文件',
    grep: '搜索内容',
    execute: '执行命令',
    write_file: '写入文件',
    edit_file: '编辑文件',
    list_story_assets: '列出故事资产',
    read_story_asset: '读取故事资产',
    save_story_asset: '保存故事资产',
  }
  return map[toolName] || toolName
}

const streamingStatusLabel = computed(() => {
  if (aiStore.streamingToolName) {
    return `正在调用工具 · ${humanizeToolName(aiStore.streamingToolName)}`
  }
  if (aiStore.streamingText || aiStore.streamingPreviewMessage?.toolCalls?.length) {
    return '正在整理结果'
  }
  if (aiStore.streamingThinkingText) {
    return '思考中'
  }
  return '正在处理'
})

// ── Auto-scroll ────────────────────────────────────────────────────────────
const messagesEl = ref<HTMLDivElement>()

watch(
  () => [aiStore.streamingText, aiStore.activeThread?.messages?.length],
  () => {
    nextTick(() => {
      if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    })
  }
)

async function handleResend(messageId: string, newContent: string) {
  const thread = aiStore.activeThread
  if (!thread) return
  const idx = (thread.messages ?? []).findIndex(m => m.id === messageId)
  if (idx < 0) return
  aiStore.updateThread({ ...thread, messages: (thread.messages ?? []).slice(0, idx) })
  await aiStore.sendMessage(newContent)
}
</script>
