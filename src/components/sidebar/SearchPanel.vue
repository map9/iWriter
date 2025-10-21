<template>
  <div class="h-full flex flex-col search-panel-container">
    <!-- Search Header -->
    <div class="sidebar-header h-9">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide" style="color: var(--color-text-secondary);">
          SEARCH
        </span>
      </div>
    </div>

    <!-- Search Form -->
    <div class="search-form-container">
      <!-- 第一行：搜索框 -->
      <div class="search-row">
        <!-- Toggle 按钮 -->
        <button
          @click="toggleReplaceMode"
          class="toggle-btn"
          :title="showReplace ? 'Hide Replace' : 'Show Replace'"
        >
          <IconChevronDown v-if="showReplace" class="w-4 h-4" />
          <IconChevronRight v-else class="w-4 h-4" />
        </button>

        <!-- 搜索输入框容器 -->
        <div class="input-wrapper">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Find"
            class="search-input"
            @keydown.enter="handleSearchEnter"
          />

          <!-- 选项按钮组（在输入框内部右侧） -->
          <div class="input-options-group">
            <button
              @click="toggleOption('matchCase')"
              :class="{ active: options.matchCase }"
              class="input-option-btn"
              title="Match Case (Alt+C)"
            >
              Aa
            </button>
            <button
              @click="toggleOption('wholeWord')"
              :class="{ active: options.wholeWord }"
              class="input-option-btn"
              title="Match Whole Word (Alt+W)"
            >
              <IconLetterCase class="w-3.5 h-3.5" />
            </button>
            <button
              @click="toggleOption('regex')"
              :class="{ active: options.regex }"
              class="input-option-btn"
              title="Use Regular Expression (Alt+R)"
            >
              .*
            </button>
          </div>
        </div>
      </div>

      <!-- 第二行：替换框（仅在 replace 模式显示） -->
      <div v-if="showReplace" class="replace-row">
        <!-- 占位对齐 -->
        <div class="toggle-placeholder"></div>

        <!-- 替换输入框容器 -->
        <div class="input-wrapper-with-action">
          <input
            v-model="replaceQuery"
            type="text"
            placeholder="Replace"
            class="replace-input"
            @keydown.enter="replaceNext"
          />
          <button
            @click="replaceAll"
            :disabled="totalMatches === 0"
            class="replace-all-btn-inline"
            title="Replace All"
          >
            <IconReplaceFilled class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Files to include -->
      <div class="filter-section">
        <label class="filter-label">files to include</label>
        <input
          v-model="includePattern"
          type="text"
          placeholder="e.g. *.ts, src/**/*.js"
          class="filter-input"
        />
      </div>

      <!-- Files to exclude -->
      <div class="filter-section">
        <label class="filter-label">files to exclude</label>
        <input
          v-model="excludePattern"
          type="text"
          placeholder="e.g. node_modules/**, *.min.js"
          class="filter-input"
        />
      </div>
    </div>

    <!-- Results Summary -->
    <div class="results-summary">
      <span v-if="isSearching" class="summary-text">Searching...</span>
      <span v-else-if="totalMatches > 0" class="summary-text">
        {{ totalMatches }} results in {{ fileCount }} files
      </span>
      <span v-else-if="searchQuery" class="summary-text">No results</span>
      <span v-else class="summary-text">Search to find results</span>
    </div>

    <!-- Search Results Tree -->
    <div class="flex-1 overflow-auto search-results-container">
      <!-- Loading State -->
      <div v-if="isSearching" class="empty-state">
        <p class="text-sm">Searching files...</p>
      </div>

      <!-- Results Tree -->
      <div v-else-if="searchResults.length > 0" class="results-tree">
        <div
          v-for="result in searchResults"
          :key="result.filePath"
          class="result-file-group"
        >
          <!-- File Header -->
          <div
            class="file-header"
            @click="toggleFileExpanded(result.filePath)"
          >
            <div class="file-header-content">
              <IconChevronRight v-if="!isFileExpanded(result.filePath)" class="expand-icon" />
              <IconChevronDown v-else class="expand-icon" />
              <IconFileText class="file-icon" />
              <div class="file-path-container">
                <span class="file-name">{{ result.fileName }}</span>
                <span v-if="getRelativeDir(result.relativePath)" class="file-dir">{{ getRelativeDir(result.relativePath) }}</span>
              </div>
              <span class="match-count-badge">{{ result.totalMatches }}</span>
            </div>
            <button
              v-if="showReplace"
              class="file-replace-btn"
              @click.stop="replaceAllInFile(result)"
              :disabled="!result.totalMatches"
              title="Replace All in File"
            >
              <IconReplaceFilled class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Match Lines (Expandable) -->
          <div v-if="isFileExpanded(result.filePath)" class="match-lines">
            <div
              v-for="(match, index) in result.matches"
              :key="`${result.filePath}-${match.line}-${index}`"
              class="match-line"
              @click="jumpToResult(result, index)"
            >
              <div class="match-line-content">
                <span class="line-number">{{ match.line }}:</span>
                <span class="line-text" v-html="match.contextHtml"></span>
              </div>
              <button
                v-if="showReplace"
                class="match-replace-btn"
                @click.stop="replaceSingle(result, index)"
                title="Replace"
              >
                <IconReplace class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!isSearching && searchQuery" class="empty-state">
        <IconSearchOff :size="48" class="empty-icon" />
        <p class="text-sm">No results found</p>
      </div>

      <!-- Initial State -->
      <div v-else class="empty-state">
        <IconSearch :size="48" class="empty-icon" />
        <p class="text-sm">Search across files in your workspace</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconChevronRight,
  IconChevronDown,
  IconLetterCase,
  IconFileText,
  IconSearch,
  IconSearchOff,
  IconReplace,
  IconReplaceFilled
} from '@tabler/icons-vue'
import { FileSearchService } from '@/utils/search/FileSearchService'
import type { FileSearchResult } from '@/types/search'
import { notify } from '@/utils/notifications'

const appStore = useAppStore()

const searchQuery = ref('')
const replaceQuery = ref('')
const showReplace = ref(false)
const includePattern = ref('')
const excludePattern = ref('')
const options = ref({
  matchCase: false,
  wholeWord: false,
  regex: false
})

const searchResults = ref<FileSearchResult[]>([])
const isSearching = ref(false)
const expandedFiles = ref<Set<string>>(new Set())

const fileCount = computed(() => {
  return searchResults.value.length
})

const totalMatches = computed(() => {
  return searchResults.value.reduce((sum, file) => sum + file.totalMatches, 0)
})

function toggleReplaceMode() {
  showReplace.value = !showReplace.value
}

function toggleOption(option: keyof typeof options.value) {
  options.value[option] = !options.value[option]
  // 选项改变后重新搜索
  if (searchQuery.value.length > 0) {
    performSearch()
  }
}

function toggleFileExpanded(filePath: string) {
  if (expandedFiles.value.has(filePath)) {
    expandedFiles.value.delete(filePath)
  } else {
    expandedFiles.value.add(filePath)
  }
}

function isFileExpanded(filePath: string): boolean {
  return expandedFiles.value.has(filePath)
}

/**
 * 从相对路径中提取目录部分（不包含文件名）
 * 例如：'path4/path5/file.txt' -> 'path4/path5'
 */
function getRelativeDir(relativePath: string): string {
  const lastSlashIndex = relativePath.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    return '' // 文件在根目录
  }
  return relativePath.substring(0, lastSlashIndex)
}

function handleSearchEnter(event: KeyboardEvent) {
  if (event.shiftKey) {
    // TODO: Find previous
  } else {
    // TODO: Find next
  }
}

async function jumpToResult(fileResult: FileSearchResult, matchIndex: number = 0) {
  try {
    // 打开文件
    await appStore.openFile(fileResult.filePath)

    // TODO: 跳转到特定行号（需要在 app store 中实现）
    const match = fileResult.matches[matchIndex]
    if (match) {
      console.log(`Jump to line ${match.line} in file ${fileResult.filePath}`)
      // 这里需要在后续步骤中实现跳转到具体行的功能
    }
  } catch (error) {
    console.error('Error jumping to result:', error)
    notify.error('Failed to open file')
  }
}

function replaceNext() {
  // TODO: Implement replace next
  notify.info('Replace next - not yet implemented')
}

function replaceAll() {
  // TODO: Implement replace all
  if (totalMatches.value === 0) return

  const confirmMsg = `Replace ${totalMatches.value} occurrences across ${fileCount.value} files?`
  if (confirm(confirmMsg)) {
    notify.info('Replace all - not yet implemented')
  }
}

function replaceSingle(fileResult: FileSearchResult, matchIndex: number) {
  // TODO: Implement single replace
  const match = fileResult.matches[matchIndex]
  if (match) {
    notify.info(`Replace in ${fileResult.fileName} at line ${match.line}`)
  }
}

function replaceAllInFile(fileResult: FileSearchResult) {
  // TODO: Implement replace all in file
  const confirmMsg = `Replace all ${fileResult.totalMatches} occurrences in ${fileResult.fileName}?`
  if (confirm(confirmMsg)) {
    notify.info(`Replace all in ${fileResult.fileName}`)
  }
}

// Watch for search query changes
let searchTimeout: number | undefined
watch(searchQuery, (newQuery) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  searchTimeout = window.setTimeout(() => {
    if (newQuery.length > 0) {
      performSearch()
    } else {
      searchResults.value = []
      expandedFiles.value.clear()
    }
  }, 300)
})

// Watch for options changes
watch(options, () => {
  if (searchQuery.value.length > 0) {
    performSearch()
  }
}, { deep: true })

// Watch for filter changes
watch([includePattern, excludePattern], () => {
  if (searchQuery.value.length > 0) {
    performSearch()
  }
})

async function performSearch() {
  if (!appStore.currentFolder) {
    notify.error('No folder opened')
    return
  }

  if (!searchQuery.value) {
    searchResults.value = []
    expandedFiles.value.clear()
    return
  }

  try {
    isSearching.value = true

    const results = await FileSearchService.searchInFolder({
      folderPath: appStore.currentFolder,
      searchTerm: searchQuery.value,
      options: {
        caseSensitive: options.value.matchCase,
        wholeWord: options.value.wholeWord,
        useRegex: options.value.regex
      },
      includePattern: includePattern.value || undefined,
      excludePattern: excludePattern.value || undefined,
      maxResults: 10000
    })

    searchResults.value = results

    // 默认展开所有文件（如果结果不太多）
    if (results.length <= 20) {
      expandedFiles.value = new Set(results.map(r => r.filePath))
    } else {
      expandedFiles.value.clear()
    }
  } catch (error) {
    console.error('Search error:', error)
    notify.error('Search failed')
    searchResults.value = []
    expandedFiles.value.clear()
  } finally {
    isSearching.value = false
  }
}
</script>

<style scoped>
.search-panel-container {
  background: var(--color-background-window);
}

/* ===== Search Form Container ===== */
.search-form-container {
  padding: 8px;
  border-bottom: 1px solid var(--color-border-separator);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ===== Search Row ===== */
.search-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Toggle 按钮 */
.toggle-btn {
  width: 20px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.toggle-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

/* 输入框容器 */
.input-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* 搜索输入框 */
.search-input {
  width: 100%;
  height: 24px;
  padding: 0 90px 0 6px;
  font-size: 13px;
  border: 1px solid var(--color-border-separator);
  border-radius: 3px;
  background: var(--color-background-content);
  color: var(--color-text-base);
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: var(--color-accent-primary);
}

/* 输入框内部的选项按钮组 */
.input-options-group {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 1px;
}

.input-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 2px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.15s;
}

.input-option-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-text-primary);
}

.input-option-btn.active {
  background: var(--color-accent-primary);
  color: white;
}

/* ===== Replace Row ===== */
.replace-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toggle-placeholder {
  width: 20px;
  flex-shrink: 0;
}

.input-wrapper-with-action {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.replace-input {
  flex: 1;
  height: 24px;
  padding: 0 6px;
  font-size: 13px;
  border: 1px solid var(--color-border-separator);
  border-radius: 3px;
  background: var(--color-background-content);
  color: var(--color-text-base);
  outline: none;
  transition: border-color 0.15s;
}

.replace-input:focus {
  border-color: var(--color-accent-primary);
}

.replace-all-btn-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.replace-all-btn-inline:hover:not(:disabled) {
  background: var(--color-interactive-hover);
  color: var(--color-accent-primary);
}

.replace-all-btn-inline:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ===== Filter Section ===== */
.filter-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.filter-input {
  width: 100%;
  height: 22px;
  padding: 0 6px;
  font-size: 12px;
  border: 1px solid var(--color-border-separator);
  border-radius: 3px;
  background: var(--color-background-content);
  color: var(--color-text-base);
  outline: none;
  transition: border-color 0.15s;
}

.filter-input:focus {
  border-color: var(--color-accent-primary);
}

.filter-input::placeholder {
  color: var(--color-text-tertiary);
  font-size: 11px;
}

/* ===== Results Summary ===== */
.results-summary {
  padding: 6px 12px;
  background: var(--color-background-window);
  border-bottom: 1px solid var(--color-border-separator);
}

.summary-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* ===== Search Results Container ===== */
.search-results-container {
  background: var(--color-background-content);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-icon {
  opacity: 0.3;
  margin-bottom: 12px;
}

/* ===== Results Tree ===== */
.results-tree {
  padding: 4px 0;
}

.result-file-group {
  /* No border, seamless tree structure */
}

/* File Header */
.file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.file-header:hover {
  background: var(--color-interactive-hover);
}

.file-header-content {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.expand-icon {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.file-icon {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.file-path-container {
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  color: var(--color-text-primary);
  font-weight: 500;
  flex-shrink: 0;
}

.file-dir {
  font-size: 11px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}

.match-count-badge {
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-background-secondary);
  padding: 1px 6px;
  border-radius: 10px;
  flex-shrink: 0;
  margin-left: auto;
  margin-right: 4px;
}

.file-replace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  opacity: 0;
}

.file-header:hover .file-replace-btn {
  opacity: 1;
}

.file-replace-btn:hover:not(:disabled) {
  background: var(--color-interactive-hover);
  color: var(--color-accent-primary);
}

.file-replace-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Match Lines */
.match-lines {
  background: var(--color-background-content);
}

.match-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px 3px 28px;
  cursor: pointer;
  transition: background 0.15s;
  min-height: 22px;
}

.match-line:hover {
  background: var(--color-interactive-hover);
}

.match-line-content {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.line-number {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: 'SF Mono', 'Monaco', 'Consolas', 'Menlo', monospace;
  flex-shrink: 0;
}

.line-text {
  font-size: 12px;
  color: var(--color-text-base);
  font-family: 'SF Mono', 'Monaco', 'Consolas', 'Menlo', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.match-replace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0;
  flex-shrink: 0;
}

.match-line:hover .match-replace-btn {
  opacity: 1;
}

.match-replace-btn:hover {
  background: var(--color-interactive-hover);
  color: var(--color-accent-primary);
}

/* 高亮样式 */
:deep(mark) {
  background-color: var(--color-accent-secondary);
  color: var(--color-text-base);
  padding: 0 1px;
  border-radius: 2px;
  font-weight: 600;
}
</style>
