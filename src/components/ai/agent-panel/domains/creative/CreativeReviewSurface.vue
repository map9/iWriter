<template>
  <section
    v-if="currentReview"
    class="mx-3 mb-3 rounded-lg border border-base-300 bg-base-100 shadow-sm"
  >
    <header class="flex items-start justify-between gap-3 border-b border-base-300 px-3 py-2">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-base-content">
          {{ title }}
        </div>
        <div class="mt-0.5 truncate text-[11px] text-base-content/50">
          {{ subtitle }}
        </div>
      </div>
      <div class="shrink-0 text-[11px] text-base-content/40">
        {{ currentIndex + 1 }} / {{ reviews.length }}
      </div>
    </header>

    <div class="space-y-2 px-3 py-3">
      <label
        v-if="currentReview.kind === 'creative_write'"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.approvedPlan') }}</span>
        <textarea
          v-model="approvedPlanDraft"
          class="min-h-16 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <label class="block">
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ bodyLabel }}</span>
        <textarea
          v-model="bodyDraft"
          class="min-h-40 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <label
        v-if="currentReview.kind === 'creative_plan'"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.rationale') }}</span>
        <textarea
          v-model="rationaleDraft"
          class="min-h-20 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>
    </div>

    <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-base-300 px-3 py-2">
      <button
        v-if="reviews.length > 1"
        class="iw-btn btn-xs btn-warning"
        @click="aiStore.approveAllCreativeReviews"
      >
        {{ t('agentPanel.creativeReview.approveAll') }}
      </button>
      <button
        class="iw-btn btn-xs btn-ghost"
        @click="reject"
      >
        {{ t('agentPanel.creativeReview.reject') }}
      </button>
      <button
        v-if="reviews.length > 1"
        class="iw-btn btn-xs btn-ghost"
        :disabled="currentIndex === 0"
        @click="prev"
      >
        {{ t('agentPanel.creativeReview.previous') }}
      </button>
      <button
        v-if="reviews.length > 1"
        class="iw-btn btn-xs btn-ghost"
        :disabled="currentIndex >= reviews.length - 1"
        @click="next"
      >
        {{ t('agentPanel.creativeReview.next') }}
      </button>
      <button
        class="iw-btn btn-xs btn-warning"
        @click="approve"
      >
        {{ approveLabel }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/ai/store/ai'

const aiStore = useAiStore()
const { t } = useI18n()

const reviews = computed(() => aiStore.pendingCreativeReviews)
const currentIndex = ref(0)
const currentReview = computed(() => reviews.value[currentIndex.value] ?? null)

const bodyDraft = ref('')
const rationaleDraft = ref('')
const approvedPlanDraft = ref('')

const title = computed(() => {
  const review = currentReview.value
  if (!review) return ''
  if (review.kind === 'creative_plan') return t('agentPanel.creativeReview.titlePlan')
  if (review.kind === 'creative_write') return t('agentPanel.creativeReview.titleWrite')
  return review.toolName === 'rebuild_storybible'
    ? t('agentPanel.creativeReview.titleRebuildStoryBible')
    : t('agentPanel.creativeReview.titleStoryBibleSection')
})

const subtitle = computed(() => {
  const review = currentReview.value
  if (!review) return ''
  if (review.kind === 'creative_write') return `${review.filename} · ${review.mode}`
  if (review.kind === 'creative_storybible') return review.section ?? 'storybible.md'
  return t('agentPanel.creativeReview.planFirstApproval')
})

const bodyLabel = computed(() => {
  const review = currentReview.value
  if (!review) return t('agentPanel.creativeReview.content')
  if (review.kind === 'creative_plan') return t('agentPanel.creativeReview.plan')
  if (review.kind === 'creative_write') return t('agentPanel.creativeReview.draftContent')
  return t('agentPanel.creativeReview.storyBibleContent')
})

const hasEditedContent = computed(() => {
  const review = currentReview.value
  if (!review) return false
  if (review.kind === 'creative_plan') {
    return bodyDraft.value !== review.plan || rationaleDraft.value !== review.rationale
  }
  if (review.kind === 'creative_write') {
    return bodyDraft.value !== review.newContent || approvedPlanDraft.value !== review.approvedPlan
  }
  return bodyDraft.value !== review.newContent
})

const approveLabel = computed(() =>
  hasEditedContent.value
    ? t('agentPanel.creativeReview.approveEdited')
    : t('agentPanel.creativeReview.approve')
)

watch(() => reviews.value.length, length => {
  if (currentIndex.value >= length) currentIndex.value = Math.max(0, length - 1)
})

watch(currentReview, review => {
  if (!review) {
    bodyDraft.value = ''
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    return
  }
  if (review.kind === 'creative_plan') {
    bodyDraft.value = review.plan
    rationaleDraft.value = review.rationale
    approvedPlanDraft.value = ''
    return
  }
  if (review.kind === 'creative_write') {
    bodyDraft.value = review.newContent
    approvedPlanDraft.value = review.approvedPlan
    rationaleDraft.value = ''
    return
  }
  bodyDraft.value = review.newContent
  rationaleDraft.value = ''
  approvedPlanDraft.value = ''
}, { immediate: true })

function editedArgs() {
  const review = currentReview.value
  if (!review) return {}
  if (review.kind === 'creative_plan') {
    return {
      plan: bodyDraft.value,
      rationale: rationaleDraft.value,
      alternatives: review.alternatives,
    }
  }
  if (review.kind === 'creative_write') {
    return {
      filename: review.filename,
      mode: review.mode,
      content: bodyDraft.value,
      approved_plan: approvedPlanDraft.value,
      ...(review.insertAnchor !== undefined && { insert_anchor: review.insertAnchor }),
      ...(review.replaceStartAnchor !== undefined && { replace_start_anchor: review.replaceStartAnchor }),
      ...(review.replaceEndAnchor !== undefined && { replace_end_anchor: review.replaceEndAnchor }),
    }
  }
  if (review.toolName === 'replace_storybible_section') {
    return {
      section: review.section,
      content: bodyDraft.value,
    }
  }
  return {
    content: bodyDraft.value,
  }
}

function approve() {
  const review = currentReview.value
  if (!review) return
  if (hasEditedContent.value) aiStore.editAndApproveCreativeReview(review.id, editedArgs())
  else aiStore.approveCreativeReview(review.id)
}

function reject() {
  const review = currentReview.value
  if (review) aiStore.rejectCreativeReview(review.id)
}

function prev() {
  currentIndex.value = Math.max(0, currentIndex.value - 1)
}

function next() {
  currentIndex.value = Math.min(reviews.value.length - 1, currentIndex.value + 1)
}
</script>
