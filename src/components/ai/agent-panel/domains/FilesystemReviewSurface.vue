<template>
  <div v-if="current" class="overflow-hidden rounded-box border border-warning-content/15 bg-base-100">
    <div class="border-b border-warning-content/15 bg-warning/10 px-3 py-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-medium text-warning-content">
            {{ reviewTitle }}
          </div>
          <div
            v-if="current.toolName === 'rename_file' || current.toolName === 'move_file'"
            class="mt-1 truncate text-sm font-medium text-base-content"
            :title="`${current.targetPath} → ${current.destPath}`"
          >
            {{ current.targetPath }} → {{ current.destPath }}
          </div>
          <div v-else class="mt-1 truncate text-sm font-medium text-base-content" :title="current.targetPath">
            {{ current.targetPath }}
          </div>
        </div>
        <div v-if="reviews.length > 1" class="text-xs text-base-content/70">
          {{ currentIndex + 1 }} / {{ reviews.length }}
        </div>
      </div>
      <div class="mt-2 rounded-box bg-warning/10 px-2 py-1.5 text-xs text-warning-content">
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
        <div class="mb-1.5 text-xs font-medium text-base-content">New file content</div>
        <pre class="max-h-88 overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-box border border-warning-content/15 bg-warning/10 p-2 font-mono text-xs leading-relaxed text-base-content">{{ current.newContent }}</pre>
      </div>
      <div v-else class="p-3 text-sm text-base-content/80">
        <template v-if="current.toolName === 'delete_file'">
          <p>This will permanently delete:</p>
          <p class="mt-1 break-all font-mono text-xs">{{ current.targetPath }}</p>
          <p v-if="current.recursive" class="mt-2 text-warning-content">This is a directory — deleting it will also remove all of its contents.</p>
        </template>
        <template v-else>
          <p>{{ current.toolName === 'rename_file' ? 'This will rename:' : 'This will move:' }}</p>
          <p class="mt-1 break-all font-mono text-xs">{{ current.targetPath }}</p>
          <p class="mt-1 break-all font-mono text-xs">→ {{ current.destPath }}</p>
        </template>
      </div>
    </div>

    <div class="border-t border-base-300 px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <button class="iw-btn btn-xs btn-warning" @click="approveCurrent">Approve</button>
        <button class="iw-btn btn-xs btn-ghost" @click="rejectCurrent">Reject</button>
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
import { useAiStore } from '@/ai/store/ai'
import DiffSplitView from '../chat-area/views/DiffSplitView.vue'

const aiStore = useAiStore()
const currentIndex = ref(0)
const reviews = computed(() => aiStore.pendingFilesystemReviews)
const current = computed(() => reviews.value[currentIndex.value] ?? null)

const REVIEW_TITLES: Record<string, string> = {
  write_file: 'File write requires approval',
  edit_file: 'File edit requires approval',
  rename_file: 'File rename requires approval',
  move_file: 'File move requires approval',
  delete_file: 'File delete requires approval',
}

const REVIEW_WARNINGS: Record<string, string> = {
  write_file: 'This will modify a real host file. Review the path and content before approving.',
  edit_file: 'This will modify a real host file. Review the path and content before approving.',
  rename_file: 'This will rename a real host file or directory.',
  move_file: 'This will move a real host file or directory to a new location.',
  delete_file: 'This will permanently delete a real host file or directory. This action cannot be undone.',
}

const reviewTitle = computed(() => current.value ? REVIEW_TITLES[current.value.toolName] ?? 'File operation requires approval' : '')
const reviewWarning = computed(() => current.value ? REVIEW_WARNINGS[current.value.toolName] ?? 'Review carefully before approving.' : '')

watch(() => reviews.value.length, length => {
  if (currentIndex.value >= length) currentIndex.value = Math.max(0, length - 1)
})

function approveCurrent() {
  if (current.value) void aiStore.approveFilesystemReview(current.value.id)
}

function rejectCurrent() {
  if (current.value) void aiStore.rejectFilesystemReview(current.value.id)
}
</script>
