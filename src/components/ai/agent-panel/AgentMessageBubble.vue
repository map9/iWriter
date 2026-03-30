<template>
  <div
    class="flex min-w-0"
    :class="{ 'flex-row-reverse': message.role === 'user' }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
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

      <!-- Interleaved content blocks (text + read tool calls in correct order) -->
      <template v-if="message.role === 'assistant' && message.contentBlocks?.length">
        <template v-for="(block, idx) in message.contentBlocks" :key="idx">
          <div
            v-if="block.type === 'text' && block.text"
            class="inline-block rounded-lg text-sm max-w-full text-left break-words"
            :class="[message.isError ? 'bg-red-50 border border-red-200 text-red-700 px-3 py-2' : 'text-gray-900', idx > 0 ? 'mt-1.5' : '']"
          >
            <MarkdownContentView :content="block.text" mode="markdown" size="sm" />
          </div>
          <ToolCallView
            v-else-if="block.type === 'tool_call' && block.toolCallId && isReadToolById(block.toolCallId)"
            :tool-call="toolCallById(block.toolCallId)!"
            class="mt-1.5 w-full"
          />
        </template>
        <!-- Edit tool calls summary (shown at bottom even in contentBlocks mode) -->
        <div
          v-if="editToolCalls.length"
          class="mt-1.5 w-full border border-yellow-200 rounded overflow-hidden text-xs"
        >
          <div
            class="flex items-center gap-2 px-2 py-1.5 bg-yellow-50 text-yellow-800 cursor-pointer select-none"
            @click="editListExpanded = !editListExpanded"
          >
            <span>✏️</span>
            <span class="font-bold">已提案 {{ editToolCalls.length }} 处修改</span>
            <span v-if="appliedCount"  class="text-green-600 text-[11px]">✓{{ appliedCount }}</span>
            <span v-if="rejectedCount" class="text-red-500  text-[11px]">✗{{ rejectedCount }}</span>
            <span class="ml-auto opacity-60 text-[10px]">{{ editListExpanded ? '▲' : '▼' }}</span>
          </div>
          <div v-if="editListExpanded" class="bg-white border-t border-yellow-100 px-2 py-1.5">
            <span
              v-for="(tc, idx) in editToolCalls"
              :key="tc.id"
              class="font-mono"
              :class="{
                'text-green-700': tc.status === 'completed',
                'text-red-400 line-through opacity-60': tc.status === 'failed',
                'text-yellow-900': tc.status !== 'completed' && tc.status !== 'failed',
              }"
            >{{ editOpDisplay(tc).label }} <span v-if="tc.status === 'completed'" class="text-green-600 font-bold">✓</span><span v-if="tc.status === 'failed'" class="text-red-400 font-bold">✗</span><template v-if="idx < editToolCalls.length - 1">；</template></span>
          </div>
        </div>
      </template>

      <!-- Fallback: legacy messages without contentBlocks -->
      <div
        v-else-if="message.role === 'assistant' && message.content"
        class="inline-block rounded-lg text-sm max-w-full text-left break-words"
        :class="message.isError ? 'bg-red-50 border border-red-200 text-red-700 px-3 py-2' : 'text-gray-900'"
      >
        <MarkdownContentView :content="message.content" mode="markdown" size="sm" />
      </div>

      <!-- Tool calls: read tools shown individually; edit tools collapsed into one summary -->
      <div
        v-if="!message.contentBlocks?.length && message.toolCalls?.length"
        class="space-y-1.5 w-full"
        :class="message.content ? 'mt-1.5' : ''"
      >
        <ToolCallView v-for="tc in readToolCalls" :key="tc.id" :tool-call="tc" />
        <div
          v-if="editToolCalls.length"
          class="w-full border border-yellow-200 rounded overflow-hidden text-xs"
        >
          <div
            class="flex items-center gap-2 px-2 py-1.5 bg-yellow-50 text-yellow-800 cursor-pointer select-none"
            @click="editListExpanded = !editListExpanded"
          >
            <span>✏️</span>
            <span class="font-bold">已提案 {{ editToolCalls.length }} 处修改</span>
            <span v-if="appliedCount"  class="text-green-600 text-[11px]">✓{{ appliedCount }}</span>
            <span v-if="rejectedCount" class="text-red-500  text-[11px]">✗{{ rejectedCount }}</span>
            <span class="ml-auto opacity-60 text-[10px]">{{ editListExpanded ? '▲' : '▼' }}</span>
          </div>
          <div v-if="editListExpanded" class="bg-white border-t border-yellow-100 px-2 py-1.5">
            <span
              v-for="(tc, idx) in editToolCalls"
              :key="tc.id"
              class="font-mono"
              :class="{
                'text-green-700': tc.status === 'completed',
                'text-red-400 line-through opacity-60': tc.status === 'failed',
                'text-yellow-900': tc.status !== 'completed' && tc.status !== 'failed',
              }"
            >{{ editOpDisplay(tc).label }} <span v-if="tc.status === 'completed'" class="text-green-600 font-bold">✓</span><span v-if="tc.status === 'failed'" class="text-red-400 font-bold">✗</span><template v-if="idx < editToolCalls.length - 1">；</template></span>
          </div>
        </div>
      </div>

      <!-- Toolbar / Timestamp row -->
      <div v-if="!isEditing" class="h-5 mt-1 flex items-center" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
        <!-- Hover toolbar -->
        <div v-if="isHovered && !isEditing" class="flex items-center gap-1">
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
        <!-- Timestamp (shown when not hovering or when editing) -->
        <div v-else class="text-xs text-gray-400">{{ formatTime(message.timestamp) }}</div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { IconCopy, IconPencil, IconX, IconSend } from '@tabler/icons-vue'
import MarkdownContentView from '../MarkdownContentView.vue'
import type { ThreadMessage, AiToolCall } from '@/types/ai'
import { BLOCK_EDIT_TOOLS } from '@/types/ai'
import ToolCallView from '../ToolCallView.vue'

const props = defineProps<{ message: ThreadMessage }>()
const emit = defineEmits<{ resend: [messageId: string, newContent: string] }>()

const thinkingExpanded = ref(false)
const isHovered = ref(false)
const isEditing = ref(false)
const editText = ref('')
const isExpanded = ref(false)
const isOverflow = ref(false)
const contentEl = ref<HTMLDivElement>()
const editTextareaEl = ref<HTMLTextAreaElement>()

const readToolCalls = computed(() =>
  (props.message.toolCalls ?? []).filter(tc => !BLOCK_EDIT_TOOLS.has(tc.name))
)
const editToolCalls = computed(() =>
  (props.message.toolCalls ?? []).filter(tc => BLOCK_EDIT_TOOLS.has(tc.name))
)

function toolCallById(id: string): AiToolCall | undefined {
  return props.message.toolCalls?.find(tc => tc.id === id)
}
function isReadToolById(id: string): boolean {
  const tc = toolCallById(id)
  return !!tc && !BLOCK_EDIT_TOOLS.has(tc.name)
}

const editListExpanded = ref(true)
watch(
  () => editToolCalls.value.length,
  (len, oldLen) => { if (oldLen === 0 && len > 0) editListExpanded.value = len <= 5 }
)

const appliedCount  = computed(() => editToolCalls.value.filter(tc => tc.status === 'completed').length)
const rejectedCount = computed(() => editToolCalls.value.filter(tc => tc.status === 'failed').length)

function editOpDisplay(tc: AiToolCall): { icon: string; label: string } {
  const args = tc.arguments
  const bid  = (v: unknown) => v !== undefined && v !== null ? `{b:${v}}` : '?'
  const fname = (fp: unknown) =>
    typeof fp === 'string' && fp ? (fp.split('/').pop() ?? fp) : ''
  switch (tc.name) {
    case 'edit_block':
      return { icon: '✏️', label: `编辑块 ${bid(args.block_id)}` }
    case 'insert_block': {
      const ref = args.after_block_id !== undefined ? `块 ${bid(args.after_block_id)} 之后`
        : args.end_block_id !== undefined ? `尾部 ${bid(args.end_block_id)}` : ''
      return { icon: '➕', label: `插入块${ref ? ` (${ref})` : ''}` }
    }
    case 'delete_block':
      return { icon: '🗑️', label: `删除块 ${bid(args.block_id)}` }
    case 'replace_range':
      return { icon: '🔄', label: `替换块 ${bid(args.start_block_id)}–${bid(args.end_block_id)}` }
    case 'create_document': {
      const name = fname(args.file_path) || (typeof args.filename === 'string' ? args.filename : '')
      return { icon: '📄', label: `创建文档${name ? `: ${name}` : ''}` }
    }
    default:
      return { icon: '✏️', label: tc.title || tc.name }
  }
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
  const calls = props.message.toolCalls
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
