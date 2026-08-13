<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Search Bar -->
    <div class="flex shrink-0 items-center border-b border-base-300 bg-base-200 p-2 select-none">
      <label class="input input-sm h-7 w-full">
        <IconSearch class="icon-xs text-base-content" />
        <input 
          v-model="searchQuery"
          type="text"
          class="grow"
          :placeholder="t('agentPanel.history.searchPlaceholder')"
        />
      </label>
    </div>

    <!-- Thread List -->
    <div class="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
      <!-- Empty States -->
      <div v-if="!aiStore.threads.length" class="text-center py-8 text-xs text-base-content/50">
        {{ t('agentPanel.history.noSessions') }}
      </div>
      <div v-else-if="!groupedThreads.length" class="text-center py-8 text-xs text-base-content/50">
        {{ t('agentPanel.history.noSessionMatches') }}
      </div>

      <!-- Grouped Threads -->
      <template v-for="group in groupedThreads" :key="group.label">
        <div class="px-1 pt-3 pb-1 text-2xs font-medium text-base-content">
          {{ group.label }}
        </div>

        <div
          v-for="thread in group.threads"
          :key="thread.id"
          @click="handleSelect(thread.id)"
          class="group relative flex items-start gap-2 px-2 py-2 rounded-field hover:bg-base-200 mb-0.5"
        >
          <!-- Dot Indicator -->
          <div class="shrink-0 mt-1.5">
            <div
              v-if="thread.id === aiStore.activeThreadId"
              class="icon-dot bg-primary"
            />
            <div
              v-else
              class="icon-dot bg-transparent"
            />
          </div>

          <!-- Main Content -->
          <div class="flex-1 min-w-0">
            <!-- Title Row -->
            <div class="flex items-center justify-between gap-1">
              <!-- Inline Rename Input -->
              <input
                v-if="renamingId === thread.id"
                :ref="el => renamingId === thread.id && (renameInputRef = el as HTMLInputElement)"
                v-model="renameValue"
                @keydown.enter.prevent="commitRename(thread)"
                @keydown.escape.prevent="cancelRename"
                @blur="commitRename(thread)"
                @click.stop
                class="input input-sm h-7 w-full text-xs"
              />
              <!-- Title Display -->
              <span v-else class="flex-1 min-w-0 text-xs font-medium truncate text-base-content">
                {{ thread.title }}
              </span>
              <span
                v-if="aiStore.isSwitchingThread && aiStore.switchingThreadId === thread.id && renamingId !== thread.id"
                class="inline-block icon-2xs border border-base-300 rounded-full animate-spin shrink-0"
                :title="t('agentPanel.history.loadingSession')"
              />
              <span v-if="thread.hasError && renamingId !== thread.id" class="shrink-0 text-error-content text-xs" :title="t('agentPanel.history.lastSessionError')">⚠</span>
              <!-- Time (hide when renaming) -->
              <span v-if="renamingId !== thread.id" class="shrink-0 text-2xs text-base-content">{{ relativeTime(thread.updatedAt) }}</span>
            </div>

            <!-- Sub Row: message count + size + action buttons -->
            <div class="flex items-center justify-between mt-0.5">
              <span class="text-2xs text-base-content">{{ threadSubtitle(thread) }}</span>
              <!-- Action Buttons (hover) -->
              <div
                v-if="renamingId !== thread.id"
                class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop
              >
                <button
                  @click.stop="startRename(thread)"
                  class="btn btn-ghost btn-square btn-xs"
                  :title="t('agentPanel.history.rename')"
                >
                  <IconPencil class="icon-2xs" />
                </button>
                <button
                  @click.stop="aiStore.deleteThread(thread.id)"
                  class="btn btn-ghost btn-square btn-xs text-error hover:bg-error hover:text-error-content"
                  :title="t('agentPanel.history.delete')"
                >
                  <IconTrash class="icon-2xs" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Clear All Button -->
    <div class="shrink-0 px-2 py-2 border-t bg-base-200 border-base-300">
      <button
        @click="handleClearAll"
        :disabled="!aiStore.threads.length"
        class="btn w-full"
        :class="confirmClear
          ? 'btn-error'
          : 'btn-neutral'"
      >
        {{ confirmClear ? t('agentPanel.history.confirm') : t('agentPanel.history.clearAll') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconTrash, IconSearch, IconPencil } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/state/aiStore'
import type { AiThread } from '@/ai/types'

const aiStore = useAiStore()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()

// ── Search ────────────────────────────────────────────────────────────────────
const searchQuery = ref('')

const filteredThreads = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return aiStore.threads
  return aiStore.threads.filter(t => t.title.toLowerCase().includes(q))
})

// ── Time Grouping ─────────────────────────────────────────────────────────────
interface ThreadGroup { label: string; threads: AiThread[] }

const groupedThreads = computed<ThreadGroup[]>(() => {
  const now = Date.now()
  const DAY = 86400000
  const groups: ThreadGroup[] = [
    { label: t('agentPanel.history.group.today'), threads: [] },
    { label: t('agentPanel.history.group.pastWeek'), threads: [] },
    { label: t('agentPanel.history.group.earlier'), threads: [] },
  ]
  for (const t of filteredThreads.value) {
    const age = now - t.updatedAt
    if (age < DAY) groups[0]!.threads.push(t)
    else if (age < 7 * DAY) groups[1]!.threads.push(t)
    else groups[2]!.threads.push(t)
  }
  return groups.filter(g => g.threads.length > 0)
})

// ── Relative Time ─────────────────────────────────────────────────────────────
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('agentPanel.history.now')
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// ── Thread Subtitle (messages + size) ────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function threadSubtitle(thread: AiThread): string {
  const msgCount = thread.messages?.length ?? 0
  const size = formatBytes(JSON.stringify(thread).length)
  return t('agentPanel.history.subtitle', { count: msgCount, size })
}

// ── Rename ────────────────────────────────────────────────────────────────────
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function startRename(thread: AiThread) {
  renamingId.value = thread.id
  renameValue.value = thread.title
  nextTick(() => {
    renameInputRef.value?.select()
  })
}

function commitRename(thread: AiThread) {
  if (renamingId.value !== thread.id) return
  const newTitle = renameValue.value.trim()
  if (newTitle && newTitle !== thread.title) {
    aiStore.updateThread({ ...thread, title: newTitle })
  }
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

// ── Select ────────────────────────────────────────────────────────────────────
function handleSelect(id: string) {
  if (renamingId.value || aiStore.isSwitchingThread) return
  emit('select', id)
}

// ── Clear All ─────────────────────────────────────────────────────────────────
const confirmClear = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

function handleClearAll() {
  if (!confirmClear.value) {
    confirmClear.value = true
    confirmTimer = setTimeout(() => {
      confirmClear.value = false
    }, 3000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmClear.value = false
  aiStore.clearAllThreads()
}
</script>
