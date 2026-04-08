<template>
  <div
    v-if="isOpen"
    class="search-replace-panel"
    :class="{ compact: isCompact, 'with-toolbar': !appStore.isCleanMode }"
  >
    <!-- 第一行：搜索框 -->
    <div class="search-row">
      <!-- Toggle 按钮 -->
      <button
        @click="toggleReplaceMode"
        class="toggle-btn"
        :title="mode === 'replace' ? 'Hide Replace' : 'Show Replace'"
      >
        <IconChevronDown v-if="mode === 'replace'" class="w-4 h-4" />
        <IconChevronRight v-else class="w-4 h-4" />
      </button>

      <!-- 搜索输入框容器 -->
      <div class="input-wrapper">
        <textarea
          ref="searchInputRef"
          v-model="localSearchTerm"
          rows="1"
          placeholder="Find (↑↓ for history)"
          class="search-input"
          @keydown="handleSearchKeydown"
          @input="autoResizeTextarea(searchInputRef)"
        />

        <!-- 选项按钮组（在输入框内部右侧） -->
        <div class="input-options-group">
          <button
            @click="toggleCaseSensitive"
            :class="{ active: options.caseSensitive }"
            class="input-option-btn"
            title="Match Case (Alt+C)"
          >
            Aa
          </button>
          <button
            @click="toggleWholeWord"
            :class="{ active: options.wholeWord }"
            class="input-option-btn"
            title="Match Whole Word (Alt+W)"
          >
            <IconLetterCase class="w-3.5 h-3.5" />
          </button>
          <button
            @click="toggleRegex"
            :class="{ active: options.regex }"
            class="input-option-btn"
            title="Use Regular Expression (Alt+R)"
          >
            .*
          </button>
        </div>
      </div>

      <!-- Result Count 容器（输入框外部） -->
      <div class="result-count-container">
        <span v-if="matchCount > 0" class="result-count">
          {{ currentIndex + 1 }} of {{ matchCount }}
        </span>
        <span v-else-if="localSearchTerm && matchCount === 0" class="result-count error">
          No results
        </span>
      </div>

      <!-- 导航按钮 -->
      <div class="nav-group">
        <button
          @click="findPrevious"
          :disabled="matchCount === 0"
          class="nav-btn"
          title="Previous Match (Shift+Enter)"
        >
          <IconArrowNarrowUp class="w-4 h-4" />
        </button>
        <button
          @click="findNext"
          :disabled="matchCount === 0"
          class="nav-btn"
          title="Next Match (Enter)"
        >
          <IconArrowNarrowDown class="w-4 h-4" />
        </button>
      </div>

      <!-- 选区按钮（有选区时显示） -->
      <button
        v-if="hasSelection"
        @click="toggleSearchInSelection"
        :class="{ active: searchInSelection }"
        class="selection-btn"
        title="Find in Selection (Alt+L)"
      >
        <IconAlignLeft class="w-4 h-4" />
      </button>

      <!-- 关闭按钮 -->
      <button
        @click="closePanel"
        class="close-btn"
        title="Close (Escape)"
      >
        <IconX class="w-4 h-4" />
      </button>
    </div>

    <!-- 第二行：替换框（仅在 replace 模式显示） -->
    <div v-if="mode === 'replace'" class="replace-row">
      <!-- 占位对齐 -->
      <div class="toggle-placeholder"></div>

      <!-- 替换输入框 -->
      <div class="input-wrapper">
        <textarea
          ref="replaceInputRef"
          v-model="localReplaceTerm"
          rows="1"
          placeholder="Replace (↑↓ for history)"
          class="replace-input"
          @keydown="handleReplaceKeydown"
          @input="autoResizeTextarea(replaceInputRef)"
        />
      </div>

      <!-- 占位（对齐 Result Count 位置） -->
      <div class="result-count-placeholder"></div>

      <!-- 替换按钮组 -->
      <div class="replace-actions">
        <button
          @click="replaceNext"
          :disabled="matchCount === 0"
          class="replace-btn"
          title="Replace (Enter)"
        >
          <IconReplace class="w-4 h-4" />
        </button>
        <button
          @click="replaceAll"
          :disabled="matchCount === 0"
          class="replace-btn"
          title="Replace All (⌘+Enter)"
        >
          <IconReplaceFilled class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import {
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

interface Props {
  editor: Editor
}

const props = defineProps<Props>()
const appStore = useAppStore()

// 本地状态（双向绑定）
const localSearchTerm = ref('')
const localReplaceTerm = ref('')
const searchInputRef = ref<HTMLTextAreaElement | null>(null)
const replaceInputRef = ref<HTMLTextAreaElement | null>(null)
const containerWidth = ref<number | null>(null)

// 计算属性从 editor storage 获取状态
const isOpen = computed(() => props.editor.storage.iwSearchReplace.isOpen)
const mode = computed(() => props.editor.storage.iwSearchReplace.mode)
const options = computed(() => props.editor.storage.iwSearchReplace.options)
const matchCount = computed(() => props.editor.storage.iwSearchReplace.matches.length)
const currentIndex = computed(() => props.editor.storage.iwSearchReplace.currentMatchIndex)
const searchInSelection = computed(() => props.editor.storage.iwSearchReplace.searchInSelection)
const isCompact = computed(() => containerWidth.value !== null && containerWidth.value < 720)

// 检查是否有有效选区
const hasSelection = computed(() => {
  const { from, to } = props.editor.state.selection
  return (from !== to) || !!props.editor.storage.iwSearchReplace.selectionRange
})

// 监听本地搜索词变化，更新到 editor
watch(localSearchTerm, (newValue) => {
  props.editor.commands.setSearchTerm(newValue)
})

// 监听本地替换词变化，更新到 editor
watch(localReplaceTerm, (newValue) => {
  props.editor.commands.setReplaceTerm(newValue)
})

// 监听 editor storage 的搜索词变化，同步到本地
watch(
  () => props.editor.storage.iwSearchReplace.searchTerm,
  (newValue) => {
    if (newValue !== localSearchTerm.value) {
      localSearchTerm.value = newValue
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
  props.editor.commands.replaceNext()
}

function replaceAll() {
  if (confirm(`Replace all ${matchCount.value} occurrences?`)) {
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

// 搜索/替换历史
const searchHistory = ref<string[]>([])
const searchHistoryIndex = ref(-1)
const replaceHistory = ref<string[]>([])
const replaceHistoryIndex = ref(-1)

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function insertNewline(termRef: typeof localSearchTerm, inputRef: typeof searchInputRef) {
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

function addToHistory(history: typeof searchHistory, value: string) {
  if (!value) return
  const idx = history.value.indexOf(value)
  if (idx !== -1) history.value.splice(idx, 1)
  history.value.unshift(value)
  if (history.value.length > 50) history.value.pop()
}

function isOnFirstLine(el: HTMLTextAreaElement): boolean {
  return !el.value.substring(0, el.selectionStart).includes('\n')
}

function isOnLastLine(el: HTMLTextAreaElement): boolean {
  return !el.value.substring(el.selectionEnd).includes('\n')
}

function navigateHistory(
  event: KeyboardEvent,
  direction: 'up' | 'down',
  termRef: typeof localSearchTerm,
  inputRef: typeof searchInputRef,
  history: typeof searchHistory,
  historyIdx: typeof searchHistoryIndex
) {
  const el = inputRef.value
  if (!el || history.value.length === 0) return
  if (direction === 'up' && !isOnFirstLine(el)) return
  if (direction === 'down' && !isOnLastLine(el)) return

  event.preventDefault()
  if (direction === 'up') {
    if (historyIdx.value < history.value.length - 1) historyIdx.value++
  } else {
    historyIdx.value--
  }

  if (historyIdx.value < 0) {
    historyIdx.value = -1
    termRef.value = ''
  } else {
    termRef.value = history.value[historyIdx.value] ?? ''
  }
  nextTick(() => autoResizeTextarea(inputRef.value))
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(localSearchTerm, searchInputRef)
    } else {
      addToHistory(searchHistory, localSearchTerm.value)
      searchHistoryIndex.value = -1
      findNext()
    }
  } else if (event.key === 'ArrowUp') {
    navigateHistory(event, 'up', localSearchTerm, searchInputRef, searchHistory, searchHistoryIndex)
  } else if (event.key === 'ArrowDown') {
    navigateHistory(event, 'down', localSearchTerm, searchInputRef, searchHistory, searchHistoryIndex)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}

function handleReplaceKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(localReplaceTerm, replaceInputRef)
    } else {
      addToHistory(replaceHistory, localReplaceTerm.value)
      replaceHistoryIndex.value = -1
      replaceNext()
    }
  } else if (event.key === 'ArrowUp') {
    navigateHistory(event, 'up', localReplaceTerm, replaceInputRef, replaceHistory, replaceHistoryIndex)
  } else if (event.key === 'ArrowDown') {
    navigateHistory(event, 'down', localReplaceTerm, replaceInputRef, replaceHistory, replaceHistoryIndex)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}

function toggleReplaceMode() {
  // 切换 find 和 replace 模式
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

  // Alt+C: Toggle case sensitive
  if (event.altKey && event.key === 'c') {
    event.preventDefault()
    toggleCaseSensitive()
  }

  // Alt+W: Toggle whole word
  if (event.altKey && event.key === 'w') {
    event.preventDefault()
    toggleWholeWord()
  }

  // Alt+R: Toggle regex
  if (event.altKey && event.key === 'r') {
    event.preventDefault()
    toggleRegex()
  }

  // Alt+L: Toggle search in selection
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
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', syncCompactMode)
})
</script>

<style scoped>
.search-replace-panel {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  z-index: 100;
  background: var(--color-background-window);
  border: 1px solid var(--color-border-separator);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 0.5rem;
  box-sizing: border-box;
  width: min(560px, calc(100% - 2rem));
  max-width: calc(100% - 2rem);
}

.search-replace-panel.with-toolbar {
  top: calc(2.25rem + 0.75rem);
}

/* ===== 第一行：搜索行 ===== */
.search-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

/* Toggle 按钮 */
.toggle-btn {
  width: 20px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}

.toggle-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

/* 输入框容器（包含输入框和内部选项按钮） */
.input-wrapper {
  position: relative;
  flex: 1;
  min-width: 180px;
}

/* 搜索输入框 */
.search-input {
  width: 100%;
  min-height: 28px;
  padding: 4px 90px 4px 8px;
  font-size: 13px;
  resize: none;
  overflow: hidden;
  line-height: 1.5;
  border: 1px solid var(--color-border-separator);
  border-radius: 4px;
  background: var(--color-background-content);
  color: var(--color-text-base);
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--color-accent-primary);
}

/* 输入框内部的选项按钮组 */
.input-options-group {
  position: absolute;
  right: 4px;
  top: 4px;
  display: flex;
  gap: 2px;
}

.input-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.2s;
}

.input-option-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

.input-option-btn.active {
  background: var(--color-accent-primary);
  color: white;
}

/* Result Count 容器（输入框外部） */
.result-count-container {
  min-width: 60px;
  text-align: left;
  flex-shrink: 0;
}

.result-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.result-count.error {
  color: var(--color-status-error);
}

/* 导航按钮组 */
.nav-group {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 选区按钮（仅在 replace 模式显示） */
.selection-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.selection-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

.selection-btn.active {
  background: var(--color-accent-primary);
  color: white;
}

/* 关闭按钮 */
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.close-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

/* ===== 第二行：替换行 ===== */
.replace-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border-separator);
}

/* 占位对齐 Toggle 按钮 */
.toggle-placeholder {
  width: 20px;
  flex-shrink: 0;
}

/* 替换输入框 */
.replace-input {
  width: 100%;
  min-height: 28px;
  padding: 4px 8px;
  font-size: 13px;
  resize: none;
  overflow: hidden;
  line-height: 1.5;
  border: 1px solid var(--color-border-separator);
  border-radius: 4px;
  background: var(--color-background-content);
  color: var(--color-text-base);
  outline: none;
  transition: border-color 0.2s;
}

.replace-input:focus {
  border-color: var(--color-accent-primary);
}

/* 占位对齐 Result Count */
.result-count-placeholder {
  min-width: 60px;
  flex-shrink: 0;
}

/* 替换按钮组 */
.replace-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.replace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.replace-btn:hover:not(:disabled) {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

.replace-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.search-replace-panel.compact .search-row,
.search-replace-panel.compact .replace-row {
  flex-wrap: wrap;
}

.search-replace-panel.compact .toggle-btn {
  order: 1;
}

.search-replace-panel.compact .input-wrapper {
  order: 2;
  flex: 1 1 220px;
}

.search-replace-panel.compact .close-btn {
  order: 3;
  margin-left: auto;
}

.search-replace-panel.compact .result-count-container {
  order: 4;
  min-width: 0;
  margin-left: 26px;
}

.search-replace-panel.compact .nav-group {
  order: 5;
  margin-left: auto;
}

.search-replace-panel.compact .selection-btn {
  order: 6;
}

.search-replace-panel.compact .toggle-placeholder {
  order: 1;
}

.search-replace-panel.compact .replace-row .input-wrapper {
  order: 2;
  flex-basis: calc(100% - 26px);
}

.search-replace-panel.compact .result-count-placeholder {
  display: none;
}

.search-replace-panel.compact .replace-actions {
  order: 3;
  margin-left: auto;
}
</style>
