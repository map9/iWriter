<template>
  <div
    v-if="request"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
  >
    <div class="w-full max-w-2xl overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl">
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
        <pre class="whitespace-pre-wrap rounded-box border border-base-300 bg-base-200 p-3 text-xs leading-relaxed text-base-content">{{ formattedPayload }}</pre>

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
import type { NovelConfirmRequest, NovelConfirmResponse } from '@/ai/ipc'

const request = ref<NovelConfirmRequest | null>(null)
const queue = ref<NovelConfirmRequest[]>([])
const adjustmentText = ref('')

const formattedPayload = computed(() => {
  if (!request.value) return ''
  return JSON.stringify(request.value.payload, null, 2)
})

function handleRequest(nextRequest: NovelConfirmRequest) {
  if (request.value) {
    queue.value.push(nextRequest)
    return
  }

  request.value = nextRequest
  adjustmentText.value = ''
}

function showNextRequest() {
  request.value = queue.value.shift() ?? null
  adjustmentText.value = ''
}

function sendDecision(decision: NovelConfirmResponse['decision']) {
  if (!request.value) return

  const response: NovelConfirmResponse = {
    sessionId: request.value.sessionId,
    type: request.value.type,
    decision,
  }

  if (decision === 'adjust' && adjustmentText.value.trim()) {
    response.adjustmentText = adjustmentText.value.trim()
  }

  window.electronAPI.novelConfirmResponse?.(response)
  showNextRequest()
}

onMounted(() => {
  window.electronAPI.onNovelConfirmRequest?.(handleRequest)
})

onUnmounted(() => {
  window.electronAPI.removeNovelConfirmListeners?.()
})
</script>
