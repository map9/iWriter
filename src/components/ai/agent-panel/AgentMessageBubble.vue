<template>
  <div
    class="flex gap-2.5 min-w-0"
    :class="{ 'flex-row-reverse': message.role === 'user' }"
  >
    <!-- Avatar -->
    <div class="flex-shrink-0 mt-0.5">
      <div
        class="w-7 h-7 rounded-full flex items-center justify-center text-white"
        :class="message.role === 'user' ? 'bg-primary-500' : 'bg-gray-500'"
      >
        <IconUser v-if="message.role === 'user'" class="w-4 h-4" />
        <IconRobot v-else class="w-4 h-4" />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0" :class="{ 'items-end flex flex-col': message.role === 'user' }">
      <div
        class="inline-block px-3 py-2 rounded-lg text-sm max-w-full text-left break-words"
        :class="message.role === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-900'"
      >
        <div
          v-if="message.content"
          class="prose prose-sm max-w-none"
          :class="message.role === 'user' ? 'prose-invert' : ''"
          v-html="renderMarkdown(message.content)"
        />
      </div>

      <!-- Tool calls -->
      <div v-if="message.toolCalls?.length" class="mt-1.5 space-y-1 w-full">
        <ToolCallView
          v-for="tc in message.toolCalls"
          :key="tc.id"
          :tool-name="tc.name"
          :result="message.toolResults?.find(r => r.toolCallId === tc.id)?.content"
          :is-error="message.toolResults?.find(r => r.toolCallId === tc.id)?.isError"
        />
      </div>

      <!-- Edit proposals -->
      <div v-if="message.editProposals?.length" class="mt-1.5 space-y-2 w-full">
        <EditProposalView
          v-for="ep in message.editProposals.filter(p => p.status === 'pending')"
          :key="ep.id"
          :proposal="ep"
          @approve="aiStore.approveEditProposal"
          @reject="aiStore.rejectEditProposal"
        />
      </div>

      <div class="text-xs text-gray-400 mt-0.5">{{ formatTime(message.timestamp) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import { IconUser, IconRobot } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'
import type { ThreadMessage } from '@/types/ai'
import ToolCallView from '../ToolCallView.vue'
import EditProposalView from '../EditProposalView.vue'

defineProps<{ message: ThreadMessage }>()

const aiStore = useAiStore()

function renderMarkdown(text: string): string {
  try { return marked.parse(text, { async: false }) as string }
  catch { return text }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>
