<template>
  <div class="border border-yellow-300 bg-yellow-50 rounded-lg overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-yellow-100 border-b border-yellow-200">
      <div class="flex items-center gap-2">
        <span class="text-sm leading-none">✏️</span>
        <span class="text-xs font-medium text-yellow-800">{{ typeLabel }}</span>
      </div>
      <span class="text-xs text-yellow-600 max-w-[200px] truncate" :title="proposal.description">
        {{ proposal.description }}
      </span>
    </div>

    <!-- FileCreateProposal (kind === 'create_file') -->
    <template v-if="proposal.kind === 'create_file'">
      <div class="px-3 py-1.5 text-xs text-yellow-700 font-medium border-b border-yellow-100">
        📄 {{ createProposal.filename }}.md
      </div>
      <div class="p-2 text-xs">
        <div class="text-green-600 font-medium mb-1">文档内容</div>
        <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-48 overflow-auto font-mono leading-relaxed">{{ createProposal.content }}</pre>
      </div>
    </template>

    <!-- BlockEditProposal — single-block diff (edit / delete) -->
    <template v-else-if="isSingleBlock">
      <div class="grid grid-cols-2 divide-x divide-yellow-200 text-xs">
        <div class="p-2">
          <div class="text-red-600 font-medium mb-1">原文</div>
          <pre class="whitespace-pre-wrap break-words text-red-700 bg-red-50 rounded p-1.5 max-h-32 overflow-auto font-mono leading-relaxed">{{ blockProposal.oldContent || '(空)' }}</pre>
        </div>
        <div class="p-2" v-if="blockProposal.type !== 'delete'">
          <div class="text-green-600 font-medium mb-1">修改后</div>
          <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-32 overflow-auto font-mono leading-relaxed">{{ blockProposal.newContent }}</pre>
        </div>
        <div class="p-2 flex items-center justify-center" v-else>
          <span class="text-xs text-red-500">此块将被删除</span>
        </div>
      </div>
    </template>

    <!-- Insert block -->
    <template v-else-if="proposal.kind === 'block' && blockProposal.type === 'insert'">
      <div class="p-2 text-xs">
        <div class="text-green-600 font-medium mb-1">插入内容</div>
        <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-32 overflow-auto font-mono leading-relaxed">{{ blockProposal.newContent }}</pre>
      </div>
    </template>

    <!-- replace_range: show old content vs new content -->
    <template v-else-if="proposal.kind === 'block' && blockProposal.type === 'replace_range'">
      <div class="grid grid-cols-2 divide-x divide-yellow-200 text-xs">
        <div class="p-2">
          <div class="text-red-600 font-medium mb-1">原文 (块 {{ blockProposal.startDisplayBlockId }}–{{ blockProposal.endDisplayBlockId }})</div>
          <pre class="whitespace-pre-wrap break-words text-red-700 bg-red-50 rounded p-1.5 max-h-40 overflow-auto font-mono leading-relaxed">{{ blockProposal.oldContent || '(空)' }}</pre>
        </div>
        <div class="p-2">
          <div class="text-green-600 font-medium mb-1">修改后</div>
          <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-40 overflow-auto font-mono leading-relaxed">{{ blockProposal.newContent }}</pre>
        </div>
      </div>
    </template>

    <!-- Fallback -->
    <template v-else>
      <div class="p-2 text-xs">
        <div class="text-green-600 font-medium mb-1">新内容预览</div>
        <pre class="whitespace-pre-wrap break-words text-green-700 bg-green-50 rounded p-1.5 max-h-40 overflow-auto font-mono leading-relaxed">{{ proposal.kind === 'block' ? blockProposal.newContent : '' }}</pre>
      </div>
    </template>

    <!-- Actions -->
    <div v-if="!disabled" class="flex items-center gap-2 px-3 py-2 bg-yellow-50 border-t border-yellow-200">
      <button
        @click="$emit('approve', proposal.id)"
        class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
      >
        ✓ 应用
      </button>
      <button
        @click="$emit('reject', proposal.id)"
        class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        ✗ 忽略
      </button>
    </div>
    <div v-else class="px-3 py-1.5 text-xs text-yellow-600 bg-yellow-50 border-t border-yellow-200">
      处理完成后可审核
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EditProposal, BlockEditProposal, FileCreateProposal } from '@/ai/types'
import { PROPOSAL_TYPE_LABELS } from '@/ai/types'

const props = defineProps<{ proposal: EditProposal; disabled?: boolean }>()
defineEmits<{ approve: [id: string]; reject: [id: string] }>()

const blockProposal  = computed(() => props.proposal as BlockEditProposal)
const createProposal = computed(() => props.proposal as FileCreateProposal)

const typeLabel = computed(() => {
  if (props.proposal.kind === 'create_file') return '创建文档'
  return PROPOSAL_TYPE_LABELS[blockProposal.value.type] ?? '编辑建议'
})

const isSingleBlock = computed(() =>
  props.proposal.kind === 'block' &&
  ['edit', 'delete'].includes(blockProposal.value.type)
)
</script>
