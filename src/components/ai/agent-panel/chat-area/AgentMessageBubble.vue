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
          class="iw-btn btn-square btn-sm border-none shrink-0 self-end disabled:cursor-not-allowed"
          :title="t('agentPanel.common.cancel')"
          @click="isEditing = false"
        ><IconX class="icon-xs" /></button>
        <textarea
          ref="editEl"
          v-model="editText"
          :placeholder="t('agentPanel.input.sendMessagePlaceholder')"
          class="flex-1 px-2 py-1.5 text-sm text-base-content border border-base-300 bg-base-100 rounded-field resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent overflow-hidden"
          rows="1"
          :style="{ maxHeight: maxTextareaHeight }"
          @input="autoResize"
          @keydown.enter.exact.prevent="submitEdit"
          @keydown.shift.enter.exact="() => {}"
          @keydown.escape="isEditing = false"
        />
        <button
          :disabled="!editText.trim()"
          class="iw-btn btn-sm btn-square border-none btn-primary shrink-0 self-end disabled:cursor-not-allowed"
          :title="t('agentPanel.sendButton.sendTitle')"
          @click="submitEdit"
        ><IconSend class="icon-xs" /></button>
      </div>

      <!-- Normal display mode -->
      <div
        v-else-if="message.role === 'user' && message.content"
        class="inline-block rounded-field text-sm max-w-full text-left wrap-break-word relative"
        :class="message.isError
          ? 'bg-error/20 border border-error/30 '
          : 'px-3 py-2 bg-primary text-primary-content'"
      >
        <div
          ref="contentEl"
          class="whitespace-pre-wrap transition-all"
          :class="{ 'overflow-hidden': !isExpanded, 'max-h-30': !isExpanded }"
        >{{ message.content }}</div>

        <!-- Expand overlay (shown on hover when content overflows) -->
        <div
          v-if="isOverflow && !isExpanded && isHovered"
          class="absolute bottom-2 right-2 iw-btn border-none btn-neutral btn-sm opacity-50 shrink-0"
          @click.stop="isExpanded = true"
        >
          {{ t('agentPanel.messageBubble.expand') }}
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
          <template v-else-if="block.type === 'text' && block.text">
            <template v-for="(part, partIdx) in splitAssistantText(block.text)" :key="`${idx}-${partIdx}`">
              <div
                v-if="part.kind === 'prose'"
                class="inline-block rounded-field text-sm max-w-full text-left wrap-break-word"
                :class="[message.isError ? 'bg-error/20 border border-error/30  px-3 py-2' : 'text-base-content', (idx > 0 || partIdx > 0) ? 'mt-1.5' : '']"
              >
                <MarkdownContentView :content="part.text" mode="markdown" size="sm" />
              </div>
              <ConsistencyFindingsBlock
                v-else-if="part.kind === 'findings'"
                :findings="part.findings"
                class="max-w-full"
              />
              <AdvisorDirectionsBlock
                v-else-if="part.kind === 'directions'"
                :directions="part.directions"
                class="max-w-full"
              />
            </template>
          </template>
          <ToolCallCard
            v-else-if="block.type === 'tool_call' && block.toolCallId && isReadToolById(block.toolCallId)"
            :tool-call="toolCallById(block.toolCallId)!"
            :group-position="contentBlockToolPosition(idx)"
            class="w-full"
            :class="contentBlockToolMarginClass(idx)"
          />
          <div
            v-else-if="block.type === 'agent_event' && (block.text || block.agentName)"
            class="mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-field bg-base-100 border border-base-300 text-base-content text-xs"
          >
            <span>🧩</span>
            <span>{{ block.text || `${block.agentName} ${block.status ?? ''}`.trim() }}</span>
          </div>
        </template>
      </template>

      <!-- Path B: Legacy messages without contentBlocks -->
      <div
        v-else-if="message.role === 'assistant' && message.content"
        class="inline-block rounded-field text-sm max-w-full text-left wrap-break-word"
        :class="message.isError ? 'bg-error/20 border border-error/30  px-3 py-2' : 'text-base-content'"
      >
        <template v-for="(part, partIdx) in splitAssistantText(message.content)" :key="partIdx">
          <MarkdownContentView
            v-if="part.kind === 'prose'"
            :content="part.text"
            mode="markdown"
            size="sm"
            :class="partIdx > 0 ? 'mt-1.5' : ''"
          />
          <ConsistencyFindingsBlock
            v-else-if="part.kind === 'findings'"
            :findings="part.findings"
            class="max-w-full"
          />
          <AdvisorDirectionsBlock
            v-else-if="part.kind === 'directions'"
            :directions="part.directions"
            class="max-w-full"
          />
        </template>
      </div>

      <!-- Legacy read tool calls (only when no contentBlocks) -->
      <div
        v-if="!visibleContentBlocks.length && readToolCalls.length"
        class="w-full"
        :class="message.content ? 'mt-1.5' : ''"
      >
        <ToolCallCard
          v-for="(tc, idx) in readToolCalls"
          :key="tc.id"
          :tool-call="tc"
          :group-position="readToolPosition(idx)"
          :class="idx > 0 ? 'mt-0' : ''"
        />
      </div>

      <DomainMessageSession
        :message="message"
        :edit-tool-calls="editToolCalls"
        :creative-review-tool-calls="creativeReviewToolCalls"
        :is-latest-assistant-message="isLatestAssistantMessage"
        :is-preview="isPreview"
      />

      <div
        v-if="shouldShowThinkingToggle"
        class="mt-1 inline-flex max-w-full flex-col items-start gap-1"
      >
        <button
          class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-base-content hover:bg-base-300 hover:text-base-content/50 transition-colors"
          @click="thinkingExpanded = !thinkingExpanded"
        >
          <span>💭</span>
          <span>{{ thinkingExpanded ? t('agentPanel.messageBubble.hideThinking') : t('agentPanel.messageBubble.showThinking') }}</span>
        </button>
        <div
          v-if="thinkingExpanded"
          class="w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 text-base-content"
        >
          <MarkdownContentView :content="thinkingContent" mode="markdown" size="xs" />
        </div>
      </div>

      <div
        v-if="isPreview && previewStatusText"
        class="mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-field text-base-300"
      >
        <span v-if="showPreviewPulse" class="loading loading-dots loading-sm text-base-content opacity-50"></span>
        <span class="text-xs text-base-content opacity-50">{{ previewStatusText }}</span>
      </div>

      <!-- Toolbar / Timestamp row -->
      <div
        v-if="!isEditing && !isPreview"
        class="h-5 mt-1 flex items-center"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div class="relative h-5 min-w-10">
          <div
            class="absolute inset-0 flex items-center"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="text-xs text-base-content transition-opacity whitespace-nowrap"
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
              class="iw-toolbar-btn btn-xs"
              :title="t('agentPanel.messageBubble.copy')"
              @click="handleCopy"
            >
              <IconCopy class="icon-xs" />
            </button>
            <button
              v-if="message.role === 'user'"
              class="iw-toolbar-btn btn-xs"
              :title="t('agentPanel.messageBubble.edit')"
              @click="startEdit"
            >
              <IconPencil class="icon-xs" />
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconCopy, IconPencil, IconX, IconSend } from '@tabler/icons-vue'
import type { ThreadMessage, AiToolCall } from '@/ai/types'
import { BLOCK_EDIT_TOOLS, CREATIVE_REVIEW_TOOLS } from '@/ai/types'
import { isRenderableAssistantMessage } from '@/ai/review/selectors'
import { useAiStore } from '@/ai/store/ai'
import MarkdownContentView from './views/MarkdownContentView.vue'
import ToolCallCard from './views/ToolCallCard.vue'
import ConsistencyFindingsBlock from './views/ConsistencyFindingsBlock.vue'
import AdvisorDirectionsBlock from './views/AdvisorDirectionsBlock.vue'
import DomainMessageSession from '../domains/DomainMessageSession.vue'
import { parseFindings } from '@/ai/message/consistency-findings'
import type { ConsistencyFinding } from '@/ai/message/consistency-findings'
import type { AdvisorDirection } from '@/ai/message/advisor-directions'
import { parseDirections } from '@/ai/message/advisor-directions'
import { splitTextWithFences } from '@/ai/message/fenced-blocks'

type AssistantTextPart =
  | { kind: 'prose'; text: string }
  | { kind: 'findings'; findings: ConsistencyFinding[] }
  | { kind: 'directions'; directions: AdvisorDirection[] }

function splitAssistantText(text: string): AssistantTextPart[] {
  const parts = splitTextWithFences(text, {
    'consistency-findings': parseFindings,
    'advisor-directions': parseDirections,
  })
  return parts.map((p) => {
    if (!('data' in p)) return p as { kind: 'prose'; text: string }
    if (p.kind === 'consistency-findings') return { kind: 'findings' as const, findings: p.data as ConsistencyFinding[] }
    return { kind: 'directions' as const, directions: p.data as AdvisorDirection[] }
  })
}

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
const { t, locale } = useI18n()
const thinkingExpanded = ref(false)
const isHovered = ref(false)
const isEditing = ref(false)
const editText = ref('')
const isExpanded = ref(false)
const isOverflow = ref(false)
const contentEl = ref<HTMLDivElement>()
const editEl = ref<HTMLTextAreaElement>()

// text-sm line-height is 1.25rem = 20px; 5 lines = 100px
const maxTextareaHeight = '100px'

function resizeTextarea(el?: HTMLTextAreaElement) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}

function autoResize(e: Event) {
  resizeTextarea(e.target as HTMLTextAreaElement)
}

// Reset height when input is cleared (e.g. after send)
watch(editText, (val) => {
  if (!val && editEl.value) {
    editEl.value.style.height = 'auto'
  }
})

const effectiveToolCalls = computed<AiToolCall[]>(() => props.message.toolCalls ?? [])
const thinkingContent = computed(() => props.message.thinkingContent?.trim() ?? '')
const readToolCalls = computed(() =>
  effectiveToolCalls.value.filter(
    tc => !BLOCK_EDIT_TOOLS.has(tc.name) && !CREATIVE_REVIEW_TOOLS.has(tc.name) && tc.name !== 'write_todos',
  )
)
const editToolCalls = computed(() =>
  effectiveToolCalls.value.filter(tc => BLOCK_EDIT_TOOLS.has(tc.name))
)
const creativeReviewToolCalls = computed(() =>
  effectiveToolCalls.value.filter(tc => CREATIVE_REVIEW_TOOLS.has(tc.name))
)

const isLatestAssistantMessage = computed(() => {
  return aiStore.latestPersistedAssistantMessageId === props.message.id
})

function toolCallById(id: string): AiToolCall | undefined {
  return effectiveToolCalls.value.find(tc => tc.id === id)
}
function isReadToolById(id: string): boolean {
  const tc = toolCallById(id)
  return !!tc && !BLOCK_EDIT_TOOLS.has(tc.name) && !CREATIVE_REVIEW_TOOLS.has(tc.name) && tc.name !== 'write_todos'
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
  const hasReadToolOutput = readToolCalls.value.length > 0
  const hasEditHost = !!props.message.editRoundResult
  if (!hasAssistantTextOutput.value && !hasReadToolOutput && !hasEditHost) return false
  const minLength = import.meta.env.DEV ? 80 : 160
  return thinkingContent.value.length >= minLength
})

const shouldRenderMessage = computed(() => {
  if (props.message.role === 'user') return !!props.message.content || isEditing.value
  if (props.isPreview && !!props.previewStatusText) return true
  return isRenderableAssistantMessage(props.message)
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
    const el = editEl.value
    if (el) {
      resizeTextarea(el)
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
    result += `\n\n<details>\n<summary>🔧 ${t('agentPanel.messageBubble.toolCallsSummary', { count: calls.length })}</summary>\n\n${lines}\n\n</details>`
  }
  return result
}


function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
}
</script>
