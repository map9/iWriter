<template>
  <div
    class="overflow-hidden text-xs border transition-colors"
    :class="[containerClass, groupContainerClass, groupDividerClass]"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div
      class="flex items-center gap-2.5 px-2.5 py-1.5 transition-colors"
      :class="headerHoverClass"
      @click="toggleExpanded"
    >
      <div class="w-3.5 flex-shrink-0 flex items-center justify-center">
        <IconLoader2 v-if="isSpinning" class="w-3 h-3 animate-spin" />
        <span v-else class="leading-none">{{ statusIcon }}</span>
      </div>

      <div class="flex-shrink-0 font-semibold text-[12px] leading-4 whitespace-nowrap">
        {{ actionLabel }}
      </div>

      <div class="min-w-0 flex-1 flex flex-col justify-center">
        <div
          v-if="inputLine"
          class="min-w-0 text-[10.5px] leading-4 text-gray-700 truncate"
        >
          <button
            v-if="targetPath && targetLabel"
            class="inline max-w-full truncate text-left underline decoration-gray-300 underline-offset-2 hover:text-gray-900 hover:decoration-gray-500"
            :title="targetPath"
            @click.stop="openTargetFile"
          >
            {{ targetLabel }}
          </button>
          <span v-else-if="targetLabel" class="truncate">{{ targetLabel }}</span>
        </div>

        <div
          v-if="contextSummaryLine"
          class="min-w-0 text-[10px] leading-4 text-gray-500 truncate whitespace-nowrap"
          :class="inputLine ? 'mt-[1px]' : ''"
          :title="contextSummaryLine"
        >
          {{ contextSummaryLine }}
        </div>
      </div>

      <button
        v-if="showExpandableDetail"
        class="flex-shrink-0 w-4.5 h-4.5 flex items-center justify-center rounded text-[9px] text-gray-500 transition-opacity hover:bg-black/5"
        :class="expanded || isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        :title="expanded ? '收起' : '展开'"
        @click.stop="toggleExpanded"
      >
        {{ expanded ? '▲' : '▼' }}
      </button>
    </div>

    <div
      v-if="showDetail"
      class="border-t bg-white px-2.5 py-2 space-y-2"
      :class="[detailBorderClass, groupDetailClass]"
    >
      <div v-if="detailType === 'outline' && outlineItems.length" class="space-y-1.5">
        <div class="text-[11px] font-medium text-gray-500">文档结构</div>
        <div
          v-for="item in outlineItems"
          :key="`${item.blockId}-${item.text}`"
          class="flex items-start justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5"
          :style="{ paddingLeft: `${0.5 + (item.level - 1) * 0.75}rem` }"
        >
          <div class="min-w-0">
            <div class="truncate text-gray-900">{{ item.text || `未命名标题 ${item.blockId}` }}</div>
            <div class="text-[10px] text-gray-500">H{{ item.level }} · {b:{{ item.blockId }}}</div>
          </div>
          <div class="flex-shrink-0 text-[10px] text-gray-500 text-right">
            <div>{{ item.sectionBlocks }} blocks</div>
            <div>{{ item.wordCount }} 字</div>
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'section' && parsedResult" class="space-y-2">
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span v-if="sectionHeading">章节：{{ sectionHeading }}</span>
          <span v-if="sectionRange">范围：{{ sectionRange }}</span>
          <span v-if="sectionPagination">{{ sectionPagination }}</span>
        </div>
        <MarkdownContentView v-if="sectionContent" :content="sectionContent" mode="text" size="xs" />
      </div>

      <div v-else-if="detailType === 'blocks' && blockItems.length" class="space-y-1.5">
        <div
          v-for="item in blockItems"
          :key="item.blockId"
          class="rounded-md bg-gray-50 px-2 py-1.5"
        >
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="font-medium text-gray-700">{b:{{ item.blockId }}}</span>
            <span class="text-gray-500">{{ item.type }}</span>
          </div>
          <div class="mt-1">
            <MarkdownContentView :content="item.content" mode="text" size="xs" />
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'block_context' && blockItems.length" class="space-y-1.5">
        <div class="text-[11px] font-medium text-gray-500">上下文块</div>
        <div
          v-for="item in blockItems"
          :key="item.blockId"
          class="rounded-md px-2 py-1.5"
          :class="item.blockId === centerBlockId ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'"
        >
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="font-medium text-gray-700">{b:{{ item.blockId }}}</span>
            <span class="text-gray-500">{{ item.type }}</span>
          </div>
          <div class="mt-1">
            <MarkdownContentView :content="item.content" mode="text" size="xs" />
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'search_sections' && searchSections.length" class="space-y-2">
        <div
          v-for="section in searchSections"
          :key="`${section.headingBlockId}-${section.heading}`"
          class="rounded-md bg-gray-50 px-2 py-1.5"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-gray-900">{{ section.heading || '未命名章节' }}</div>
              <div class="text-[10px] text-gray-500">heading {b:{{ section.headingBlockId }}}</div>
            </div>
            <div class="flex-shrink-0 text-[10px] text-gray-500">{{ section.matchCount }} 个命中</div>
          </div>
          <div v-if="section.preview" class="mt-1">
            <MarkdownContentView :content="section.preview" mode="text" size="xs" />
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'workspace_search' && workspaceFiles.length" class="space-y-2">
        <div
          v-for="file in workspaceFiles"
          :key="file.filePath"
          class="rounded-md bg-gray-50 px-2 py-1.5"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <button
                class="truncate text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-gray-950 hover:decoration-gray-500"
                :title="file.filePath"
                @click.stop="openFilePath(file.filePath)"
              >
                {{ file.fileName }}
              </button>
              <div class="text-[10px] text-gray-500 truncate">{{ file.filePath }}</div>
            </div>
            <div class="flex-shrink-0 text-[10px] text-gray-500 text-right">
              <div>{{ file.totalMatches }} 个命中</div>
              <div>{{ file.documentType }}</div>
            </div>
          </div>
          <div v-if="file.previews.length" class="mt-1.5 space-y-1">
            <div
              v-for="preview in file.previews"
              :key="`${file.filePath}-${preview.blockId}`"
              class="rounded bg-white px-2 py-1 border border-gray-100"
            >
              <div class="text-[10px] text-gray-500 mb-1">
                <span v-if="preview.heading">{{ preview.heading }}</span>
                <span v-else>未命名章节</span>
                <span> · {b:{{ preview.blockId }}}</span>
              </div>
              <MarkdownContentView :content="preview.preview" mode="text" size="xs" />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'todo_list' && todoItems.length" class="space-y-1.5">
        <div
          v-for="(item, idx) in todoItems"
          :key="`${idx}-${item.content}`"
          class="flex items-start gap-2 rounded-md bg-gray-50 px-2 py-1.5"
        >
          <span
            class="mt-[1px] inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] leading-none"
            :class="item.statusClass"
          >
            {{ item.icon }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-gray-900 break-words">{{ item.content }}</div>
            <div v-if="item.statusLabel" class="mt-0.5 text-[10px] text-gray-500">{{ item.statusLabel }}</div>
          </div>
        </div>
      </div>

      <div v-else-if="resultText" class="space-y-1">
        <div class="text-[11px] font-medium text-gray-500">结果详情</div>
        <MarkdownContentView :content="resultText" mode="text" size="xs" />
      </div>

      <details v-if="showRawResult" class="group">
        <summary class="cursor-pointer text-[11px] text-gray-500 hover:text-gray-700">查看原始结果</summary>
        <div class="mt-2 rounded-md bg-gray-50 px-2 py-1.5">
          <MarkdownContentView :content="rawResult" mode="text" size="xs" />
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconLoader2 } from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import type { AiToolCall } from '@/ai/types'
import MarkdownContentView from './MarkdownContentView.vue'

const props = defineProps<{
  toolCall: AiToolCall
  groupPosition?: 'single' | 'start' | 'middle' | 'end'
}>()

const appStore = useAppStore()
const expanded = ref(false)
const isHovered = ref(false)
const groupPosition = computed(() => props.groupPosition ?? 'single')

const isSpinning = computed(() =>
  props.toolCall.status === 'pending' || props.toolCall.status === 'in_progress'
)

const statusIcon = computed(() => {
  if (props.toolCall.status === 'rejected') return '⊘'
  if (props.toolCall.isError || props.toolCall.status === 'failed') return '✗'
  if (props.toolCall.status === 'completed') return '✓'
  return '•'
})

const containerClass = computed(() => {
  const isRunning = props.toolCall.status === 'in_progress' || props.toolCall.status === 'pending'
  const isRejected = props.toolCall.status === 'rejected'
  const isError = props.toolCall.isError || props.toolCall.status === 'failed'
  if (isError) return 'border-red-200 bg-red-50 text-red-700'
  if (isRejected) return 'border-gray-200 bg-gray-50 text-gray-600'
  if (isRunning) return 'border-blue-200 bg-blue-50 text-blue-700'
  if (props.toolCall.kind === 'edit' || props.toolCall.kind === 'delete') {
    return 'border-yellow-200 bg-yellow-50 text-yellow-800'
  }
  return 'border-green-200 bg-green-50 text-green-700'
})

const groupContainerClass = computed(() => {
  switch (groupPosition.value) {
    case 'start':
      return 'rounded-t-lg rounded-b-none border-b-0'
    case 'middle':
      return 'rounded-none border-t-0 border-b-0'
    case 'end':
      return 'rounded-b-lg rounded-t-none border-t-0'
    default:
      return 'rounded-lg'
  }
})

const groupDividerClass = computed(() => {
  switch (groupPosition.value) {
    case 'middle':
    case 'end':
      return 'shadow-[inset_0_1px_0_rgba(15,23,42,0.06)]'
    default:
      return ''
  }
})

const headerHoverClass = computed(() => {
  const base = showExpandableDetail.value ? 'cursor-pointer select-none' : ''
  if (!isHovered.value || expanded.value) return base
  if (props.toolCall.isError || props.toolCall.status === 'failed') return `${base} bg-red-100/40`.trim()
  if (props.toolCall.status === 'rejected') return `${base} bg-gray-100/60`.trim()
  if (props.toolCall.status === 'pending' || props.toolCall.status === 'in_progress') return `${base} bg-blue-100/45`.trim()
  if (props.toolCall.kind === 'edit' || props.toolCall.kind === 'delete') return `${base} bg-yellow-100/45`.trim()
  return `${base} bg-green-100/45`.trim()
})

const groupDetailClass = computed(() => {
  if (groupPosition.value === 'middle' || groupPosition.value === 'end') return 'border-t'
  return ''
})

const detailBorderClass = computed(() => {
  if (props.toolCall.isError || props.toolCall.status === 'failed') return 'border-red-100'
  if (props.toolCall.status === 'rejected') return 'border-gray-100'
  if (props.toolCall.status === 'pending' || props.toolCall.status === 'in_progress') return 'border-blue-100'
  if (props.toolCall.kind === 'edit' || props.toolCall.kind === 'delete') return 'border-yellow-100'
  return 'border-green-100'
})

const display = computed(() => props.toolCall.display ?? {})
const actionLabel = computed(() => display.value.actionLabel || props.toolCall.title || props.toolCall.name)
const targetLabel = computed(() => display.value.targetLabel || '')
const targetPath = computed(() => display.value.targetPath || '')
const contextLabel = computed(() => display.value.contextLabel || '')
const summaryLabel = computed(() => display.value.summaryLabel || '')
const detailType = computed(() => display.value.detailType ?? 'text')
const parsedResult = computed<Record<string, unknown> | null>(() => display.value.parsedResult ?? null)
const rawResult = computed(() => display.value.rawResult ?? props.toolCall.result ?? '')
const resultText = computed(() => props.toolCall.result ?? '')
const inputLine = computed(() => targetLabel.value)
const contextSummaryLine = computed(() => {
  return [contextLabel.value, summaryLabel.value].filter(Boolean).join(' · ')
})
const hasStructuredDetail = computed(() => {
  switch (detailType.value) {
    case 'outline':
      return outlineItems.value.length > 0
    case 'section':
      return !!sectionContent.value
    case 'blocks':
    case 'block_context':
      return blockItems.value.length > 0
    case 'search_sections':
      return searchSections.value.length > 0
    case 'workspace_search':
      return workspaceFiles.value.length > 0
    case 'todo_list':
      return todoItems.value.length > 0
    default:
      return false
  }
})
const showExpandableDetail = computed(() =>
  props.toolCall.status === 'completed' && (hasStructuredDetail.value || !!resultText.value || !!showRawResult.value)
)
const showDetail = computed(() => showExpandableDetail.value && expanded.value)
const showRawResult = computed(() => import.meta.env.DEV && !!rawResult.value)

const outlineItems = computed(() => {
  const outline = parsedResult.value?.outline
  if (!Array.isArray(outline)) return []
  return outline.map(item => {
    const entry = item as Record<string, unknown>
    return {
      blockId: Number(entry.block_id ?? 0),
      level: Number(entry.level ?? 1),
      text: String(entry.text ?? ''),
      sectionBlocks: Number(entry.section_blocks ?? 0),
      wordCount: Number(entry.word_count ?? 0),
    }
  })
})

const sectionHeading = computed(() => {
  const heading = parsedResult.value?.heading
  return typeof heading === 'string' ? heading : ''
})

const sectionRange = computed(() => {
  const range = parsedResult.value?.block_id_range
  if (!Array.isArray(range) || range.length < 2) return ''
  return `{b:${range[0]}}-{b:${range[1]}}`
})

const sectionPagination = computed(() => {
  if (!parsedResult.value) return ''
  const offset = parsedResult.value.offset
  const limit = parsedResult.value.limit
  const totalLines = parsedResult.value.total_lines
  const hasMore = parsedResult.value.has_more === true
  const parts: string[] = []
  if (typeof offset === 'number' && typeof limit === 'number') {
    parts.push(`offset ${offset} · limit ${limit}`)
  }
  if (typeof totalLines === 'number') {
    parts.push(`共 ${totalLines} 段`)
  }
  if (hasMore) parts.push('可继续分页')
  return parts.join(' · ')
})

const sectionContent = computed(() => {
  const content = parsedResult.value?.content
  return typeof content === 'string' ? content : ''
})

const blockItems = computed(() => {
  const blocks = parsedResult.value?.blocks
  if (!Array.isArray(blocks)) return []
  return blocks.map(item => {
    const entry = item as Record<string, unknown>
    return {
      blockId: Number(entry.blockId ?? 0),
      type: String(entry.type ?? ''),
      content: String(entry.content ?? ''),
    }
  })
})

const centerBlockId = computed(() => {
  const center = parsedResult.value?.centerBlockId
  return typeof center === 'number' ? center : null
})

const searchSections = computed(() => {
  const sections = parsedResult.value?.sections
  if (!Array.isArray(sections)) return []
  return sections.map(item => {
    const entry = item as Record<string, unknown>
    const preview = typeof entry.preview === 'string' ? entry.preview : ''
    return {
      headingBlockId: Number(entry.heading_block_id ?? 0),
      heading: String(entry.heading ?? ''),
      matchCount: Number(entry.match_count ?? 0),
      preview,
    }
  })
})

const workspaceFiles = computed(() => {
  const files = parsedResult.value?.files
  if (!Array.isArray(files)) return []
  return files.map(item => {
    const entry = item as Record<string, unknown>
    const matches = Array.isArray(entry.matches) ? entry.matches : []
    return {
      filePath: String(entry.file_path ?? ''),
      fileName: String(entry.file_name ?? ''),
      documentType: String(entry.document_type ?? ''),
      totalMatches: Number(entry.total_matches ?? matches.length),
      previews: matches.slice(0, 3).map(match => {
        const matchEntry = match as Record<string, unknown>
        return {
          blockId: Number(matchEntry.block_id ?? 0),
          heading: String(matchEntry.heading ?? ''),
          preview: String(matchEntry.preview ?? ''),
        }
      }),
    }
  })
})

const todoItems = computed(() => {
  const todos = parsedResult.value?.todos
  if (!Array.isArray(todos)) return []
  return todos.map(item => {
    const entry = item as Record<string, unknown>
    const status = String(entry.status ?? '')
    const content = String(entry.content ?? '')
    if (status === 'completed') {
      return {
        content,
        icon: '✓',
        statusLabel: '已完成',
        statusClass: 'border-green-300 bg-green-100 text-green-700',
      }
    }
    if (status === 'in_progress') {
      return {
        content,
        icon: '•',
        statusLabel: '进行中',
        statusClass: 'border-amber-300 bg-amber-100 text-amber-700',
      }
    }
    return {
      content,
      icon: '',
      statusLabel: '待办',
      statusClass: 'border-slate-300 bg-white text-transparent',
    }
  })
})

function toggleExpanded() {
  if (!showExpandableDetail.value) return
  expanded.value = !expanded.value
}

function openTargetFile() {
  if (!targetPath.value) return
  void appStore.openFile(targetPath.value)
}

function openFilePath(filePath: string) {
  if (!filePath) return
  void appStore.openFile(filePath)
}
</script>
