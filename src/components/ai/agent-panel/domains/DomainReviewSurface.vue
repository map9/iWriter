<template>
  <EditReviewSurface v-if="activeDomain === 'editing'" />
  <CreativeReviewSurface v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AiAgentDomain } from '@/ai/types'
import { useAiStore } from '@/ai/store/ai'
import EditReviewSurface from './edit/EditReviewSurface.vue'
import CreativeReviewSurface from './creative/CreativeReviewSurface.vue'

const aiStore = useAiStore()

const activeDomain = computed<AiAgentDomain>(() => aiStore.activeThread?.domain ?? 'editing')
</script>
