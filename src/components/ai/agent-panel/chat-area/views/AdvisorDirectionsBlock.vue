<template>
  <div class="w-full rounded-box border-primary-content/15 bg-primary/50 p-3 text-primary-content">
    <button
      class="flex w-full items-center justify-between gap-3 text-left text-xs"
      @click="expanded = !expanded"
    >
      <span class="font-medium">{{ t('advisorDirection.title', { count: directions.length }) }}</span>
      <span class="opacity-60">{{ expanded ? t('advisorDirection.collapse') : t('advisorDirection.expand') }}</span>
    </button>
    <div v-if="expanded" class="mt-2 space-y-2">
      <AdvisorDirectionCard
        v-for="(direction, index) in directions"
        :key="index"
        :direction="direction"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AdvisorDirection } from '@/ai/message/advisor-directions'
import AdvisorDirectionCard from './AdvisorDirectionCard.vue'

defineProps<{
  directions: AdvisorDirection[]
}>()

const { t } = useI18n()
const expanded = ref(true)
</script>
