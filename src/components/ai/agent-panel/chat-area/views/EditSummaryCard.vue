<template>
  <div
    class="overflow-hidden rounded-box border text-xs transition-colors"
    :class="containerClass"
  >
    <div
      class="group flex cursor-pointer select-none items-center gap-2.5 px-2 py-1"
      @click="expanded = !expanded"
    >
      <div class="flex w-3.5 shrink-0 items-center justify-center">
        <IconPencil class="icon-2xs" />
      </div>
      <div class="min-w-0 flex-1 font-semibold leading-4">
        {{ summaryLabel }}
      </div>
      <button
        class="iw-toolbar-btn btn-xs pointer-events-none opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-transparent"
        :title="expanded ? t('agentPanel.common.collapse') : t('agentPanel.common.expandDetails')"
        @click="expanded = !expanded"
      >
        <IconChevronDown v-if="expanded" class="icon-2xs" />
        <IconChevronUp v-else class="icon-2xs" />
      </button>
    </div>

    <div v-if="expanded" class="space-y-2 border-t bg-base-100 px-2 py-2" :class="bodyClass">
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="chip in summaryChips"
          :key="chip.label"
          class="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium"
          :class="chip.className"
        >{{ chip.label }}</span>
      </div>

      <div class="space-y-1">
        <div
          v-for="item in result.items"
          :key="item.proposalId"
          class="rounded-md px-2 py-1.5"
          :class="detailRowClass(item.state)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 text-xs text-base-content">
              {{ item.label }}
            </div>
            <span
              class="shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium"
              :class="stateBadgeClass(item.state)"
            >{{ stateLabel(item.state) }}</span>
          </div>

          <div v-if="item.description" class="mt-1 text-2xs text-base-content/70">
            {{ item.description }}
          </div>

          <div
            v-if="item.failureMessage"
            class="mt-1 text-2xs text-error-content"
          >
            {{ item.failureMessage }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronDown, IconChevronUp, IconPencil } from '@tabler/icons-vue'
import type { EditRoundResult, EditRoundResultState } from '@/ai/types'

const props = defineProps<{
  result: EditRoundResult
}>()
const { t } = useI18n()

const expanded = ref(false)

watch(
  () => props.result.items.length,
  (len, oldLen) => {
    if (oldLen === 0 && len > 0) expanded.value = len <= 5
  },
  { immediate: true },
)

const summaryLabel = computed(() => {
  const appliedTotal = props.result.applied + props.result.appliedEdited
  const parts: string[] = []
  if (appliedTotal > 0) parts.push(t('agentPanel.editSummary.summary.appliedChanges', { count: appliedTotal }))
  if (props.result.skipped > 0) parts.push(t('agentPanel.editSummary.summary.skipped', { count: props.result.skipped }))
  if (props.result.reworkRequested > 0) parts.push(t('agentPanel.editSummary.summary.rework', { count: props.result.reworkRequested }))
  if (props.result.ended > 0) parts.push(t('agentPanel.editSummary.summary.ended', { count: props.result.ended }))
  if (props.result.failedToApply > 0) parts.push(t('agentPanel.editSummary.summary.failed', { count: props.result.failedToApply }))
  if (!parts.length) parts.push(t('agentPanel.editSummary.summary.totalHandled', { count: props.result.total }))
  return parts.join(' · ')
})

const containerClass = computed(() => {
  if (props.result.failedToApply > 0) return 'border-error/30 bg-error/20 text-error-content hover:bg-error/35'
  return 'border-warning/30 bg-warning/20 text-warning-content hover:bg-warning/35'
})

const bodyClass = computed(() => {
  if (props.result.failedToApply > 0) return 'border-error/30'
  return 'border-warning/30'
})

const summaryChips = computed(() => {
  const chips: Array<{ label: string; className: string }> = []
  chips.push({ label: t('agentPanel.editSummary.chips.total', { count: props.result.total }), className: 'bg-base-200 text-base-content' })
  if (props.result.applied > 0) chips.push({ label: t('agentPanel.editSummary.chips.applied', { count: props.result.applied }), className: 'bg-success/20 text-success-content' })
  if (props.result.appliedEdited > 0) chips.push({ label: t('agentPanel.editSummary.chips.appliedEdited', { count: props.result.appliedEdited }), className: 'bg-info/20 text-info-content' })
  if (props.result.skipped > 0) chips.push({ label: t('agentPanel.editSummary.chips.skipped', { count: props.result.skipped }), className: 'bg-base-200 text-base-content' })
  if (props.result.reworkRequested > 0) chips.push({ label: t('agentPanel.editSummary.chips.reworkRequested', { count: props.result.reworkRequested }), className: 'bg-warning/20 text-warning-content' })
  if (props.result.ended > 0) chips.push({ label: t('agentPanel.editSummary.chips.ended', { count: props.result.ended }), className: 'bg-base-200 text-base-content' })
  if (props.result.failedToApply > 0) chips.push({ label: t('agentPanel.editSummary.chips.failedToApply', { count: props.result.failedToApply }), className: 'bg-error/20 text-error-content' })
  return chips
})

function stateLabel(state: EditRoundResultState): string {
  switch (state) {
    case 'applied':
      return t('agentPanel.editSummary.states.applied')
    case 'applied_edited':
      return t('agentPanel.editSummary.states.appliedEdited')
    case 'rework_requested':
      return t('agentPanel.editSummary.states.reworkRequested')
    case 'ended':
      return t('agentPanel.editSummary.states.ended')
    case 'failed_to_apply':
      return t('agentPanel.editSummary.states.failedToApply')
    default:
      return t('agentPanel.editSummary.states.skipped')
  }
}

function stateBadgeClass(state: EditRoundResultState): string {
  switch (state) {
    case 'applied':
      return 'bg-success/20 text-success-content'
    case 'applied_edited':
      return 'bg-info/20 text-info-content'
    case 'rework_requested':
      return 'bg-warning/20 text-warning-content'
    case 'failed_to_apply':
      return 'bg-error/20 text-error-content'
    default:
      return 'bg-base-200 text-base-content'
  }
}

function detailRowClass(state: EditRoundResultState): string {
  switch (state) {
    case 'applied':
      return 'bg-success/5'
    case 'applied_edited':
      return 'bg-info/5'
    case 'rework_requested':
      return 'bg-warning/8'
    case 'failed_to_apply':
      return 'bg-error/8'
    default:
      return 'bg-base-100'
  }
}
</script>
