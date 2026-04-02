<template>
  <div
    class="rounded-lg overflow-hidden"
    :class="containerClass"
  >
    <!-- Header: batch summary + actions -->
    <div
      class="px-3 py-2 border-b space-y-1.5"
      :class="headerContainerClass"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-semibold" :class="headerTitleClass">
              {{ batchTitle }}
            </div>
            <span
              v-if="hasDeleteProposal"
              class="inline-flex items-center rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-800"
            >
              高风险
            </span>
          </div>
          <div class="mt-0.5 text-[11px] truncate" :class="headerTextClass" :title="batchSummaryLine">
            {{ batchSummaryLine }}
          </div>
          <div
            v-if="hasDeleteProposal"
            class="mt-1 text-[11px] text-red-700"
          >
            删除操作会直接移除相关内容，应用前请先确认命中范围和上下文。
          </div>
        </div>
        <div v-if="proposals.length > 1" class="flex gap-1.5">
          <button
            @click="$emit('approveAll')"
            class="text-xs px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >{{ hasDeleteProposal ? '全部删除' : '全部应用' }}</button>
          <button
            @click="$emit('rejectAll')"
            class="text-xs px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >全部忽略</button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3">
        <template v-if="isStreaming">
          <span class="text-xs font-medium animate-pulse" :class="headerTextClass">
            正在生成建议... (已有 {{ proposals.length }} 条)
          </span>
        </template>
        <template v-else>
          <button
            class="text-xs font-medium transition-colors"
            :class="headerButtonClass"
            title="点击定位到此块"
            @click="scrollToCurrentBlock"
          >
            <template v-if="proposals.length > 1">{{ currentIndex + 1 }} / {{ proposals.length }} 处修改</template>
            <template v-else>当前修改</template>
          </button>
          <div class="text-[11px] truncate" :class="headerTextClass" :title="operationSummaryLine">
            {{ operationSummaryLine }}
          </div>
        </template>
      </div>
    </div>

    <!-- Description row -->
    <div
      class="flex items-center gap-2 px-3 py-1.5 border-b"
      :class="descriptionRowClass"
    >
      <span class="text-sm leading-none">✏️</span>
      <span class="text-xs font-medium" :class="descriptionTitleClass">{{ typeLabel }}</span>
      <span class="text-xs truncate ml-auto max-w-[200px]" :class="descriptionTextClass" :title="current?.description">
        {{ current?.description }}
      </span>
    </div>

    <div
      v-if="proposals.length > 1"
      class="px-3 py-2 bg-white border-b"
      :class="overviewBorderClass"
    >
      <div class="text-[11px] font-medium mb-1.5" :class="overviewTitleClass">{{ overviewTitle }}</div>
      <div class="space-y-1">
        <button
          v-for="(proposal, idx) in proposals"
          :key="proposal.id"
          class="w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors"
          :class="proposalItemClass(proposal, idx)"
          @click="currentIndex = idx"
        >
          <span
            class="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
            :class="proposalIndexBadgeClass(proposal, idx)"
          >
            {{ idx + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs font-medium text-gray-900">
              {{ proposalListLabel(proposal) }}
            </div>
            <div
              v-if="proposal.description"
              class="mt-0.5 truncate text-[11px] text-gray-500"
              :title="proposal.description"
            >
              {{ proposal.description }}
            </div>
          </div>
          <span
            v-if="idx === currentIndex"
            class="flex-shrink-0 text-[10px]"
            :class="isDeleteProposal(proposal) ? 'text-red-700' : 'text-yellow-700'"
          >当前</span>
        </button>
      </div>
    </div>

    <!-- Diff content -->
    <template v-if="current">
      <!-- FileCreateProposal -->
      <template v-if="current.kind === 'create_file'">
        <div class="px-3 py-1.5 text-xs font-medium border-b" :class="hasDeleteProposal ? 'text-red-700 border-red-100' : 'text-yellow-700 border-yellow-100'">
          📄 {{ createProposal.filename }}.md
        </div>
        <div class="p-2 text-xs">
          <div class="text-[11px] font-medium mb-1" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</div>
          <div class="text-green-600 font-medium mb-1">文档内容</div>
          <div class="text-green-800 bg-green-50 rounded p-1.5 max-h-48 overflow-auto">
            <MarkdownContentView :content="createProposal.content" />
          </div>
        </div>
      </template>

      <!-- BlockEditProposal: edit / delete -->
      <template v-else-if="isSingleBlock">
        <template v-if="blockProposal.type === 'delete'">
          <div class="p-2 text-xs">
            <div class="text-[11px] font-medium text-red-800 mb-1">删除详情</div>
            <div class="mb-1 rounded bg-red-100 px-2 py-1 text-[11px] text-red-700">
              应用后将直接删除以下内容，且不会自动保留替代文本。
            </div>
            <div class="text-red-600 font-medium mb-1">原文（将被删除）</div>
            <div class="text-red-800 bg-red-50 rounded p-1.5 max-h-32 overflow-auto">
              <MarkdownContentView :content="blockProposal.oldContent || '(空)'" mode="markdown" />
            </div>
          </div>
        </template>
        <template v-else>
          <div class="p-2 pb-0 text-[11px] font-medium" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</div>
          <DiffSplitView :old-content="blockProposal.oldContent || ''" :new-content="blockProposal.newContent || ''" />
        </template>
      </template>

      <!-- BlockEditProposal: insert -->
      <template v-else-if="current.kind === 'block' && blockProposal.type === 'insert'">
        <div class="p-2 text-xs">
          <div class="text-[11px] font-medium mb-1" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</div>
          <div class="text-green-600 font-medium mb-1">插入内容</div>
          <div class="text-green-800 bg-green-50 rounded p-1.5 max-h-32 overflow-auto">
            <MarkdownContentView :content="blockProposal.newContent || ''" />
          </div>
        </div>
      </template>

      <!-- BlockEditProposal: replace_range -->
      <template v-else-if="current.kind === 'block' && blockProposal.type === 'replace_range'">
        <div class="px-3 py-1 text-xs border-b" :class="hasDeleteProposal ? 'text-red-700 border-red-100' : 'text-yellow-700 border-yellow-100'">
          <span class="font-medium mr-2" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</span>
          块 {{ blockProposal.startDisplayBlockId }}–{{ blockProposal.endDisplayBlockId }}
        </div>
        <DiffSplitView :old-content="blockProposal.oldContent || ''" :new-content="blockProposal.newContent || ''" />
      </template>

      <!-- Fallback -->
      <template v-else>
        <div class="p-2 text-xs">
          <div class="text-[11px] font-medium mb-1" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</div>
          <div class="text-green-600 font-medium mb-1">新内容预览</div>
          <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-40 overflow-auto font-mono leading-relaxed">{{ current.kind === 'block' ? blockProposal.newContent : '' }}</pre>
        </div>
      </template>
    </template>

    <!-- Footer: apply/ignore + navigation -->
    <div
      class="flex items-center justify-between px-3 py-2 border-t"
      :class="footerContainerClass"
    >
      <div class="flex gap-1.5">
        <button
          @click="approve"
          :class="approveButtonClass"
          class="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded text-white transition-colors"
        >{{ approveButtonLabel }}</button>
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
import type { EditProposal, BlockEditProposal, FileCreateProposal } from '@/ai/types'
import { PROPOSAL_TYPE_LABELS } from '@/ai/types'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import { findNodeById } from '@/ai/edit-agent/BlockEditApplier'
import { highlightBlock } from '@/ai/edit-agent/iwBlockHighlightExtension'

const props = defineProps<{ proposals: EditProposal[]; isStreaming?: boolean; sessionMode?: 'quick_fix' | 'standard' | 'delete_review' }>()
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
const createProposal = computed(() => current.value as FileCreateProposal)

const isSingleBlock = computed(() =>
  current.value?.kind === 'block' &&
  ['edit', 'delete'].includes(blockProposal.value?.type ?? '')
)

const typeLabel = computed(() => {
  if (!current.value) return ''
  if (props.sessionMode === 'quick_fix') return '轻量修正'
  if (current.value.kind === 'create_file') return '创建文档'
  return PROPOSAL_TYPE_LABELS[blockProposal.value?.type ?? ''] ?? '编辑建议'
})

function isDeleteProposal(proposal: EditProposal): boolean {
  return proposal.kind === 'block' && proposal.type === 'delete'
}

const hasDeleteProposal = computed(() => props.proposals.some(proposal => isDeleteProposal(proposal)))

const isQuickFixBatch = computed(() =>
  props.sessionMode === 'quick_fix' && !hasDeleteProposal.value
)

const batchTitle = computed(() => {
  if (hasDeleteProposal.value) return '本批删除建议'
  if (isQuickFixBatch.value) return '轻量修正建议'
  return '本批修改建议'
})

const overviewTitle = computed(() => {
  if (hasDeleteProposal.value) return '本批删除概览'
  if (isQuickFixBatch.value) return '本批修正概览'
  return '本批修改概览'
})

const approveButtonLabel = computed(() => {
  if (current.value && isDeleteProposal(current.value)) return '⚠ 删除这处'
  if (isQuickFixBatch.value) return '✓ 应用修正'
  return '✓ 应用'
})

const approveButtonClass = computed(() =>
  current.value && isDeleteProposal(current.value)
    ? 'bg-red-600 hover:bg-red-700'
    : isQuickFixBatch.value
      ? 'bg-blue-600 hover:bg-blue-700'
      : 'bg-green-600 hover:bg-green-700'
)

const containerClass = computed(() => {
  if (hasDeleteProposal.value) return 'border border-red-300 bg-red-50'
  if (isQuickFixBatch.value) return 'border border-blue-300 bg-blue-50'
  return 'border border-yellow-300 bg-yellow-50'
})

const headerContainerClass = computed(() => {
  if (hasDeleteProposal.value) return 'bg-red-100 border-red-200'
  if (isQuickFixBatch.value) return 'bg-blue-100 border-blue-200'
  return 'bg-yellow-100 border-yellow-200'
})

const headerTitleClass = computed(() => {
  if (hasDeleteProposal.value) return 'text-red-900'
  if (isQuickFixBatch.value) return 'text-blue-900'
  return 'text-yellow-900'
})

const headerTextClass = computed(() => {
  if (hasDeleteProposal.value) return 'text-red-700'
  if (isQuickFixBatch.value) return 'text-blue-700'
  return 'text-yellow-700'
})

const headerButtonClass = computed(() => {
  if (hasDeleteProposal.value) return 'text-red-800 hover:text-red-600'
  if (isQuickFixBatch.value) return 'text-blue-800 hover:text-blue-600'
  return 'text-yellow-800 hover:text-yellow-600'
})

const descriptionRowClass = computed(() => {
  if (hasDeleteProposal.value) return 'bg-red-50 border-red-100'
  if (isQuickFixBatch.value) return 'bg-blue-50 border-blue-100'
  return 'bg-yellow-50 border-yellow-100'
})

const descriptionTitleClass = computed(() => {
  if (hasDeleteProposal.value) return 'text-red-800'
  if (isQuickFixBatch.value) return 'text-blue-800'
  return 'text-yellow-800'
})

const descriptionTextClass = computed(() => {
  if (hasDeleteProposal.value) return 'text-red-600'
  if (isQuickFixBatch.value) return 'text-blue-600'
  return 'text-yellow-600'
})

const overviewBorderClass = computed(() => {
  if (hasDeleteProposal.value) return 'border-red-100'
  if (isQuickFixBatch.value) return 'border-blue-100'
  return 'border-yellow-100'
})

const overviewTitleClass = computed(() => {
  if (hasDeleteProposal.value) return 'text-red-800'
  if (isQuickFixBatch.value) return 'text-blue-800'
  return 'text-yellow-800'
})

const footerContainerClass = computed(() => {
  if (hasDeleteProposal.value) return 'bg-red-50 border-red-200'
  if (isQuickFixBatch.value) return 'bg-blue-50 border-blue-200'
  return 'bg-yellow-50 border-yellow-200'
})

function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

const affectedFileLabel = computed(() => {
  const fileNames = Array.from(new Set(
    props.proposals.flatMap(proposal => {
      if (proposal.kind === 'create_file') {
        return proposal.filename ? [proposal.filename] : []
      }
      return proposal.filePath ? [basename(proposal.filePath)] : []
    }).filter(Boolean)
  ))

  if (!fileNames.length) return ''
  if (fileNames.length === 1) return fileNames[0]!
  return `${fileNames[0]} 等 ${fileNames.length} 个文件`
})

const batchSummaryLine = computed(() => {
  const parts: string[] = []
  if (affectedFileLabel.value) parts.push(affectedFileLabel.value)
  parts.push(props.proposals.length > 1 ? `${props.proposals.length} 处待确认修改` : '1 处待确认修改')
  return parts.join(' · ')
})

const operationSummaryLine = computed(() => {
  let edits = 0
  let inserts = 0
  let deletes = 0
  let replaces = 0
  let creates = 0

  for (const proposal of props.proposals) {
    if (proposal.kind === 'create_file') {
      creates += 1
      continue
    }
    switch (proposal.type) {
      case 'edit':
        edits += 1
        break
      case 'insert':
        inserts += 1
        break
      case 'delete':
        deletes += 1
        break
      case 'replace_range':
        replaces += 1
        break
    }
  }

  const parts: string[] = []
  if (edits > 0) parts.push(`${edits} 处编辑`)
  if (inserts > 0) parts.push(`${inserts} 处插入`)
  if (deletes > 0) parts.push(`${deletes} 处删除`)
  if (replaces > 0) parts.push(`${replaces} 处替换`)
  if (creates > 0) parts.push(`${creates} 个文档创建`)
  return parts.join(' · ') || '修改建议'
})

function proposalListLabel(proposal: EditProposal): string {
  if (proposal.kind === 'create_file') {
    return `创建文档：${proposal.filename || '未命名文档'}`
  }

  const fileLabel = proposal.filePath ? basename(proposal.filePath) : '当前文档'
  switch (proposal.type) {
    case 'edit':
      return `${fileLabel} · 编辑块 {b:${proposal.displayBlockId ?? '?'}}`
    case 'insert':
      return `${fileLabel} · 在 {b:${proposal.displayBlockId ?? 0}} 后插入`
    case 'delete':
      return `${fileLabel} · 删除块 {b:${proposal.displayBlockId ?? '?'}}`
    case 'replace_range':
      return `${fileLabel} · 替换 {b:${proposal.startDisplayBlockId ?? '?'}}–{b:${proposal.endDisplayBlockId ?? '?'}}`
    default:
      return proposal.description || '修改建议'
  }
}

function proposalItemClass(proposal: EditProposal, index: number): string {
  if (isDeleteProposal(proposal)) {
    return index === currentIndex.value
      ? 'border-red-300 bg-red-50'
      : 'border-red-100 bg-white hover:bg-red-50/50'
  }
  return index === currentIndex.value
    ? 'border-yellow-300 bg-yellow-50'
    : 'border-yellow-100 bg-white hover:bg-yellow-50/50'
}

function proposalIndexBadgeClass(proposal: EditProposal, index: number): string {
  if (isDeleteProposal(proposal)) {
    return index === currentIndex.value
      ? 'bg-red-200 text-red-900'
      : 'bg-red-100 text-red-700'
  }
  return index === currentIndex.value
    ? 'bg-yellow-200 text-yellow-900'
    : 'bg-yellow-100 text-yellow-700'
}

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
