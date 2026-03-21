<template>
  <div class="border border-yellow-300 bg-yellow-50 rounded-lg overflow-hidden">
    <!-- Header: count + batch actions -->
    <div class="flex items-center justify-between px-3 py-2 bg-yellow-100 border-b border-yellow-200">
      <template v-if="isStreaming">
        <span class="text-xs font-medium text-yellow-700 animate-pulse">
          正在生成建议... (已有 {{ proposals.length }} 条)
        </span>
      </template>
      <template v-else>
        <span
          class="text-xs font-medium text-yellow-800 cursor-pointer hover:text-yellow-600 transition-colors"
          title="点击定位到此块"
          @click="scrollToCurrentBlock"
        >
          <template v-if="proposals.length > 1">{{ currentIndex + 1 }} / {{ proposals.length }} 处修改建议</template>
          <template v-else>1 处修改建议</template>
        </span>
        <div v-if="proposals.length > 1" class="flex gap-1.5">
          <button
            @click="$emit('approveAll')"
            class="text-xs px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >全部接受</button>
          <button
            @click="$emit('rejectAll')"
            class="text-xs px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >全部忽略</button>
        </div>
      </template>
    </div>

    <!-- Description row -->
    <div class="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border-b border-yellow-100">
      <span class="text-sm leading-none">✏️</span>
      <span class="text-xs font-medium text-yellow-800">{{ typeLabel }}</span>
      <span class="text-xs text-yellow-600 truncate ml-auto max-w-[200px]" :title="current?.description">
        {{ current?.description }}
      </span>
    </div>

    <!-- Diff content -->
    <template v-if="current">
      <!-- FileCreateProposal -->
      <template v-if="current.kind === 'create_file'">
        <div class="px-3 py-1.5 text-xs text-yellow-700 font-medium border-b border-yellow-100">
          📄 {{ createProposal.filename }}.md
        </div>
        <div class="p-2 text-xs">
          <div class="text-green-600 font-medium mb-1">文档内容</div>
          <div class="text-green-800 bg-green-50 rounded p-1.5 max-h-48 overflow-auto">
            <MarkdownContentView :content="createProposal.content" />
          </div>
        </div>
      </template>

      <!-- FileEditProposal -->
      <template v-else-if="current.kind === 'file'">
        <div class="px-3 py-1.5 text-xs text-yellow-700 font-medium border-b border-yellow-100">
          📄 {{ fileProposal.filePath.split('/').pop() }}
        </div>
        <DiffSplitView :old-content="fileProposal.oldContent || ''" :new-content="fileProposal.newContent" />
      </template>

      <!-- BlockEditProposal: edit / delete -->
      <template v-else-if="isSingleBlock">
        <template v-if="blockProposal.type === 'delete'">
          <div class="p-2 text-xs">
            <div class="text-red-600 font-medium mb-1">原文（将被删除）</div>
            <div class="text-red-800 bg-red-50 rounded p-1.5 max-h-32 overflow-auto">
              <MarkdownContentView :content="blockProposal.oldContent || '(空)'" mode="markdown" />
            </div>
          </div>
        </template>
        <template v-else>
          <DiffSplitView :old-content="blockProposal.oldContent || ''" :new-content="blockProposal.newContent || ''" />
        </template>
      </template>

      <!-- BlockEditProposal: insert -->
      <template v-else-if="current.kind === 'block' && blockProposal.type === 'insert'">
        <div class="p-2 text-xs">
          <div class="text-green-600 font-medium mb-1">插入内容</div>
          <div class="text-green-800 bg-green-50 rounded p-1.5 max-h-32 overflow-auto">
            <MarkdownContentView :content="blockProposal.newContent || ''" />
          </div>
        </div>
      </template>

      <!-- BlockEditProposal: replace_range -->
      <template v-else-if="current.kind === 'block' && blockProposal.type === 'replace_range'">
        <div class="px-3 py-1 text-xs text-yellow-700 border-b border-yellow-100">
          块 {{ blockProposal.startDisplayBlockId }}–{{ blockProposal.endDisplayBlockId }}
        </div>
        <DiffSplitView :old-content="blockProposal.oldContent || ''" :new-content="blockProposal.newContent || ''" />
      </template>

      <!-- Fallback -->
      <template v-else>
        <div class="p-2 text-xs">
          <div class="text-green-600 font-medium mb-1">新内容预览</div>
          <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-40 overflow-auto font-mono leading-relaxed">{{ current.kind === 'block' ? blockProposal.newContent : '' }}</pre>
        </div>
      </template>
    </template>

    <!-- Footer: apply/ignore + navigation -->
    <div class="flex items-center justify-between px-3 py-2 bg-yellow-50 border-t border-yellow-200">
      <div class="flex gap-1.5">
        <button
          @click="approve"
          class="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
        >✓ 应用</button>
        <button
          @click="reject"
          class="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
        >✗ 忽略</button>
      </div>
      <div v-if="proposals.length > 1" class="flex gap-1">
        <button
          @click="prev"
          :disabled="currentIndex === 0"
          class="px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >← 上一个</button>
        <button
          @click="next"
          :disabled="currentIndex >= proposals.length - 1"
          class="px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >下一个 →</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import MarkdownContentView from './MarkdownContentView.vue'
import DiffSplitView from './DiffSplitView.vue'
import type { EditProposal, BlockEditProposal, FileEditProposal, FileCreateProposal } from '@/types/ai'
import { PROPOSAL_TYPE_LABELS } from '@/types/ai'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import { findNodeById } from '@/ai/edit-agent/BlockEditApplier'
import { highlightBlock } from '@/ai/edit-agent/iwBlockHighlightExtension'

const props = defineProps<{ proposals: EditProposal[]; isStreaming?: boolean }>()
const emit = defineEmits<{
  approve:    [id: string]
  reject:     [id: string]
  approveAll: []
  rejectAll:  []
}>()

const currentIndex = ref(0)

// Keep index in bounds when list shrinks (after approve/reject)
watch(() => props.proposals.length, len => {
  if (currentIndex.value >= len) {
    currentIndex.value = Math.max(0, len - 1)
  }
})

const current = computed(() => props.proposals[currentIndex.value] ?? null)

const blockProposal  = computed(() => current.value as BlockEditProposal)
const fileProposal   = computed(() => current.value as FileEditProposal)
const createProposal = computed(() => current.value as FileCreateProposal)

const isSingleBlock = computed(() =>
  current.value?.kind === 'block' &&
  ['edit', 'delete'].includes(blockProposal.value?.type ?? '')
)

const typeLabel = computed(() => {
  if (!current.value) return ''
  if (current.value.kind === 'create_file') return '创建文档'
  if (current.value.kind === 'file')        return '文件修改'
  return PROPOSAL_TYPE_LABELS[blockProposal.value?.type ?? ''] ?? '编辑建议'
})

function approve() {
  if (!current.value) return
  emit('approve', current.value.id)
  // index adjusts via watcher after list shrinks
}

function reject() {
  if (!current.value) return
  emit('reject', current.value.id)
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function next() {
  if (currentIndex.value < props.proposals.length - 1) currentIndex.value++
}

function scrollToCurrentBlock() {
  const proposal = current.value
  if (!proposal || proposal.kind !== 'block') return

  const block = proposal as BlockEditProposal
  const nodeId =
    block.type === 'insert' ? block.afterNodeId :
    block.type === 'replace_range' ? block.startNodeId :
    block.nodeId

  if (!nodeId || nodeId === '0') return

  const appStore = useAppStore()
  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  if (!editor) return

  const found = findNodeById(editor.state.doc, nodeId)
  if (!found) return

  // Highlight the block via decoration (no cursor change) — do this first,
  // independent of DOM availability
  highlightBlock(editor, nodeId)

  // Scroll into view
  const domNode = editor.view.nodeDOM(found.from)
  const element = domNode instanceof Element ? domNode : (domNode as Node | null)?.parentElement
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function clearHighlight() {
  const appStore = useAppStore()
  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  if (editor) highlightBlock(editor, null)
}

watch(currentIndex, scrollToCurrentBlock)
onMounted(scrollToCurrentBlock)
onUnmounted(clearHighlight)
</script>
