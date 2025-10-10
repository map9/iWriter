<template>
  <div
    v-if="isOpen"
    class="search-replace-panel"
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
        <input
          ref="searchInputRef"
          v-model="localSearchTerm"
          type="text"
          placeholder="Find"
          class="search-input"
          @keydown.enter="handleSearchEnter"
          @keydown.esc="closePanel"
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
          {{ currentIndex + 1 }}/{{ matchCount }}
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
          <IconChevronUp class="w-4 h-4" />
        </button>
        <button
          @click="findNext"
          :disabled="matchCount === 0"
          class="nav-btn"
          title="Next Match (Enter)"
        >
          <IconChevronDown class="w-4 h-4" />
        </button>
      </div>

      <!-- 选区按钮（仅在 replace 模式且有选区时显示） -->
      <button
        v-if="mode === 'replace' && hasSelection"
        @click="toggleSearchInSelection"
        :class="{ active: searchInSelection }"
        class="selection-btn"
        title="Find in Selection (Alt+L)"
      >
        <IconBook class="w-4 h-4" />
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
        <input
          v-model="localReplaceTerm"
          type="text"
          placeholder="Replace"
          class="replace-input"
          @keydown.enter="replaceNext"
          @keydown.esc="closePanel"
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
          title="Replace (Cmd+Shift+1)"
        >
          <IconReplace class="w-4 h-4" />
        </button>
        <button
          @click="replaceAll"
          :disabled="matchCount === 0"
          class="replace-btn"
          title="Replace All (Cmd+Shift+Enter)"
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
import {
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
  IconX,
  IconLetterCase,
  IconReplace,
  IconReplaceFilled,
  IconBook
} from '@tabler/icons-vue'

interface Props {
  editor: Editor
}

const props = defineProps<Props>()

// 本地状态（双向绑定）
const localSearchTerm = ref('')
const localReplaceTerm = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

// 计算属性从 editor storage 获取状态
const isOpen = computed(() => props.editor.storage.iwSearchReplace.isOpen)
const mode = computed(() => props.editor.storage.iwSearchReplace.mode)
const options = computed(() => props.editor.storage.iwSearchReplace.options)
const matchCount = computed(() => props.editor.storage.iwSearchReplace.matches.length)
const currentIndex = computed(() => props.editor.storage.iwSearchReplace.currentMatchIndex)
const searchInSelection = computed(() => props.editor.storage.iwSearchReplace.searchInSelection)

// 检查是否有有效选区
const hasSelection = computed(() => {
  const { from, to } = props.editor.state.selection
  return from !== to
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
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  }
})

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

function handleSearchEnter(event: KeyboardEvent) {
  if (event.shiftKey) {
    findPrevious()
  } else {
    findNext()
  }
}

function toggleReplaceMode() {
  if (mode.value === 'search') {
    props.editor.commands.openReplace()
  } else {
    // 收起时重置为 search 模式
    props.editor.storage.iwSearchReplace.mode = 'search'
    // 同时禁用选区搜索
    props.editor.storage.iwSearchReplace.searchInSelection = false
    props.editor.storage.iwSearchReplace.selectionRange = null
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

  // Alt+L: Toggle search in selection (仅在 replace 模式)
  if (event.altKey && event.key === 'l' && mode.value === 'replace') {
    event.preventDefault()
    toggleSearchInSelection()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.search-replace-panel {
  position: fixed;
  top: 4.75rem;
  right: 1rem;
  z-index: 100;
  background: var(--color-background-window);
  border: 1px solid var(--color-border-separator);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 450px;
  padding: 0.5rem;
}

/* ===== 第一行：搜索行 ===== */
.search-row {
  display: flex;
  align-items: center;
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
  height: 28px;
  padding: 0 90px 0 8px;
  font-size: 13px;
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
  top: 50%;
  transform: translateY(-50%);
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
  text-align: center;
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
  align-items: center;
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
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
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
</style>
