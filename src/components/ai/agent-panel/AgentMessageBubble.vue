<template>
  <div
    v-if="shouldRenderMessage"
    class="flex min-w-0"
    :class="{ 'flex-row-reverse': message.role === 'user' }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Content -->
    <div class="flex-1 min-w-0" :class="{ 'items-end flex flex-col': message.role === 'user' }">

      <!-- ── USER MESSAGE BUBBLE ── -->

      <!-- Edit mode: input-area style row -->
      <div v-if="message.role === 'user' && message.content && isEditing" class="flex items-center gap-2 w-full">
        <button
          class="flex-shrink-0 self-end p-1.5 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          title="取消"
          @click="isEditing = false"
        ><IconX class="w-4 h-4" /></button>
        <textarea
          ref="editTextareaEl"
          v-model="editText"
          class="flex-1 px-2 py-1.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent overflow-hidden"
          rows="3"
          @keydown.enter.exact.prevent="submitEdit"
          @keydown.shift.enter.exact="() => {}"
          @keydown.escape="isEditing = false"
        />
        <button
          :disabled="!editText.trim()"
          class="flex-shrink-0 self-end p-1.5 flex items-center justify-center rounded-md bg-accent-primary text-white hover:bg-accent-primary/90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          title="发送"
          @click="submitEdit"
        ><IconSend class="w-4 h-4" /></button>
      </div>

      <!-- Normal display mode -->
      <div
        v-else-if="message.role === 'user' && message.content"
        class="inline-block rounded-lg text-sm max-w-full text-left break-words relative"
        :class="message.isError
          ? 'bg-red-50 border border-red-200 text-red-700'
          : 'px-3 py-2 bg-accent-primary text-white'"
      >
        <div
          ref="contentEl"
          class="whitespace-pre-wrap transition-all"
          :class="{ 'overflow-hidden': !isExpanded, 'max-h-[7.5rem]': !isExpanded }"
        >{{ message.content }}</div>

        <!-- Expand overlay (shown on hover when content overflows) -->
        <div
          v-if="isOverflow && !isExpanded && isHovered"
          class="absolute bottom-0 right-2 flex justify-center pb-1.5 rounded-b-lg"
          style="background: linear-gradient(to top, rgba(var(--color-accent-primary-rgb, 59 130 246), 0.9) 0%, transparent 100%)"
          @click.stop="isExpanded = true"
        >
          <span class="text-white text-xs cursor-pointer select-none bg-white/20 rounded px-2 py-1 hover:bg-white/30">点击展开</span>
        </div>
      </div>

      <!-- ── ASSISTANT MESSAGE BUBBLE ── -->

      <!-- Path A: Interleaved content blocks (text + read tool calls in correct order) -->
      <template v-if="message.role === 'assistant' && visibleContentBlocks.length">
        <template v-for="(block, idx) in visibleContentBlocks" :key="idx">
          <div
            v-if="block.type === 'thinking' && block.text"
            class="hidden"
          />
          <div
            v-else-if="block.type === 'text' && block.text"
            class="inline-block rounded-lg text-sm max-w-full text-left break-words"
            :class="[message.isError ? 'bg-red-50 border border-red-200 text-red-700 px-3 py-2' : 'text-gray-900', idx > 0 ? 'mt-1.5' : '']"
          >
            <MarkdownContentView :content="block.text" mode="markdown" size="sm" />
          </div>
          <ToolCallView
            v-else-if="block.type === 'tool_call' && block.toolCallId && isReadToolById(block.toolCallId)"
            :tool-call="toolCallById(block.toolCallId)!"
            :group-position="contentBlockToolPosition(idx)"
            class="w-full"
            :class="contentBlockToolMarginClass(idx)"
          />
          <div
            v-else-if="block.type === 'agent_event' && (block.text || block.agentName)"
            class="mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs"
          >
            <span>🧩</span>
            <span>{{ block.text || `${block.agentName} ${block.status ?? ''}`.trim() }}</span>
          </div>
        </template>
      </template>

      <!-- Path B: Legacy messages without contentBlocks -->
      <div
        v-else-if="message.role === 'assistant' && message.content"
        class="inline-block rounded-lg text-sm max-w-full text-left break-words"
        :class="message.isError ? 'bg-red-50 border border-red-200 text-red-700 px-3 py-2' : 'text-gray-900'"
      >
        <MarkdownContentView :content="message.content" mode="markdown" size="sm" />
      </div>

      <!-- Legacy read tool calls (only when no contentBlocks) -->
      <div
        v-if="!visibleContentBlocks.length && readToolCalls.length"
        class="w-full"
        :class="message.content ? 'mt-1.5' : ''"
      >
        <ToolCallView
          v-for="(tc, idx) in readToolCalls"
          :key="tc.id"
          :tool-call="tc"
          :group-position="readToolPosition(idx)"
          :class="idx > 0 ? 'mt-0' : ''"
        />
      </div>

      <!-- Edit summary: single instance, applies to both Path A and Path B -->
      <EditSessionCard
        v-if="editSession"
        :session="editSession"
        :is-streaming="aiStore.isStreaming"
        :reviewed-entries="aiStore.reviewedBatchEntries"
        :review-summary="aiStore.reviewBatchSummary"
        class="mt-1.5"
        @approve="aiStore.approveEditProposal"
        @edit-approve="({ id, editedArgs }) => aiStore.editAndApproveProposal(id, editedArgs)"
        @approve-all="aiStore.approveAllProposals"
        @rework="({ id, reason }) => aiStore.requestProposalRework(id, reason)"
        @end-round="payload => aiStore.endReviewRound(payload?.id)"
      />

      <TaskPlanCard
        v-if="message.role === 'assistant' && message.taskPlan?.items?.length && isPreview"
        :items="message.taskPlan.items"
        :is-preview="isPreview"
        class="mt-1.5"
      />

      <div
        v-if="shouldShowThinkingToggle"
        class="mt-1 inline-flex max-w-full flex-col items-start gap-1"
      >
        <button
          class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          @click="thinkingExpanded = !thinkingExpanded"
        >
          <span>💭</span>
          <span>{{ thinkingExpanded ? '隐藏思考过程' : '查看思考过程' }}</span>
        </button>
        <div
          v-if="thinkingExpanded"
          class="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600 whitespace-pre-wrap"
        >
          {{ thinkingContent }}
        </div>
      </div>

      <div
        v-if="isPreview && previewStatusText"
        class="mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100"
      >
        <div v-if="showPreviewPulse" class="flex items-center gap-0.5">
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms" />
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms" />
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms" />
        </div>
        <span class="text-xs text-gray-500">{{ previewStatusText }}</span>
      </div>

      <!-- Toolbar / Timestamp row -->
      <div
        v-if="!isEditing && !isPreview"
        class="h-5 mt-1 flex items-center"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div class="relative h-5 min-w-[2.5rem]">
          <div
            class="absolute inset-0 flex items-center"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="text-xs text-gray-400 transition-opacity"
              :class="showHoverToolbar && isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'"
            >
              {{ formatTime(message.timestamp) }}
            </div>
          </div>
          <div
            v-if="showHoverToolbar"
            class="absolute inset-0 flex items-center gap-1 transition-opacity"
            :class="[
              message.role === 'user' ? 'justify-end' : 'justify-start',
              isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ]"
          >
            <button
              class="flex items-center gap-1 px-1 py-1 rounded text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="复制"
              @click="handleCopy"
            >
              <IconCopy class="w-3.5 h-3.5" />
            </button>
            <button
              v-if="message.role === 'user'"
              class="flex items-center gap-1 px-1 py-1 rounded text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="编辑"
              @click="startEdit"
            >
              <IconPencil class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { IconCopy, IconPencil, IconX, IconSend } from '@tabler/icons-vue'
import MarkdownContentView from '../MarkdownContentView.vue'
import type { ThreadMessage, AiToolCall } from '@/ai/types'
import { BLOCK_EDIT_TOOLS } from '@/ai/types'
import { useAiStore } from '@/ai/store/ai'
import { buildEditSessionForMessage } from '@/ai/edit-session'
import ToolCallView from '../ToolCallView.vue'
import TaskPlanCard from './TaskPlanCard.vue'
import EditSessionCard from './EditSessionCard.vue'

const props = withDefaults(defineProps<{
  message: ThreadMessage
  isPreview?: boolean
  previewStatusText?: string
  showPreviewPulse?: boolean
}>(), {
  isPreview: false,
  previewStatusText: '',
  showPreviewPulse: false,
})
const emit = defineEmits<{ resend: [messageId: string, newContent: string] }>()

const aiStore = useAiStore()
const thinkingExpanded = ref(false)
const isHovered = ref(false)
const isEditing = ref(false)
const editText = ref('')
const isExpanded = ref(false)
const isOverflow = ref(false)
const contentEl = ref<HTMLDivElement>()
const editTextareaEl = ref<HTMLTextAreaElement>()

const effectiveToolCalls = computed<AiToolCall[]>(() => props.message.toolCalls ?? [])
const thinkingContent = computed(() => props.message.thinkingContent?.trim() ?? '')
const readToolCalls = computed(() =>
  effectiveToolCalls.value.filter(tc => !BLOCK_EDIT_TOOLS.has(tc.name) && tc.name !== 'write_todos')
)
const editToolCalls = computed(() =>
  effectiveToolCalls.value.filter(tc => BLOCK_EDIT_TOOLS.has(tc.name))
)

const isLatestAssistantMessage = computed(() => {
  return aiStore.latestPersistedAssistantMessageId === props.message.id
})

const editSession = computed(() =>
  buildEditSessionForMessage({
    message: props.message,
    mode: aiStore.activeThread?.mode,
    pendingProposals: aiStore.allPendingProposals,
    isInterrupted: aiStore.isInterrupted,
    interruptedTurnId: aiStore.interruptedTurnId,
    isLatestAssistantMessage: isLatestAssistantMessage.value,
    assistantMessageIds: aiStore.persistedAssistantMessageIds,
    editToolCalls: editToolCalls.value,
  })
)

function toolCallById(id: string): AiToolCall | undefined {
  return effectiveToolCalls.value.find(tc => tc.id === id)
}
function isReadToolById(id: string): boolean {
  const tc = toolCallById(id)
  return !!tc && !BLOCK_EDIT_TOOLS.has(tc.name) && tc.name !== 'write_todos'
}

const visibleContentBlocks = computed(() =>
  (props.message.contentBlocks ?? []).filter(block => {
    if (block.type === 'text') return !!block.text?.trim()
    if (block.type === 'thinking') return false
    if (block.type === 'tool_call') return !!(block.toolCallId && isReadToolById(block.toolCallId))
    if (block.type === 'agent_event') return !!(block.text?.trim() || block.agentName)
    return false
  })
)

const hasAssistantTextOutput = computed(() => {
  if (props.message.role !== 'assistant') return false
  if (visibleContentBlocks.value.length) {
    return visibleContentBlocks.value.some(block => block.type === 'text' && !!block.text?.trim())
  }
  return !!props.message.content?.trim()
})

const showHoverToolbar = computed(() => {
  if (props.message.role === 'user') return !!props.message.content?.trim()
  if (hasToolDrivenOutput.value || props.message.taskPlan?.items?.length) return false
  return hasAssistantTextOutput.value
})

const hasToolDrivenOutput = computed(() => readToolCalls.value.length > 0 || editToolCalls.value.length > 0)

const shouldShowThinkingToggle = computed(() => {
  if (props.message.role !== 'assistant' || props.isPreview) return false
  if (!thinkingContent.value) return false
  if (props.message.isError) return true
  if (import.meta.env.DEV) return thinkingContent.value.length >= 80
  if (hasToolDrivenOutput.value) return false
  return thinkingContent.value.length >= 160
})

const shouldRenderMessage = computed(() => {
  if (props.message.role === 'user') return !!props.message.content || isEditing.value
  if (visibleContentBlocks.value.length > 0) return true
  if (!visibleContentBlocks.value.length && !!props.message.content?.trim()) return true
  if (readToolCalls.value.length > 0) return true
  if (editToolCalls.value.length > 0) return true
  if (editSession.value) return true
  if (props.message.taskPlan?.items?.length && props.isPreview) return true
  if (shouldShowThinkingToggle.value) return true
  if (props.isPreview && !!props.previewStatusText) return true
  return false
})

function isReadToolBlockAt(index: number): boolean {
  const block = visibleContentBlocks.value[index]
  return !!(block?.type === 'tool_call' && block.toolCallId && isReadToolById(block.toolCallId))
}

function toolGroupPosition(prevIsTool: boolean, nextIsTool: boolean): 'single' | 'start' | 'middle' | 'end' {
  if (prevIsTool && nextIsTool) return 'middle'
  if (prevIsTool) return 'end'
  if (nextIsTool) return 'start'
  return 'single'
}

function contentBlockToolPosition(index: number): 'single' | 'start' | 'middle' | 'end' {
  return toolGroupPosition(isReadToolBlockAt(index - 1), isReadToolBlockAt(index + 1))
}

function contentBlockToolMarginClass(index: number): string {
  const prevIsTool = isReadToolBlockAt(index - 1)
  return prevIsTool ? 'mt-0' : 'mt-1'
}

function readToolPosition(index: number): 'single' | 'start' | 'middle' | 'end' {
  return toolGroupPosition(index > 0, index < readToolCalls.value.length - 1)
}


async function checkOverflow() {
  if (props.message.role !== 'user') return
  await nextTick()
  if (contentEl.value) {
    isOverflow.value = contentEl.value.scrollHeight > contentEl.value.clientHeight
  }
}

onMounted(checkOverflow)
watch(() => props.message.content, checkOverflow)

function startEdit() {
  editText.value = props.message.content
  isEditing.value = true
  nextTick(() => {
    const el = editTextareaEl.value
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  })
}

function submitEdit() {
  const text = editText.value.trim()
  if (!text) return
  isEditing.value = false
  emit('resend', props.message.id, text)
}

function handleCopy() {
  const text = props.message.role === 'user'
    ? props.message.content
    : buildAssistantCopyText()
  navigator.clipboard.writeText(text)
}

function buildAssistantCopyText(): string {
  let result = props.message.content
  const calls = effectiveToolCalls.value.filter(tc => tc.name !== 'write_todos')
  if (calls?.length) {
    const lines = calls.map(tc => `- ${tc.name}: ${tc.title}`).join('\n')
    result += `\n\n<details>\n<summary>🔧 工具调用 (${calls.length})</summary>\n\n${lines}\n\n</details>`
  }
  return result
}


function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>
