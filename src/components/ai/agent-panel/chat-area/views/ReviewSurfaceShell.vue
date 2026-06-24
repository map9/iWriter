<template>
  <div class="overflow-hidden rounded-box border bg-base-100" :class="containerClass">
    <div
      v-if="isBatch"
      class="space-y-2 border-b border-warning-content/15 bg-warning/50 px-3 py-2.5"
    >
      <div class="flex items-start justify-between gap-3">
        <slot name="batch-summary" :index="index" :total="total">
          <div class="text-xs text-warning-content">{{ index + 1 }} / {{ total }}</div>
        </slot>
        <div class="flex shrink-0 flex-wrap gap-1.5">
          <button class="iw-btn btn-xs btn-warning" @click="$emit('approveAll')">{{ approveAllLabel }}</button>
          <button class="iw-btn btn-xs btn-error" @click="$emit('rejectAll')">{{ rejectAllLabel }}</button>
        </div>
      </div>
    </div>

    <div class="border-b border-base-300 px-3 py-2.5" :class="tonePanelClass">
      <slot
        name="header"
        :tone-panel-class="tonePanelClass"
        :tone-title-class="toneTitleClass"
        :tone-description-class="toneDescriptionClass"
        :tone-ring-class="toneRingClass"
        :is-delete="isDelete"
      />
    </div>

    <slot :tone-panel-class="tonePanelClass" :tone-ring-class="toneRingClass" />

    <div class="border-t border-base-300 px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <button class="iw-btn btn-xs" :class="isDelete ? 'btn-error' : 'btn-warning'" @click="$emit('approve')">
          {{ approveLabel }}
        </button>
        <button class="iw-btn btn-xs btn-ghost" @click="$emit('reject')">{{ rejectLabel }}</button>
        <slot name="footer-extra" />
        <button
          v-if="isBatch"
          class="iw-btn btn-xs btn-ghost"
          :disabled="index === 0"
          @click="$emit('prev')"
        >←</button>
        <button
          v-if="isBatch"
          class="iw-btn btn-xs btn-ghost"
          :disabled="index >= total - 1"
          @click="$emit('next')"
        >→</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Shared three-section layout (batch header / tone header / body / footer actions) for
 * the filesystem-operation and edit-proposal approval surfaces. Stateless and slot-driven
 * so each caller keeps its own data source, navigation state, and button copy.
 */
const props = defineProps<{
  isBatch: boolean
  index: number
  total: number
  isDelete: boolean
  approveLabel: string
  rejectLabel: string
  approveAllLabel: string
  rejectAllLabel: string
}>()

defineEmits<{
  approve: []
  reject: []
  approveAll: []
  rejectAll: []
  prev: []
  next: []
}>()

const containerClass = computed(() =>
  !props.isBatch && props.isDelete ? 'border-error/50' : 'border-warning/50'
)
const tonePanelClass = computed(() => props.isDelete
  ? 'border-error-content/15 bg-error/50 text-error-content'
  : 'border-warning-content/15 bg-warning/50 text-warning-content')
const toneTitleClass = computed(() => props.isDelete ? 'text-error-content' : 'text-warning-content')
const toneDescriptionClass = computed(() => props.isDelete ? 'text-error-content/70' : 'text-warning-content/70')
const toneRingClass = computed(() => props.isDelete ? 'ring-2 ring-error-content/15' : 'ring-2 ring-warning-content/15')
</script>
