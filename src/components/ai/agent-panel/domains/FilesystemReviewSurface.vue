<template>
  <div v-if="current" class="overflow-hidden rounded-box border bg-base-100" :class="containerClass">
    <div
      v-if="reviews.length > 1"
      class="space-y-2 border-b border-warning-content/15 bg-warning/50 px-3 py-2.5"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs text-warning-content">{{ currentIndex + 1 }} / {{ reviews.length }}</div>
        <div class="flex shrink-0 flex-wrap gap-1.5">
          <button class="iw-btn btn-xs btn-warning" @click="approveAll">{{ t('agentPanel.filesystemReview.approveAll') }}</button>
          <button class="iw-btn btn-xs btn-error" @click="rejectAll">{{ t('agentPanel.filesystemReview.rejectAll') }}</button>
        </div>
      </div>
    </div>

    <div class="border-b border-base-300 px-3 py-2.5" :class="tonePanelClass">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium" :class="toneTitleClass">{{ reviewTitle }}</div>
            <span
              v-if="isDelete"
              class="inline-flex items-center rounded-full bg-error/50 px-1.5 py-0.5 text-2xs font-medium text-error-content"
            >{{ t('agentPanel.proposalNavigator.highRisk') }}</span>
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
    </div>

    <div class="min-h-48">
      <DiffSplitView
        v-if="current.toolName === 'edit_file'"
        :old-content="current.oldString || ''"
        :new-content="current.newString || ''"
      />
      <div v-else-if="current.toolName === 'write_file'" class="p-3">
        <div class="mb-1.5 text-xs font-medium text-base-content">{{ t('agentPanel.filesystemReview.newFileContent') }}</div>
        <pre class="max-h-88 overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-box border border-warning-content/15 bg-warning/50 p-2 font-mono text-xs leading-relaxed text-warning-content">{{ current.newContent }}</pre>
      </div>
      <div v-else-if="current.toolName === 'delete_file'" class="p-3">
        <div class="rounded-md border border-error-content/15 bg-error/50 p-2 text-xs text-error-content">
          <p>{{ t('agentPanel.filesystemReview.deletePermanently') }}</p>
          <p class="mt-1 break-all font-mono">{{ current.targetPath }}</p>
          <p v-if="current.recursive" class="mt-2">{{ t('agentPanel.filesystemReview.deleteDirectoryHint') }}</p>
        </div>
      </div>
      <div v-else class="p-3 text-sm text-base-content/80">
        <p>{{ current.toolName === 'rename_file' ? t('agentPanel.filesystemReview.rename') : t('agentPanel.filesystemReview.move') }}</p>
        <p class="mt-1 break-all font-mono text-xs">{{ current.targetPath }}</p>
        <p class="mt-1 break-all font-mono text-xs">→ {{ current.destPath }}</p>
      </div>
    </div>

    <div class="border-t border-base-300 px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <button class="iw-btn btn-xs" :class="isDelete ? 'btn-error' : 'btn-warning'" @click="approveCurrent">
          {{ t('agentPanel.filesystemReview.approve') }}
        </button>
        <button class="iw-btn btn-xs btn-ghost" @click="rejectCurrent">{{ t('agentPanel.filesystemReview.reject') }}</button>
        <button
          v-if="reviews.length > 1"
          class="iw-btn btn-xs btn-ghost"
          :disabled="currentIndex === 0"
          @click="currentIndex -= 1"
        >←</button>
        <button
          v-if="reviews.length > 1"
          class="iw-btn btn-xs btn-ghost"
          :disabled="currentIndex >= reviews.length - 1"
          @click="currentIndex += 1"
        >→</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/ai/store/ai'
import DiffSplitView from '../chat-area/views/DiffSplitView.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const currentIndex = ref(0)
const reviews = computed(() => aiStore.pendingFilesystemReviews)
const current = computed(() => reviews.value[currentIndex.value] ?? null)
const isDelete = computed(() => current.value?.toolName === 'delete_file')

const containerClass = computed(() =>
  reviews.value.length <= 1 && isDelete.value ? 'border-error-content/15' : 'border-warning-content/15'
)
const tonePanelClass = computed(() => isDelete.value ? 'border-error-content/15 bg-error/50 text-error-content' : 'border-warning-content/15 bg-warning/50 text-warning-content')
const toneTitleClass = computed(() => isDelete.value ? 'text-error-content' : 'text-warning-content')
const toneDescriptionClass = computed(() => isDelete.value ? 'text-error-content/70' : 'text-warning-content/70')

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
