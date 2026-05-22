<template>
  <div class="rounded-field border px-3 py-2 text-xs" :class="toneClass">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">{{ layerLabel }}</span>
      <span class="opacity-70">{{ severityLabel }}</span>
      <span v-if="finding.locationRef" class="truncate opacity-70">{{ finding.locationRef }}</span>
    </div>
    <p v-if="finding.description" class="mt-1 text-sm leading-relaxed">
      {{ finding.description }}
    </p>
    <p v-if="finding.suggestion" class="mt-1 leading-relaxed opacity-80">
      {{ finding.suggestion }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConsistencyFinding } from '@/ai/message/consistency-findings'

const props = defineProps<{
  finding: ConsistencyFinding
}>()

const { t } = useI18n()

const toneClass = computed(() => {
  if (props.finding.severity === 'major') return 'border-error-content/15 bg-error/50 text-error-content'
  if (props.finding.severity === 'minor') return 'border-warning-content/15 bg-warning/50 text-warning-content'
  return 'border-info-content/15 bg-info/50 text-info-content'
})

const severityLabel = computed(() => t(`consistencyFinding.severity.${props.finding.severity}`))
const layerLabel = computed(() => t(`consistencyFinding.layer.${props.finding.layer}`))
</script>
