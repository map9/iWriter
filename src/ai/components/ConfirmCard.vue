<template>
  <div
    v-if="request"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
  >
    <div class="w-full max-w-4xl overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl">
      <div class="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200 px-4 py-3">
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-base-content">Novel Confirm</div>
          <div class="truncate font-mono text-2xs text-base-content/60">{{ request.type }} · {{ request.sessionId }}</div>
        </div>
        <button
          class="iw-toolbar-btn btn-sm"
          title="Cancel"
          @click="sendDecision('cancel')"
        >
          <IconX class="icon-xs" />
        </button>
      </div>

      <div class="max-h-[60vh] overflow-auto p-4">
        <div v-if="isChapterBoundary" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-medium text-base-content">
              {{ chapterRows.length }} chapters · {{ totalWords }} words · {{ totalBlocks }} blocks
            </div>
            <div class="flex items-center gap-2">
              <button
                class="iw-btn btn-sm btn-outline"
                :disabled="selectedIndex <= 0"
                @click="mergeWithPrevious"
              >
                Merge Previous
              </button>
              <button
                class="iw-btn btn-sm btn-outline"
                :disabled="selectedIndex < 0"
                @click="splitSelected"
              >
                Split
              </button>
            </div>
          </div>

          <div class="overflow-hidden rounded-box border border-base-300">
            <table class="table table-zebra table-sm w-full">
              <thead>
                <tr>
                  <th class="w-12"></th>
                  <th>Title</th>
                  <th class="w-24 text-right">Words</th>
                  <th class="w-24 text-right">Blocks</th>
                  <th class="w-32 text-right">Range</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(chapter, index) in chapterRows"
                  :key="chapter.id"
                  :class="{ 'bg-primary/10': selectedIndex === index }"
                  @click="selectedIndex = index"
                >
                  <td>
                    <input
                      type="radio"
                      class="radio radio-xs"
                      :checked="selectedIndex === index"
                      @change="selectedIndex = index"
                    />
                  </td>
                  <td class="min-w-0">
                    <input
                      v-model="chapter.title"
                      class="input input-bordered input-xs w-full"
                      @click.stop
                    />
                  </td>
                  <td class="text-right tabular-nums">{{ chapter.wordCount }}</td>
                  <td class="text-right tabular-nums">{{ chapter.blockCount }}</td>
                  <td class="text-right font-mono text-xs">
                    {{ chapter.startBlockId }}-{{ chapter.endBlockId }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <pre v-else class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200 p-3 text-xs leading-relaxed text-base-content">{{ formattedPayload }}</pre>

        <label class="mt-3 block text-2xs font-medium uppercase tracking-wide text-base-content/60">
          Adjustment
        </label>
        <textarea
          v-model="adjustmentText"
          class="textarea textarea-bordered mt-1 h-24 w-full resize-none text-sm"
          placeholder="Optional instruction for adjust"
        />
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-base-300 bg-base-100 px-4 py-3">
        <button class="iw-btn btn-sm btn-ghost" @click="sendDecision('cancel')">
          Cancel
        </button>
        <button
          class="iw-btn btn-sm btn-outline"
          :disabled="!adjustmentText.trim()"
          @click="sendDecision('adjust')"
        >
          Adjust
        </button>
        <button class="iw-btn btn-sm btn-primary" @click="sendDecision('confirm')">
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { IconX } from '@tabler/icons-vue'
import type { ChapterBoundaryPayload, NovelConfirmRequest, NovelConfirmResponse } from '@/ai/ipc'

const request = ref<NovelConfirmRequest | null>(null)
const queue = ref<NovelConfirmRequest[]>([])
const adjustmentText = ref('')
const chapterRows = ref<ChapterBoundaryPayload['chapters']>([])
const selectedIndex = ref(-1)

const formattedPayload = computed(() => {
  if (!request.value) return ''
  return JSON.stringify(request.value.payload, null, 2)
})

const isChapterBoundary = computed(() => request.value?.type === 'chapter_boundary')
const totalWords = computed(() => chapterRows.value.reduce((sum, chapter) => sum + chapter.wordCount, 0))
const totalBlocks = computed(() => chapterRows.value.reduce((sum, chapter) => sum + chapter.blockCount, 0))

function handleRequest(nextRequest: NovelConfirmRequest) {
  if (request.value) {
    queue.value.push(nextRequest)
    return
  }

  request.value = nextRequest
  adjustmentText.value = ''
  loadChapterRows(nextRequest)
}

function showNextRequest() {
  request.value = queue.value.shift() ?? null
  adjustmentText.value = ''
  if (request.value) {
    loadChapterRows(request.value)
  } else {
    chapterRows.value = []
    selectedIndex.value = -1
  }
}

function sendDecision(decision: NovelConfirmResponse['decision']) {
  if (!request.value) return

  const response: NovelConfirmResponse = {
    sessionId: request.value.sessionId,
    type: request.value.type,
    decision,
  }

  if (isChapterBoundary.value) {
    response.adjustedPayload = { chapters: normalizeChapters(chapterRows.value) }
  }

  if (decision === 'adjust' && adjustmentText.value.trim()) {
    response.adjustmentText = adjustmentText.value.trim()
  }

  window.electronAPI.novelConfirmResponse?.(response)
  showNextRequest()
}

function loadChapterRows(nextRequest: NovelConfirmRequest) {
  if (nextRequest.type !== 'chapter_boundary') {
    chapterRows.value = []
    selectedIndex.value = -1
    return
  }

  const payload = nextRequest.payload as ChapterBoundaryPayload
  chapterRows.value = payload.chapters.map(chapter => ({ ...chapter }))
  selectedIndex.value = chapterRows.value.length ? 0 : -1
}

function mergeWithPrevious() {
  const index = selectedIndex.value
  if (index <= 0) return

  const previous = chapterRows.value[index - 1]
  const current = chapterRows.value[index]
  if (!previous || !current) return

  previous.title = `${previous.title} / ${current.title}`
  previous.wordCount += current.wordCount
  previous.blockCount += current.blockCount
  previous.endBlockId = current.endBlockId
  chapterRows.value.splice(index, 1)
  selectedIndex.value = index - 1
  renumberChapters()
}

function splitSelected() {
  const index = selectedIndex.value
  const chapter = chapterRows.value[index]
  if (!chapter || chapter.blockCount < 2) return

  const splitBlockCount = Math.floor(chapter.blockCount / 2)
  const firstEndBlockId = chapter.startBlockId + splitBlockCount - 1
  const firstWordCount = Math.floor(chapter.wordCount / 2)
  const secondWordCount = chapter.wordCount - firstWordCount

  const first = {
    ...chapter,
    title: `${chapter.title} A`,
    wordCount: firstWordCount,
    blockCount: splitBlockCount,
    endBlockId: firstEndBlockId,
  }

  const second = {
    ...chapter,
    title: `${chapter.title} B`,
    wordCount: secondWordCount,
    blockCount: chapter.blockCount - splitBlockCount,
    startBlockId: firstEndBlockId + 1,
  }

  chapterRows.value.splice(index, 1, first, second)
  selectedIndex.value = index + 1
  renumberChapters()
}

function renumberChapters() {
  chapterRows.value = chapterRows.value.map((chapter, index) => ({
    ...chapter,
    id: `ch${String(index + 1).padStart(2, '0')}`,
  }))
}

function normalizeChapters(chapters: ChapterBoundaryPayload['chapters']) {
  return chapters.map((chapter, index) => ({
    ...chapter,
    id: `ch${String(index + 1).padStart(2, '0')}`,
    title: chapter.title.trim() || `未命名章节 ${index + 1}`,
  }))
}

onMounted(() => {
  window.electronAPI.onNovelConfirmRequest?.(handleRequest)
})

onUnmounted(() => {
  window.electronAPI.removeNovelConfirmListeners?.()
})
</script>
