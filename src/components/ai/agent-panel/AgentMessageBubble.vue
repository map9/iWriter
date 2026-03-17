<template>
  <div
    class="flex gap-2.5 min-w-0"
    :class="{ 'flex-row-reverse': message.role === 'user' }"
  >
    <!-- Avatar -->
    <div class="flex-shrink-0 mt-0.5">
      <div
        class="w-7 h-7 rounded-full flex items-center justify-center text-white"
        :class="message.role === 'user' ? 'bg-accent-primary' : 'bg-gray-500'"
      >
        <IconUser v-if="message.role === 'user'" class="w-4 h-4" />
        <IconRobot v-else class="w-4 h-4" />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0" :class="{ 'items-end flex flex-col': message.role === 'user' }">

      <!-- Thinking content (collapsible, assistant only) -->
      <div
        v-if="message.thinkingContent"
        class="mb-1.5 w-full border border-purple-200 bg-purple-50 rounded-lg overflow-hidden text-xs"
      >
        <button
          class="w-full flex items-center gap-1.5 px-3 py-1.5 text-purple-700 font-medium text-left hover:bg-purple-100 transition-colors"
          @click="thinkingExpanded = !thinkingExpanded"
        >
          <span>💭</span>
          <span>思考过程</span>
          <span class="ml-auto">{{ thinkingExpanded ? '▲' : '▼' }}</span>
        </button>
        <div v-if="thinkingExpanded" class="px-3 py-2 text-purple-800 whitespace-pre-wrap leading-relaxed border-t border-purple-200">
          {{ message.thinkingContent }}
        </div>
      </div>

      <!-- Plan entries (ACP-only, collapsible) -->
      <div
        v-if="message.planEntries?.length"
        class="mb-1.5 w-full border border-blue-200 bg-blue-50 rounded-lg overflow-hidden text-xs"
      >
        <div class="px-3 py-1.5 text-blue-700 font-medium">📋 执行计划</div>
        <div class="px-3 pb-2 space-y-1">
          <div
            v-for="(plan, idx) in message.planEntries"
            :key="idx"
            class="flex items-start gap-1.5 text-blue-800"
          >
            <span class="mt-0.5">{{ plan.status === 'completed' ? '✓' : plan.status === 'in_progress' ? '⟳' : '○' }}</span>
            <span>{{ plan.content }}</span>
          </div>
        </div>
      </div>

      <!-- Main content bubble — only render when there is text content -->
      <div
        v-if="message.content"
        class="inline-block rounded-lg text-sm max-w-full text-left break-words"
        :class="message.isError
          ? 'bg-red-50 border border-red-200 text-red-700'
          : message.role === 'user' ? 'px-3 py-2 bg-accent-primary text-white' : 'text-gray-900'"
      >
        <div
          class="prose prose-sm max-w-none"
          :class="message.isError ? 'prose-red' : message.role === 'user' ? 'prose-invert' : ''"
          v-html="renderMarkdown(message.content)"
        />
      </div>

      <!-- Tool calls: read tools shown individually; edit tools collapsed into one summary -->
      <div v-if="message.toolCalls?.length" class="space-y-1.5 w-full" :class="message.content ? 'mt-1.5' : ''">
        <ToolCallView v-for="tc in readToolCalls" :key="tc.id" :tool-call="tc" />
        <div
          v-if="editToolCalls.length"
          class="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-yellow-50 border border-yellow-200 text-yellow-800"
        >
          <span>✓</span>
          <span>✏️</span>
          <span class="font-medium">已提案 {{ editToolCalls.length }} 处修改建议</span>
        </div>
      </div>

      <div class="text-xs text-gray-400 mt-0.5">{{ formatTime(message.timestamp) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { marked } from 'marked'
import { IconUser, IconRobot } from '@tabler/icons-vue'
import type { ThreadMessage } from '@/types/ai'
import { BLOCK_EDIT_TOOLS } from '@/types/ai'
import ToolCallView from '../ToolCallView.vue'

const props = defineProps<{ message: ThreadMessage }>()

const thinkingExpanded = ref(false)

const readToolCalls = computed(() =>
  (props.message.toolCalls ?? []).filter(tc => !BLOCK_EDIT_TOOLS.has(tc.name))
)
const editToolCalls = computed(() =>
  (props.message.toolCalls ?? []).filter(tc => BLOCK_EDIT_TOOLS.has(tc.name))
)

function renderMarkdown(text: string): string {
  try { return marked.parse(text, { async: false }) as string }
  catch { return text }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>
