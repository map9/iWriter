<template>
  <div class="h-full flex flex-col">
    <!-- Search Header -->
    <div class="iw-sidebar-section">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          {{ t('notify.search.title') }}
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
          :title="showReplace ? t('notify.search.hideReplace') : t('notify.search.showReplace')"
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
                :placeholder="t('notify.search.findPlaceholder')"
                class="w-full min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-1.5 pr-22 pl-2 text-xs focus:border-primary rounded-field"
                @keydown="handleSearchKeydown"
                @input="onSearchInput"
              />

              <!-- 选项按钮组（在输入框内部右侧） -->
              <div class="flex absolute right-2 top-0.5 gap-0.5">
                <button
                  @click="toggleOption('matchCase')"
                  :class="{ 'iw-toolbar-btn-active': options.matchCase }"
                  class="iw-toolbar-btn btn-xs"
                  :title="t('notify.search.matchCaseTitle')"
                >
                  <IconLetterCase class="icon-2xs" />
                </button>
                <button
                  @click="toggleOption('wholeWord')"
                  :class="{ 'iw-toolbar-btn-active': options.wholeWord }"
                  class="iw-toolbar-btn btn-xs"
                  :title="t('notify.search.matchWholeWordTitle')"
                >
                  <IconAbc class="icon-2xs" />
                </button>
                <button
                  @click="toggleOption('regex')"
                  :class="{ 'iw-toolbar-btn-active': options.regex }"
                  class="iw-toolbar-btn btn-xs"
                  :title="t('notify.search.regexTitle')"
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
                :placeholder="t('notify.search.replacePlaceholder')"
                class="w-full min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-1.5 px-2 text-xs focus:border-primary rounded-field"
                @keydown="handleReplaceKeydown"
                @input="onReplaceInput"
              />
            </div>
            <button
              @click="replaceAll"
              :disabled="totalMatches === 0"
              class="iw-toolbar-btn btn-xs mt-0.5"
              :title="t('notify.search.replaceAllTitle')"
            >
              <IconReplaceFilled class="icon-xs" />
            </button>
          </div>
        </div>
      </div>

      <!-- Files to include -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-base-content">{{ t('notify.search.includeLabel') }}</label>
        <input 
          v-model="includePattern"
          type="text"
          :placeholder="t('notify.search.includePlaceholder')"
          class="iw-input"
        />
      </div>

      <!-- Files to exclude -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-base-content">{{ t('notify.search.excludeLabel') }}</label>
        <input
          v-model="excludePattern"
          type="text"
          :placeholder="t('notify.search.excludePlaceholder')"
          class="iw-input"
        />
      </div>
    </div>

    <!-- Results Summary -->
    <div class="flex flex-col bg-base-200 gap-1 p-2 border-b border-base-300 text-xs text-base-content">
      <span v-if="isSearching">{{ t('notify.search.searching') }}</span>
      <span v-else-if="totalMatches > 0">
        {{ t('notify.search.summary', { total: totalMatches, files: fileCount }) }}
      </span>
      <span v-else-if="searchQuery">{{ t('notify.search.noResults') }}</span>
      <span v-else>{{ t('notify.search.searchHint') }}</span>
    </div>

    <!-- Search Results Tree -->
    <div class="flex-1 overflow-auto bg-base-100">
      <!-- Loading State -->
      <div v-if="isSearching" class="empty-panel">
        <p class="text-sm">{{ t('notify.search.searchingFiles') }}</p>
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
                <span v-if="getRelativeDir(result.relativePath)" class="text-xs text-base-content/50 overflow-hidden text-ellipsis whitespace-nowrap shrink">{{ getRelativeDir(result.relativePath) }}</span>
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
                :title="t('notify.search.replaceAllInFileTitle')"
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
                <span class="text-2xs text-base-content/50 font-mono shrink-0">{{ match.position.from }}:</span>
                <span class="text-xs text-base-content font-mono overflow-hidden text-ellipsis whitespace-nowrap" v-html="match.contextHtml"></span>
              </div>
              <div
                v-if="showReplace"
                class="flex w-5 shrink-0 justify-end opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto"
              >
                <button
                  class="iw-toolbar-btn btn-xs"
                  @click.stop="replaceSingle(result, index)"
                  :title="t('notify.search.replaceTitle')"
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
        <p class="text-sm">{{ t('notify.search.noResultsFound') }}</p>
      </div>

      <!-- Initial State -->
      <div v-else class="empty-panel">
        <IconSearch class="empty-panel-icon mb-3" />
        <p class="text-sm">{{ t('notify.search.initialHint') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { waitForEditorReady } from '@/components/common/tiptap/utils'
import type { Editor } from '@tiptap/core'
import { notify } from '@/utils/notifications'
import type { FileChange } from '@/types'
import { pathUtils } from '@/utils/pathUtils'
import { STORAGE_KEYS } from '@/utils/StateStorage'
import { useSearchHistory } from '@/components/common/tiptap/iw-search-replace/composables/useSearchHistory'
import { collectWorkspaceTextFiles } from '@/services/workspace/filtering'

const appStore = useAppStore()
const { t } = useI18n()

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
const searchIgnoreRules = ref('')

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

onMounted(() => {
  loadConfig()
  void refreshSearchIgnoreRules()
})

watch(
  () => appStore.searchRequestKey,
  () => {
    includePattern.value = appStore.searchIncludePattern || ''
    excludePattern.value = appStore.searchExcludePattern || ''
    if (appStore.leftSidebarMode === 'search' && searchQuery.value) {
      performSearch()
    }
  }
)

const fileCount = computed(() => {
  return searchResults.value.length
})

const totalMatches = computed(() => {
  return searchResults.value.reduce((sum, file) => sum + file.totalMatches, 0)
})

const workspaceFilterState = computed(() => ({
  workspaceIgnoreRules: appStore.globalEditSetting.workspaceIgnoreRules,
  useGitignoreForSearch: appStore.globalEditSetting.useGitignoreForSearch === true,
  revision: appStore.workspaceSearchFilterRevision,
  currentFolder: appStore.currentFolder,
}))

async function refreshSearchIgnoreRules(): Promise<string> {
  if (!appStore.currentFolder) {
    searchIgnoreRules.value = ''
    return ''
  }

  const rules = await appStore.getEffectiveWorkspaceIgnoreRules(appStore.currentFolder, 'search')
  searchIgnoreRules.value = rules
  return rules
}

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

const searchHist = useSearchHistory(STORAGE_KEYS.SIDEBAR_SEARCH_HISTORY)
const replaceHist = useSearchHistory(STORAGE_KEYS.SIDEBAR_REPLACE_HISTORY)

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

function onSearchInput() {
  searchHist.markAsUserTyped()
  autoResizeTextarea(searchInputRef.value)
}

function onReplaceInput() {
  replaceHist.markAsUserTyped()
  autoResizeTextarea(replaceInputRef.value)
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      insertNewline(searchQuery, searchInputRef)
      searchHist.markAsUserTyped()
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
  }
}

async function jumpToResult(fileResult: SearchReplaceInFilesSearchResult, matchIndex: number = 0) {
  try {
    // 1. 打开文件
    await appStore.openFile(fileResult.filePath)

    // 2. 等待编辑器实例就绪（包括内容加载完成）
    const editor = await waitForEditorReady(() => appStore.tabs.find(t => t.path === fileResult.filePath))
    if (!editor) {
      notify.error(t('notify.search.failedOpenEditor'))
      return
    }

    const match = fileResult.matches[matchIndex]
    if (!match) {
      notify.warning(t('notify.search.matchNotFound'))
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
    notify.error(t('notify.search.failedJump'))
  }
}

function replaceNext() {
  // TODO: Implement replace next
  notify.info(t('notify.search.replaceNextTodo'))
}

async function replaceAll() {
  if (totalMatches.value === 0) return

  const confirmMsg = t('notify.search.replaceAllConfirm', {
    total: totalMatches.value,
    files: fileCount.value,
  })
  if (!confirm(confirmMsg)) return

  replaceHist.forceRecord(replaceQuery.value)

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
      },
      appStore.tabs
    )

    isReplacing.value = false

    // 显示结果
    if (result.success) {
      notify.success(
        t('notify.search.replaceAllSuccess', {
          count: result.totalReplacements,
          files: result.filesModified,
        })
      )
      // 重新执行搜索以更新结果
      await performSearch()
    } else {
      const errorMsg = result.errors
        ? t('notify.search.replaceAllPartial', {
          count: result.totalReplacements,
          errors: result.errors.length,
        })
        : t('notify.search.replaceAllWithErrors')
      notify.warning(errorMsg)
      // 仍然重新搜索以显示更新的结果
      await performSearch()
    }
  } catch (error) {
    isReplacing.value = false
    console.error('Error in replaceAll:', error)
    notify.error(t('notify.search.replaceFailed', { error: String(error) }))
  }
}

async function replaceSingle(fileResult: SearchReplaceInFilesSearchResult, matchIndex: number) {
  replaceHist.forceRecord(replaceQuery.value)

  try {
    const match = fileResult.matches[matchIndex]
    if (!match) {
      notify.warning(t('notify.search.matchNotFound'))
      return
    }

    // 1. 打开文件
    await appStore.openFile(fileResult.filePath)
    await nextTick()

    // 2. 获取编辑器实例
    const tab = appStore.tabs.find(t => t.path === fileResult.filePath)
    if (!tab?.docState?.editorInstance) {
      notify.error(t('notify.search.failedOpenEditor'))
      return
    }

    const editor = tab.docState.editorInstance as Editor

    // 3. 执行替换
    editor.commands.insertContentAt(
      { from: match.position.from, to: match.position.to },
      replaceQuery.value
    )

    notify.success(t('notify.search.replaceSingleSuccess'))

    // 4. 重新执行搜索以更新结果
    await performSearch()
  } catch (error) {
    console.error('Error in replaceSingle:', error)
    notify.error(t('notify.search.replaceFailed', { error: String(error) }))
  }
}

async function replaceAllInFile(fileResult: SearchReplaceInFilesSearchResult) {
  const confirmMsg = t('notify.search.replaceInFileConfirm', {
    count: fileResult.totalMatches,
    name: fileResult.fileName,
  })
  if (!confirm(confirmMsg)) return

  replaceHist.forceRecord(replaceQuery.value)

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
      },
      appStore.tabs
    )

    isReplacing.value = false

    // 显示结果
    if (result.success) {
      notify.success(
        t('notify.search.replaceInFileSuccess', {
          count: result.totalReplacements,
          name: fileResult.fileName,
        })
      )
      // 重新执行搜索以更新结果
      await performSearch()
    } else {
      const errorMsg = result.errors?.[0]?.error || t('notify.search.unknownError')
      notify.error(t('notify.search.replaceInFileFailed', { name: fileResult.fileName, error: errorMsg }))
    }
  } catch (error) {
    isReplacing.value = false
    console.error('Error in replaceAllInFile:', error)
    notify.error(t('notify.search.replaceFailed', { error: String(error) }))
  }
}

// ========== highlightOnly 生命周期管理 ==========
// 清除所有编辑器的高亮模式
function clearAllHighlights() {
  appStore.tabs.forEach(tab => {
    if (tab.docState?.editorInstance) {
      iwSearchReplaceInFilesService.clearHighlightMode(tab.docState.editorInstance as Editor)
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

// Unified debounced trigger so rapid keystrokes don't fire concurrent searches.
// Without this, an intermediate exclude pattern like "*." can finish AFTER the
// final "*.md" search and overwrite results, leaving stale `.md` files visible.
let searchDebounceTimer: number | undefined
const SEARCH_DEBOUNCE_MS = 300

function scheduleSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = window.setTimeout(() => {
    if (searchQuery.value.length > 0) {
      searchHist.record(searchQuery.value)
      performSearch()
    } else {
      searchResults.value = []
      expandedFiles.value.clear()
    }
  }, SEARCH_DEBOUNCE_MS)
}

watch(searchQuery, scheduleSearch)
watch([includePattern, excludePattern], scheduleSearch)
watch(options, scheduleSearch, { deep: true })
watch(workspaceFilterState, () => {
  void refreshSearchIgnoreRules()
  scheduleSearch()
}, { deep: true })

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
    if (tab.docState?.editorInstance && tab.path) {
      const editor = tab.docState.editorInstance as Editor

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

  // 编辑器更新事件必须经过统一的 include/exclude/ignore 过滤，否则
  // 已被 excludePattern 排除的文件会因为编辑触发重新加入结果。
  if (!isFileInSearchScope(filePath)) {
    updateSingleFileResult(filePath, null)
    return
  }

  try {
    // 重新搜索这一个文件
    const updatedResult = await iwSearchReplaceInFilesService.searchInSingleFilePublic(
      filePath,
      appStore.currentFolder,
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

// 递增 ID，用于丢弃过期搜索结果。debounce 之外仍可能并发（例如目录变化触发），
// 所以在每次 await 返回后必须比对 ID。
let currentSearchId = 0

async function performSearch() {
  if (!appStore.currentFolder) {
    return
  }

  if (!searchQuery.value) {
    searchResults.value = []
    expandedFiles.value.clear()
    return
  }

  const myId = ++currentSearchId
  isSearching.value = true

  try {
    const ignoreRules = await refreshSearchIgnoreRules()
    if (myId !== currentSearchId) return

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
      appStore.tabs,  // 传递 tabs
      undefined,
      appStore.currentFolder,
      ignoreRules
    )

    if (myId !== currentSearchId) return

    searchResults.value = results

    // 默认展开所有文件（如果结果不太多）
    if (results.length <= 20) {
      expandedFiles.value = new Set(results.map(r => r.filePath))
    } else {
      expandedFiles.value.clear()
    }
  } catch (error) {
    if (myId !== currentSearchId) return
    console.error('Search error:', error)
    notify.error(t('notify.search.searchFailed'))
    searchResults.value = []
    expandedFiles.value.clear()
  } finally {
    if (myId === currentSearchId) {
      isSearching.value = false
    }
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

  const rootPath = appStore.searchFolderPath || appStore.currentFolder
  if (!filePath.startsWith(rootPath)) return false

  return iwSearchReplaceInFilesService.shouldSearchPath(
    {
      path: filePath,
      name: pathUtils.basename(filePath),
      isDirectory: false,
      isHidden: pathUtils.basename(filePath).startsWith('.'),
    },
    appStore.currentFolder,
    searchIgnoreRules.value,
    includePattern.value || undefined,
    excludePattern.value || undefined
  )
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
  if (!appStore.currentFolder) return []

  try {
    const files = await collectWorkspaceTextFiles({
      workspaceRoot: appStore.currentFolder,
      directoryPath: dirPath,
      ignoreRulesText: searchIgnoreRules.value,
      includePattern: includePattern.value || undefined,
      excludePattern: excludePattern.value || undefined,
    })

    return files.map(file => file.path)
  } catch (error) {
    console.error('Error traversing directory:', dirPath, error)
    return []
  }
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
  color: var(--color-base-content, #92400e);
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 500;
}
</style>
