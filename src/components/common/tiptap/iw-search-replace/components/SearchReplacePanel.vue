<template>
  <div
    v-if="isOpen"
    class="absolute right-2 z-100 rounded-box shadow-sm flex flex-col bg-base-200 gap-1 p-2"
    :class="{
        compact: isCompact,
        'top-2': appStore.isCleanMode,
        'top-[calc(10*0.25rem+0.25rem)]': !appStore.isCleanMode
      }"
  >
    <div class="flex flex-row items-stretch">
      <!-- Toggle 按钮 -->
      <button
        @click="toggleReplaceMode"
        class="btn btn-ghost btn-square w-4 h-auto"
        :title="mode === 'replace' ? t('notify.search.hideReplace') : t('notify.search.showReplace')"
      >
        <IconChevronDown v-if="mode === 'replace'" class="icon-xs" />
        <IconChevronRight v-else class="icon-xs" />
      </button>

      <div class="flex flex-1 flex-col gap-1 pl-1">
        <!-- 第一行：搜索框 -->
        <div class="flex items-start gap-1">
          <!-- 搜索输入框容器 -->
          <div class="flex relative min-w-0">
            <textarea
              ref="searchInputRef"
              v-model="searchQuery"
              rows="1"
              :placeholder="t('notify.search.findPlaceholder')"
              class="w-65 min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-1.5 pr-22 pl-2 text-xs focus:border-primary rounded-field"
              @keydown="handleSearchKeydown"
              @input="onSearchInput"
            />

            <!-- 选项按钮组（在输入框内部右侧） -->
            <div class="flex absolute right-2 top-0.5 gap-0.5">
              <button
                @click="toggleCaseSensitive"
                :class="{ 'btn-active bg-primary text-primary-content': options.caseSensitive }"
                class="btn btn-ghost btn-square btn-xs"
                :title="t('notify.search.matchCaseTitle')"
              >
                <IconLetterCase class="icon-2xs" />
              </button>
              <button
                @click="toggleWholeWord"
                :class="{ 'btn-active bg-primary text-primary-content': options.wholeWord }"
                class="btn btn-ghost btn-square btn-xs"
                :title="t('notify.search.matchWholeWordTitle')"
              >
                <IconAbc class="icon-2xs" />
              </button>
              <button
                @click="toggleRegex"
                :class="{ 'btn-active bg-primary text-primary-content': options.regex }"
                class="btn btn-ghost btn-square btn-xs"
                :title="t('notify.search.regexTitle')"
              >
                <IconRegex class="icon-2xs" />
              </button>
            </div>
          </div>

          <!-- Result Count 容器（输入框外部） -->
          <div class="min-w-15 text-left shrink-0 text-xs text-base-content whitespace-nowrap mt-1.5">
            <span v-if="totalMatches > 0">
              {{ t('notify.search.resultCount', { current: currentIndex + 1, total: totalMatches }) }}
            </span>
            <span v-else-if="totalMatches === 0" class="text-error">
              {{ t('notify.search.noResults') }}
            </span>
          </div>

          <!-- 导航按钮 -->
          <div class="flex gap-1 shrink-0 mt-0.5">
            <button
              @click="findPrevious"
              :disabled="totalMatches === 0"
              class="btn btn-ghost btn-square btn-xs"
              :title="t('notify.search.previousMatchTitle')"
            >
              <IconArrowNarrowUp class="icon-xs" />
            </button>
            <button
              @click="findNext"
              :disabled="totalMatches === 0"
              class="btn btn-ghost btn-square btn-xs"
              :title="t('notify.search.nextMatchTitle')"
            >
              <IconArrowNarrowDown class="icon-xs" />
            </button>
            <!-- 选区按钮（有选区时显示） -->
            <button
              @click="toggleSearchInSelection"
              :disabled="!hasSelection && !searchInSelection"
              :class="{ 'btn-active btn-primary': searchInSelection }"
              class="btn btn-ghost btn-square btn-xs"
              :title="t('notify.search.findInSelectionTitle')"
            >
              <IconAlignLeft class="icon-xs" />
            </button>

            <!-- 关闭按钮 -->
            <button
              @click="closePanel"
              class="btn btn-ghost btn-square btn-xs"
              :title="t('notify.search.closeTitle')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
        </div>

        <!-- 第二行：替换框（仅在 replace 模式显示） -->
        <div v-if="mode === 'replace'" class="flex flex-row items-start gap-1">
          <!-- 替换输入框容器 -->
          <div class="flex relative min-w-0 gap-1">
            <textarea
              ref="replaceInputRef"
              v-model="replaceQuery"
              rows="1"
              :placeholder="t('notify.search.replacePlaceholder')"
              class="w-65 min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-1.5 px-2 text-xs focus:border-primary rounded-field"
              @keydown="handleReplaceKeydown"
              @input="onReplaceInput"
            />
          </div>
          <!-- 替换按钮组 -->
          <div class="flex gap-1 shrink-0 mt-0.5">
            <button
              @click="replaceNext"
              :disabled="totalMatches === 0"
              class="btn btn-ghost btn-square btn-xs"
              :title="t('notify.search.replaceNextTitle')"
            >
              <IconReplace class="icon-xs" />
            </button>
            <button
              @click="replaceAll"
              :disabled="totalMatches === 0"
              class="btn btn-ghost btn-square btn-xs"
              :title="t('notify.search.replaceAllTitle')"
            >
              <IconReplaceFilled class="icon-xs" />
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import { STORAGE_KEYS } from '@/utils/StateStorage'
import { useSearchHistory } from '../composables/useSearchHistory'
import {
  IconAbc,
  IconRegex,
  IconArrowNarrowUp,
  IconChevronDown,
  IconArrowNarrowDown,
  IconChevronRight,
  IconX,
  IconLetterCase,
  IconReplace,
  IconReplaceFilled,
  IconAlignLeft
} from '@tabler/icons-vue'

const { t } = useI18n()

interface Props {
  editor: Editor
}

const props = defineProps<Props>()
const appStore = useAppStore()

// 本地状态（双向绑定）
const searchQuery = ref('')
const replaceQuery = ref('')
const searchInputRef = ref<HTMLTextAreaElement | null>(null)
const replaceInputRef = ref<HTMLTextAreaElement | null>(null)
const containerWidth = ref<number | null>(null)

// 搜索/替换历史
const searchHist = useSearchHistory(STORAGE_KEYS.SEARCH_REPLACE_SEARCH_HISTORY)
const replaceHist = useSearchHistory(STORAGE_KEYS.SEARCH_REPLACE_REPLACE_HISTORY)

// 计算属性从 editor storage 获取状态
const isOpen = computed(() => props.editor.storage.iwSearchReplace.isOpen)
const mode = computed(() => props.editor.storage.iwSearchReplace.mode)
const options = computed(() => props.editor.storage.iwSearchReplace.options)
const totalMatches = computed(() => props.editor.storage.iwSearchReplace.matches.length)
const currentIndex = computed(() => props.editor.storage.iwSearchReplace.currentMatchIndex)
const searchInSelection = computed(() => props.editor.storage.iwSearchReplace.searchInSelection)
const isCompact = computed(() => containerWidth.value !== null && containerWidth.value < 720)

// 检查是否有有效选区
const hasSelection = computed(() => {
  const { from, to } = props.editor.state.selection
  return (from !== to) || !!props.editor.storage.iwSearchReplace.selectionRange
})

// 监听本地搜索词变化，更新到 editor；防抖记录历史
let searchHistoryDebounce: number | undefined
watch(searchQuery, (newValue) => {
  props.editor.commands.setSearchTerm(newValue)
  if (searchHistoryDebounce) clearTimeout(searchHistoryDebounce)
  searchHistoryDebounce = newValue
    ? window.setTimeout(() => searchHist.record(newValue), 300)
    : undefined
})

// 监听本地替换词变化，更新到 editor
watch(replaceQuery, (newValue) => {
  props.editor.commands.setReplaceTerm(newValue)
})

// 监听 editor storage 的搜索词变化，同步到本地
watch(
  () => props.editor.storage.iwSearchReplace.searchTerm,
  (newValue) => {
    if (newValue !== searchQuery.value) {
      searchQuery.value = newValue
    }
  }
)

// 监听面板打开，自动聚焦输入框
watch(isOpen, async (isNowOpen) => {
  if (isNowOpen) {
    await nextTick()
    syncCompactMode()
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
    autoResizeTextarea(searchInputRef.value)
  }
})

function syncCompactMode() {
  const editorContainer = props.editor.view.dom.closest('.editor-content-wrapper') as HTMLElement | null
  if (!editorContainer) return

  containerWidth.value = editorContainer.clientWidth
}

// 事件处理函数
function closePanel() {
  props.editor.commands.closeSearch()
}

function findNext() {
  props.editor.commands.findNext()
}

function findPrevious() {
  props.editor.commands.findPrevious()
}

function replaceNext() {
  replaceHist.forceRecord(replaceQuery.value)
  props.editor.commands.replaceNext()
}

function replaceAll() {
  if (confirm(`Replace all ${totalMatches.value} occurrences?`)) {
    replaceHist.forceRecord(replaceQuery.value)
    props.editor.commands.replaceAll()
  }
}

function toggleCaseSensitive() {
  props.editor.commands.toggleCaseSensitive()
}

function toggleWholeWord() {
  props.editor.commands.toggleWholeWord()
}

function toggleRegex() {
  props.editor.commands.toggleRegex()
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function onSearchInput() {
  searchHist.markAsUserTyped()
  autoResizeTextarea(searchInputRef.value)
}

function onReplaceInput() {
  replaceHist.markAsUserTyped()
  autoResizeTextarea(replaceInputRef.value)
}

function insertNewline(termRef: typeof searchQuery, inputRef: typeof searchInputRef) {
  const el = inputRef.value
  if (!el) return
  const start = el.selectionStart ?? termRef.value.length
  const end = el.selectionEnd ?? start
  termRef.value = termRef.value.substring(0, start) + '\n' + termRef.value.substring(end)
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.selectionStart = inputRef.value.selectionEnd = start + 1
      autoResizeTextarea(inputRef.value)
    }
  })
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(searchQuery, searchInputRef)
      searchHist.markAsUserTyped()
    } else {
      findNext()
    }
  } else if (event.key === 'ArrowUp') {
    const el = searchInputRef.value
    if (!el || el.value.substring(0, el.selectionStart).includes('\n')) return
    const val = searchHist.up()
    if (val === undefined) return
    event.preventDefault()
    searchQuery.value = val
    nextTick(() => autoResizeTextarea(el))
  } else if (event.key === 'ArrowDown') {
    const el = searchInputRef.value
    if (!el || el.value.substring(el.selectionEnd).includes('\n')) return
    const val = searchHist.down()
    if (val === undefined) return
    event.preventDefault()
    searchQuery.value = val ?? ''
    nextTick(() => autoResizeTextarea(el))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}

function handleReplaceKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(replaceQuery, replaceInputRef)
      replaceHist.markAsUserTyped()
    } else {
      replaceNext()
    }
  } else if (event.key === 'ArrowUp') {
    const el = replaceInputRef.value
    if (!el || el.value.substring(0, el.selectionStart).includes('\n')) return
    const val = replaceHist.up()
    if (val === undefined) return
    event.preventDefault()
    replaceQuery.value = val
    nextTick(() => autoResizeTextarea(el))
  } else if (event.key === 'ArrowDown') {
    const el = replaceInputRef.value
    if (!el || el.value.substring(el.selectionEnd).includes('\n')) return
    const val = replaceHist.down()
    if (val === undefined) return
    event.preventDefault()
    replaceQuery.value = val ?? ''
    nextTick(() => autoResizeTextarea(el))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}

function toggleReplaceMode() {
  if (mode.value === 'search') {
    props.editor.commands.openReplace()
  } else {
    props.editor.commands.openSearch()
  }
}

function toggleSearchInSelection() {
  props.editor.commands.toggleSearchInSelection()
}

// 键盘快捷键
function handleKeyDown(event: KeyboardEvent) {
  if (!isOpen.value) return

  if (event.altKey && event.key === 'c') {
    event.preventDefault()
    toggleCaseSensitive()
  }
  if (event.altKey && event.key === 'w') {
    event.preventDefault()
    toggleWholeWord()
  }
  if (event.altKey && event.key === 'r') {
    event.preventDefault()
    toggleRegex()
  }
  if (event.altKey && event.key === 'l') {
    event.preventDefault()
    toggleSearchInSelection()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', syncCompactMode)
  nextTick(syncCompactMode)
})

onUnmounted(() => {
  if (searchHistoryDebounce) clearTimeout(searchHistoryDebounce)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', syncCompactMode)
})
</script>
