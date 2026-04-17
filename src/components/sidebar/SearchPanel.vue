<template>
  <div class="h-full flex flex-col">
    <!-- Search Header -->
    <div class="iw-sidebar-section">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          Search
        </span>
      </div>
    </div>

    <!-- Search Form -->
    <div class="flex flex-col bg-base-200 gap-1 p-2">
      <div class="flex flex-row items-stretch">
        <!-- Toggle 按钮 -->
        <button
          @click="toggleReplaceMode"
          class="iw-toolbar-btn w-4 h-auto"
          :title="showReplace ? 'Hide Replace' : 'Show Replace'"
        >
          <IconChevronDown v-if="showReplace" class="icon-xs" />
          <IconChevronRight v-else class="icon-xs" />
        </button>

        <div class="flex flex-1 flex-col gap-1 pl-1">
          <!-- 第一行：搜索框 -->
          <div class="flex items-start gap-1">
            <!-- 搜索输入框容器 -->
            <div class="flex flex-1 relative min-w-0">
              <textarea
                ref="searchInputRef"
                v-model="searchQuery"
                rows="1"
                placeholder="Find"
                class="w-full min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-0.5 pr-22 pl-2 text-sm focus:border-primary rounded-field"
                @keydown="handleSearchKeydown"
                @input="autoResizeTextarea(searchInputRef)"
              />

              <!-- 选项按钮组（在输入框内部右侧） -->
              <div class="flex absolute right-2 top-0.5 gap-0.5">
                <button
                  @click="toggleOption('matchCase')"
                  :class="{ 'iw-toolbar-btn-active': options.matchCase }"
                  class="iw-toolbar-btn btn-xs"
                  title="Match Case (Alt+C)"
                >
                  <IconLetterCase class="icon-2xs" />
                </button>
                <button
                  @click="toggleOption('wholeWord')"
                  :class="{ 'iw-toolbar-btn-active': options.wholeWord }"
                  class="iw-toolbar-btn btn-xs"
                  title="Match Whole Word (Alt+W)"
                >
                  <IconAbc class="icon-2xs" />
                </button>
                <button
                  @click="toggleOption('regex')"
                  :class="{ 'iw-toolbar-btn-active': options.regex }"
                  class="iw-toolbar-btn btn-xs"
                  title="Use Regular Expression (Alt+R)"
                >
                  <IconRegex class="icon-2xs" />
                </button>
              </div>
            </div>
          </div>

          <!-- 第二行：替换框（仅在 replace 模式显示） -->
          <div v-if="showReplace" class="flex flex-row items-start gap-1">
            <!-- 替换输入框容器 -->
            <div class="flex flex-1 relative min-w-0 gap-1">
              <textarea
                ref="replaceInputRef"
                v-model="replaceQuery"
                rows="1"
                placeholder="Replace"
                class="w-full min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-0.5 px-2 text-sm focus:border-primary rounded-field"
                @keydown="handleReplaceKeydown"
                @input="autoResizeTextarea(replaceInputRef)"
              />
            </div>
            <button
              @click="replaceAll"
              :disabled="totalMatches === 0"
              class="iw-toolbar-btn btn-xs mt-0.5"
              title="Replace All"
            >
              <IconReplaceFilled class="icon-xs" />
            </button>
          </div>
        </div>
      </div>

      <!-- Files to include -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-base-content">files to include</label>
        <input 
          v-model="includePattern"
          type="text"
          placeholder="e.g. *.ts, src/**/*.js"
          class="iw-input"
        />
      </div>

      <!-- Files to exclude -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-base-content">files to exclude</label>
        <input
          v-model="excludePattern"
          type="text"
          placeholder="e.g. node_modules/**, *.min.js"
          class="iw-input"
        />
      </div>
    </div>

    <!-- Results Summary -->
    <div class="flex flex-col bg-base-200 gap-1 p-2 border-b border-base-300 text-xs text-base-content">
      <span v-if="isSearching">Searching...</span>
      <span v-else-if="totalMatches > 0">
        {{ totalMatches }} results in {{ fileCount }} files
      </span>
      <span v-else-if="searchQuery">No results</span>
      <span v-else>Search to find results</span>
    </div>

    <!-- Search Results Tree -->
    <div class="flex-1 overflow-auto bg-base-100">
      <!-- Loading State -->
      <div v-if="isSearching" class="empty-panel">
        <p class="text-sm">Searching files...</p>
      </div>

      <!-- Results Tree -->
      <div v-else-if="searchResults.length > 0" class="py-1">
        <div
          v-for="result in searchResults"
          :key="result.filePath"
        >
          <!-- File Header -->
          <div
            class="group flex items-center justify-between px-2 py-1 h-7 cursor-pointer transition-colors duration-150 hover:bg-base-200"
            @click="toggleFileExpanded(result.filePath)"
          >
            <div class="flex flex-1 min-w-0 items-center gap-1">
              <IconChevronRight v-if="!isFileExpanded(result.filePath)" class="icon-2xs text-base-content shrink-0" />
              <IconChevronDown v-else class="icon-2xs text-base-content shrink-0" />
              <IconFileText class="icon-xs text-base-content shrink-0" />
              <div class="flex flex-1 min-w-0 items-baseline gap-1 overflow-hidden">
                <span class="text-xs text-base-content font-medium shrink-0">{{ result.fileName }}</span>
                <span v-if="getRelativeDir(result.relativePath)" class="text-xs text-base-content opacity-50 overflow-hidden text-ellipsis whitespace-nowrap shrink">{{ getRelativeDir(result.relativePath) }}</span>
              </div>
              <span class="text-2xs text-base-content bg-base-100 border border-base-300 py-0.5 px-2 rounded-selector shrink-0 ml-auto mr-1.5">{{ result.totalMatches }}</span>
            </div>
            <div
              v-if="showReplace"
              class="flex w-5 shrink-0 justify-end opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto"
            >
              <button
                class="iw-toolbar-btn btn-xs"
                @click.stop="replaceAllInFile(result)"
                :disabled="!result.totalMatches"
                title="Replace All in File"
              >
                <IconReplaceFilled class="icon-2xs" />
              </button>
            </div>
          </div>

          <!-- Match Lines (Expandable) -->
          <div v-if="isFileExpanded(result.filePath)">
            <div
              v-for="(match, index) in result.matches"
              :key="`${result.filePath}-${match.position.from}-${index}`"
              class="group flex items-center justify-between pl-7 pr-2 py-1 cursor-pointer transition-colors duration-150 h-7 hover:bg-base-200"
              @click="jumpToResult(result, index)"
            >
              <div class="flex items-baseline gap-2 flex-1 min-w-0">
                <span class="text-2xs text-base-content opacity-50 font-mono shrink-0">{{ match.position.from }}:</span>
                <span class="text-xs text-base-content font-mono overflow-hidden text-ellipsis whitespace-nowrap" v-html="match.contextHtml"></span>
              </div>
              <div
                v-if="showReplace"
                class="flex w-5 shrink-0 justify-end opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto"
              >
                <button
                  class="iw-toolbar-btn btn-xs"
                  @click.stop="replaceSingle(result, index)"
                  title="Replace"
                >
                  <IconReplace class="icon-2xs" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!isSearching && searchQuery" class="empty-panel">
        <IconSearchOff class="empty-panel-icon mb-3" />
        <p class="text-sm">No results found</p>
      </div>

      <!-- Initial State -->
      <div v-else class="empty-panel">
        <IconSearch class="empty-panel-icon mb-3" />
        <p class="text-sm">Search across files in your workspace</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconChevronRight,
  IconChevronDown,
  IconLetterCase,
  IconAbc,
  IconRegex,
  IconFileText,
  IconSearch,
  IconSearchOff,
  IconReplace,
  IconReplaceFilled
} from '@tabler/icons-vue'
import { iwSearchReplaceInFilesService, type SearchReplaceInFilesSearchResult } from '@/components/common/tiptap/iw-search-replace'
import type { Editor } from '@tiptap/core'
import { notify } from '@/utils/notifications'
import type { FileChange } from '@/types'
import { TEXT_EXTENSIONS } from '@/types'
import { pathUtils } from '@/utils/pathUtils'
import { STORAGE_KEYS } from '@/utils/StateStorage'

const appStore = useAppStore()

// 组件内状态（使用 v-show 后不会被销毁）
const searchQuery = ref('')
const replaceQuery = ref('')
const searchInputRef = ref<HTMLTextAreaElement | null>(null)
const replaceInputRef = ref<HTMLTextAreaElement | null>(null)
const showReplace = ref(false)
const includePattern = ref('')
const excludePattern = ref('')
const options = ref({
  matchCase: false,
  wholeWord: false,
  regex: false
})

// 临时状态（不需要持久化）
const searchResults = ref<SearchReplaceInFilesSearchResult[]>([])
const isSearching = ref(false)
const isReplacing = ref(false)
const expandedFiles = ref<Set<string>>(new Set())

// 加载用户配置
function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SEARCH_CONFIG)
    if (saved) {
      const config = JSON.parse(saved)
      searchQuery.value = config.searchQuery || ''
      replaceQuery.value = config.replaceQuery || ''
      includePattern.value = config.includePattern || ''
      excludePattern.value = config.excludePattern || ''
      options.value = config.options || {
        matchCase: false,
        wholeWord: false,
        regex: false
      }
    }
  } catch (error) {
    console.error('Failed to load search config:', error)
  }
}

// 保存用户配置
function saveConfig() {
  try {
    const config = {
      searchQuery: searchQuery.value,
      replaceQuery: replaceQuery.value,
      includePattern: includePattern.value,
      excludePattern: excludePattern.value,
      options: options.value
    }
    localStorage.setItem(STORAGE_KEYS.SEARCH_CONFIG, JSON.stringify(config))
  } catch (error) {
    console.error('Failed to save search config:', error)
  }
}

// 组件挂载时加载配置
onMounted(() => {
  loadConfig()
})

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

function insertNewline(
  queryRef: typeof searchQuery,
  inputRef: typeof searchInputRef
) {
  const el = inputRef.value
  if (!el) return
  const start = el.selectionStart ?? queryRef.value.length
  const end = el.selectionEnd ?? start
  queryRef.value = queryRef.value.substring(0, start) + '\n' + queryRef.value.substring(end)
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
  queryRef: typeof searchQuery,
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
    queryRef.value = ''
  } else {
    queryRef.value = history.value[historyIdx.value] ?? ''
  }
  nextTick(() => autoResizeTextarea(inputRef.value))
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(searchQuery, searchInputRef)
    } else {
      addToHistory(searchHistory, searchQuery.value)
      searchHistoryIndex.value = -1
      // 搜索由 watch 驱动，Enter 仅记录历史
    }
  } else if (event.key === 'ArrowUp') {
    navigateHistory(event, 'up', searchQuery, searchInputRef, searchHistory, searchHistoryIndex)
  } else if (event.key === 'ArrowDown') {
    navigateHistory(event, 'down', searchQuery, searchInputRef, searchHistory, searchHistoryIndex)
  }
}

function handleReplaceKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(replaceQuery, replaceInputRef)
    } else {
      addToHistory(replaceHistory, replaceQuery.value)
      replaceHistoryIndex.value = -1
      replaceNext()
    }
  } else if (event.key === 'ArrowUp') {
    navigateHistory(event, 'up', replaceQuery, replaceInputRef, replaceHistory, replaceHistoryIndex)
  } else if (event.key === 'ArrowDown') {
    navigateHistory(event, 'down', replaceQuery, replaceInputRef, replaceHistory, replaceHistoryIndex)
  }
}

async function jumpToResult(fileResult: SearchReplaceInFilesSearchResult, matchIndex: number = 0) {
  try {
    // 1. 打开文件
    await appStore.openFile(fileResult.filePath)

    // 2. 等待编辑器实例就绪（包括内容加载完成）
    const editor = await waitForEditorReady(fileResult.filePath)
    if (!editor) {
      notify.error('Failed to open editor')
      return
    }

    const match = fileResult.matches[matchIndex]
    if (!match) {
      notify.warning('Match not found')
      return
    }

    // 3. 使用 TipTap 服务跳转并高亮
    iwSearchReplaceInFilesService.jumpToMatch(
      editor,
      match,
      searchQuery.value,
      {
        caseSensitive: options.value.matchCase,
        wholeWord: options.value.wholeWord,
        regex: options.value.regex
      }
    )
  } catch (error) {
    console.error('Error jumping to result:', error)
    notify.error('Failed to jump to result')
  }
}

/**
 * 等待编辑器实例就绪
 * 文件打开后，编辑器实例需要时间完成初始化和内容加载
 *
 * 检查条件：
 * 1. tab 存在且有 editorInstance
 * 2. editor.state 和 editor.view 已初始化
 * 3. 文档内容已加载（doc.content.size > 2，空文档的 size 为 2）
 *
 * @param filePath 文件路径
 * @param maxAttempts 最大尝试次数（默认 40 次，共 2 秒）
 * @returns Editor 实例或 null
 */
async function waitForEditorReady(filePath: string, maxAttempts: number = 40): Promise<Editor | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await nextTick()

    const tab = appStore.tabs.find(t => t.path === filePath)
    if (tab?.editorInstance) {
      const editor = tab.editorInstance as Editor

      // 确保编辑器已完全初始化
      if (editor.state && editor.view && editor.view.dom) {
        // 关键检查：文档内容已加载
        // 空文档的 size 为 2（开始和结束标记）
        // 有内容的文档 size > 2
        if (editor.state.doc.content.size > 2) {
          return editor
        }
      }
    }

    // 等待 50ms 后重试
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return null
}

function replaceNext() {
  // TODO: Implement replace next
  notify.info('Replace next - not yet implemented')
}

async function replaceAll() {
  if (totalMatches.value === 0) return

  const confirmMsg = `Replace ${totalMatches.value} occurrences across ${fileCount.value} files?`
  if (!confirm(confirmMsg)) return

  try {
    // 执行跨文件替换（不再需要从编辑器获取 extensions）
    isReplacing.value = true
    const result = await iwSearchReplaceInFilesService.replaceInWorkspace(
      searchResults.value,
      searchQuery.value,
      replaceQuery.value,
      {
        caseSensitive: options.value.matchCase,
        wholeWord: options.value.wholeWord,
        regex: options.value.regex
      }
    )

    isReplacing.value = false

    // 显示结果
    if (result.success) {
      notify.success(
        `Replaced ${result.totalReplacements} occurrences in ${result.filesModified} files`
      )
      // 重新执行搜索以更新结果
      await performSearch()
    } else {
      const errorMsg = result.errors
        ? `Replaced ${result.totalReplacements} occurrences, but encountered ${result.errors.length} errors`
        : 'Replacement completed with errors'
      notify.warning(errorMsg)
      // 仍然重新搜索以显示更新的结果
      await performSearch()
    }
  } catch (error) {
    isReplacing.value = false
    console.error('Error in replaceAll:', error)
    notify.error('Failed to replace: ' + String(error))
  }
}

async function replaceSingle(fileResult: SearchReplaceInFilesSearchResult, matchIndex: number) {
  try {
    const match = fileResult.matches[matchIndex]
    if (!match) {
      notify.warning('Match not found')
      return
    }

    // 1. 打开文件
    await appStore.openFile(fileResult.filePath)
    await nextTick()

    // 2. 获取编辑器实例
    const tab = appStore.tabs.find(t => t.path === fileResult.filePath)
    if (!tab?.editorInstance) {
      notify.error('Failed to open editor')
      return
    }

    const editor = tab.editorInstance as Editor

    // 3. 执行替换
    editor.commands.insertContentAt(
      { from: match.position.from, to: match.position.to },
      replaceQuery.value
    )

    notify.success('Replaced 1 occurrence')

    // 4. 重新执行搜索以更新结果
    await performSearch()
  } catch (error) {
    console.error('Error in replaceSingle:', error)
    notify.error('Failed to replace: ' + String(error))
  }
}

async function replaceAllInFile(fileResult: SearchReplaceInFilesSearchResult) {
  const confirmMsg = `Replace all ${fileResult.totalMatches} occurrences in ${fileResult.fileName}?`
  if (!confirm(confirmMsg)) return

  try {
    // 执行单文件替换（不再需要从编辑器获取 extensions）
    isReplacing.value = true
    const result = await iwSearchReplaceInFilesService.replaceInWorkspace(
      [fileResult],
      searchQuery.value,
      replaceQuery.value,
      {
        caseSensitive: options.value.matchCase,
        wholeWord: options.value.wholeWord,
        regex: options.value.regex
      }
    )

    isReplacing.value = false

    // 显示结果
    if (result.success) {
      notify.success(
        `Replaced ${result.totalReplacements} occurrences in ${fileResult.fileName}`
      )
      // 重新执行搜索以更新结果
      await performSearch()
    } else {
      const errorMsg = result.errors?.[0]?.error || 'Unknown error'
      notify.error(`Failed to replace in ${fileResult.fileName}: ${errorMsg}`)
    }
  } catch (error) {
    isReplacing.value = false
    console.error('Error in replaceAllInFile:', error)
    notify.error('Failed to replace: ' + String(error))
  }
}

// ========== highlightOnly 生命周期管理 ==========
// 清除所有编辑器的高亮模式
function clearAllHighlights() {
  appStore.tabs.forEach(tab => {
    if (tab.editorInstance) {
      iwSearchReplaceInFilesService.clearHighlightMode(tab.editorInstance as Editor)
    }
  })
}

// 当搜索结果清空时，清除所有高亮
watch(searchResults, (newResults) => {
  if (newResults.length === 0) {
    clearAllHighlights()
  }
})

// 监听左侧边栏模式切换，当离开搜索模式时清除高亮
watch(() => appStore.leftSidebarMode, (newMode) => {
  if (newMode !== 'search') {
    clearAllHighlights()
  }
})

// 监听 searchFolderPath 变化，触发在指定文件夹内搜索
watch(() => appStore.searchFolderPath, (newPath) => {
  if (newPath && searchQuery.value.length > 0) {
    performSearch()
  }
})

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

// 监听配置变化，自动保存到 localStorage
watch([searchQuery, replaceQuery, includePattern, excludePattern, options], () => {
  saveConfig()
}, { deep: true })

// ========== 编辑器内容变化监听（差分更新）==========
const editorUpdateListeners = new Map<string, () => void>()

watch(() => appStore.tabs, (newTabs) => {
  // 清理旧的监听器
  editorUpdateListeners.forEach(cleanup => cleanup())
  editorUpdateListeners.clear()

  // 为每个打开的 tab 添加监听
  newTabs.forEach(tab => {
    if (tab.editorInstance && tab.path) {
      const editor = tab.editorInstance as Editor

      // 监听编辑器更新事件（防抖处理）
      let updateTimeout: number | undefined
      const updateHandler = () => {
        if (updateTimeout) clearTimeout(updateTimeout)
        updateTimeout = window.setTimeout(() => {
          handleEditorContentChange(tab.path!)
        }, 1000) // 1秒防抖
      }

      editor.on('update', updateHandler)

      // 保存清理函数
      editorUpdateListeners.set(tab.id, () => {
        if (updateTimeout) clearTimeout(updateTimeout)
        editor.off('update', updateHandler)
      })
    }
  })
}, { deep: true })

// 处理编辑器内容变化（差分更新）
async function handleEditorContentChange(filePath: string) {
  // 只有存在搜索条件时才处理
  if (!searchQuery.value || !appStore.currentFolder) return

  try {
    // 重新搜索这一个文件
    const updatedResult = await iwSearchReplaceInFilesService.searchInSingleFilePublic(
      filePath,
      appStore.currentFolder,
      searchQuery.value,
      {
        caseSensitive: options.value.matchCase,
        wholeWord: options.value.wholeWord,
        regex: options.value.regex
      },
      10000,
      appStore.tabs
    )

    // 差分更新结果
    updateSingleFileResult(filePath, updatedResult)
  } catch (error) {
    console.error('Error updating search result for file:', filePath, error)
  }
}

// 差分更新单个文件的搜索结果
function updateSingleFileResult(
  filePath: string,
  newResult: SearchReplaceInFilesSearchResult | null
) {
  const existingIndex = searchResults.value.findIndex(
    r => r.filePath === filePath
  )

  if (newResult && newResult.totalMatches > 0) {
    // 有匹配结果
    if (existingIndex >= 0) {
      // 更新现有结果
      searchResults.value[existingIndex] = newResult
    } else {
      // 添加新结果（之前没有匹配，现在有了）
      searchResults.value.push(newResult)
      // 如果总文件数不多，自动展开
      if (searchResults.value.length <= 20) {
        expandedFiles.value.add(filePath)
      }
    }
  } else {
    // 没有匹配结果
    if (existingIndex >= 0) {
      // 移除现有结果（之前有匹配，现在没有了）
      searchResults.value.splice(existingIndex, 1)
      expandedFiles.value.delete(filePath)
    }
    // 如果之前也没有，什么都不做
  }
}

async function performSearch() {
  if (!appStore.currentFolder) {
    return
  }

  if (!searchQuery.value) {
    searchResults.value = []
    expandedFiles.value.clear()
    return
  }

  try {
    isSearching.value = true

    // 使用 TipTap 搜索服务，传递打开的 tabs 以优先搜索编辑器内容
    const results = await iwSearchReplaceInFilesService.searchInWorkspace(
      appStore.searchFolderPath || appStore.currentFolder,
      searchQuery.value,
      {
        caseSensitive: options.value.matchCase,
        wholeWord: options.value.wholeWord,
        regex: options.value.regex
      },
      includePattern.value || undefined,
      excludePattern.value || undefined,
      10000,
      appStore.tabs  // 传递 tabs
    )

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

// ========== 文件系统变化监听（差分更新）==========
const fileChangeDebounceMap = new Map<string, number>()

// 监听左侧边栏模式切换
watch(() => appStore.leftSidebarMode, (newMode, oldMode) => {
  if (newMode === 'search' && oldMode !== 'search') {
    // 进入搜索模式，开始监听文件系统变化
    if (window.electronAPI) {
      window.electronAPI.onFileChange(handleFileSystemChange)
    }
  } else if (oldMode === 'search' && newMode !== 'search') {
    // 离开搜索模式，清理高亮
    clearAllHighlights()
  }
})

// 处理文件系统变化（差分更新）
async function handleFileSystemChange(change: FileChange) {
  // 只有存在搜索条件时才处理
  if (!searchQuery.value || !appStore.currentFolder) return

  // 检查文件是否在搜索范围内
  if (!isFileInSearchScope(change.path)) return

  try {
    switch (change.type) {
      case 'add':
      case 'change':
        // 文件添加或内容变化：重新搜索该文件
        await handleFileAddedOrChanged(change.path)
        break

      case 'unlink':
        // 文件删除：直接从结果中移除
        handleFileDeleted(change.path)
        break

      case 'addDir':
        // 目录添加：递归搜索新目录下的所有文件
        await handleDirectoryAdded(change.path)
        break

      case 'unlinkDir':
        // 目录删除：移除该目录下所有文件的结果
        handleDirectoryDeleted(change.path)
        break
    }
  } catch (error) {
    console.error('Error handling file system change:', error)
  }
}

// 检查文件是否在搜索范围内
function isFileInSearchScope(filePath: string): boolean {
  if (!appStore.currentFolder) return false

  // 1. 检查是否在当前文件夹下
  if (!filePath.startsWith(appStore.currentFolder)) return false

  // 2. 检查是否是文本文件（目录也返回 true，后续会递归处理）
  const ext = pathUtils.extension(filePath)
  if (ext && !(TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
    return false
  }

  // 3. TODO: 应用 include/exclude 模式过滤

  return true
}

// 处理文件添加或内容变化
async function handleFileAddedOrChanged(filePath: string) {
  // 防抖处理：同一个文件在 500ms 内多次变化只处理最后一次
  const debounceKey = `file-change-${filePath}`
  if (fileChangeDebounceMap.has(debounceKey)) {
    clearTimeout(fileChangeDebounceMap.get(debounceKey))
  }

  const timeoutId = window.setTimeout(async () => {
    fileChangeDebounceMap.delete(debounceKey)

    try {
      // 重新搜索这一个文件
      const updatedResult = await iwSearchReplaceInFilesService.searchInSingleFilePublic(
        filePath,
        appStore.currentFolder!,
        searchQuery.value,
        {
          caseSensitive: options.value.matchCase,
          wholeWord: options.value.wholeWord,
          regex: options.value.regex
        },
        10000,
        appStore.tabs
      )

      // 差分更新结果
      updateSingleFileResult(filePath, updatedResult)
    } catch (error) {
      console.error('Error searching in changed file:', filePath, error)
    }
  }, 500)

  fileChangeDebounceMap.set(debounceKey, timeoutId)
}

// 处理文件删除
function handleFileDeleted(filePath: string) {
  const existingIndex = searchResults.value.findIndex(
    r => r.filePath === filePath
  )

  if (existingIndex >= 0) {
    searchResults.value.splice(existingIndex, 1)
    expandedFiles.value.delete(filePath)
  }
}

// 处理目录添加
async function handleDirectoryAdded(dirPath: string) {
  // 防抖处理：目录添加可能伴随大量文件添加事件
  const debounceKey = `dir-add-${dirPath}`
  if (fileChangeDebounceMap.has(debounceKey)) {
    clearTimeout(fileChangeDebounceMap.get(debounceKey))
  }

  const timeoutId = window.setTimeout(async () => {
    fileChangeDebounceMap.delete(debounceKey)

    try {
      // 递归获取目录下所有文件
      const newFiles = await getFilesInDirectory(dirPath)

      // 批量搜索新文件（复用 searchInWorkspace 的批处理逻辑）
      const BATCH_SIZE = 20
      for (let i = 0; i < newFiles.length; i += BATCH_SIZE) {
        const batch = newFiles.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(filePath =>
            iwSearchReplaceInFilesService.searchInSingleFilePublic(
              filePath,
              appStore.currentFolder!,
              searchQuery.value,
              {
                caseSensitive: options.value.matchCase,
                wholeWord: options.value.wholeWord,
                regex: options.value.regex
              },
              10000,
              appStore.tabs
            )
          )
        )

        // 添加有结果的文件
        batchResults.forEach(result => {
          if (result && result.totalMatches > 0) {
            updateSingleFileResult(result.filePath, result)
          }
        })

        // 让出控制权
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } catch (error) {
      console.error('Error searching in added directory:', dirPath, error)
    }
  }, 1000) // 目录添加使用更长的防抖时间

  fileChangeDebounceMap.set(debounceKey, timeoutId)
}

// 递归获取目录下所有文本文件
async function getFilesInDirectory(dirPath: string): Promise<string[]> {
  const result: string[] = []

  async function traverse(path: string) {
    if (!window.electronAPI) return

    try {
      const files = await window.electronAPI.getFiles(path)
      if (!files || !Array.isArray(files)) return

      await Promise.all(
        files.map(async (file) => {
          if (file.isDirectory) {
            await traverse(file.path)
          } else {
            const ext = pathUtils.extension(file.path)
            if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
              result.push(file.path)
            }
          }
        })
      )
    } catch (error) {
      console.error('Error traversing directory:', path, error)
    }
  }

  await traverse(dirPath)
  return result
}

// 处理目录删除
function handleDirectoryDeleted(dirPath: string) {
  // 移除该目录下所有文件的结果
  searchResults.value = searchResults.value.filter(result => {
    const shouldRemove = result.filePath.startsWith(dirPath + '/')
    if (shouldRemove) {
      expandedFiles.value.delete(result.filePath)
    }
    return !shouldRemove
  })
}

// 组件卸载时清理
onUnmounted(() => {
  // 清理编辑器监听器
  editorUpdateListeners.forEach(cleanup => cleanup())
  editorUpdateListeners.clear()

  // 清理所有防抖定时器
  fileChangeDebounceMap.forEach(timeoutId => clearTimeout(timeoutId))
  fileChangeDebounceMap.clear()
})
</script>

<style scoped>
/* 高亮样式 */
:deep(mark) {
  background-color: color-mix(in oklab, var(--color-warning, #fbbf24) 30%, transparent);
  color: var(--color-warning-content, #92400e);
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 500;
}
</style>
