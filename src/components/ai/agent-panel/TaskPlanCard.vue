<template>
  <div
    class="w-full rounded-lg overflow-hidden text-xs border border-border-separator bg-background-window"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="flex items-center gap-2.5 px-2.5 py-1.5 select-none text-text-primary transition-colors"
      :class="canToggle ? 'cursor-pointer hover:bg-interactive-hover' : ''"
      @click="toggleExpanded"
    >
      <div class="w-3.5 flex-shrink-0 flex items-center justify-center">
        <span class="leading-none">✓</span>
      </div>

      <div class="flex-shrink-0 font-semibold text-xs leading-4 whitespace-nowrap">
        任务列表
      </div>

      <div class="min-w-0 flex-1 flex flex-col justify-center">
        <div
          v-if="currentTaskLine"
          class="min-w-0 text-2xs leading-4 text-text-primary truncate"
          :title="currentTaskLine"
        >
          {{ currentTaskLine }}
        </div>
        <div
          class="min-w-0 text-2xs leading-4 text-text-secondary truncate whitespace-nowrap"
          :class="currentTaskLine ? 'mt-[1px]' : ''"
          :title="summaryLine"
        >
          {{ summaryLine }}
        </div>
      </div>

      <button
        v-if="canToggle"
        class="flex-shrink-0 w-4.5 h-4.5 flex items-center justify-center rounded text-2xs text-text-secondary hover:bg-interactive-hover"
        :title="expanded ? '收起' : '展开'"
        @click.stop="toggleExpanded"
      >
        {{ expanded ? '▲' : '▼' }}
      </button>
    </div>

    <div v-if="expanded" class="bg-background-content px-2.5 py-1.5 border-t border-border-separator space-y-0.5">
      <div
        v-for="(item, idx) in items"
        :key="`${idx}-${item.content}`"
        class="flex items-center gap-1.5 rounded px-1.5 py-1"
        :class="itemRowClass(item.status)"
      >
        <span
          class="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border text-2xs leading-none"
          :class="itemBadgeClass(item.status)"
        >{{ itemIcon(item.status) }}</span>
        <div class="min-w-0 flex-1 truncate text-text-primary leading-4" :title="item.content">{{ item.content }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { TaskPlanItem } from '@/ai/types'

const props = withDefaults(defineProps<{
  items: TaskPlanItem[]
  isPreview?: boolean
}>(), {
  isPreview: false,
})

const expanded = ref(true)
const isHovered = ref(false)
let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null

const completedCount = computed(() => props.items.filter(item => item.status === 'completed').length)
const inProgressItem = computed(() => props.items.find(item => item.status === 'in_progress') ?? null)
const pendingCount = computed(() => props.items.filter(item => item.status === 'pending').length)
const canToggle = computed(() => props.items.length > 1)
const currentTaskLine = computed(() => {
  if (inProgressItem.value) return inProgressItem.value.content
  if (completedCount.value === props.items.length && props.items.length > 0) return '全部任务已完成'
  return '尚未开始执行'
})
const summaryLine = computed(() => {
  const parts = [`${props.items.length} 项任务`]
  if (completedCount.value > 0) parts.push(`${completedCount.value} 已完成`)
  if (inProgressItem.value) parts.push('1 进行中')
  if (pendingCount.value > 0) parts.push(`${pendingCount.value} 待办`)
  return parts.join(' · ')
})

function clearTimer() {
  if (autoCollapseTimer) {
    clearTimeout(autoCollapseTimer)
    autoCollapseTimer = null
  }
}

function scheduleAutoCollapse() {
  clearTimer()
  if (!props.isPreview) return
  if (!expanded.value) return
  if (isHovered.value) return
  autoCollapseTimer = setTimeout(() => {
    if (!isHovered.value) expanded.value = false
  }, 4000)
}

function handleMouseEnter() {
  isHovered.value = true
  clearTimer()
}

function handleMouseLeave() {
  isHovered.value = false
  scheduleAutoCollapse()
}

function toggleExpanded() {
  if (!canToggle.value) return
  expanded.value = !expanded.value
  if (expanded.value) scheduleAutoCollapse()
  else clearTimer()
}

function itemStatusLabel(status: TaskPlanItem['status']): string {
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '进行中'
  return '待办'
}

function itemIcon(status: TaskPlanItem['status']): string {
  if (status === 'completed') return '✓'
  if (status === 'in_progress') return '•'
  return ''
}

function itemBadgeClass(status: TaskPlanItem['status']): string {
  if (status === 'completed') return 'border-status-success/40 bg-status-success/10 text-status-success'
  if (status === 'in_progress') return 'border-status-warning/40 bg-status-warning/10 text-status-warning'
  return 'border-border-separator bg-background-content text-transparent'
}

function itemRowClass(status: TaskPlanItem['status']): string {
  if (status === 'completed') return 'bg-transparent'
  if (status === 'in_progress') return 'bg-status-warning/5'
  return 'bg-transparent'
}

watch(
  () => props.items.map(item => `${item.status}:${item.content}`).join('|'),
  () => {
    if (!props.isPreview) return
    expanded.value = true
    scheduleAutoCollapse()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearTimer()
})
</script>
