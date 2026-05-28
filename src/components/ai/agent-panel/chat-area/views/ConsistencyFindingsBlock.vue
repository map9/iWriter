<template>
  <div class="mt-1.5 w-full rounded-box border border-base-300 bg-base-100 p-2 text-base-content">
    <button
      class="flex w-full items-center justify-between gap-3 text-left text-xs"
      @click="expanded = !expanded"
    >
      <span class="font-medium">{{ t('consistencyFinding.title', { count: findings.length }) }}</span>
      <span class="opacity-60">{{ expanded ? t('consistencyFinding.collapse') : t('consistencyFinding.expand') }}</span>
    </button>
    <div v-if="expanded" class="mt-2 space-y-2">
      <ConsistencyFindingCard
        v-for="(finding, index) in findings"
        :key="index"
        :finding="finding"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConsistencyFinding } from '@/ai/message/consistency-findings'
import ConsistencyFindingCard from './ConsistencyFindingCard.vue'

defineProps<{
  findings: ConsistencyFinding[]
}>()

const { t } = useI18n()
const expanded = ref(true)
</script>
