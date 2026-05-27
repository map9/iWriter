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

      <div
        v-if="currentReview.kind === 'creative_chapter_structure'"
        class="rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs"
      >
        <div class="font-medium text-base-content/70">
          {{ t('agentPanel.creativeReview.chapterStructure') }}
        </div>
        <dl class="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-base-content/70">
          <dt>{{ t('agentPanel.creativeReview.operation') }}</dt>
          <dd class="min-w-0 break-words">{{ chapterOperationLabel }}</dd>
          <dt v-if="currentReview.filename">{{ t('agentPanel.creativeReview.filename') }}</dt>
          <dd v-if="currentReview.filename" class="min-w-0 break-words">{{ currentReview.filename }}</dd>
          <dt v-if="currentReview.newFilename">{{ t('agentPanel.creativeReview.newFilename') }}</dt>
          <dd v-if="currentReview.newFilename" class="min-w-0 break-words">{{ currentReview.newFilename }}</dd>
          <dt v-if="currentReview.afterFilename">{{ t('agentPanel.creativeReview.afterFilename') }}</dt>
          <dd v-if="currentReview.afterFilename" class="min-w-0 break-words">{{ currentReview.afterFilename }}</dd>
        </dl>
        <ol
          v-if="currentReview.order?.length"
          class="mt-2 list-decimal space-y-1 pl-5 text-base-content/70"
        >
          <li
            v-for="filename in currentReview.order"
            :key="filename"
            class="break-words"
          >
            {{ filename }}
          </li>
        </ol>
      </div>

      <div
        v-else-if="currentReview.kind === 'creative_exploration_start'"
        class="rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs"
      >
        <div class="font-medium text-base-content/70">
          {{ t('agentPanel.creativeReview.explorationPlan') }}
        </div>
        <p class="mt-2 whitespace-pre-wrap text-base-content/70">{{ currentReview.context }}</p>
        <ol class="mt-2 list-decimal space-y-1 pl-5 text-base-content/70">
          <li
            v-for="direction in currentReview.directions"
            :key="direction.name"
          >
            <span class="font-medium">{{ direction.name }}</span>
            <span v-if="direction.description"> — {{ direction.description }}</span>
          </li>
        </ol>
      </div>

      <div
        v-else-if="currentReview.kind === 'creative_exploration_delete'"
        class="rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs text-base-content/70"
      >
        {{ t('agentPanel.creativeReview.deleteExploration', { name: currentReview.directionName }) }}
      </div>

      <div
        v-else-if="currentReview.kind === 'creative_compress'"
        class="rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs"
      >
        <div class="font-medium text-base-content/70">
          {{ t('agentPanel.creativeReview.compressChapters') }}
        </div>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-base-content/70">
          <li
            v-for="chapter in currentReview.completedChapters"
            :key="chapter"
          >
            {{ chapter }}
          </li>
        </ul>
      </div>

      <div
        v-else-if="currentReview.kind === 'creative_exploration_compare'"
        class="space-y-2"
      >
        <div
          v-if="currentReview.directionSummaries?.length"
          class="grid gap-2"
        >
          <section
            v-for="direction in currentReview.directionSummaries"
            :key="direction.name"
            class="rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs"
          >
            <div class="font-semibold text-base-content/80">{{ direction.name }}</div>
            <p class="mt-1 whitespace-pre-wrap text-base-content/70">{{ direction.summary }}</p>
            <ul
              v-if="direction.narrativeConsequences.length"
              class="mt-2 list-disc space-y-1 pl-5 text-base-content/65"
            >
              <li
                v-for="consequence in direction.narrativeConsequences"
                :key="consequence"
              >
                {{ consequence }}
              </li>
            </ul>
          </section>
        </div>
        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.comparisonReport') }}</span>
          <textarea
            v-model="bodyDraft"
            class="min-h-32 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
          />
        </label>
      </div>

      <div
        v-else-if="currentReview.kind === 'creative_exploration_merge'"
        class="space-y-2"
      >
        <div class="grid gap-2 md:grid-cols-2">
          <section class="min-w-0 rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs">
            <div class="mb-1 font-medium text-base-content/60">
              {{ t('agentPanel.creativeReview.beforeContent') }}
            </div>
            <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-base-100 px-2 py-1.5 text-[11px] leading-relaxed text-base-content/70">{{ currentReview.beforeContent || t('agentPanel.creativeReview.emptyContent') }}</pre>
          </section>
          <section class="min-w-0 rounded-md border border-base-300 bg-base-200 px-2 py-2 text-xs">
            <div class="mb-1 font-medium text-base-content/60">
              {{ t('agentPanel.creativeReview.afterContent') }}
            </div>
            <textarea
              v-model="bodyDraft"
              class="min-h-56 w-full resize-y rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
            />
          </section>
        </div>
      </div>

      <label
        v-else-if="showsBodyEditor"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ bodyLabel }}</span>
        <textarea
          v-model="bodyDraft"
          class="min-h-40 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <label
        v-if="currentReview.kind === 'creative_git_commit'"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.gitFiles') }}</span>
        <textarea
          v-model="filesDraft"
          class="min-h-16 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
        />
      </label>

      <label
        v-if="currentReview.kind === 'creative_git_tag'"
        class="block"
      >
        <span class="mb-1 block text-[11px] font-medium text-base-content/50">{{ t('agentPanel.creativeReview.gitTagMessage') }}</span>
        <textarea
          v-model="tagMessageDraft"
          class="min-h-16 w-full resize-y rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
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

      <details
        v-if="logicAudit"
        class="rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs"
      >
        <summary class="cursor-pointer select-none font-medium text-base-content/70">
          {{ t('agentPanel.creativeReview.logicAudit') }}
        </summary>
        <div class="mt-2 space-y-2">
          <section v-if="logicAudit.motivationTraces.length">
            <div class="mb-1 font-medium text-base-content/60">
              {{ t('agentPanel.creativeReview.motivationTraces') }}
            </div>
            <ul class="space-y-1">
              <li
                v-for="(trace, index) in logicAudit.motivationTraces"
                :key="`motivation-${index}`"
                class="rounded border border-base-300 bg-base-100 px-2 py-1"
              >
                <div class="font-medium">{{ trace.character }} · {{ trace.action }}</div>
                <div class="text-base-content/70">{{ trace.derivation }}</div>
              </li>
            </ul>
          </section>

          <section v-if="logicAudit.causalChain.length">
            <div class="mb-1 font-medium text-base-content/60">
              {{ t('agentPanel.creativeReview.causalChain') }}
            </div>
            <ul class="space-y-1">
              <li
                v-for="(beat, index) in logicAudit.causalChain"
                :key="`causal-${index}`"
                class="rounded border border-base-300 bg-base-100 px-2 py-1"
              >
                <div class="font-medium">{{ beat.beat }}</div>
                <div class="text-base-content/70">{{ beat.trigger }} → {{ beat.decision }} → {{ beat.consequence }}</div>
              </li>
            </ul>
          </section>

          <section v-if="logicAudit.commonSenseFlags.length">
            <div class="mb-1 font-medium text-base-content/60">
              {{ t('agentPanel.creativeReview.commonSenseFlags') }}
            </div>
            <ul class="space-y-1">
              <li
                v-for="(flag, index) in logicAudit.commonSenseFlags"
                :key="`common-sense-${index}`"
                class="rounded border border-base-300 bg-base-100 px-2 py-1"
              >
                <div class="font-medium">{{ flag.dimension }} · {{ flag.issue }}</div>
                <div class="text-base-content/70">{{ flag.correction }}</div>
              </li>
            </ul>
          </section>
        </div>
      </details>
    </div>

    <div
      v-if="isRespondOpen"
      class="border-t border-base-300 px-3 py-2"
    >
      <textarea
        v-model="respondMessage"
        class="w-full resize-none rounded-md border border-base-300 bg-base-200 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
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
        class="iw-btn btn-xs btn-ghost"
        @click="isRespondOpen = true"
      >
        {{ t('agentPanel.creativeReview.respond') }}
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
const logicAudit = computed(() =>
  currentReview.value?.kind === 'creative_plan' ? currentReview.value.logicAudit : undefined
)

const bodyDraft = ref('')
const rationaleDraft = ref('')
const approvedPlanDraft = ref('')
const filesDraft = ref('')
const tagMessageDraft = ref('')
const isRespondOpen = ref(false)
const respondMessage = ref('')

const title = computed(() => {
  const review = currentReview.value
  if (!review) return ''
  if (review.kind === 'creative_plan') return t('agentPanel.creativeReview.titlePlan')
  if (review.kind === 'creative_write') return t('agentPanel.creativeReview.titleWrite')
  if (review.kind === 'creative_chapter_structure') return t('agentPanel.creativeReview.titleChapterStructure')
  if (review.kind === 'creative_git_commit') return t('agentPanel.creativeReview.titleGitCommit')
  if (review.kind === 'creative_git_tag') return t('agentPanel.creativeReview.titleGitTag')
  if (review.kind === 'creative_exploration_start') return t('agentPanel.creativeReview.titleExplorationStart')
  if (review.kind === 'creative_exploration_compare') return t('agentPanel.creativeReview.titleExplorationCompare')
  if (review.kind === 'creative_exploration_merge') return t('agentPanel.creativeReview.titleExplorationMerge')
  if (review.kind === 'creative_exploration_delete') return t('agentPanel.creativeReview.titleExplorationDelete')
  if (review.kind === 'creative_compress') return t('agentPanel.creativeReview.titleCompress')
  return review.toolName === 'rebuild_storybible'
    ? t('agentPanel.creativeReview.titleRebuildStoryBible')
    : t('agentPanel.creativeReview.titleStoryBibleSection')
})

const subtitle = computed(() => {
  const review = currentReview.value
  if (!review) return ''
  if (review.kind === 'creative_write') return `${review.filename} · ${review.mode}`
  if (review.kind === 'creative_chapter_structure') return chapterOperationLabel.value
  if (review.kind === 'creative_storybible') return review.section ?? 'storybible.md'
  if (review.kind === 'creative_git_commit') return review.files.join(', ')
  if (review.kind === 'creative_git_tag') return review.name
  if (review.kind === 'creative_exploration_start') return t('agentPanel.creativeReview.explorationDirections', { count: review.directions.length })
  if (review.kind === 'creative_exploration_compare') return t('agentPanel.creativeReview.explorationComparison')
  if (review.kind === 'creative_exploration_merge') return `${review.directionName} → ${review.targetChapter} · ${review.mode}`
  if (review.kind === 'creative_exploration_delete') return review.directionName
  if (review.kind === 'creative_compress') return review.completedChapters.join(', ')
  return t('agentPanel.creativeReview.planFirstApproval')
})

const bodyLabel = computed(() => {
  const review = currentReview.value
  if (!review) return t('agentPanel.creativeReview.content')
  if (review.kind === 'creative_plan') return t('agentPanel.creativeReview.plan')
  if (review.kind === 'creative_write') return t('agentPanel.creativeReview.draftContent')
  if (review.kind === 'creative_git_commit') return t('agentPanel.creativeReview.gitCommitMessage')
  if (review.kind === 'creative_git_tag') return t('agentPanel.creativeReview.gitTagName')
  if (review.kind === 'creative_exploration_compare') return t('agentPanel.creativeReview.comparisonReport')
  if (review.kind === 'creative_exploration_merge') return t('agentPanel.creativeReview.explorationContent')
  return t('agentPanel.creativeReview.storyBibleContent')
})

const showsBodyEditor = computed(() => {
  const review = currentReview.value
  if (!review) return false
  return review.kind === 'creative_plan'
    || review.kind === 'creative_write'
    || review.kind === 'creative_storybible'
    || review.kind === 'creative_git_commit'
    || review.kind === 'creative_git_tag'
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
  if (review.kind === 'creative_chapter_structure') return false
  if (review.kind === 'creative_git_commit') {
    return bodyDraft.value !== review.message || filesDraft.value !== review.files.join('\n')
  }
  if (review.kind === 'creative_git_tag') {
    return bodyDraft.value !== review.name || tagMessageDraft.value !== (review.message ?? '')
  }
  if (review.kind === 'creative_exploration_start' || review.kind === 'creative_exploration_delete' || review.kind === 'creative_compress') return false
  if (review.kind === 'creative_exploration_compare') return bodyDraft.value !== review.comparisonReport
  if (review.kind === 'creative_exploration_merge') return bodyDraft.value !== (review.newContent ?? '')
  return bodyDraft.value !== review.newContent
})

const chapterOperationLabel = computed(() => {
  const review = currentReview.value
  if (!review || review.kind !== 'creative_chapter_structure') return ''
  return t(`agentPanel.creativeReview.chapterOperation.${review.operation}`)
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
  isRespondOpen.value = false
  respondMessage.value = ''
  if (!review) {
    bodyDraft.value = ''
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_plan') {
    bodyDraft.value = review.plan
    rationaleDraft.value = review.rationale
    approvedPlanDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_write') {
    bodyDraft.value = review.newContent
    approvedPlanDraft.value = review.approvedPlan
    rationaleDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_chapter_structure' || review.kind === 'creative_exploration_start' || review.kind === 'creative_exploration_delete' || review.kind === 'creative_compress') {
    bodyDraft.value = ''
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_git_commit') {
    bodyDraft.value = review.message
    filesDraft.value = review.files.join('\n')
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_git_tag') {
    bodyDraft.value = review.name
    tagMessageDraft.value = review.message ?? ''
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    filesDraft.value = ''
    return
  }
  if (review.kind === 'creative_exploration_compare') {
    bodyDraft.value = review.comparisonReport
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
    return
  }
  if (review.kind === 'creative_exploration_merge') {
    bodyDraft.value = review.newContent ?? ''
    rationaleDraft.value = ''
    approvedPlanDraft.value = ''
    filesDraft.value = ''
    tagMessageDraft.value = ''
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
      logicAudit: review.logicAudit,
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
  if (review.kind === 'creative_chapter_structure') {
    if (review.toolName === 'create_chapter') {
      return {
        filename: review.filename,
        ...(review.afterFilename !== undefined && { after_filename: review.afterFilename }),
      }
    }
    if (review.toolName === 'delete_chapter') {
      return {
        filename: review.filename,
        ...(review.cascadeRenumber !== undefined && { cascade_renumber: review.cascadeRenumber }),
      }
    }
    if (review.toolName === 'rename_chapter') {
      return {
        filename: review.filename,
        new_filename: review.newFilename,
      }
    }
    return { order: review.order ?? [] }
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
  if (review.kind === 'creative_exploration_start') {
    return {
      context: review.context,
      directions: review.directions,
    }
  }
  if (review.kind === 'creative_exploration_compare') {
    return {
      comparison_report: bodyDraft.value,
    }
  }
  if (review.kind === 'creative_exploration_merge') {
    return {
      direction_name: review.directionName,
      target_chapter: review.targetChapter,
      mode: review.mode,
      ...(bodyDraft.value.trim() && { content: bodyDraft.value }),
    }
  }
  if (review.kind === 'creative_exploration_delete') {
    return {
      direction_name: review.directionName,
    }
  }
  if (review.kind === 'creative_compress') {
    return {
      completed_chapters: review.completedChapters,
    }
  }
  if (review.toolName === 'resolve_open_question') {
    return {
      question: review.question,
      resolution: bodyDraft.value,
      target_section: review.targetSection ?? review.section,
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
