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
            @click="$emit('endRound')"
            class="text-xs px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >结束本轮</button>
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

      <div
        v-if="proposals.length > 1 && !isStreaming"
        class="text-[11px]"
        :class="headerTextClass"
      >
        逐条审核后统一应用，避免前面的修改影响后续块定位。
      </div>

      <div
        v-if="reviewSummary && reviewSummary.total > 1"
        class="flex flex-wrap items-center gap-1.5 text-[11px]"
      >
        <span class="font-medium" :class="headerTextClass">
          已审核 {{ reviewSummary.resolved }} / {{ reviewSummary.total }}
        </span>
        <span
          v-if="reviewSummary.approved > 0"
          class="rounded-full bg-green-100 px-1.5 py-0.5 text-green-700"
        >{{ reviewSummary.approved }} 条待应用</span>
        <span
          v-if="reviewSummary.edited > 0"
          class="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700"
        >{{ reviewSummary.edited }} 条编辑后应用</span>
        <span
          v-if="reviewSummary.rework > 0"
          class="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700"
        >{{ reviewSummary.rework }} 条退回重做</span>
        <span
          v-if="reviewSummary.paused > 0"
          class="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600"
        >{{ reviewSummary.paused }} 条已暂停</span>
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

      <div v-if="reviewedEntriesToShow.length" class="mt-2 border-t border-gray-100 pt-2">
        <div class="mb-1.5 text-[11px] font-medium text-gray-600">已审核</div>
        <div class="space-y-1">
          <button
            v-for="entry in reviewedEntriesToShow"
            :key="entry.proposal.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-left transition-colors hover:border-gray-200 hover:bg-gray-100/80"
            title="点击定位到这处修改"
            @click="focusReviewedProposal(entry.proposal)"
          >
            <span
              class="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="reviewedBadgeClass(entry)"
            >
              {{ entry.label }}
            </span>
            <div class="min-w-0 flex-1 truncate text-[11px] text-gray-700">
              {{ proposalListLabel(entry.proposal) }}
            </div>
          </button>
        </div>
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
          <DiffSplitView
            :old-content="blockProposal.oldContent || ''"
            :new-content="blockProposal.newContent || ''"
            editable-right
            v-model="editedContent"
          />
        </template>
      </template>

      <!-- BlockEditProposal: insert -->
      <template v-else-if="current.kind === 'block' && blockProposal.type === 'insert'">
        <div class="p-2 text-xs">
          <div class="text-[11px] font-medium mb-1" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</div>
          <div class="text-green-600 font-medium mb-1">插入内容</div>
          <div
            class="rounded border border-green-200 bg-green-50 p-1.5"
            :class="isInsertEditing ? 'ring-2 ring-green-200' : 'cursor-text'"
            @click="activateInsertEditing"
          >
            <textarea
              v-if="isInsertEditing"
              ref="insertEditorRef"
              v-model="editedContent"
              rows="10"
              class="w-full resize-y border-0 bg-transparent px-2 py-1 text-xs leading-relaxed text-green-900 outline-none"
              placeholder="按 Markdown 编辑将要插入的内容"
              @blur="deactivateInsertEditing"
            />
            <pre
              v-else
              class="whitespace-pre-wrap break-word px-2 py-1 text-xs leading-relaxed text-green-900 font-mono"
            >{{ editedContent }}</pre>
          </div>
        </div>
      </template>

      <!-- BlockEditProposal: replace_range -->
      <template v-else-if="current.kind === 'block' && blockProposal.type === 'replace_range'">
        <div class="px-3 py-1 text-xs border-b" :class="hasDeleteProposal ? 'text-red-700 border-red-100' : 'text-yellow-700 border-yellow-100'">
          <span class="font-medium mr-2" :class="hasDeleteProposal ? 'text-red-800' : 'text-yellow-800'">修改详情</span>
          块 {{ blockProposal.startDisplayBlockId }}–{{ blockProposal.endDisplayBlockId }}
        </div>
        <DiffSplitView
          :old-content="blockProposal.oldContent || ''"
          :new-content="blockProposal.newContent || ''"
          editable-right
          v-model="editedContent"
        />
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
      <div class="flex flex-col gap-2 min-w-0 flex-1">
        <div class="flex gap-1.5 flex-wrap">
          <button
            @click="approve"
            :class="approveButtonClass"
            class="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded text-white transition-colors"
          >{{ approveButtonLabel }}</button>
          <button
            @click="openReworkComposer"
            class="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-white text-amber-700 border border-amber-300 hover:bg-amber-50 transition-colors"
          >↻ 重新修改</button>
          <button
            @click="$emit('endRound', current ? { id: current.id } : undefined)"
            class="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
          >⏹ 结束本轮</button>
        </div>

        <div v-if="showReworkComposer" class="rounded-md border border-amber-200 bg-white/80 p-2">
          <div class="text-[11px] font-medium text-amber-800">告诉 AI 这次应该怎么调整</div>
          <div class="mt-1 text-[11px] text-amber-700">
            提交后会暂停这一批后续修改，先让 AI 重做当前这处。
          </div>
          <textarea
            v-model="reworkReason"
            rows="3"
            class="mt-1 w-full resize-y rounded border border-amber-200 bg-white px-2 py-1.5 text-xs leading-relaxed text-gray-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            placeholder="例如：保留原文事实，只调整文风；不要再压缩句子。"
          />
          <div class="mt-2 flex gap-1.5">
            <button
              @click="submitRework"
              :disabled="!reworkReason.trim() || !current"
              class="px-2.5 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >提交并重改</button>
            <button
              @click="cancelReworkComposer"
              class="px-2.5 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >取消</button>
          </div>
        </div>

        <div
          v-if="proposals.length > 1"
          class="text-[11px]"
          :class="hasDeleteProposal ? 'text-red-700' : isQuickFixBatch ? 'text-blue-700' : 'text-yellow-700'"
        >
          当前确认只会暂存，等本批都审核完后再统一执行。
        </div>
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import MarkdownContentView from './MarkdownContentView.vue'
import DiffSplitView from './DiffSplitView.vue'
import type { EditProposal, BlockEditProposal, FileCreateProposal } from '@/ai/types'
import type { ProposalReviewEntry, ProposalReviewSummary } from '@/ai/store/ai'
import { PROPOSAL_TYPE_LABELS } from '@/ai/types'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import { findNodeById } from '@/ai/edit-agent/BlockEditApplier'
import { highlightBlock } from '@/ai/edit-agent/iwBlockHighlightExtension'

const props = defineProps<{
  proposals: EditProposal[]
  isStreaming?: boolean
  sessionMode?: 'quick_fix' | 'standard' | 'delete_review'
  reviewedEntries?: ProposalReviewEntry[]
  reviewSummary?: ProposalReviewSummary | null
}>()
const emit = defineEmits<{
  approve:    [id: string]
  editApprove: [payload: { id: string; editedArgs: Record<string, unknown> }]
  approveAll: []
  rework: [payload: { id: string; reason: string }]
  endRound: [payload?: { id?: string }]
}>()

const currentIndex = ref(0)
const editedContent = ref('')
const isInsertEditing = ref(false)
const insertEditorRef = ref<HTMLTextAreaElement | null>(null)
const showReworkComposer = ref(false)
const reworkReason = ref('')

// Keep index in bounds when list shrinks (after approve/reject)
watch(() => props.proposals.length, len => {
  if (currentIndex.value >= len) {
    currentIndex.value = Math.max(0, len - 1)
  }
})

const current = computed(() => props.proposals[currentIndex.value] ?? null)
const reviewedEntriesToShow = computed(() => props.reviewedEntries ?? [])

const blockProposal  = computed(() => current.value as BlockEditProposal)
const createProposal = computed(() => current.value as FileCreateProposal)

const isSingleBlock = computed(() =>
  current.value?.kind === 'block' &&
  ['edit', 'delete'].includes(blockProposal.value?.type ?? '')
)

const isEditableProposal = computed(() =>
  current.value?.kind === 'block' &&
  ['edit', 'insert', 'replace_range'].includes(blockProposal.value?.type ?? '')
)

const hasEditedContent = computed(() =>
  isEditableProposal.value
  && editedContent.value !== (blockProposal.value?.newContent || '')
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
  if (hasEditedContent.value) return '✓ 编辑后应用'
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

function reviewedBadgeClass(entry: ProposalReviewEntry): string {
  switch (entry.tone) {
    case 'green':
      return 'bg-green-100 text-green-700'
    case 'blue':
      return 'bg-blue-100 text-blue-700'
    case 'amber':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function approve() {
  if (!current.value) return
  if (hasEditedContent.value && current.value.kind === 'block') {
    const editedArgs = current.value.type === 'insert'
      ? { new_blocks: editedContent.value }
      : { new_content: editedContent.value }
    emit('editApprove', { id: current.value.id, editedArgs })
    return
  }
  emit('approve', current.value.id)
  // index adjusts via watcher after list shrinks
}

function openReworkComposer() {
  showReworkComposer.value = true
}

function cancelReworkComposer() {
  showReworkComposer.value = false
  reworkReason.value = ''
}

function submitRework() {
  if (!current.value || !reworkReason.value.trim()) return
  emit('rework', {
    id: current.value.id,
    reason: reworkReason.value.trim(),
  })
  cancelReworkComposer()
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function next() {
  if (currentIndex.value < props.proposals.length - 1) currentIndex.value++
}

function scrollToProposal(proposal: EditProposal | null | undefined) {
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

function scrollToCurrentBlock() {
  scrollToProposal(current.value)
}

function focusReviewedProposal(proposal: EditProposal) {
  const pendingIndex = props.proposals.findIndex(item => item.id === proposal.id)
  if (pendingIndex >= 0) {
    currentIndex.value = pendingIndex
    return
  }
  scrollToProposal(proposal)
}

function clearHighlight() {
  const appStore = useAppStore()
  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  if (editor) highlightBlock(editor, null)
}

function activateInsertEditing() {
  if (!(current.value?.kind === 'block' && current.value.type === 'insert') || isInsertEditing.value) return
  isInsertEditing.value = true
  nextTick(() => {
    insertEditorRef.value?.focus()
  })
}

function deactivateInsertEditing() {
  isInsertEditing.value = false
}

watch(currentIndex, scrollToCurrentBlock)
watch(
  current,
  proposal => {
    isInsertEditing.value = false
    showReworkComposer.value = false
    reworkReason.value = ''
    if (!proposal || proposal.kind !== 'block') {
      editedContent.value = ''
      return
    }
    editedContent.value = proposal.newContent || ''
  },
  { immediate: true }
)
onMounted(scrollToCurrentBlock)
onUnmounted(clearHighlight)
</script>
