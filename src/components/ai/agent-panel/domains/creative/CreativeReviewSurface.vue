<template>
  <section
    v-if="currentReview"
    class="rounded-box border border-base-300 bg-base-100 shadow-sm"
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
      <div class="shrink-0 text-[11px] text-base-content/30">
        {{ currentIndex + 1 }} / {{ reviews.length }}
      </div>
    </header>

    <div class="space-y-2 px-3 py-3">
      <label
        v-if="showsBodyEditor"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ bodyLabel }}</span>
        <textarea
          v-model="bodyDraft"
          class="min-h-40 w-full resize-y rounded-field border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <label
        v-if="currentReview.kind === 'creative_git_commit'"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.gitFiles') }}</span>
        <textarea
          v-model="filesDraft"
          class="min-h-16 w-full resize-y rounded-field border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <label
        v-if="currentReview.kind === 'creative_git_tag'"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.gitTagMessage') }}</span>
        <textarea
          v-model="tagMessageDraft"
          class="min-h-16 w-full resize-y rounded-field border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <div
        v-if="currentReview.kind === 'creative_chapter_finalize'"
        class="space-y-2"
      >
        <p
          v-if="currentReview.summary"
          class="text-xs leading-relaxed text-base-content/70"
        >
          {{ currentReview.summary }}
        </p>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-base-content/50">
          <span>{{ t('agentPanel.creativeReview.finalizeBaselineChars', { count: baselineChars }) }}</span>
          <span>→</span>
          <span>{{ t('agentPanel.creativeReview.finalizeCurrentChars', { count: currentChars }) }}</span>
          <span :class="charDelta >= 0 ? 'text-success' : 'text-warning'">
            {{ charDelta >= 0 ? '+' : '' }}{{ charDelta }}
          </span>
        </div>
        <p
          v-if="currentReview.autoFallback"
          class="rounded-box bg-base-200 px-2 py-1.5 text-[11px] leading-relaxed text-base-content/60"
        >
          {{ t('agentPanel.creativeReview.finalizeFallbackHint') }}
        </p>
        <p
          v-if="currentReview.hasExternalEdits"
          class="rounded-box bg-warning/10 px-2 py-1.5 text-[11px] leading-relaxed text-warning"
        >
          {{ t('agentPanel.creativeReview.finalizeExternalEdits') }}
        </p>
        <details class="rounded-box border border-base-300 bg-base-200">
          <summary class="cursor-pointer px-2 py-1 text-[11px] text-base-content/60">
            {{ t('agentPanel.creativeReview.finalizeShowDiff') }}
          </summary>
          <div class="grid grid-cols-1 gap-2 px-2 py-2 sm:grid-cols-2">
            <div class="min-w-0">
              <div class="mb-1 text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.finalizeBaseline') }}</div>
              <pre class="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word rounded bg-base-100 p-2 text-[11px] leading-relaxed">{{ currentReview.baseline || t('agentPanel.creativeReview.emptyContent') }}</pre>
            </div>
            <div class="min-w-0">
              <div class="mb-1 text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.finalizeCurrent') }}</div>
              <pre class="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word rounded bg-base-100 p-2 text-[11px] leading-relaxed">{{ currentReview.current || t('agentPanel.creativeReview.emptyContent') }}</pre>
            </div>
          </div>
        </details>
      </div>

      <div
        v-if="currentReview.kind === 'creative_manuscript_import'"
        class="space-y-1.5 text-[11px] leading-relaxed text-base-content/70"
      >
        <p v-if="currentReview.chapterCount > 0">{{ t('agentPanel.creativeReview.importWarning', { count: currentReview.chapterCount }) }}</p>
        <p v-else>{{ t('agentPanel.creativeReview.importDryRun') }}</p>
        <div class="rounded-box bg-base-200 px-2 py-1.5">
          <div class="truncate"><span class="text-base-content/50">{{ t('agentPanel.creativeReview.importSource') }}</span> {{ currentReview.sourcePath }}</div>
          <div v-if="currentReview.targetDirectory" class="truncate"><span class="text-base-content/50">{{ t('agentPanel.creativeReview.importTarget') }}</span> {{ currentReview.targetDirectory }}</div>
        </div>
      </div>

    </div>

    <div
      v-if="isRespondOpen"
      class="border-t border-base-300 px-3 py-2"
    >
      <textarea
        v-model="respondMessage"
        class="w-full resize-none rounded-field border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        rows="3"
        :placeholder="t('agentPanel.creativeReview.respondPlaceholder')"
        @keydown.enter.ctrl="sendRespond"
      />
      <div class="mt-1.5 flex justify-end gap-2">
        <button
          class="iw-btn btn-xs btn-ghost"
          @click="isRespondOpen = false; respondMessage = ''"
        >
          {{ t('agentPanel.creativeReview.respondCancel') }}
        </button>
        <button
          class="iw-btn btn-xs btn-warning"
          :disabled="!respondMessage.trim()"
          @click="sendRespond"
        >
          {{ t('agentPanel.creativeReview.respondSend') }}
        </button>
      </div>
    </div>
    <div
      v-if="isFinalizeRejectConfirm"
      class="border-t border-warning/40 bg-warning/5 px-3 py-2"
    >
      <p class="text-[11px] leading-relaxed text-warning">
        {{ t('agentPanel.creativeReview.finalizeRejectConfirm') }}
      </p>
      <div class="mt-1.5 flex justify-end gap-2">
        <button
          class="iw-btn btn-xs btn-ghost"
          @click="isFinalizeRejectConfirm = false"
        >
          {{ t('agentPanel.creativeReview.respondCancel') }}
        </button>
        <button
          class="iw-btn btn-xs btn-warning"
          @click="confirmFinalizeReject"
        >
          {{ t('agentPanel.creativeReview.finalizeRejectConfirmAction') }}
        </button>
      </div>
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
        {{ rejectLabel }}
      </button>
      <button
        v-if="!isRunEndFallback"
        class="iw-btn btn-xs btn-ghost"
        @click="isRespondOpen = true"
      >
        {{ respondLabel }}
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
const filesDraft = ref('')
const tagMessageDraft = ref('')
const isRespondOpen = ref(false)
const respondMessage = ref('')
// M1-2: finalize reject restores the session baseline to disk — a two-step confirm guards against
// silently discarding the author's own edits (and the run-end fallback lands here too).
const isFinalizeRejectConfirm = ref(false)

const title = computed(() => {
  const review = currentReview.value
  if (!review) return ''
  if (review.kind === 'creative_plan') return t('agentPanel.creativeReview.titlePlan')
  if (review.kind === 'creative_git_commit') return t('agentPanel.creativeReview.titleGitCommit')
  if (review.kind === 'creative_git_tag') return t('agentPanel.creativeReview.titleGitTag')
  if (review.kind === 'creative_git_init') return t('agentPanel.creativeReview.titleGitInit')
  if (review.kind === 'creative_git_restore') return t('agentPanel.creativeReview.titleGitRestore')
  if (review.kind === 'creative_chapter_finalize') return t('agentPanel.creativeReview.titleFinalize')
  if (review.kind === 'creative_manuscript_import') return t('agentPanel.creativeReview.titleImport')
  return t('agentPanel.creativeReview.titlePlan')
})

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

const subtitle = computed(() => {
  const review = currentReview.value
  if (!review) return ''
  if (review.kind === 'creative_git_commit') return review.files.join(', ')
  if (review.kind === 'creative_git_tag') return review.name
  if (review.kind === 'creative_git_init') return ''
  if (review.kind === 'creative_git_restore') return review.ref ? `${review.files.join(', ')} · ${review.ref}` : review.files.join(', ')
  if (review.kind === 'creative_chapter_finalize') return basename(review.chapter)
  if (review.kind === 'creative_manuscript_import') return basename(review.sourcePath)
  return t('agentPanel.creativeReview.planFirstApproval')
})

const baselineChars = computed(() =>
  currentReview.value?.kind === 'creative_chapter_finalize' ? currentReview.value.baseline.length : 0
)
const currentChars = computed(() =>
  currentReview.value?.kind === 'creative_chapter_finalize' ? currentReview.value.current.length : 0
)
const charDelta = computed(() => currentChars.value - baselineChars.value)

// Run-end fallback finalize cards have no live agent turn to rework — hide the rework button.
const isRunEndFallback = computed(() =>
  currentReview.value?.kind === 'creative_chapter_finalize' && currentReview.value.autoFallback === true
)

const rejectLabel = computed(() =>
  currentReview.value?.kind === 'creative_chapter_finalize'
    ? t('agentPanel.creativeReview.finalizeReject')
    : t('agentPanel.creativeReview.reject')
)
const respondLabel = computed(() =>
  currentReview.value?.kind === 'creative_chapter_finalize'
    ? t('agentPanel.creativeReview.finalizeRework')
    : t('agentPanel.creativeReview.respond')
)

const bodyLabel = computed(() => {
  const review = currentReview.value
  if (!review) return t('agentPanel.creativeReview.content')
  if (review.kind === 'creative_plan') return t('agentPanel.creativeReview.plan')
  if (review.kind === 'creative_git_commit') return t('agentPanel.creativeReview.gitCommitMessage')
  if (review.kind === 'creative_git_tag') return t('agentPanel.creativeReview.gitTagName')
  return t('agentPanel.creativeReview.content')
})

const showsBodyEditor = computed(() => {
  const review = currentReview.value
  if (!review) return false
  return review.kind === 'creative_plan'
    || review.kind === 'creative_git_commit'
    || review.kind === 'creative_git_tag'
})

const hasEditedContent = computed(() => {
  const review = currentReview.value
  if (!review) return false
  if (review.kind === 'creative_plan') {
    return bodyDraft.value !== review.plan
  }
  if (review.kind === 'creative_git_commit') {
    return bodyDraft.value !== review.message || filesDraft.value !== review.files.join('\n')
  }
  if (review.kind === 'creative_git_tag') {
    return bodyDraft.value !== review.name || tagMessageDraft.value !== (review.message ?? '')
  }
  return false
})

const approveLabel = computed(() => {
  if (currentReview.value?.kind === 'creative_chapter_finalize') {
    return t('agentPanel.creativeReview.finalizeAccept')
  }
  return hasEditedContent.value
    ? t('agentPanel.creativeReview.approveEdited')
    : t('agentPanel.creativeReview.approve')
})

watch(() => reviews.value.length, length => {
  if (currentIndex.value >= length) currentIndex.value = Math.max(0, length - 1)
})

watch(currentReview, review => {
  isRespondOpen.value = false
  respondMessage.value = ''
  isFinalizeRejectConfirm.value = false
  if (!review) {
    bodyDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_plan') {
    bodyDraft.value = review.plan
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_git_commit') {
    bodyDraft.value = review.message
    filesDraft.value = review.files.join('\n')
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_git_tag') {
    bodyDraft.value = review.name
    tagMessageDraft.value = review.message ?? ''
    filesDraft.value = ''
    return
  }
  // creative_git_init / creative_git_restore: no editable body
  bodyDraft.value = ''
  filesDraft.value = ''
  tagMessageDraft.value = ''
}, { immediate: true })

function editedArgs() {
  const review = currentReview.value
  if (!review) return {}
  if (review.kind === 'creative_plan') {
    return { plan: bodyDraft.value }
  }
  if (review.kind === 'creative_git_commit') {
    return {
      message: bodyDraft.value,
      files: filesDraft.value.split(/\r?\n/).map(file => file.trim()).filter(Boolean),
    }
  }
  if (review.kind === 'creative_git_tag') {
    return {
      name: bodyDraft.value,
      ...(tagMessageDraft.value.trim() && { message: tagMessageDraft.value }),
    }
  }
  return {}
}

function approve() {
  const review = currentReview.value
  if (!review) return
  if (hasEditedContent.value) aiStore.editAndApproveCreativeReview(review.id, editedArgs())
  else aiStore.approveCreativeReview(review.id)
}

function reject() {
  const review = currentReview.value
  if (!review) return
  // Finalize reject回退基线到磁盘、会一并丢弃作者手改——先二次确认。其余创作卡拒绝无破坏性，直接执行。
  if (review.kind === 'creative_chapter_finalize') {
    isFinalizeRejectConfirm.value = true
    return
  }
  aiStore.rejectCreativeReview(review.id)
}

function confirmFinalizeReject() {
  const review = currentReview.value
  isFinalizeRejectConfirm.value = false
  if (review) aiStore.rejectCreativeReview(review.id)
}

function sendRespond() {
  const review = currentReview.value
  const msg = respondMessage.value.trim()
  if (!review || !msg) return
  isRespondOpen.value = false
  respondMessage.value = ''
  aiStore.respondCreativeReview(review.id, msg)
}

function prev() {
  currentIndex.value = Math.max(0, currentIndex.value - 1)
}

function next() {
  currentIndex.value = Math.min(reviews.value.length - 1, currentIndex.value + 1)
}
</script>
