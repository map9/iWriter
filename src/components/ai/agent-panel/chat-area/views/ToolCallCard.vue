<template>
  <div
    class="overflow-hidden rounded-box text-xs border transition-colors"
    :class="[containerClass, groupContainerClass, groupDividerClass]"
  >
    <div
      class="group flex items-center gap-2.5 px-2 py-0.5 cursor-pointer select-none"
      @click="toggleExpanded"
    >
      <div class="w-3.5 shrink-0 flex items-center justify-center">
        <IconLoader2 v-if="isSpinning" class="icon-2xs animate-spin" />
        <component v-else-if="completedKindIcon" :is="completedKindIcon" class="icon-2xs" />
        <span v-else class="leading-none">{{ statusIcon }}</span>
      </div>

      <div class="shrink-0 font-semibold text-xs leading-4 whitespace-nowrap">
        {{ actionLabel }}
      </div>

      <div class="min-w-0 flex-1 flex flex-col justify-center">
        <div
          v-if="inputLine"
          class="min-w-0 text-2xs leading-4 truncate"
        >
          <button
            v-if="targetPath && targetLabel"
            class="inline max-w-full truncate font-medium text-left opacity-70 underline underline-offset-2 hover:opacity-100 cursor-pointer"
            :title="targetPath"
            @click.stop="openTargetFile"
          >
            {{ targetLabel }}
          </button>
          <span v-else-if="targetLabel" class="truncate">{{ targetLabel }}</span>
        </div>

        <div
          v-if="contextSummaryLine"
          class="min-w-0 text-2xs leading-4 truncate whitespace-nowrap opacity-70"
          :class="inputLine ? 'mt-px' : ''"
          :title="contextSummaryLine"
        >
          {{ contextSummaryLine }}
        </div>
      </div>

      <button
        v-if="showExpandableDetail"
        class="iw-toolbar-btn btn-xs opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-transparent"
        :title="expanded ? t('agentPanel.common.collapse') : t('agentPanel.common.expandDetails')"
        @click.stop="toggleExpanded"
      >
        <IconChevronDown v-if="expanded" class="icon-2xs" />
        <IconChevronUp v-else class="icon-2xs" />
      </button>
    </div>

    <div
      v-if="showDetail"
      class="bg-base-100 px-2.5 py-2 space-y-2"
      :class="[detailBorderClass, groupDetailClass]"
    >
      <div v-if="detailType === 'outline' && outlineItems.length" class="space-y-1.5">
        <div class="text-xs font-medium text-base-content">{{ t('agentPanel.toolCall.outline') }}</div>
        <div
          v-for="item in outlineItems"
          :key="`${item.blockId}-${item.text}`"
          class="flex items-start justify-between gap-2 rounded-box bg-base-100 px-2 py-1.5"
          :style="{ paddingLeft: `${0.5 + (item.level - 1) * 0.75}rem` }"
        >
          <div class="min-w-0">
            <div class="truncate text-base-content">{{ item.text || t('agentPanel.toolCall.unnamedTitle', { id: item.blockId }) }}</div>
            <div class="text-2xs text-base-content">H{{ item.level }} · {b:{{ item.blockId }}}</div>
          </div>
          <div class="shrink-0 text-2xs text-base-content text-right">
            <div>{{ t('agentPanel.toolCall.blocks', { count: item.sectionBlocks }) }}</div>
            <div>{{ t('agentPanel.toolCall.words', { count: item.wordCount }) }}</div>
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'section' && parsedResult" class="space-y-2">
        <div v-if="sectionHeading" class="text-xs font-medium text-base-content">
          {{ sectionHeading }}
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/70">
          <span v-if="sectionRange">{{ t('agentPanel.toolCall.rangePrefix') }} {{ sectionRange }}</span>
          <span v-if="sectionReadProgress">{{ sectionReadProgress }}</span>
          <span v-if="sectionWordCount">{{ sectionWordCount }}</span>
          <span v-if="sectionHasMore">{{ t('agentPanel.toolCall.hasMore') }}</span>
        </div>
        <MarkdownContentView v-if="sectionContent" :content="sectionContent" mode="text" size="xs" />
      </div>

      <div v-else-if="detailType === 'sections' && batchSectionItems.length" class="space-y-2">
        <div
          v-for="item in batchSectionItems"
          :key="item.key"
          class="rounded-box bg-base-200 px-2 py-1.5"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-xs font-medium text-base-content">
                {{ item.heading || t('agentPanel.toolCall.unnamedSection') }}
              </div>
              <div class="text-2xs text-base-content">heading {b:{{ item.headingBlockId }}}</div>
            </div>
            <span v-if="item.error" class="shrink-0 text-2xs text-error-content">{{ t('agentPanel.displayNormalizer.status.failed') }}</span>
          </div>
          <div v-if="item.error" class="mt-1 text-xs text-error-content">
            {{ item.error }}
          </div>
          <template v-else>
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/70">
              <span v-if="item.range">{{ t('agentPanel.toolCall.rangePrefix') }} {{ item.range }}</span>
              <span v-if="item.progress">{{ item.progress }}</span>
              <span v-if="item.wordCount">{{ item.wordCount }}</span>
              <span v-if="item.hasMore">{{ t('agentPanel.toolCall.hasMore') }}</span>
            </div>
            <div v-if="item.content" class="mt-1">
              <MarkdownContentView :content="item.content" mode="text" size="xs" />
            </div>
          </template>
        </div>
      </div>

      <div v-else-if="detailType === 'blocks' && blockItems.length" class="space-y-1.5">
        <div
          v-for="item in blockItems"
          :key="item.blockId"
          class="rounded-box bg-base-200 px-2 py-1.5"
        >
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-medium text-base-content">{b:{{ item.blockId }}}</span>
            <span class="text-base-content">{{ item.type }}</span>
          </div>
          <div class="mt-1">
            <MarkdownContentView :content="item.content" mode="text" size="xs" />
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'block_context' && blockItems.length" class="space-y-1.5">
        <div class="text-xs font-medium text-base-content">{{ t('agentPanel.toolCall.contextBlocks') }}</div>
        <div
          v-for="item in blockItems"
          :key="item.blockId"
          class="rounded-box px-2 py-1.5"
          :class="item.blockId === centerBlockId ? 'bg-info/50 border border-info-content/15 text-info-content' : 'bg-base-100'"
        >
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-medium text-base-content">{b:{{ item.blockId }}}</span>
            <span class="text-base-content">{{ item.type }}</span>
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
          class="rounded-box bg-base-200 px-2 py-1.5"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-base-content">{{ section.heading || t('agentPanel.toolCall.unnamedSection') }}</div>
              <div class="text-2xs text-base-content">heading {b:{{ section.headingBlockId }}}</div>
            </div>
            <div class="shrink-0 text-2xs text-base-content">{{ t('agentPanel.toolCall.matched', { count: section.matchCount }) }}</div>
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
          class="rounded-box bg-base-200 px-2 py-1.5"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <button
                class="inline max-w-full truncate font-medium text-left text-base-content/50 underline underline-offset-2 hover:text-base-content hover:decoration-base-content cursor-pointer"
                :title="file.filePath"
                @click.stop="openFilePath(file.filePath)"
              >
                {{ file.fileName }}
              </button>
              <div class="text-2xs text-base-content truncate">{{ file.filePath }}</div>
            </div>
            <div class="shrink-0 text-2xs text-base-content text-right">
              <div>{{ t('agentPanel.toolCall.matched', { count: file.totalMatches }) }}</div>
              <div>{{ file.documentType }}</div>
            </div>
          </div>
          <div v-if="file.previews.length" class="mt-1.5 space-y-1">
            <div
              v-for="preview in file.previews"
              :key="`${file.filePath}-${preview.blockId}`"
              class="rounded-box bg-base-200 px-2 py-1 border border-base-300"
            >
              <div class="text-2xs text-base-content mb-1">
                <span v-if="preview.heading">{{ preview.heading }}</span>
                <span v-else>{{ t('agentPanel.toolCall.unnamedSection') }}</span>
                <span> · {b:{{ preview.blockId }}}</span>
              </div>
              <MarkdownContentView :content="preview.preview" mode="text" size="xs" />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="detailType === 'subagent_task' && (taskDescription || taskResult)" class="space-y-2">
        <div v-if="taskSubagentType" class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content">
          <span>{{ t('agentPanel.toolCall.subagent', { type: taskSubagentType }) }}</span>
        </div>
        <div v-if="taskDescription" class="space-y-1">
          <div class="text-xs font-medium text-base-content">{{ t('agentPanel.toolCall.delegateDescription') }}</div>
          <div class="rounded-box bg-base-200 px-2 py-1.5">
            <MarkdownContentView :content="taskDescription" mode="text" size="xs" />
          </div>
        </div>
        <div v-if="taskResult" class="space-y-1">
          <div class="text-xs font-medium text-base-content">{{ t('agentPanel.toolCall.subagentResult') }}</div>
          <MarkdownContentView :content="taskResult" mode="markdown" size="xs" />
        </div>
      </div>

      <div v-else-if="detailType === 'todo_list' && todoItems.length" class="space-y-1.5">
        <div
          v-for="(item, idx) in todoItems"
          :key="`${idx}-${item.content}`"
          class="flex items-start gap-2 rounded-box bg-base-200 px-2 py-1.5"
        >
          <span
            class="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-2xs leading-none"
            :class="item.statusClass"
          >
            {{ item.icon }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base-content wrap-break-word">{{ item.content }}</div>
            <div v-if="item.statusLabel" class="mt-0.5 text-2xs text-base-content">{{ item.statusLabel }}</div>
          </div>
        </div>
      </div>

      <div v-else-if="resultText" class="space-y-1">
        <div class="text-xs font-medium text-base-content">{{ t('agentPanel.toolCall.resultDetails') }}</div>
        <MarkdownContentView :content="resultText" mode="text" size="xs" />
      </div>

      <details v-if="showRawResult" class="group">
        <summary class="cursor-pointer text-xs text-base-content hover:text-base-content/50">{{ t('agentPanel.toolCall.viewRawResult') }}</summary>
        <div class="mt-2 rounded-box bg-base-200 px-2 py-1.5">
          <MarkdownContentView :content="rawResult" mode="text" size="xs" />
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconChevronUp,
  IconChevronDown,
  IconLoader2,
  IconEye,
  IconSearch,
  IconPencil,
  IconTrash,
  IconTerminal2,
  IconUsers,
  IconTool,
} from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import type { AiToolCall } from '@/ai/types'
import MarkdownContentView from './MarkdownContentView.vue'

const props = defineProps<{
  toolCall: AiToolCall
  groupPosition?: 'single' | 'start' | 'middle' | 'end'
}>()

const appStore = useAppStore()
const { t } = useI18n()
const expanded = ref(false)
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
  if (isError) return 'border-error-content/15 bg-error/50 text-error-content hover:bg-error/70'
  if (isRejected) return 'border-base-300 bg-base-100 text-base-content hover:bg-base-300'
  if (isRunning) return 'border-info-content/15 bg-info/50 text-info-content'
  switch (props.toolCall.kind) {
    case 'edit':
    case 'delete':
      return 'border-warning-content/15 bg-warning/50 text-warning-content hover:bg-warning/70'
    case 'execute':
      return 'border-error-content/15 bg-error/50 text-error-content hover:bg-error/70'
    case 'search':
      return 'border-info-content/15 bg-info/50 text-info-content hover:bg-info/70'
    case 'delegate':
      return 'border-secondary-content/15 bg-secondary/50 text-secondary-content hover:bg-secondary/70'
    case 'read':
      return 'border-success-content/15 bg-success/50 text-success-content hover:bg-success/70'
    case 'other':
    default:
      return 'border-base-300 bg-base-200 text-base-content hover:bg-base-300'
  }
})

const groupContainerClass = computed(() => {
  switch (groupPosition.value) {
    case 'start':
      return 'rounded-t-box rounded-b-none border-b-0'
    case 'middle':
      return 'rounded-none border-t-0 border-b-0'
    case 'end':
      return 'rounded-b-box rounded-t-none border-t-0'
    default:
      return 'rounded-box'
  }
})

const groupDividerClass = computed(() => {
  switch (groupPosition.value) {
    case 'middle':
      return ''
    case 'end':
      return 'shadow-sm'
    default:
      return ''
  }
})

const groupDetailClass = computed(() => {
  if (groupPosition.value === 'middle' || groupPosition.value === 'end') return 'border-t'
  return ''
})

const detailBorderClass = computed(() => {
  if (props.toolCall.isError || props.toolCall.status === 'failed') return 'border-error-content/15'
  if (props.toolCall.status === 'rejected') return 'border-base-300'
  if (props.toolCall.status === 'pending' || props.toolCall.status === 'in_progress') return 'border-info-content/15'
  switch (props.toolCall.kind) {
    case 'edit':
    case 'delete':
      return 'border-warning-content/15'
    case 'execute':
      return 'border-error-content/15'
    case 'search':
      return 'border-info-content/15'
    case 'delegate':
      return 'border-secondary-content/15'
    case 'read':
      return 'border-success-content/15'
    case 'other':
    default:
      return 'border-base-300'
  }
})

const completedKindIcon = computed(() => {
  if (props.toolCall.status !== 'completed') return null
  if (props.toolCall.isError) return null
  switch (props.toolCall.kind) {
    case 'read': return IconEye
    case 'search': return IconSearch
    case 'edit': return IconPencil
    case 'delete': return IconTrash
    case 'execute': return IconTerminal2
    case 'delegate': return IconUsers
    case 'other':
    default: return IconTool
  }
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
    case 'sections':
      return batchSectionItems.value.length > 0
    case 'blocks':
    case 'block_context':
      return blockItems.value.length > 0
    case 'search_sections':
      return searchSections.value.length > 0
    case 'workspace_search':
      return workspaceFiles.value.length > 0
    case 'todo_list':
      return todoItems.value.length > 0
    case 'subagent_task':
      return !!(taskDescription.value || taskResult.value)
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

const sectionReadProgress = computed(() => {
  if (!parsedResult.value) return ''
  const offset = parsedResult.value.offset
  const limit = parsedResult.value.limit
  const totalLines = parsedResult.value.total_lines
  const content = parsedResult.value.content
  const currentCount = typeof content === 'string'
    ? (content.match(/\{b:\d+\}/g)?.length ?? 0)
    : 0

  if (typeof totalLines === 'number' && currentCount > 0) {
    if (totalLines > currentCount) return t('agentPanel.toolCall.sectionReadProgress', { current: currentCount, total: totalLines })
    return t('agentPanel.toolCall.sectionTotal', { total: totalLines })
  }

  if (typeof offset === 'number' && typeof limit === 'number') {
    const start = offset + 1
    const end = typeof totalLines === 'number'
      ? Math.min(offset + limit, totalLines)
      : offset + limit
    return t('agentPanel.toolCall.sectionRangeCount', { start, end })
  }

  if (typeof totalLines === 'number') return t('agentPanel.toolCall.sectionTotal', { total: totalLines })
  return ''
})

const sectionWordCount = computed(() => {
  const wordCount = parsedResult.value?.word_count
  return typeof wordCount === 'number' ? t('agentPanel.toolCall.wordCount', { count: wordCount }) : ''
})

const sectionHasMore = computed(() => parsedResult.value?.has_more === true)

const sectionContent = computed(() => {
  const content = parsedResult.value?.content
  return typeof content === 'string' ? content : ''
})

const batchSectionItems = computed(() => {
  const sections = parsedResult.value?.sections
  if (!Array.isArray(sections)) return []
  return sections.map((item, index) => {
    const entry = item as Record<string, unknown>
    const headingBlockId = Number(entry.heading_block_id ?? 0)
    const content = typeof entry.content === 'string' ? entry.content : ''
    const totalLines = typeof entry.total_lines === 'number' ? entry.total_lines : null
    const currentCount = content ? (content.match(/\{b:\d+\}/g)?.length ?? 0) : 0
    const offset = typeof entry.offset === 'number' ? entry.offset : null
    const limit = typeof entry.limit === 'number' ? entry.limit : null

    let progress = ''
    if (totalLines !== null && currentCount > 0) {
      progress = totalLines > currentCount
        ? t('agentPanel.toolCall.sectionReadProgress', { current: currentCount, total: totalLines })
        : t('agentPanel.toolCall.sectionTotal', { total: totalLines })
    } else if (offset !== null && limit !== null) {
      const start = offset + 1
      const end = totalLines !== null ? Math.min(offset + limit, totalLines) : offset + limit
      progress = t('agentPanel.toolCall.sectionRangeCount', { start, end })
    } else if (totalLines !== null) {
      progress = t('agentPanel.toolCall.sectionTotal', { total: totalLines })
    }

    const range = Array.isArray(entry.block_id_range) && entry.block_id_range.length >= 2
      ? `{b:${entry.block_id_range[0]}}-{b:${entry.block_id_range[1]}}`
      : ''
    const wordCount = typeof entry.word_count === 'number'
      ? t('agentPanel.toolCall.wordCount', { count: entry.word_count })
      : ''

    return {
      key: `${headingBlockId}-${index}`,
      headingBlockId,
      heading: typeof entry.heading === 'string' ? entry.heading : '',
      range,
      progress,
      wordCount,
      hasMore: entry.has_more === true,
      content,
      error: typeof entry.error === 'string' ? entry.error : '',
    }
  })
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

const taskDescription = computed(() => {
  const value = parsedResult.value?.description
  return typeof value === 'string' ? value : ''
})

const taskSubagentType = computed(() => {
  const value = parsedResult.value?.subagent_type
  return typeof value === 'string' ? value : ''
})

const taskResult = computed(() => {
  const value = parsedResult.value?.result
  return typeof value === 'string' ? value : ''
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
        statusLabel: t('agentPanel.toolCall.todo.completed'),
        statusClass: 'border-success-content/15 bg-success/50 text-success-content',
      }
    }
    if (status === 'in_progress') {
      return {
        content,
        icon: '•',
        statusLabel: t('agentPanel.toolCall.todo.inProgress'),
        statusClass: 'border-warning-content/15 bg-warning/50 text-warning-content',
      }
    }
    return {
      content,
      icon: '',
      statusLabel: t('agentPanel.toolCall.todo.pending'),
      statusClass: 'border-base-300 bg-base-100 text-transparent',
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
