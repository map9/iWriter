<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Search Bar -->
    <div class="px-3 py-2 flex-shrink-0">
      <div class="relative">
        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search sessions..."
          class="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border-default bg-background-content text-text-primary placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-interactive-highlight"
        />
      </div>
    </div>

    <!-- Thread List -->
    <div class="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
      <!-- Empty States -->
      <div v-if="!aiStore.threads.length" class="text-center py-8 text-xs text-gray-400">
        暂无历史对话
      </div>
      <div v-else-if="!groupedThreads.length" class="text-center py-8 text-xs text-gray-400">
        无匹配结果
      </div>

      <!-- Grouped Threads -->
      <template v-for="group in groupedThreads" :key="group.label">
        <div class="px-1 pt-3 pb-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          {{ group.label }}
        </div>

        <div
          v-for="thread in group.threads"
          :key="thread.id"
          @click="handleSelect(thread.id)"
          class="group relative flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors mb-0.5"
          :class="thread.id === aiStore.activeThreadId
            ? 'bg-interactive-highlight'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <!-- Dot Indicator -->
          <div class="flex-shrink-0 mt-1.5">
            <div
              v-if="thread.id === aiStore.activeThreadId"
              class="w-2 h-2 rounded-full bg-accent-primary"
            />
            <div
              v-else
              class="w-2 h-2 rounded-full border border-gray-400"
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
                class="flex-1 min-w-0 text-xs font-medium bg-transparent border-b border-accent-primary outline-none text-text-primary"
              />
              <!-- Title Display -->
              <span v-else class="flex-1 min-w-0 text-xs font-medium truncate text-text-primary">
                {{ thread.title }}
              </span>
              <span
                v-if="aiStore.isSwitchingThread && aiStore.switchingThreadId === thread.id && renamingId !== thread.id"
                class="inline-block w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0"
                title="正在载入会话"
              />
              <span v-if="thread.hasError && renamingId !== thread.id" class="flex-shrink-0 text-red-400 text-xs" title="上次对话出现错误">⚠</span>
              <!-- Time (hide when renaming) -->
              <span v-if="renamingId !== thread.id" class="flex-shrink-0 text-[10px] text-gray-400">{{ relativeTime(thread.updatedAt) }}</span>
            </div>

            <!-- Sub Row: message count + size + action buttons -->
            <div class="flex items-center justify-between mt-0.5">
              <span class="text-[10px] text-gray-400">{{ threadSubtitle(thread) }}</span>
              <!-- Action Buttons (hover) -->
              <div
                v-if="renamingId !== thread.id"
                class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop
              >
                <button
                  @click.stop="startRename(thread)"
                  class="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="重命名"
                >
                  <IconPencil class="w-3 h-3 text-gray-500" />
                </button>
                <button
                  @click.stop="aiStore.deleteThread(thread.id)"
                  class="p-0.5 rounded hover:bg-red-100"
                  title="删除"
                >
                  <IconTrash class="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Clear All Button -->
    <div class="flex-shrink-0 px-3 py-2 border-t border-border-default">
      <button
        @click="handleClearAll"
        :disabled="!aiStore.threads.length"
        class="w-full text-xs py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :class="confirmClear
          ? 'text-red-500 hover:bg-red-50 font-medium'
          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'"
      >
        {{ confirmClear ? '确认清除？点击确认' : '清除所有会话记录' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { IconTrash, IconSearch, IconPencil } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiThread } from '@/ai/types'

const aiStore = useAiStore()
const emit = defineEmits<{ select: [id: string] }>()

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
    { label: 'Today', threads: [] },
    { label: 'Past week', threads: [] },
    { label: 'Earlier', threads: [] },
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
  if (mins < 1) return '刚刚'
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
  return `${msgCount} messages · ${size}`
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
