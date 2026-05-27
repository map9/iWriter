<template>
  <div class="rounded-box border border-primary-content/15 bg-primary/50 px-3 py-2 text-xs text-primary-content">
    <div class="flex flex-wrap items-center gap-2">
      <span class="badge badge-primary badge-sm">{{ typeLabel }}</span>
    </div>
    <p class="mt-1 text-sm leading-relaxed">{{ direction.direction }}</p>
    <p v-if="direction.angle" class="mt-1 leading-relaxed opacity-60">{{ direction.angle }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AdvisorDirection } from '@/ai/message/advisor-directions'

const props = defineProps<{
  direction: AdvisorDirection
}>()

const { t } = useI18n()

const typeLabel = computed(() => t(`advisorDirection.type.${props.direction.type}`))
</script>
