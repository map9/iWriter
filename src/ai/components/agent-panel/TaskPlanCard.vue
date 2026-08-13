<template>
  <div
    class="w-full rounded-box overflow-hidden text-xs border border-base-300 bg-base-200 text-base-content transition-colors hover:bg-base-300"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="group flex items-center gap-2.5 px-2.5 py-1.5 select-none text-base-content transition-colors"
      :class="canToggle ? 'cursor-pointer hover:bg-base-300' : ''"
      @click="toggleExpanded"
    >
      <div class="w-3.5 shrink-0 flex items-center justify-center">
        <IconListCheck class="icon-2xs" />
      </div>

      <div class="shrink-0 font-semibold text-xs leading-4 whitespace-nowrap">
        {{ t('agentPanel.taskPlan.title') }}
      </div>

      <div class="min-w-0 flex-1 flex flex-col justify-center">
        <div
          v-if="currentTaskLine"
          class="min-w-0 text-2xs leading-4 text-base-content truncate"
          :title="currentTaskLine"
        >
          {{ currentTaskLine }}
        </div>
        <div
          class="min-w-0 text-2xs leading-4 text-base-content truncate whitespace-nowrap"
          :class="currentTaskLine ? 'mt-px' : ''"
          :title="summaryLine"
        >
          {{ summaryLine }}
        </div>
      </div>

      <button
        v-if="canToggle"
        class="btn btn-ghost btn-square btn-xs opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-transparent"
        :title="expanded ? t('agentPanel.common.collapse') : t('agentPanel.common.expandDetails')"
        @click.stop="toggleExpanded"
      >
        <IconChevronDown v-if="expanded" class="icon-2xs" />
        <IconChevronUp v-else class="icon-2xs" />
      </button>
    </div>

    <div v-if="expanded" class="bg-base-100 px-2.5 py-1.5 border-t border-base-300 space-y-0.5">
      <div
        v-for="(item, idx) in items"
        :key="`${idx}-${item.content}`"
        class="flex items-center gap-1.5 rounded px-1.5 py-1"
        :class="itemRowClass(item.status)"
      >
        <span
          class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-2xs leading-none"
          :class="itemBadgeClass(item.status)"
        >{{ itemIcon(item.status) }}</span>
        <div class="min-w-0 flex-1 truncate text-base-content leading-4" :title="item.content">{{ item.content }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconChevronUp,
  IconChevronDown,
  IconListCheck,
} from '@tabler/icons-vue'
import type { TaskPlanItem } from '@shared/ai/contracts'

const props = withDefaults(defineProps<{
  items: TaskPlanItem[]
  isPreview?: boolean
}>(), {
  isPreview: false,
})
const { t } = useI18n()

const expanded = ref(true)
const isHovered = ref(false)
let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null

const completedCount = computed(() => props.items.filter(item => item.status === 'completed').length)
const inProgressItem = computed(() => props.items.find(item => item.status === 'in_progress') ?? null)
const pendingCount = computed(() => props.items.filter(item => item.status === 'pending').length)
const canToggle = computed(() => props.items.length > 1)
const currentTaskLine = computed(() => {
  if (inProgressItem.value) return inProgressItem.value.content
  if (completedCount.value === props.items.length && props.items.length > 0) return t('agentPanel.taskPlan.allCompleted')
  return t('agentPanel.taskPlan.noneInProgress')
})
const summaryLine = computed(() => {
  const parts = [t('agentPanel.taskPlan.summary.tasks', { count: props.items.length })]
  if (completedCount.value > 0) parts.push(t('agentPanel.taskPlan.summary.completed', { count: completedCount.value }))
  if (inProgressItem.value) parts.push(t('agentPanel.taskPlan.summary.inProgress', { count: 1 }))
  if (pendingCount.value > 0) parts.push(t('agentPanel.taskPlan.summary.pending', { count: pendingCount.value }))
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

function itemIcon(status: TaskPlanItem['status']): string {
  if (status === 'completed') return '✓'
  if (status === 'in_progress') return '•'
  return ''
}

function itemBadgeClass(status: TaskPlanItem['status']): string {
  if (status === 'completed') return 'border-success-content/15 bg-success/20 text-success-content'
  if (status === 'in_progress') return 'border-warning-content/15 bg-warning/20 text-warning-content'
  return 'border-base-300 bg-base-100 text-transparent'
}

function itemRowClass(status: TaskPlanItem['status']): string {
  if (status === 'completed') return 'bg-transparent'
  if (status === 'in_progress') return 'bg-warning/15'
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
