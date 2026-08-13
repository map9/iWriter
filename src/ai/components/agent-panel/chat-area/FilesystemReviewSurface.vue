<template>
  <ReviewSurfaceShell
    v-if="current"
    :is-batch="reviews.length > 1"
    :index="currentIndex"
    :total="reviews.length"
    :is-delete="isDelete"
    :approve-label="t('agentPanel.filesystemReview.approve')"
    :reject-label="t('agentPanel.filesystemReview.reject')"
    :approve-all-label="t('agentPanel.filesystemReview.approveAll')"
    :reject-all-label="t('agentPanel.filesystemReview.rejectAll')"
    @approve="approveCurrent"
    @reject="rejectCurrent"
    @approve-all="approveAll"
    @reject-all="rejectAll"
    @prev="currentIndex -= 1"
    @next="currentIndex += 1"
  >
    <template #header="{ toneTitleClass, toneDescriptionClass }">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium" :class="toneTitleClass">{{ reviewTitle }}</div>
            <span
              v-if="isDelete"
              class="inline-flex items-center rounded-full bg-error/50 px-1.5 py-0.5 text-2xs font-medium text-error-content"
            >{{ t('agentPanel.blockEditReviewSurface.highRisk') }}</span>
          </div>
          <div
            v-if="current.toolName === 'rename_file' || current.toolName === 'move_file'"
            class="mt-1 truncate text-sm font-medium text-current"
            :title="`${current.targetPath} → ${current.destPath}`"
          >
            {{ current.targetPath }} → {{ current.destPath }}
          </div>
          <div v-else class="mt-1 truncate text-sm font-medium text-current" :title="current.targetPath">
            {{ current.targetPath }}
          </div>
        </div>
      </div>
      <div class="mt-2 text-xs" :class="toneDescriptionClass">
        {{ reviewWarning }}
      </div>
      <div v-if="current.toolName === 'delete_file' && current.recursive" class="mt-1 text-xs" :class="toneDescriptionClass">
        {{ t('agentPanel.filesystemReview.deleteDirectoryHint') }}
      </div>
    </template>

    <div v-if="current.toolName === 'edit_file' || current.toolName === 'write_file'" class="min-h-48">
      <DiffSplitView
        v-if="current.toolName === 'edit_file'"
        :old-content="current.oldString || ''"
        :new-content="current.newString || ''"
      />
      <div v-else class="p-3">
        <div class="mb-1.5 text-xs font-medium text-base-content">{{ t('agentPanel.filesystemReview.newFileContent') }}</div>
        <pre class="max-h-88 overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-box border border-base-300 p-2 font-mono text-xs leading-relaxed text-base-content">{{ current.newContent }}</pre>
      </div>
    </div>
  </ReviewSurfaceShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/ai/state/aiStore'
import DiffSplitView from './views/DiffSplitView.vue'
import ReviewSurfaceShell from './views/ReviewSurfaceShell.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const currentIndex = ref(0)
const reviews = computed(() => aiStore.pendingFilesystemReviews)
const current = computed(() => reviews.value[currentIndex.value] ?? null)
const isDelete = computed(() => current.value?.toolName === 'delete_file')

const REVIEW_TITLE_KEYS: Record<string, string> = {
  write_file: 'titleWriteFile',
  edit_file: 'titleEditFile',
  rename_file: 'titleRenameFile',
  move_file: 'titleMoveFile',
  delete_file: 'titleDeleteFile',
}

const REVIEW_WARNING_KEYS: Record<string, string> = {
  write_file: 'warningWriteFile',
  edit_file: 'warningEditFile',
  rename_file: 'warningRenameFile',
  move_file: 'warningMoveFile',
  delete_file: 'warningDeleteFile',
}

const reviewTitle = computed(() =>
  current.value
    ? t(`agentPanel.filesystemReview.${REVIEW_TITLE_KEYS[current.value.toolName] ?? 'titleDefault'}`)
    : ''
)
const reviewWarning = computed(() =>
  current.value
    ? t(`agentPanel.filesystemReview.${REVIEW_WARNING_KEYS[current.value.toolName] ?? 'warningDefault'}`)
    : ''
)

watch(() => reviews.value.length, length => {
  if (currentIndex.value >= length) currentIndex.value = Math.max(0, length - 1)
})

function approveCurrent() {
  if (current.value) void aiStore.approveFilesystemReview(current.value.id)
}

function rejectCurrent() {
  if (current.value) void aiStore.rejectFilesystemReview(current.value.id)
}

function approveAll() {
  void aiStore.approveAllFilesystemReviews()
}

function rejectAll() {
  void aiStore.rejectAllFilesystemReviews()
}
</script>
