<template>
  <div v-if="current" class="overflow-hidden rounded-box border border-warning-content/15 bg-base-100">
    <div class="border-b border-warning-content/15 bg-warning/10 px-3 py-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-medium text-warning-content">
            {{ current.toolName === 'write_file' ? 'File write requires approval' : 'File edit requires approval' }}
          </div>
          <div class="mt-1 truncate text-sm font-medium text-base-content" :title="current.targetPath">
            {{ current.targetPath }}
          </div>
        </div>
        <div v-if="reviews.length > 1" class="text-xs text-base-content/70">
          {{ currentIndex + 1 }} / {{ reviews.length }}
        </div>
      </div>
      <div class="mt-2 rounded-box bg-warning/10 px-2 py-1.5 text-xs text-warning-content">
        This will modify a real host file. Review the path and content before approving.
      </div>
    </div>

    <div class="min-h-48">
      <DiffSplitView
        v-if="current.toolName === 'edit_file'"
        :old-content="current.oldString || ''"
        :new-content="current.newString || ''"
      />
      <div v-else class="p-3">
        <div class="mb-1.5 text-xs font-medium text-base-content">New file content</div>
        <pre class="max-h-88 overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-box border border-warning-content/15 bg-warning/10 p-2 font-mono text-xs leading-relaxed text-base-content">{{ current.newContent }}</pre>
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
