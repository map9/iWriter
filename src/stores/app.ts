import { debounce } from 'lodash'
import { defineStore } from 'pinia'
import { ref, computed, watch, reactive } from 'vue'
import { generateJSON, type Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import type { FileTab, FileOperationResult, FileChange, EditSetting, MarkdownEditorPageMode } from '@/types'
import { SidebarMode, DocumentType } from '@/types'
import type { ExportFormatId, ExportSettings, MarkdownPrintPreferences } from '@/types'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import { pathUtils } from '@/utils/pathUtils'
import { notify } from '@/utils/notifications'
import type { FileTreeNode, FileTreeSortType } from '@/components/common/tree'
import {
  availableThemes,
  applyThemeSelection,
  getSystemPrefersDark,
  getThemeById,
  type ThemeOption,
} from '@/utils/themes'
import updaterService from '@/updater/UpdaterService'
import {
  TEXT_IWT_EXTENSION,
  TEXT_MD_EXTENSIONS,
  TEXT_TXT_EXTENSIONS,
  TEXT_IWT_EXTENSIONS,
  TEXT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  OFFICE_EXTENSIONS,
  type PandocAvailabilityResult,
  type PandocExportRequest,
} from '@/types'
import { convertContentFrom, convertContentTo } from '@/import-export'
import { PANDOC_EXPORT_EXTENSIONS, PANDOC_IMPORT_EXTENSIONS } from '@/import-export'
import {
  DEFAULT_EXPORT_SETTING,
  DEFAULT_AUTO_SAVE_SETTINGS,
  StateStorage,
  normalizeAutoSaveIntervalSeconds,
  type WorkspaceState,
} from '@/utils/StateStorage'
import { detectPreferredLocale, i18n, resolveLocale, setAppLocale, type AppLocale } from '@/i18n'
import { DEFAULT_MARKDOWN_PRINT_PREFERENCES } from '@/components/print/markdownThemes'
import {
  computeFileContentHash,
  isFileContentChangedOnDiskError,
  isSuspiciousEmptyExternalContent,
} from '@/utils/fileContentHash'
import { generateUntitledName } from '@/utils/untitledName'
import {
  buildWorkspaceIgnoreRules,
  DEFAULT_WORKSPACE_IGNORE_RULES,
  GITIGNORE_FILENAME,
  getWorkspaceEntriesRaw,
  listWorkspaceEntries,
  parseWorkspaceIgnoreRules,
  shouldIncludeWorkspaceEntry,
  shouldTraverseWorkspaceDirectory,
  toWorkspaceRelativePath,
  WORKSPACE_IGNORE_FILENAME,
} from '@/services/workspace/filtering'

export const useAppStore = defineStore('app', () => {
  type PreferencesTab = 'editor' | 'spelling' | 'themes' | 'print' | 'export' | 'ai' | 'updates'
  type WorkspaceStatus = 'available' | 'deleted'
  type FileTreePerfStats = { directories: number; files: number; skippedDirectories: number }
  const t = i18n.global.t
  const perfEnabled = import.meta.env.DEV || import.meta.env.VITE_IWRITER_PERF === '1'

  function perfLog(label: string, startedAt?: number): void {
    if (!perfEnabled) return
    const now = performance.now()
    const duration = startedAt === undefined ? '' : ` (${(now - startedAt).toFixed(1)}ms)`
    console.info(`[PERF][renderer] ${label}: +${now.toFixed(1)}ms${duration}`)
  }

  // 文件监听和类型检测
  const { detectFromPath } = useDocumentTypeDetector()
  
  // UI State
  const isLeftSidebarVisible = ref(true)
  const isRightSidebarVisible = ref(false)
  const isStatusbarVisible = ref(true)  
  const isCleanMode = ref(false)
  const isFocusMode = ref(false)
  const isTypewriterMode = ref(false)
  const markdownEditorPageMode = ref<MarkdownEditorPageMode>('fixed-768')
  const showPreferencesDialog = ref(false)
  const preferencesInitialTab = ref<PreferencesTab>('editor')
  const showPrintPreviewDialog = ref(false)
  const printPreviewHtml = ref('')
  const printPreviewTitle = ref('')
  const printPreviewMode = ref<'print' | 'export'>('print')
  const printPreviewDefaultSavePath = ref('')
  const printPreviewSkipSaveDialog = ref(false)
  type PrintSource =
    | { kind: 'html' }
    | { kind: 'pdf'; filePath: string; numPages: number }
  const printPreviewSource = ref<PrintSource | null>(null)
  /** Active print profile: 'markdown' for HTML content, 'image' for image files */
  const printPreviewProfile = ref<'markdown' | 'image'>('markdown')
  /** Initial rotation (degrees) passed from ImageViewerPage for image printing */
  const printPreviewImageRotation = ref(0)
  let cleanModeFullscreenBefore: boolean | null = null
  let cleanModeFullscreenRequestId = 0
  const leftSidebarMode = ref<SidebarMode>(SidebarMode.START)
  const searchFolderPath = ref<string | null>(null)
  const searchIncludePattern = ref('')
  const searchExcludePattern = ref('')
  const searchRequestKey = ref(0)
  const leftSidebarWidth = ref(288) // 默认宽度
  const minSidebarWidth = 256 // 最小宽度 - 对应TOC按钮右边缘
  const rightSidebarWidth = ref(288) // 默认宽度
  const minRightSidebarWidth = 288 // 最小宽度
  const autoSaveEnabled = ref(DEFAULT_AUTO_SAVE_SETTINGS.enabled)
  const autoSaveIntervalSeconds = ref(DEFAULT_AUTO_SAVE_SETTINGS.intervalSeconds)
  const locale = ref<AppLocale>('en-US')
  const globalEditSetting = reactive<EditSetting>({
    lineEnding: 'LF',
    invisibleCharacters: true,
    firstLineIndent: true,
    smartPunctuation: true,
    showProofreadErrors: true,
    proofread: true,
    workspaceIgnoreRules: DEFAULT_WORKSPACE_IGNORE_RULES,
    useGitignoreAsWorkspaceIgnore: true,
    codeBlockLanguageScope: 'common',
  })
  const globalExportSetting = reactive<ExportSettings>(structuredClone(DEFAULT_EXPORT_SETTING))
  const globalMarkdownPrintSetting = reactive<MarkdownPrintPreferences>(structuredClone(DEFAULT_MARKDOWN_PRINT_PREFERENCES))

  // Heart beat
  let sayHelloTimeout: ReturnType<typeof setTimeout> | null = null
  const SAY_HELLO_TIMEOUT = 1000

  // Theme System
  const currentThemeId = ref<string>('system')
  const systemPrefersDark = ref(false)
  let systemThemeMediaQuery: MediaQueryList | null = null
  let systemThemeChangeHandler: ((event: MediaQueryListEvent) => void) | null = null
  
  // Folder and Files
  const currentFolder = ref<string | null>(null)
  const workspaceStatus = ref<WorkspaceStatus>('available')
  const fileTree = ref<FileTreeNode | null>(null)
  const selectedItem = ref<FileTreeNode | null>(null)
  const currentFileTreeSortType = ref<FileTreeSortType>('type-asc')

  // Tabs
  const tabs = ref<FileTab[]>([])
  const activeTabId = ref<string | null>(null)
  const pendingOpenPaths = new Set<string>()
  const externalChangePromptPaths = new Set<string>()
  const ignoredExternalChangePaths = new Set<string>()
  const openDocumentWatchDirs = new Set<string>()
  const inFlightAddPaths = new Map<string, Promise<boolean>>()
  const suspiciousEmptyExternalChangeRetries = new Map<string, number>()
  let tabIdSeq = 0
  let fileWatchListenersRegistered = false
  let workspaceRestoreCheckTimer: ReturnType<typeof setInterval> | null = null

  // 控制是否应该保存状态（在退出清理时设为 false）
  const shouldPersistState = ref(true)

  // Computed
  const activeTab = computed(() => {
    return tabs.value.find(tab => tab.id === activeTabId.value)
  })
  
  const hasOpenFolder = computed(() => {
    return currentFolder.value !== null
  })

  const isWorkspaceDeleted = computed(() => workspaceStatus.value === 'deleted')
  const canUseWorkspaceFeatures = computed(() => hasOpenFolder.value && !isWorkspaceDeleted.value)

  const autoSave = computed(() => autoSaveEnabled.value)
  const autoSaveDelayMs = computed(() => autoSaveIntervalSeconds.value * 1000)

  function isFileReadonly(tab: FileTab | null | undefined): boolean {
    return tab?.fileReadonly === true
  }

  function isEditReadonly(tab: FileTab | null | undefined): boolean {
    return tab?.editReadonly === true
  }

  function isTabReadonly(tab: FileTab | null | undefined): boolean {
    return isFileReadonly(tab) || isEditReadonly(tab)
  }

  function canEditTab(tab: FileTab | null | undefined): boolean {
    return !!tab && tab.documentType === DocumentType.MARKDOWN_EDITOR && !isTabReadonly(tab)
  }

  function canSaveTab(tab: FileTab | null | undefined): boolean {
    return !!tab && isFileReadonly(tab) === false && isEditReadonly(tab) === false
  }

  function canRunAutoSave(tab: FileTab | null | undefined): boolean {
    return !!tab && autoSave.value && !!tab.path && !!tab.isDirty && canSaveTab(tab) && !isWorkspaceDeleted.value
  }

  function canRunProofread(tab: FileTab | null | undefined): boolean {
    return canEditTab(tab)
  }

  function getOpenTabByPath(filePath: string): FileTab | undefined {
    const normalizedPath = pathUtils.normalize(filePath)
    return tabs.value.find(tab => tab.path && pathUtils.normalize(tab.path) === normalizedPath)
  }

  function getOpenTabsAffectedByPath(targetPath: string, includeChildren = false): FileTab[] {
    const normalizedTargetPath = pathUtils.normalize(targetPath).replace(/\/+$/, '')
    return tabs.value.filter(tab => {
      if (!tab.path) return false
      const normalizedTabPath = pathUtils.normalize(tab.path)
      return normalizedTabPath === normalizedTargetPath ||
        (includeChildren && normalizedTabPath.startsWith(`${normalizedTargetPath}/`))
    })
  }

  function isCurrentWorkspacePath(targetPath: string): boolean {
    if (!currentFolder.value) return false
    return pathUtils.normalize(targetPath).replace(/\/+$/, '') ===
      pathUtils.normalize(currentFolder.value).replace(/\/+$/, '')
  }

  function notifyWorkspaceDeleted(feature?: string) {
    notify.warning(
      feature
        ? t('notify.workspace.deletedFeaturePaused', { feature })
        : t('notify.workspace.deletedMessage'),
      t('notify.workspace.deletedTitle')
    )
  }

  function ensureWorkspaceFeatureAvailable(feature?: string): boolean {
    if (!isWorkspaceDeleted.value) return true
    notifyWorkspaceDeleted(feature)
    return false
  }

  function startWorkspaceRestorePolling() {
    if (workspaceRestoreCheckTimer !== null) return
    workspaceRestoreCheckTimer = setInterval(() => {
      void checkWorkspaceDirectoryRestored(true)
    }, 3000)
  }

  function stopWorkspaceRestorePolling() {
    if (workspaceRestoreCheckTimer === null) return
    clearInterval(workspaceRestoreCheckTimer)
    workspaceRestoreCheckTimer = null
  }

  function enterWorkspaceDeletedState() {
    if (!currentFolder.value) return
    if (workspaceStatus.value === 'deleted') return

    workspaceStatus.value = 'deleted'
    fileTree.value = null
    selectedItem.value = null
    markOpenTabsDeleted(currentFolder.value, true)
    if (leftSidebarMode.value === SidebarMode.SEARCH) {
      leftSidebarMode.value = SidebarMode.EXPLORER
    }
    void stopAdvancedFileWatching()
    startWorkspaceRestorePolling()
    notifyWorkspaceDeleted()
  }

  async function checkWorkspaceDirectoryRestored(silent = false): Promise<boolean> {
    if (!currentFolder.value || !window.electronAPI || workspaceStatus.value !== 'deleted') return false

    const exists = await window.electronAPI.pathExists(currentFolder.value)
    if (!exists) {
      if (!silent) notifyWorkspaceDeleted()
      return false
    }

    workspaceStatus.value = 'available'
    stopWorkspaceRestorePolling()
    await loadFileTree()
    await startAdvancedFileWatching()
    await refreshDeletedOpenTabsUnderPath(currentFolder.value)
    if (!silent) {
      notify.success(t('notify.workspace.restoredMessage'), t('notify.workspace.restoredTitle'))
    }
    return true
  }

  function buildSavedHash(content: string): string {
    return computeFileContentHash(content)
  }

  const EXTERNAL_FILE_STABLE_READ_DELAY_MS = 150
  const EXTERNAL_FILE_CHANGED_READ_DELAY_MS = 300
  const SUSPICIOUS_EMPTY_EXTERNAL_RETRY_DELAY_MS = 1000
  const MAX_SUSPICIOUS_EMPTY_EXTERNAL_RETRIES = 3

  function wait(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms))
  }

  async function readExistingFileContent(filePath: string): Promise<string> {
    const content = await window.electronAPI?.readFile(filePath)
    if (content === null || content === undefined) {
      throw new Error(`Failed to read file from disk: ${filePath}`)
    }
    return content
  }

  async function readStableExternalFileContent(filePath: string): Promise<string> {
    const first = await readExistingFileContent(filePath)
    await wait(EXTERNAL_FILE_STABLE_READ_DELAY_MS)

    const second = await readExistingFileContent(filePath)
    if (second === first) return second

    await wait(EXTERNAL_FILE_CHANGED_READ_DELAY_MS)
    return readExistingFileContent(filePath)
  }

  function scheduleSuspiciousEmptyExternalRetry(filePath: string, normalizedPath: string): boolean {
    const retryCount = suspiciousEmptyExternalChangeRetries.get(normalizedPath) ?? 0
    if (retryCount >= MAX_SUSPICIOUS_EMPTY_EXTERNAL_RETRIES) {
      suspiciousEmptyExternalChangeRetries.delete(normalizedPath)
      return false
    }

    suspiciousEmptyExternalChangeRetries.set(normalizedPath, retryCount + 1)
    window.setTimeout(() => {
      if (!suspiciousEmptyExternalChangeRetries.has(normalizedPath)) return
      void handleOpenTabExternalChange(filePath)
    }, SUSPICIOUS_EMPTY_EXTERNAL_RETRY_DELAY_MS)

    return true
  }

  function syncReadonlyWindowState(tab: FileTab | null | undefined) {
    window.electronAPI?.windowContentChange?.({
      edit: {
        readonly: isTabReadonly(tab),
        fileReadonly: isFileReadonly(tab),
        editReadonly: isEditReadonly(tab),
      }
    })
  }

  // Update menu when theme changes
  watch(() => currentThemeId.value, (themeId) => {
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        view: {
          theme: themeId,
        },
      })
    }
    //applyCurrentTheme()
  }, { immediate: true })

  // Update menu when tabs change
  watch(() => tabs.value.length, (newLength) => {
    const hasActiveDocument = newLength > 0
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        hasActiveDocument: hasActiveDocument,
      })
    }
  })
  
  // Update menu when active tab changes
  watch(() => activeTab.value, (newTab) => {
    // Update window title when active tab changes
    updateWindowTitle()

    const hasActiveDocument = !!newTab
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        hasActiveDocument: hasActiveDocument,
        type: newTab?.documentType,
        edit: {
          readonly: isTabReadonly(newTab),
          fileReadonly: isFileReadonly(newTab),
          editReadonly: isEditReadonly(newTab),
        }
      })
    }
  }, { immediate: true })
  
  // Update menu when folder state changes
  watch(() => currentFolder.value, (newFolder) => {
    // Update window title when folder state changes
    updateWindowTitle()

    const hasFolderOpen = !!newFolder
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        hasFolderOpen: hasFolderOpen,
      })
    }
  }, { immediate: true })

  // update menu when left sidebar or right sidebar or statusbar visibility changes
  watch(() => [isLeftSidebarVisible.value, isRightSidebarVisible.value, isStatusbarVisible.value, isCleanMode.value, isFocusMode.value, isTypewriterMode.value, markdownEditorPageMode.value, locale.value], () => {
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI?.windowContentChange?.({
        view: {
          leftSidebar: isLeftSidebarVisible.value,
          rightSidebar: isRightSidebarVisible.value,
          statusbar: isStatusbarVisible.value,
          cleanMode: isCleanMode.value,
          focusMode: isFocusMode.value,
          typewriterMode: isTypewriterMode.value,
          markdownEditorPageMode: markdownEditorPageMode.value,
          locale: locale.value,
        },
      })
    }
  }, { immediate: true })

  // update menu when autoSave setting changes
  watch(() => autoSave.value, (newAutoSave) => {
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        autoSave: newAutoSave,
        edit: { autoSave: newAutoSave },
      })
    }
  }, { immediate: true })
  
  // ===== 状态恢复 =====

  /**
   * 从 localStorage 恢复状态
   */
  function restoreState() {
    // 1. 恢复 UI 状态
    const uiState = StateStorage.loadUIState()
    isLeftSidebarVisible.value = uiState.isLeftSidebarVisible
    isRightSidebarVisible.value = uiState.isRightSidebarVisible
    isStatusbarVisible.value = uiState.isStatusbarVisible
    isFocusMode.value = uiState.isFocusMode
    isTypewriterMode.value = uiState.isTypewriterMode
    markdownEditorPageMode.value = uiState.markdownEditorPageMode
    leftSidebarMode.value = uiState.leftSidebarMode
    leftSidebarWidth.value = uiState.leftSidebarWidth
    rightSidebarWidth.value = uiState.rightSidebarWidth ?? 288

    // 2. 恢复编辑设置
    const editSetting = StateStorage.loadEditSetting()
    Object.assign(globalEditSetting, editSetting)
    const exportSetting = StateStorage.loadExportSetting()
    Object.assign(globalExportSetting.common, exportSetting.common)
    Object.assign(globalExportSetting.formats, exportSetting.formats)
    const markdownPrintSetting = StateStorage.loadMarkdownPrintSetting()
    Object.assign(globalMarkdownPrintSetting.themeAssignment, markdownPrintSetting.themeAssignment)
    globalMarkdownPrintSetting.printOverrides = structuredClone(markdownPrintSetting.printOverrides ?? {})
    const autoSaveSettings = StateStorage.loadAutoSave()
    autoSaveEnabled.value = autoSaveSettings.enabled
    autoSaveIntervalSeconds.value = autoSaveSettings.intervalSeconds

    // 3. 恢复主题
    const savedThemeId = StateStorage.loadTheme()
    currentThemeId.value = getThemeById(savedThemeId)?.id ?? 'system'

    // 4. 恢复语言
    const savedLocale = StateStorage.loadLocale()
    const initialLocale = resolveLocale(savedLocale ?? detectPreferredLocale())
    locale.value = initialLocale
    setAppLocale(initialLocale)

    // 5. 恢复工作区状态（在窗口完全加载后）
    setTimeout(() => {
      restoreWorkspace()
    }, 100)
  }

  /**
   * 恢复工作区（文件夹和标签页）
   */
  async function restoreWorkspace() {
    const restoreStartedAt = performance.now()
    perfLog('restoreWorkspace start')
    const workspaceState = StateStorage.loadWorkspaceState()
    perfLog(
      `restoreWorkspace state loaded folder=${workspaceState.currentFolder ? 'yes' : 'no'} tabs=${workspaceState.tabs?.length ?? 0}`,
      restoreStartedAt
    )

    // 恢复文件夹
    if (workspaceState.currentFolder && window.electronAPI) {
      try {
        // 检查文件夹是否存在
        const existsStartedAt = performance.now()
        const exists = await window.electronAPI.pathExists(workspaceState.currentFolder)
        perfLog(`restoreWorkspace pathExists done exists=${exists}`, existsStartedAt)
        if (exists) {
          currentFolder.value = workspaceState.currentFolder
          workspaceStatus.value = 'available'
          const loadTreeStartedAt = performance.now()
          await loadFileTree()
          perfLog('restoreWorkspace loadFileTree awaited', loadTreeStartedAt)
          startAdvancedFileWatching()
          perfLog('restoreWorkspace startAdvancedFileWatching scheduled')
          leftSidebarMode.value = SidebarMode.EXPLORER
        } else {
          console.warn('Saved folder no longer exists:', workspaceState.currentFolder)
          currentFolder.value = null
          workspaceStatus.value = 'available'
          fileTree.value = null
          selectedItem.value = null
          if (leftSidebarMode.value !== SidebarMode.TOC) {
            leftSidebarMode.value = SidebarMode.START
          }
        }
      } catch (error) {
        console.warn('Failed to restore folder:', error)
      }
    }

    // 恢复标签页（只恢复有路径的文件）
    if (workspaceState.tabs && workspaceState.tabs.length > 0) {
      const tabsStartedAt = performance.now()
      let restoredTabs = 0
      let missingTabs = 0
      for (const tabData of workspaceState.tabs) {
        try {
          if (tabData.path && window.electronAPI) {
            // 检查文件是否存在
            const exists = await window.electronAPI.pathExists(tabData.path)
            if (exists) {
              await openFile(tabData.path)
              restoredTabs += 1
            } else {
              missingTabs += 1
              console.warn('Saved file no longer exists:', tabData.path)
            }
          }
        } catch (error) {
          console.warn(`Failed to restore tab: ${tabData.path}`, error)
        }
      }

      // 恢复激活的标签页（通过路径查找）
      if (workspaceState.activeTabPath) {
        const tab = tabs.value.find(t => t.path === workspaceState.activeTabPath)
        if (tab) {
          setActiveTab(tab.id)
        }
      }
      perfLog(`restoreWorkspace tabs restored restored=${restoredTabs} missing=${missingTabs}`, tabsStartedAt)
    }

    perfLog('restoreWorkspace done', restoreStartedAt)
  }

  // ===== 状态保存 =====

  /**
   * 保存 UI 状态（防抖）
   * clean mode is intentionally excluded here so it always behaves like
   * a transient "hide chrome for now" view, rather than a persisted layout.
   */
  const saveUIState = debounce(() => {
    StateStorage.saveUIState({
      isLeftSidebarVisible: isLeftSidebarVisible.value,
      isRightSidebarVisible: isRightSidebarVisible.value,
      isStatusbarVisible: isStatusbarVisible.value,
      isFocusMode: isFocusMode.value,
      isTypewriterMode: isTypewriterMode.value,
      markdownEditorPageMode: markdownEditorPageMode.value,
      leftSidebarMode: leftSidebarMode.value,
      leftSidebarWidth: leftSidebarWidth.value,
      rightSidebarWidth: rightSidebarWidth.value
    })
  }, 500)

  /**
   * 保存编辑设置（防抖）
   */
  const saveEditSettingDebounced = debounce(() => {
    StateStorage.saveEditSetting(globalEditSetting)
  }, 500)

  const reloadWorkspaceFiltersDebounced = debounce(async () => {
    if (!currentFolder.value || isWorkspaceDeleted.value) return
    await loadFileTree()
    await startAdvancedFileWatching()
  }, 300)

  const saveAutoSaveDebounced = debounce(() => {
    StateStorage.saveAutoSave({
      enabled: autoSaveEnabled.value,
      intervalSeconds: autoSaveIntervalSeconds.value,
    })
  }, 500)

  /**
   * 保存工作区状态（防抖）
   */
  const saveWorkspaceStateDebounced = debounce((state: WorkspaceState) => {
    StateStorage.saveWorkspaceState(state)
  }, 1000) // 1 秒防抖

  // Initial
  function initial() {
    // 恢复状态
    restoreState()

    // 初始化主题系统
    initTheme()
    window.addEventListener('focus', handleWindowFocus)

    function startSayHello(windowId: number) {
      sayHelloTimeout = setTimeout(() => {
        window.electronAPI.hello(windowId);
        startSayHello(windowId)
      }, SAY_HELLO_TIMEOUT)
    }

    // Detect system theme preference
    if (window.electronAPI) {
      window.electronAPI.onWindowId(async (windowId: number)=>{
        startSayHello(windowId)
      })

      window.electronAPI.onRequestWindowClose(async (windowId: number)=>{
        // 在关闭之前立即保存所有状态
        if (saveWorkspaceStateDebounced.flush) {
          saveWorkspaceStateDebounced.flush()
        }
        if (saveUIState.flush) {
          saveUIState.flush()
        }
        if (saveEditSettingDebounced.flush) {
          saveEditSettingDebounced.flush()
        }
        if (saveAutoSaveDebounced.flush) {
          saveAutoSaveDebounced.flush()
        }

        // 禁用状态持久化（避免在清理过程中触发保存）
        shouldPersistState.value = false

        let resultClosed: boolean = false

        try {
          if (currentFolder.value) {
            resultClosed = await closeFolder()
          } else {
            resultClosed = await closeAllTab();
          }

          if (!resultClosed) {
            shouldPersistState.value = true
          }

          window.electronAPI.windowCloseConfirm(windowId, resultClosed);
        } catch(error) {
          console.error(`窗口${windowId}任务失败:`, error);
          // 提示用户后决定是否强制退出​
          const result = await window.electronAPI.showMessageBox({
            message: t('notify.window.closeFailedMessage'),
            type: 'question',
            buttons: [t('notify.window.closeAction'), t('notify.window.cancelAction')],
            defaultId: 0,
            title: t('notify.window.closeFailedTitle'),
            detail: t('notify.window.closeFailedDetail'),
            cancelId: 1
          })
      
          if (result.response === 0) {
            window.electronAPI.windowCloseConfirm(windowId, true);
          } else {
            shouldPersistState.value = true
            window.electronAPI.windowCloseConfirm(windowId, false);
          }
        }
      })
    }
  }

  // Destroy
  function destroy() {
    // Clean up file watching
    window.removeEventListener('focus', handleWindowFocus)
    stopWorkspaceRestorePolling()
    void stopAdvancedFileWatching()
    void stopOpenDocumentWatchers()
    if (sayHelloTimeout) {
      clearTimeout(sayHelloTimeout)
      sayHelloTimeout = null
    }
    if (window.electronAPI) {
      window.electronAPI.removeMenuActionListener()
      window.electronAPI.removeFileChangeListeners()
      fileWatchListenersRegistered = false
      window.electronAPI.removeWindowStateChangedListeners()
      window.electronAPI.removeRequestWindowCloseListeners()
      window.electronAPI.removeWindowIdListeners()
    }
    if (systemThemeMediaQuery && systemThemeChangeHandler) {
      if (typeof systemThemeMediaQuery.removeEventListener === 'function') {
        systemThemeMediaQuery.removeEventListener('change', systemThemeChangeHandler)
      } else {
        systemThemeMediaQuery.removeListener(systemThemeChangeHandler)
      }
      systemThemeMediaQuery = null
      systemThemeChangeHandler = null
    }
  }

  function handleWindowFocus() {
    void checkWorkspaceDirectoryRestored(true)
  }

  // Actions
  function showLeftSidebar(show: boolean = true) {
    if (isLeftSidebarVisible.value === show) return
    isLeftSidebarVisible.value = show
  }

  function toggleLeftSidebar() {
    showLeftSidebar(!isLeftSidebarVisible.value)
  }
  
  function showRightSidebar(show: boolean = true) {
    if (isRightSidebarVisible.value === show) return
    isRightSidebarVisible.value = show
  }

  function toggleRightSidebar() {
    showRightSidebar(!isRightSidebarVisible.value)
  }

  function showStatusbar(show: boolean = true) {
    if (isStatusbarVisible.value === show) return
    isStatusbarVisible.value = show
  }

  function searchInFolder(folderPath: string) {
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.search'))) return
    searchFolderPath.value = folderPath
    const relativePath = currentFolder.value
      ? toWorkspaceRelativePath(currentFolder.value, folderPath)
      : ''
    searchIncludePattern.value = relativePath ? `${relativePath}/**` : ''
    searchExcludePattern.value = ''
    searchRequestKey.value += 1
    setLeftSidebarMode(SidebarMode.SEARCH)
  }

  function searchInWorkspace() {
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.search'))) return
    searchFolderPath.value = null
    searchIncludePattern.value = ''
    searchExcludePattern.value = ''
    searchRequestKey.value += 1
    setLeftSidebarMode(SidebarMode.SEARCH)
  }

  function setLeftSidebarMode(mode: SidebarMode) {
    if (mode === SidebarMode.SEARCH && isWorkspaceDeleted.value) {
      notifyWorkspaceDeleted(t('notify.workspace.features.search'))
      leftSidebarMode.value = SidebarMode.EXPLORER
      showLeftSidebar(true)
      return
    }

    if (
      (mode === SidebarMode.TOC && tabs.value.length === 0) ||
      (mode !== SidebarMode.TOC && hasOpenFolder.value === false)
    ) {
      leftSidebarMode.value = SidebarMode.START
    } else { 
      leftSidebarMode.value = mode
    }
    showLeftSidebar(true)
  }
  
  function setLeftSidebarWidth(width: number) {
    if (width < minSidebarWidth) {
      // 如果宽度小于最小值，自动隐藏sidebar
      showLeftSidebar(false)
    } else {
      leftSidebarWidth.value = width
      showLeftSidebar(true)
    }
  }

  function setRightSidebarWidth(width: number) {
    if (width < minRightSidebarWidth) {
      showRightSidebar(false)
    } else {
      rightSidebarWidth.value = width
      showRightSidebar(true)
    }
  }
  
  function toggleStatusbar() {
    showStatusbar(!isStatusbarVisible.value)
  }

  function setCleanMode(enabled: boolean) {
    if (isCleanMode.value === enabled) return
    const requestId = ++cleanModeFullscreenRequestId
    isCleanMode.value = enabled

    if (!window.electronAPI?.getWindowFullscreen || !window.electronAPI?.setWindowFullscreen) return

    if (enabled) {
      void (async () => {
        try {
          const wasFullscreen = await window.electronAPI.getWindowFullscreen()
          if (requestId !== cleanModeFullscreenRequestId || !isCleanMode.value) return
          cleanModeFullscreenBefore = wasFullscreen
          if (!wasFullscreen) {
            await window.electronAPI.setWindowFullscreen(true)
          }
        } catch (error) {
          console.error('Failed to enter fullscreen for clean mode:', error)
        }
      })()
      return
    }

    const shouldRestoreFullscreen = cleanModeFullscreenBefore
    cleanModeFullscreenBefore = null
    if (shouldRestoreFullscreen === false) {
      void window.electronAPI.setWindowFullscreen(false).catch(error => {
        console.error('Failed to restore fullscreen after clean mode:', error)
      })
    }
  }

  function toggleCleanMode() {
    setCleanMode(!isCleanMode.value)
  }

  function setFocusMode(enabled: boolean) {
    if (isFocusMode.value === enabled) return
    isFocusMode.value = enabled
  }

  function toggleFocusMode() {
    setFocusMode(!isFocusMode.value)
  }

  async function toggleReadonlyMode() {
    const tab = activeTab.value
    if (!tab) return
    if (tab.documentType !== DocumentType.MARKDOWN_EDITOR) return

    if (isFileReadonly(tab)) {
      notify.warning(t('notify.readonly.fileReadonlyMessage'), t('notify.readonly.fileReadonlyContext'))
      return
    }

    const nextEditReadonly = !isEditReadonly(tab)

    if (nextEditReadonly && tab.isDirty && window.electronAPI?.showMessageBox) {
      const result = await window.electronAPI.showMessageBox({
        message: t('notify.readonly.enableMessage', { name: tab.name }),
        type: 'question',
        buttons: [
          t('notify.readonly.saveThenEnable'),
          t('notify.readonly.enableNow'),
          t('notify.readonly.cancel'),
        ],
        defaultId: 0,
        cancelId: 2,
        title: t('notify.readonly.enableTitle'),
        detail: t('notify.readonly.enableDetail')
      })

      if (result.response === 2) return
      if (result.response === 0) {
        const saved = await saveTab(tab, false, true)
        if (!saved) return
      }
    }

    updateTabState(tab.id, { editReadonly: nextEditReadonly })
    syncReadonlyWindowState({ ...tab, editReadonly: nextEditReadonly })
  }

  function setTypewriterMode(enabled: boolean) {
    if (isTypewriterMode.value === enabled) return
    isTypewriterMode.value = enabled
  }

  function toggleTypewriterMode() {
    setTypewriterMode(!isTypewriterMode.value)
  }

  function setMarkdownEditorPageMode(mode: MarkdownEditorPageMode) {
    if (markdownEditorPageMode.value === mode) return
    markdownEditorPageMode.value = mode
  }

  // Update window title based on current state
  function updateWindowTitle() {
    if (!window.electronAPI?.updateWindowTitle) return
    
    let title = 'iWriter'
    
    if (currentFolder.value && activeTab.value) {
      const folderName = pathUtils.basename(currentFolder.value)
      title = `${activeTab.value.name} - ${folderName}`
    } else if (activeTab.value) {
      title = activeTab.value.name
    } else if (currentFolder.value) {
      const folderName = pathUtils.basename(currentFolder.value)
      title = folderName
    }
    
    window.electronAPI.updateWindowTitle(title).catch(error => {
      console.error('Failed to update window title:', error)
    })
  }

  function toggleAutoSave() {
    if (!window.electronAPI?.windowContentChange) return
    autoSaveEnabled.value = !autoSave.value
  }

  function setAutoSaveIntervalSeconds(value: number) {
    autoSaveIntervalSeconds.value = normalizeAutoSaveIntervalSeconds(value)
  }

  function getPreferredFileDirectory(): string | undefined {
    if (activeTab.value?.path) return pathUtils.dirname(activeTab.value.path)
    if (currentFolder.value) return currentFolder.value
    return undefined
  }

  async function ensurePandocAvailable(): Promise<PandocAvailabilityResult | null> {
    if (!window.electronAPI?.pandocCheck) return null

    const availability = await window.electronAPI.pandocCheck({
      pandocPath: getConfiguredPandocPath(),
    })
    if (availability.available) return availability

    const detail = [t('notify.pandoc.unavailableDetail'), availability.installHint]
      .filter(Boolean)
      .join('\n\n')

    if (window.electronAPI.showMessageBox) {
      await window.electronAPI.showMessageBox({
        type: 'warning',
        title: t('notify.pandoc.unavailableTitle'),
        message: availability.error || t('notify.pandoc.unavailableTitle'),
        detail,
        buttons: [t('common.close')],
        defaultId: 0,
        cancelId: 0,
      })
    } else {
      notify.warning(availability.error || t('notify.pandoc.unavailableTitle'), detail)
    }

    return null
  }

  async function importWithPandoc(preferredExtensions?: string[]) {
    if (!window.electronAPI?.pandocImportFile) return false
    if (!(await ensurePandocAvailable())) return false

    const importExtensions = preferredExtensions?.length ? preferredExtensions : PANDOC_IMPORT_EXTENSIONS
    const result = await window.electronAPI.showOpenDialog({
      title: 'Import with Pandoc',
      defaultPath: getPreferredFileDirectory(),
      properties: ['openFile'],
      filters: [
        { name: 'Supported Documents', extensions: importExtensions },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return false

    const sourcePath = result.filePaths[0]!
    const sourceBaseName = pathUtils.basename(sourcePath)
    const targetName = `${pathUtils.basename(sourcePath, pathUtils.extname(sourcePath))}.md`

    // 已有同名且来源相同的无路径 tab（之前导入的）→ 直接激活，跳过转换
    const existingTab = findExistingTab({ name: targetName, documentType: DocumentType.MARKDOWN_EDITOR })
    if (existingTab && existingTab.pendingImport?.sourcePath === sourcePath) {
      setActiveTab(existingTab.id)
      return true
    }

    const importResult = await window.electronAPI.pandocImportFile({
      inputPath: sourcePath,
      pandocPath: getConfiguredPandocPath(),
    })
    if (!importResult.success || !importResult.markdown) {
      notify.error(importResult.error || t('notify.pandoc.unsupportedSource'), t('notify.pandoc.importFailed'))
      return false
    }

    createTab(targetName, undefined, DocumentType.MARKDOWN_EDITOR, false, {
      markdown: importResult.markdown,
      sourcePath,
    })
    notify.success(t('notify.pandoc.importSuccess', { name: sourceBaseName }), t('notify.file.operation'))
    return true
  }

  async function exportWithPandoc(defaultExtension?: string) {
    if (!window.electronAPI?.pandocExportFile) return false
    if (!(await ensurePandocAvailable())) return false

    const tab = activeTab.value
    if (!tab || tab.documentType !== DocumentType.MARKDOWN_EDITOR || !tab.editorInstance) {
      notify.warning(t('notify.pandoc.noActiveEditor'), t('notify.pandoc.exportFailed'))
      return false
    }

    const markdown = convertContentTo(tab.editorInstance as import('@tiptap/core').Editor, 'md')
    if (markdown == null || markdown.trim().length === 0) {
      notify.warning(t('notify.pandoc.emptyDocument'), t('notify.pandoc.exportFailed'))
      return false
    }

    const currentBaseName = (tab.path ? pathUtils.basename(tab.path) : tab.name).replace(/\.[^.]+$/, '')
    const extension = defaultExtension || 'docx'
    const exportTargetPath = await resolveExportTargetPath(tab, currentBaseName, extension, [
      { name: 'Pandoc Export Formats', extensions: PANDOC_EXPORT_EXTENSIONS },
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'HTML Document', extensions: ['html'] },
      { name: 'OpenDocument Text', extensions: ['odt'] },
      { name: 'Rich Text Format', extensions: ['rtf'] },
      { name: 'EPUB Ebook', extensions: ['epub'] },
      { name: 'LaTeX Document', extensions: ['tex'] },
      { name: 'MediaWiki Text', extensions: ['mediawiki'] },
      { name: 'reStructuredText', extensions: ['rst'] },
      { name: 'Textile', extensions: ['textile'] },
      { name: 'OPML', extensions: ['opml'] },
    ])
    if (!exportTargetPath) return false

    const request: PandocExportRequest = {
      markdown,
      outputPath: exportTargetPath,
      title: currentBaseName,
      pandocPath: getConfiguredPandocPath(),
      options: buildPandocExportOptions(pathUtils.extension(exportTargetPath)),
    }
    const exportResult = await window.electronAPI.pandocExportFile(request)

    if (!exportResult.success || !exportResult.outputPath) {
      notify.error(exportResult.error || t('notify.pandoc.unsupportedTarget'), t('notify.pandoc.exportFailed'))
      return false
    }

    notify.success(t('notify.pandoc.exportSuccess', { path: exportResult.outputPath }), t('notify.file.operation'))
    void handlePostExportAction(exportResult.outputPath)
    return true
  }

  function getConfiguredPandocPath(): string | undefined {
    if (globalExportSetting.common.pandocPathMode !== 'custom') return undefined
    const configured = globalExportSetting.common.pandocPath.trim()
    return configured || undefined
  }

  function getConfiguredSofficePath(): string | undefined {
    if (globalExportSetting.common.libreOfficePathMode !== 'custom') return undefined
    const configured = globalExportSetting.common.libreOfficePath.trim()
    return configured || undefined
  }

  async function importOfficeToMarkdown(filePath: string): Promise<boolean> {
    if (!window.electronAPI?.pandocImportFile) return false

    const sourceBaseName = pathUtils.basename(filePath)
    const targetName = `${pathUtils.basename(filePath, pathUtils.extname(filePath))}.md`

    // 已有同名且来源相同的无路径 tab（之前导入的）→ 直接激活，跳过转换
    const existingTab = findExistingTab({ name: targetName, documentType: DocumentType.MARKDOWN_EDITOR })
    if (existingTab && existingTab.pendingImport?.sourcePath === filePath) {
      setActiveTab(existingTab.id)
      return true
    }

    const pandocAvailability = await window.electronAPI.pandocCheck?.({
      pandocPath: getConfiguredPandocPath(),
    })
    if (!pandocAvailability?.available) {
      notify.error(
        pandocAvailability?.error || t('notify.pandoc.unavailableTitle'),
        t('notify.office.importFailed'),
      )
      return false
    }

    const importResult = await window.electronAPI.pandocImportFile({
      inputPath: filePath,
      pandocPath: getConfiguredPandocPath(),
    })
    if (!importResult.success || !importResult.markdown) {
      notify.error(importResult.error || t('notify.pandoc.unsupportedSource'), t('notify.office.importFailed'))
      return false
    }

    createTab(targetName, undefined, DocumentType.MARKDOWN_EDITOR, false, {
      markdown: importResult.markdown,
      sourcePath: filePath,
    })
    notify.success(t('notify.office.importSuccess', { name: sourceBaseName }), t('notify.file.operation'))
    return true
  }

  function getPreferredExportDirectory(tab?: FileTab | null): string | undefined {
    switch (globalExportSetting.common.defaultFolderMode) {
      case 'same-directory':
        if (tab?.path) return pathUtils.dirname(tab.path)
        return undefined
      case 'custom':
        return globalExportSetting.common.customFolderPath.trim() || undefined
      default:
        return undefined
    }
  }

  async function resolveExportTargetPath(
    tab: FileTab | null | undefined,
    baseName: string,
    extension: string,
    filters: { name: string; extensions: string[] }[],
  ): Promise<string | null> {
    const folderMode = globalExportSetting.common.defaultFolderMode
    const preferredDirectory = getPreferredExportDirectory(tab)
    const directExport =
      (folderMode === 'same-directory' && !!preferredDirectory) ||
      (folderMode === 'custom' && !!preferredDirectory)

    const defaultPath = preferredDirectory
      ? pathUtils.join(preferredDirectory, `${baseName}.${extension}`)
      : `${baseName}.${extension}`

    if (directExport) {
      return defaultPath
    }

    const result = await window.electronAPI.showSaveDialog({
      title: 'Export',
      defaultPath,
      filters,
    })

    if (result.canceled || !result.filePath) return null
    return result.filePath
  }

  function mapExtensionToExportFormat(extension: string): ExportFormatId | null {
    const normalized = extension.toLowerCase()
    switch (normalized) {
      case 'html':
      case 'htm':
        return 'html'
      case 'docx':
        return 'docx'
      case 'odt':
        return 'odt'
      case 'rtf':
        return 'rtf'
      case 'epub':
        return 'epub'
      case 'tex':
      case 'latex':
        return 'latex'
      case 'mediawiki':
      case 'wiki':
        return 'mediawiki'
      case 'rst':
      case 'rest':
        return 'rst'
      case 'textile':
        return 'textile'
      case 'opml':
        return 'opml'
      default:
        return null
    }
  }

  function buildPandocExportOptions(extension: string): PandocExportRequest['options'] {
    const formatId = mapExtensionToExportFormat(extension)
    if (!formatId) return undefined

    const settings = globalExportSetting.formats[formatId]
    return {
      customArgs: settings.customArgs,
      referenceDocPath: settings.referenceDocPath,
      templatePath: settings.templatePath,
      cssPath: settings.cssPath,
      tocDepth: settings.tocDepth,
    }
  }

  async function handlePostExportAction(filePath: string) {
    const actions = globalExportSetting.common.afterExportActions
    if (!actions.reveal && !actions.open) return

    try {
      if (actions.reveal) {
        await window.electronAPI.revealInFolder(filePath)
      }
      if (actions.open) {
        await window.electronAPI.openWithShell(filePath)
      }
    } catch (error) {
      console.warn('Failed to handle post export action:', error)
    }
  }

  async function openFile(filePath: string) {
    return openFileAt(filePath)
  }

  async function openFileAt(filePath: string, insertIndex?: number) {
    if (!window.electronAPI) return false
    const normalizedFilePath = pathUtils.normalize(filePath)

    // Check if file is already open
    const existingTab = tabs.value.find(tab => tab.path && pathUtils.normalize(tab.path) === normalizedFilePath)
    if (existingTab) {
      setActiveTab(existingTab.id)
      return false
    }

    if (pendingOpenPaths.has(normalizedFilePath)) {
      return false
    }

    pendingOpenPaths.add(normalizedFilePath)

    try {
      const files = await window.electronAPI.getFiles(filePath, true)
      if (!files || files.length === 0 || !files[0] || files[0].isDirectory === true) {
        notify.error(t('notify.file.openError', { path: filePath }), t('notify.file.openErrorContext'))
        return false
      }

      const duplicateTab = tabs.value.find(tab => tab.path && pathUtils.normalize(tab.path) === normalizedFilePath)
      if (duplicateTab) {
        setActiveTab(duplicateTab.id)
        return false
      }

      const documentType = detectFromPath(filePath)
      const fileReadonly = files[0].isWritable === false
      createTab(pathUtils.basename(filePath), filePath, documentType, fileReadonly, undefined, insertIndex)
      return true
    } finally {
      pendingOpenPaths.delete(normalizedFilePath)
    }
  }

  /* for debug
  function logFileTreeNode(node: FileTreeNode | null) {
    if (!node) {
      console.log('Invalid node provided to logFileTreeNode') 
      return
    }
    
    // 如果是文件，直接返回
    if (node.type === 'file') {
      console.log(`Traversing file: ${node.parent?.label} ${node.type} ${node.path}`)
      return
    }
    
    // 如果是目录，递归遍历子节点
    if (node.children && node.children.length > 0) {
      console.log(`Traversing folder: ${node.parent?.label} ${node.type} ${node.path}`)
      node.children.forEach(child => {
        logFileTreeNode(child as FileTreeNode)
      })
    }
    return
  }
  */

  // File or Folder operations
  async function openFolder() {
    if (!window.electronAPI) return

    const result = await window.electronAPI.showOpenDialog({ properties: ['openDirectory'] })
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0]!

      if (folderPath === currentFolder.value) {
        if (isWorkspaceDeleted.value) {
          await checkWorkspaceDirectoryRestored(false)
          return
        }
        notify.success(t('notify.file.alreadyOpened', { path: folderPath }), t('notify.file.operation'))
        return
      }

      let resultClosed: boolean = false
      if (currentFolder.value) {
        resultClosed = await closeFolder()
      } else {
        resultClosed = await closeAllTab();
      }
      if (resultClosed === false)
        return

      currentFolder.value = folderPath
      workspaceStatus.value = 'available'
      stopWorkspaceRestorePolling()
      leftSidebarMode.value = SidebarMode.EXPLORER
      await loadFileTree()
      startAdvancedFileWatching() // Start advanced file watching
      
      // 成功通知
      const folderName = pathUtils.basename(folderPath)
      notify.success(t('notify.file.opened', { name: folderName }), t('notify.file.operation'))
    }
  }
  
  async function closeFolder(): Promise<boolean> {
    if (currentFolder.value !== null) {
      // Close all tabs since no folder is open
      const result = await closeAllTab();
      
      if (result) {
        stopAdvancedFileWatching() // Stop file watching when folder is closed
        currentFolder.value = null
        workspaceStatus.value = 'available'
        stopWorkspaceRestorePolling()
        fileTree.value = null
        selectedItem.value = null
        leftSidebarMode.value = SidebarMode.START
      }

      return result
    }

    return true
  }

  async function rebuildWorkspaceDirectory(): Promise<boolean> {
    if (!currentFolder.value || !window.electronAPI) return false

    try {
      await window.electronAPI.ensureDirectory(currentFolder.value)
      return await checkWorkspaceDirectoryRestored(false)
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.workspace.rebuildError'))
      return false
    }
  }

  async function loadFileTree() {
    if (!currentFolder.value || !window.electronAPI) return
    if (isWorkspaceDeleted.value) return

    const startedAt = performance.now()
    perfLog('loadFileTree start')

    try {
      const ignoreStartedAt = performance.now()
      const effectiveIgnoreRules = await getEffectiveWorkspaceIgnoreRules(currentFolder.value)
      perfLog('loadFileTree ignore rules loaded', ignoreStartedAt)
      // 使用 await 等待异步操作完成
      const rootStartedAt = performance.now()
      const files = await window.electronAPI.getFiles(currentFolder.value, true)
      perfLog('loadFileTree root metadata loaded', rootStartedAt)
      if (!files || files.length === 0 || !files[0] || files[0].isDirectory === false) {
        throw(new Error(t('notify.file.notDirectory')))
      }
      const file = files[0]
      fileTree.value = {
        id: generateId(),
        label: file.name,
        path: file.path,
        type: 'folder',
        children: [],
        isExpanded: false,
        isVisible: true,
        isEnabled: true,
        data: {},
        isOpen: false,
        isHidden: file.isHidden ?? file.name.startsWith('.'),
        isWritable: file.isWritable,
        isReadonly: file.isWritable === false,
        created: file.created,
        modified: file.modified,
      }

      // 使用 await 等待异步操作完成
      const traverseStartedAt = performance.now()
      const stats: FileTreePerfStats = { directories: 1, files: 0, skippedDirectories: 0 }
      fileTree.value.children = await traverseFileTree(currentFolder.value, fileTree.value, effectiveIgnoreRules, stats)
      perfLog(
        `loadFileTree traverse done dirs=${stats.directories} files=${stats.files} skippedDirs=${stats.skippedDirectories}`,
        traverseStartedAt
      )
      perfLog('loadFileTree done', startedAt)
    } catch (error) {
      const exists = await window.electronAPI.pathExists(currentFolder.value)
      if (!exists) {
        enterWorkspaceDeletedState()
        return []
      }
      perfLog('loadFileTree failed', startedAt)
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.treeLoadError'))
      return []
    }
  }

  async function getEffectiveWorkspaceIgnoreRules(workspaceRoot: string): Promise<string> {
    const preferenceRules = globalEditSetting.workspaceIgnoreRules ?? DEFAULT_WORKSPACE_IGNORE_RULES
    const gitignoreFilePath = pathUtils.join(workspaceRoot, GITIGNORE_FILENAME)
    const ignoreFilePath = pathUtils.join(workspaceRoot, WORKSPACE_IGNORE_FILENAME)
    let gitignoreRules: string | undefined
    let workspaceRules: string | undefined

    try {
      if (globalEditSetting.useGitignoreAsWorkspaceIgnore !== false) {
        const gitignoreExists = await window.electronAPI?.pathExists(gitignoreFilePath)
        if (gitignoreExists) {
          gitignoreRules = await window.electronAPI?.readFileSilent(gitignoreFilePath) ?? undefined
        }
      }

      const ignoreExists = await window.electronAPI?.pathExists(ignoreFilePath)
      if (ignoreExists) {
        workspaceRules = await window.electronAPI?.readFileSilent(ignoreFilePath) ?? undefined
      }
    } catch (error) {
      console.warn('Failed to load workspace ignore rules:', error)
    }

    return buildWorkspaceIgnoreRules({
      preferenceRules,
      gitignoreRules,
      workspaceRules,
      useGitignoreAsWorkspaceIgnore: globalEditSetting.useGitignoreAsWorkspaceIgnore,
    })
  }

  async function traverseFileTree(
    dirPath: string,
    parent?: FileTreeNode,
    effectiveIgnoreRules?: string,
    stats?: FileTreePerfStats
  ): Promise<FileTreeNode[] | undefined> {
    if (!dirPath || !window.electronAPI) return undefined
    
    try {
      const workspaceRoot = currentFolder.value ?? dirPath
      const ignoreRules = effectiveIgnoreRules ?? await getEffectiveWorkspaceIgnoreRules(workspaceRoot)
      const matcher = parseWorkspaceIgnoreRules(ignoreRules)
      const files = await getWorkspaceEntriesRaw(dirPath, workspaceRoot)

      if (files && Array.isArray(files)) {
        // 使用 Promise.all 处理所有子目录的异步操作
        const fileTree = await Promise.all(
          files.map(async (file) => {
            let children: FileTreeNode[] | undefined
            if (file.isDirectory) {
              if (!shouldTraverseWorkspaceDirectory(file, matcher)) {
                if (stats) stats.skippedDirectories += 1
                return null
              }
              if (stats) stats.directories += 1
              children = await traverseFileTree(file.path, undefined, ignoreRules, stats)
            } else if (stats) {
              stats.files += 1
            }

            const shouldIncludeNode = shouldIncludeWorkspaceEntry(file, matcher)
            if (!shouldIncludeNode && (!children || children.length === 0)) {
              return null
            }

            const node: FileTreeNode = {
              id: generateId(),
              label: file.name,
              path: file.path,
              type: file.isDirectory ? 'folder' : 'file',
              children,
              parent: parent,
              isExpanded: file.isDirectory ? false : undefined,
              isVisible: true,
              isEnabled: true,
              data: {},
              isOpen: false,
              isHidden: file.isHidden,
              isWritable: file.isWritable,
              isReadonly: file.isReadonly,
              created: file?.created,
              modified: file?.modified,
            }

            node.children?.forEach(child => {
              child.parent = node
            })
            
            return node
          })
        )

        return fileTree.filter((node): node is FileTreeNode => node !== null)
      }      
    } catch (error) {
      throw(error)
    }
  }
  
  function generateId(): string {
    return Math.random().toString(36).substring(2, 11)
  }

  function sortFileTreeNodes(nodes: FileTreeNode[], sortType: FileTreeSortType) {
    // Sort current level
    nodes.sort((a, b) => {
      switch (sortType) {
        case 'name-asc':
          return a.label.localeCompare(b.label)
        case 'name-desc':
          return b.label.localeCompare(a.label)
        case 'type-asc':
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1
          }
          return a.label.localeCompare(b.label)
        case 'type-desc':
          if (a.type !== b.type) {
            return a.type === 'file' ? -1 : 1
          }
          return a.label.localeCompare(b.label)
        case 'created-asc':
          return (a.created?.getTime() || 0) - (b.created?.getTime() || 0)
        case 'created-desc':
          return (b.created?.getTime() || 0) - (a.created?.getTime() || 0)
        case 'modified-asc':
          return (a.modified?.getTime() || 0) - (b.modified?.getTime() || 0)
        case 'modified-desc':
          return (b.modified?.getTime() || 0) - (a.modified?.getTime() || 0)
        default:
          return 0
      }
    })

    // Sort children recursively
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortFileTreeNodes(node.children as FileTreeNode[], sortType)
      }
    })
  }

  function queryFileTreeNodes(nodes: FileTreeNode[], query: string) {
    // Sort children recursively
    nodes.forEach(node => {
      if (query && query !== '') {
        node.isVisible = node.label.toLowerCase().includes(query)
      } else {
        node.isVisible = true
      }

      if (node.children && node.children.length > 0) {
        queryFileTreeNodes(node.children as FileTreeNode[], query)
      }
    })
  }

  
  function setSelectedItem(node: FileTreeNode | null) {
    selectedItem.value = node
  }

  function updateFileTreeNodePath(node: FileTreeNode, dir: string, filename: string) {
    const sourcePath = node.path
    node.id = generateId()
    node.label = filename
    node.path = `${dir}/${filename}`
    if (node.type === 'file') {
      const openTab = tabs.value.find(tab => tab.path === sourcePath)
      if (openTab) {
        openTab.path = node.path
      }
    }
    else if (node.type === 'folder') {
      node?.children?.forEach(child => {
        updateFileTreeNodePath(child as FileTreeNode, `${dir}/${node.label}`, child.label)
      });
    }
  }

  async function openFileDialog() {
    if (!window.electronAPI) return
    
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Text and Markdown Files', extensions: [...TEXT_EXTENSIONS] },
        { name: 'Image Files', extensions: [...IMAGE_EXTENSIONS] },
        { name: 'PDF Files', extensions: [...PDF_EXTENSIONS] },
        { name: 'Office Files', extensions: [...OFFICE_EXTENSIONS] },
        {
          name: 'All Files',
          extensions: [
            ...TEXT_EXTENSIONS,
            ...IMAGE_EXTENSIONS,
            ...PDF_EXTENSIONS,
            ...OFFICE_EXTENSIONS,
          ]
        }
      ]
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return openFile(result.filePaths[0]!)
    }
  }
  
  // Create a file or folder by input node parameters
  async function CreateFileOrFolder(parentNode: FileTreeNode, childNode: FileTreeNode): Promise<boolean> {
    if (!window.electronAPI) return false
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.fileTree'))) return false
    const date = new Date()

    try {
      if (childNode.type === 'file') {
        const filePath = await window.electronAPI.createFile(parentNode.path, childNode.label)
        if (filePath) {
          childNode.label = pathUtils.basename(filePath)
          childNode.path = filePath
          childNode.data = {}
          childNode.isHidden = pathUtils.basename(filePath).startsWith('.')
          childNode.isWritable = true
          childNode.isReadonly = false
          childNode.created = date
          childNode.modified = date
          notify.success(t('notify.file.createSuccess', { name: filePath }), t('notify.file.operation'))
        }
      } else if (childNode.type === 'folder') {
        const folderPath = await window.electronAPI.createFolder(parentNode.path, childNode.label)
        if (folderPath) {
          childNode.label = pathUtils.basename(folderPath)
          childNode.path = folderPath
          childNode.data = {}
          childNode.isHidden = pathUtils.basename(folderPath).startsWith('.')
          childNode.isWritable = true
          childNode.isReadonly = false
          childNode.created = date
          childNode.modified = date
          notify.success(t('notify.file.createSuccess', { name: folderPath }), t('notify.file.operation'))
        }
      }
      
      return true
    } catch (error) {
      if (childNode.type === 'file') {
        notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.createError'))
      } else if (childNode.type === 'folder') {
        notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.createFolderError'))
      }
      return false
    }

  }

  // Delete a file or folder
  async function deleteFileOrFolder(node: FileTreeNode): Promise<boolean> {
    if (!window.electronAPI) return false
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.fileTree'))) return false

    try {
      const result = await window.electronAPI.deleteFile(node.path)
      
      if (result) {
        // Remove from parent's children
        if (node.parent?.children) {
          const index = node.parent.children.findIndex(child => child.id === node.id)
          if (index > -1) {
            node.parent.children.splice(index, 1)
          }
        }
        notify.success(t('notify.file.deleteSuccess', { path: node.path }), t('notify.file.operation'))

        markOpenTabsDeleted(node.path, node.type === 'folder')
        setSelectedItem(null)

        return true
      }

      return false
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.deleteError'))
      return false
    }
  }

  // Rename a file or folder
  async function renameFileOrFolder(node: FileTreeNode, newName: string): Promise<boolean> {
    if (!window.electronAPI) return false
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.fileTree'))) return false

    try {
      const newPath = await window.electronAPI.renameFile(node.path, newName)

      if (newPath) {
        // Update tab if the renamed file was open
        const openTab = tabs.value.find(tab => tab.path === node.path)
        if (openTab) {
          openTab.path = newPath
          openTab.name = pathUtils.basename(newPath)
        }
        updateFileTreeNodePath(node, pathUtils.dirname(newPath), pathUtils.basename(newPath))

        // Sort parent's children
        //if (node.parent) {
        //  sortFileTreeNodes(node.parent.children as FileTreeNode[], currentFileTreeSortType.value)
        //}
        setSelectedItem(node)

        notify.success(t('notify.file.renameSuccess', { from: node.path, to: newName }), t('notify.file.operation'))
        return true
      }

      return false
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.renameError'))
      return false
    }
  }

  async function moveFileOrFolder(sourceNode: FileTreeNode, targetParentNode: FileTreeNode): Promise<FileOperationResult | null> {
    if (!window.electronAPI) return null
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.fileTree'))) return null

    const sourcePath: string = sourceNode.path
    const targetDir: string = targetParentNode.path
    try {
      const result = await window.electronAPI.moveFile(sourcePath, targetDir)
      
      if (!result) {
        throw new Error(t('notify.file.unknownError'))
      }
      
      if (result.success) {
        // Remove from source parent's children
        if (sourceNode.parent?.children) {
          const sourceParentChildren = sourceNode.parent.children as FileTreeNode[]
          const index = sourceParentChildren.findIndex(child => child.id === sourceNode.id)
          if (index > -1) {
            sourceParentChildren.splice(index, 1)
          }
        }

        // 如果是替换模式
        if (result.conflictAction === 'replace') {
          const targetParentChildren = targetParentNode.children as FileTreeNode[]
          let index = targetParentChildren.findIndex(child => child.label === sourceNode.label && child.type === sourceNode.type)
          if (index === -1)
            index = targetParentChildren.findIndex(child => {
              const targetLabel = child.label.toUpperCase()
              const sourceLabel = sourceNode.label.toUpperCase()
              return targetLabel === sourceLabel && child.type === sourceNode.type
          })
          
          // Remove replaced from target parent's children
          targetParentChildren.splice(index, 1)
        }
         
        // update sourceNode path to target path
        updateFileTreeNodePath(sourceNode, pathUtils.dirname(result.newPath), pathUtils.basename(result.newPath))

        // Add to Target parent's children
        if (!targetParentNode.children) {
          targetParentNode.children = []
        }
        (targetParentNode.children as FileTreeNode[]).push(sourceNode)
        sourceNode.parent = targetParentNode
    
        //sortFileTreeNodes(targetParentNode.children as FileTreeNode[], currentFileTreeSortType.value)
        setSelectedItem(sourceNode)
        notify.success(t('notify.file.moveSuccess', { from: sourcePath, to: result.newPath }), t('notify.file.operation'))

        return result
      }

      return result
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.moveError'))
      throw error
    }
  }

  async function copyFileOrFolder(sourceNode: FileTreeNode, targetParentNode: FileTreeNode): Promise<FileOperationResult | null> {
    if (!window.electronAPI) return null
    if (!ensureWorkspaceFeatureAvailable(t('notify.workspace.features.fileTree'))) return null

    try {
      const result = await window.electronAPI.copyFile(sourceNode.path, targetParentNode.path)
      if (!result?.success) {
        return result
      }

      await addNodeToFileTreeByFilePath(result.newPath)
      notify.success(t('notify.file.copySuccess', { from: sourceNode.path, to: result.newPath }), t('notify.file.operation'))
      return result
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.copyError'))
      throw error
    }
  }

  // 启动高级文件监听
  async function startAdvancedFileWatching() {
    if (!currentFolder.value || !window.electronAPI) return
    if (isWorkspaceDeleted.value) return

    const startedAt = performance.now()
    perfLog('startAdvancedFileWatching start')

    try {
      ensureFileWatchListeners()

      const ignoreStartedAt = performance.now()
      const effectiveIgnoreRules = await getEffectiveWorkspaceIgnoreRules(currentFolder.value)
      perfLog('startAdvancedFileWatching ignore rules loaded', ignoreStartedAt)

      // 启动原生文件监听
      const ipcStartedAt = performance.now()
      const result = await window.electronAPI.startFileWatching(currentFolder.value, {
        ignoreRulesText: effectiveIgnoreRules,
      })
      perfLog(`startAdvancedFileWatching IPC returned success=${result.success}`, ipcStartedAt)
      if (!result.success) {
        notify.warning(result.error ?? 'File watcher failed to start', t('notify.file.watchStartError'))
      }
      perfLog('startAdvancedFileWatching done', startedAt)
    } catch (error) {
      perfLog('startAdvancedFileWatching failed', startedAt)
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.watchStartError'))
    }
  }
  
  // 停止高级文件监听
  async function stopAdvancedFileWatching() {
    if (!currentFolder.value || !window.electronAPI) return
    
    try {
      await window.electronAPI.stopFileWatching(currentFolder.value)
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.watchStopError'))
    }
  }

  function ensureFileWatchListeners() {
    if (!window.electronAPI || fileWatchListenersRegistered) return

    window.electronAPI.onFileChange((change) => {
      void handleFileChange(change)
    })

    window.electronAPI.onFileWatchError((error) => {
      notify.warning(`${error.message}`, t('notify.file.watchWarning'))
    })

    fileWatchListenersRegistered = true
  }

  function shouldWatchOpenDocumentPath(filePath: string): boolean {
    return !currentFolder.value || !isPathInsideWorkspace(filePath, currentFolder.value)
  }

  async function syncOpenDocumentWatchers() {
    if (!window.electronAPI) return

    ensureFileWatchListeners()

    const desiredDirs = new Set<string>()
    for (const tab of tabs.value) {
      if (!tab.path || !shouldWatchOpenDocumentPath(tab.path)) continue
      const parentDir = pathUtils.normalize(pathUtils.dirname(tab.path))
      desiredDirs.add(parentDir)
    }

    for (const dir of Array.from(openDocumentWatchDirs)) {
      if (desiredDirs.has(dir)) continue

      try {
        await window.electronAPI.stopFileWatching(dir)
      } catch (error) {
        notify.warning(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.watchStopError'))
      } finally {
        openDocumentWatchDirs.delete(dir)
      }
    }

    for (const dir of desiredDirs) {
      if (openDocumentWatchDirs.has(dir)) continue

      try {
        const result = await window.electronAPI.startFileWatching(dir, { depth: 0 })
        if (result.success) {
          openDocumentWatchDirs.add(dir)
        } else {
          notify.warning(result.error ?? 'File watcher failed to start', t('notify.file.watchStartError'))
        }
      } catch (error) {
        notify.warning(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.watchStartError'))
      }
    }
  }

  async function stopOpenDocumentWatchers() {
    if (!window.electronAPI) return

    const dirs = Array.from(openDocumentWatchDirs)
    openDocumentWatchDirs.clear()
    await Promise.all(dirs.map(async dir => {
      try {
        await window.electronAPI.stopFileWatching(dir)
      } catch (error) {
        notify.warning(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.watchStopError'))
      }
    }))
  }
  
  // 根据路径在文件树中查找节点
  function findNodeByPath(targetPath: string, tree?: FileTreeNode): FileTreeNode | null {
    const rootNode = tree || fileTree.value
    if (!rootNode) return null
    
    // 检查当前节点
    if (rootNode.path === targetPath) {
      return rootNode
    }
    
    // 递归搜索子节点
    if (rootNode.children && rootNode.children.length > 0) {
      for (const child of rootNode.children) {
        const found = findNodeByPath(targetPath, child as FileTreeNode)
        if (found) {
          return found
        }
      }
    }
    
    return null
  }

  // 从文件树中移除节点（基于 deleteFileOrFolder 的逻辑，但不实际删除文件）
  async function removeNodeFromFileTreeByFilePath(targetPath: string): Promise<boolean> {
    const node = findNodeByPath(targetPath)
    if (!node) return false
    
    try {
      // Remove from parent's children
      if (node.parent?.children) {
        const index = node.parent.children.findIndex(child => child.id === node.id)
        if (index > -1) {
          node.parent.children.splice(index, 1)
        }
      }
      notify.success(t('notify.tree.nodeDeleted', { path: node.path }), t('notify.tree.context'))

      markOpenTabsDeleted(targetPath, node.type === 'folder')
      
      // Clear selection if the deleted node was selected
      if (selectedItem.value?.path === targetPath || 
          (selectedItem.value?.path && selectedItem.value.path.startsWith(targetPath + '/'))) {
        setSelectedItem(null)
      }

      return true
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.tree.updateError'))
      return false
    }
  }

  function markOpenTabsDeleted(targetPath: string, includeChildren = false) {
    for (const tab of getOpenTabsAffectedByPath(targetPath, includeChildren)) {
      updateTabState(tab.id, { diskState: 'deleted' })
      if (tab.path) {
        const normalizedPath = pathUtils.normalize(tab.path)
        ignoredExternalChangePaths.delete(normalizedPath)
        externalChangePromptPaths.delete(normalizedPath)
        suspiciousEmptyExternalChangeRetries.delete(normalizedPath)
      }
    }
  }

  // 向文件树添加节点
  async function addNodeToFileTreeByFilePath(filePath: string): Promise<boolean> {
    if (!window.electronAPI) return false
    if (findNodeByPath(filePath)) return false

    // Deduplicate concurrent adds for the same path to prevent duplicate tree nodes
    // when chokidar fires addDir/add events for a parent and all its children simultaneously.
    const key = pathUtils.normalize(filePath)
    const inFlight = inFlightAddPaths.get(key)
    if (inFlight) return inFlight

    const promise = (async (): Promise<boolean> => {
      try {
        const parentPath = pathUtils.dirname(filePath)
        const parentNode = findNodeByPath(parentPath)
        if (!parentNode) {
          if (currentFolder.value && isPathInsideWorkspace(parentPath, currentFolder.value)) {
            const parentAdded = await addNodeToFileTreeByFilePath(parentPath)
            if (!parentAdded && !findNodeByPath(parentPath)) {
              await loadFileTree()
              return !!findNodeByPath(filePath)
            }
          } else {
            await loadFileTree()
            return !!findNodeByPath(filePath)
          }
        }
        const resolvedParentNode = findNodeByPath(parentPath)
        if (!resolvedParentNode) return false
        if (findNodeByPath(filePath)) return false

        // 使用 await 等待异步操作完成
        const files = await window.electronAPI.getFiles(filePath, true)
        if (!files || files.length === 0 || !files[0]) {
          throw new Error(`获取 ${filePath} 信息失败`)
        }

        if (currentFolder.value) {
          const effectiveIgnoreRules = await getEffectiveWorkspaceIgnoreRules(currentFolder.value)
          const entries = await listWorkspaceEntries(parentPath, {
            workspaceRoot: currentFolder.value,
            ignoreRulesText: effectiveIgnoreRules,
            includeDirectories: true,
          })
          const existsAfterFiltering = entries.some(entry => entry.path === filePath)
          if (!existsAfterFiltering) {
            return false
          }
        }

        const newNode: FileTreeNode = {
          id: generateId(),
          label: files[0].name,
          path: files[0].path,
          type: files[0].isDirectory ? 'folder' : 'file',
          parent: resolvedParentNode,
          isVisible: true,
          isEnabled: true,
          data: {},
          size: files[0].size || 0,
          isHidden: files[0].isHidden ?? files[0].name.startsWith('.'),
          isWritable: files[0].isWritable,
          isReadonly: files[0].isWritable === false,
          created: files[0].created,
          modified: files[0].modified,
        }
        if (files[0].isDirectory) {
          const effectiveIgnoreRules = currentFolder.value
            ? await getEffectiveWorkspaceIgnoreRules(currentFolder.value)
            : undefined
          newNode.children = await traverseFileTree(files[0].path, newNode, effectiveIgnoreRules)
        }
        if (!resolvedParentNode.children) {
          resolvedParentNode.children = []
        }
        resolvedParentNode.children.push(newNode)

        notify.success(t('notify.tree.nodeAdded', { path: filePath }), t('notify.tree.context'))

        // Sort children based on current sort type
        //sortFileTreeNodes(parentNode.children as FileTreeNode[], currentFileTreeSortType.value)

        return true
      } catch (error) {
        notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.tree.updateError'))
        return false
      }
    })()
    inFlightAddPaths.set(key, promise)
    return promise.finally(() => inFlightAddPaths.delete(key))
  }

  // 通过文件路径，更新fileTree中path=给定path的FileTreeNode的状态size，created，modified
  async function updateFileTreeNodeInfo(filePath: string) {
    if (!window.electronAPI) return
    const node = findNodeByPath(filePath)
    if (!node) return
    
    try {
      // 使用 getFiles 获取单个文件信息
      const parentPath = pathUtils.dirname(filePath)
      const fileInfos = await window.electronAPI.getFiles(parentPath, true)
      const fileName = pathUtils.basename(filePath)
      const fileInfo = fileInfos.find(info => info.name === fileName)
      
      if (fileInfo) {
        node.size = fileInfo.size
        node.isHidden = fileInfo.isHidden ?? fileInfo.name.startsWith('.')
        node.isWritable = fileInfo.isWritable
        node.isReadonly = fileInfo.isWritable === false
        if (fileInfo.created) node.created = fileInfo.created
        if (fileInfo.modified) node.modified = fileInfo.modified
      }
    } catch (error) {
      notify.error(
        t('notify.tree.updateNodeInfoError', { path: node.path, error: error instanceof Error ? error.message : String(error) }),
        t('notify.tree.context')
      )
    }
  }

  // 处理文件变化
  function isPathInsideWorkspace(filePath: string, workspacePath: string): boolean {
    const normalizedFilePath = pathUtils.normalize(filePath)
    const normalizedWorkspacePath = pathUtils.normalize(workspacePath).replace(/\/+$/, '')
    return normalizedFilePath === normalizedWorkspacePath ||
      normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`)
  }

  async function reloadOpenMarkdownTabFromDisk(tab: FileTab, rawContent?: string): Promise<boolean> {
    if (!window.electronAPI || !tab.path || tab.documentType !== DocumentType.MARKDOWN_EDITOR) {
      return false
    }

    const editor = tab.editorInstance as Editor | undefined
    if (!editor) return false

    const content = rawContent ?? await readExistingFileContent(tab.path)
    const savedHash = buildSavedHash(content)

    const contentConverted = await convertContentFrom(content, pathUtils.extension(tab.path))
    if (contentConverted === null) {
      throw new Error('Unsupport file format')
    }

    editor.chain().command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setMeta('addToHistory', false)
        const json = generateJSON(contentConverted.content, editor.extensionManager.extensions)
        const doc = editor.schema.nodeFromJSON(json)
        tr.replaceWith(0, tr.doc.content.size, doc.content)
        dispatch(tr)
      }
      return true
    }).run()

    updateTabState(tab.id, {
      isDirty: false,
      lastSavedHash: savedHash,
      diskState: 'normal',
      savedCheckPoint: undoDepth(editor.state),
      editState: {
        lineEnding: contentConverted.lineEnding || 'LF',
      }
    })
    if (tab.path) {
      const normalizedPath = pathUtils.normalize(tab.path)
      ignoredExternalChangePaths.delete(normalizedPath)
      externalChangePromptPaths.delete(normalizedPath)
      suspiciousEmptyExternalChangeRetries.delete(normalizedPath)
    }
    return true
  }

  async function handleOpenTabExternalChange(filePath: string, rawContent?: string) {
    const tab = getOpenTabByPath(filePath)
    if (!tab || tab.documentType !== DocumentType.MARKDOWN_EDITOR) return

    const normalizedPath = pathUtils.normalize(filePath)

    if (ignoredExternalChangePaths.has(normalizedPath)) return

    const content = rawContent ?? await readStableExternalFileContent(filePath)
    const changedHash = buildSavedHash(content)

    if (isSuspiciousEmptyExternalContent(content, tab.lastSavedHash)) {
      updateTabState(tab.id, { diskState: 'external-modified' })
      if (rawContent === undefined && scheduleSuspiciousEmptyExternalRetry(filePath, normalizedPath)) {
        return
      }
      suspiciousEmptyExternalChangeRetries.delete(normalizedPath)
      await promptReloadForExternalChange(tab, normalizedPath, filePath)
      return
    }
    suspiciousEmptyExternalChangeRetries.delete(normalizedPath)

    if (tab.diskState === 'deleted') {
      if (tab.isDirty) {
        if (tab.lastSavedHash && changedHash !== tab.lastSavedHash) {
          ignoredExternalChangePaths.add(normalizedPath)
          updateTabState(tab.id, { diskState: 'external-modified' })
        } else {
          updateTabState(tab.id, { diskState: 'normal' })
        }
        return
      }

      if (tab.lastSavedHash && changedHash === tab.lastSavedHash) {
        updateTabState(tab.id, { diskState: 'normal' })
        return
      }
    }

    if (tab.lastSavedHash && changedHash === tab.lastSavedHash) {
      updateTabState(tab.id, { diskState: 'normal' })
      return
    }

    if (!tab.isDirty) {
      if (!tab.lastSavedHash) {
        throw new Error(`Missing lastSavedHash for clean tab: ${filePath}`)
      }

      const reloaded = await reloadOpenMarkdownTabFromDisk(tab, content)
      if (!reloaded) {
        throw new Error(`Failed to reload file in editor: ${filePath}`)
      }
      return
    }

    await promptReloadForExternalChange(tab, normalizedPath, filePath, content)
  }

  async function promptReloadForExternalChange(
    tab: FileTab,
    normalizedPath: string,
    filePath: string,
    rawContent?: string
  ) {
    if (externalChangePromptPaths.has(normalizedPath)) return
    if (!window.electronAPI?.showMessageBox) {
      throw new Error('showMessageBox not available')
    }

    externalChangePromptPaths.add(normalizedPath)

    try {
      const result = await window.electronAPI.showMessageBox({
        message: t('dialog.fileExternalChange.message'),
        type: 'warning',
        buttons: [t('dialog.fileExternalChange.reload'), t('dialog.fileExternalChange.ignore')],
        defaultId: 0,
        cancelId: 1,
        title: t('dialog.fileExternalChange.title'),
        detail: tab.path ?? filePath,
        noLink: true,
      })

      if (result?.response === 0) {
        await reloadOpenMarkdownTabFromDisk(tab, rawContent)
      } else {
        ignoredExternalChangePaths.add(normalizedPath)
        updateTabState(tab.id, { diskState: 'external-modified' })
      }
    } finally {
      externalChangePromptPaths.delete(normalizedPath)
    }
  }

  function doesChangeAffectOpenTab(change: FileChange): boolean {
    return getOpenTabsAffectedByPath(change.path, change.type === 'addDir' || change.type === 'unlinkDir').length > 0
  }

  async function refreshDeletedOpenTabsUnderPath(targetPath: string) {
    const affectedTabs = getOpenTabsAffectedByPath(targetPath, true)

    await Promise.all(affectedTabs.map(async tab => {
      if (!tab.path || tab.diskState !== 'deleted') return

      try {
        const exists = await window.electronAPI?.pathExists(tab.path)
        if (exists) {
          await handleOpenTabExternalChange(tab.path)
        }
      } catch {
        // Keep the deleted state if the filesystem check fails.
      }
    }))
  }

  async function handleOpenDocumentDiskChange(change: FileChange) {
    switch (change.type) {
      case 'add':
      case 'change':
        try {
          await handleOpenTabExternalChange(change.path)
        } catch (error) {
          notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.editor.errorContext'))
        }
        break
      case 'unlink':
        markOpenTabsDeleted(change.path)
        break
      case 'addDir':
        await refreshDeletedOpenTabsUnderPath(change.path)
        break
      case 'unlinkDir':
        markOpenTabsDeleted(change.path, true)
        break
    }
  }

  async function handleFileChange(change: FileChange) {
    if (isCurrentWorkspacePath(change.path)) {
      if (change.type === 'unlinkDir') {
        enterWorkspaceDeletedState()
        return
      }

      if (change.type === 'addDir' && isWorkspaceDeleted.value) {
        await checkWorkspaceDirectoryRestored(true)
        return
      }
    }

    if (isWorkspaceDeleted.value && currentFolder.value && isPathInsideWorkspace(change.path, currentFolder.value)) {
      return
    }

    const isInWorkspace = !!currentFolder.value && isPathInsideWorkspace(change.path, currentFolder.value)
    const affectsOpenTab = doesChangeAffectOpenTab(change)

    if (!isInWorkspace && !affectsOpenTab) {
      return
    }

    const isWorkspaceIgnoreFile = isInWorkspace &&
      !!currentFolder.value &&
      change.path === pathUtils.join(currentFolder.value, WORKSPACE_IGNORE_FILENAME)
    const isGitignoreFile = isInWorkspace &&
      !!currentFolder.value &&
      globalEditSetting.useGitignoreAsWorkspaceIgnore !== false &&
      change.path === pathUtils.join(currentFolder.value, GITIGNORE_FILENAME)

    if (isWorkspaceIgnoreFile || isGitignoreFile) {
      await loadFileTree()
      await startAdvancedFileWatching()
      if (!affectsOpenTab) return
    }

    if (isInWorkspace && !isWorkspaceIgnoreFile) {
      // 根据变化类型文件树更新
      switch (change.type) {
        case 'add':
          addNodeToFileTreeByFilePath(change.path)
          break
        case 'addDir':
          addNodeToFileTreeByFilePath(change.path)
          break
        case 'unlink':
        case 'unlinkDir':
          // 外部删除的文件或文件夹，从文件树中移除
          await removeNodeFromFileTreeByFilePath(change.path)
          break
        case 'change':
          // 文件内容变化，更新文件信息
          updateFileTreeNodeInfo(change.path)
          break
      }
    }

    if (affectsOpenTab) {
      await handleOpenDocumentDiskChange(change)
    }
  }
  
  function createTab(
    name?: string,
    path?: string,
    documentType?: DocumentType,
    fileReadonly?: boolean,
    pendingImport?: FileTab['pendingImport'],
    insertIndex?: number
  ) {
    const id = `${Date.now()}-${++tabIdSeq}`
    
    // Generate untitled name if not provided
    let tabName = name
    if (!tabName) {
      tabName = generateUntitledName({ existingNames: tabs.value.map(t => t.name) })
    }
    
    const newTab: FileTab = {
      id,
      name: tabName,
      path,
      isDirty: false,
      isActive: true,
      documentType: documentType || (path ? detectFromPath(path) : DocumentType.MARKDOWN_EDITOR),
      pendingImport,
      editState: { ...globalEditSetting },
      fileReadonly: fileReadonly ?? false,
      editReadonly: false,
      diskState: 'normal'
    }
    
    // Deactivate all other tabs
    tabs.value.forEach(tab => {
      tab.isActive = false
    })
    
    const normalizedInsertIndex = typeof insertIndex === 'number'
      ? Math.max(0, Math.min(insertIndex, tabs.value.length))
      : tabs.value.length

    tabs.value.splice(normalizedInsertIndex, 0, newTab)
    activeTabId.value = id

    notify.success(t('notify.file.opened', { name: path ? path : tabName }), t('notify.file.operation'))
    
    return newTab
  }

  /**
   * 查找已存在的 tab：
   * - 有 path → 按规范化路径 + documentType 匹配（用于磁盘文件）
   * - 无 path，有 name → 按名称 + documentType 匹配无路径的内存 tab（用于导入/新建未保存 tab）
   */
  function findExistingTab({ path, name, documentType }: { path?: string; name?: string; documentType?: DocumentType }): FileTab | undefined {
    if (path) {
      const normalized = pathUtils.normalize(path)
      return tabs.value.find(t =>
        t.path &&
        pathUtils.normalize(t.path) === normalized &&
        (!documentType || t.documentType === documentType)
      )
    }
    if (name) {
      return tabs.value.find(t =>
        !t.path &&
        t.name === name &&
        (!documentType || t.documentType === documentType)
      )
    }
    return undefined
  }

  /**
   * 新建空白 tab 的去重网关，与 openFileAt（打开磁盘文件的网关）平级。
   * 仅处理新建空白文档（不含 pendingImport 内容的场景）；导入文档直接调 createTab。
   * - 指定 path/name → 去重命中则激活已有 tab，不创建。
   * - 未指定 name → 生成不与现有 tab 冲突的唯一 Untitled 名称。
   * - 未命中 → 委托 createTab 创建。
   */
  function createOrActivateTab(
    name?: string,
    path?: string,
    documentType?: DocumentType,
  ): FileTab {
    // 去重：命中已有 tab 则激活并返回，不创建新 tab
    const existing = findExistingTab({ path, name, documentType })
    if (existing) {
      setActiveTab(existing.id)
      return existing
    }

    // 唯一命名：未提供 name 时，生成不与现有 tab 冲突的 Untitled 名
    let resolvedName = name
    if (!resolvedName) {
      resolvedName = generateUntitledName({ existingNames: tabs.value.map(t => t.name) })
    }

    return createTab(resolvedName, path, documentType)
  }

  function moveTab(tabId: string, insertIndex: number) {
    const sourceIndex = tabs.value.findIndex(tab => tab.id === tabId)
    if (sourceIndex === -1) return

    const [movedTab] = tabs.value.splice(sourceIndex, 1)
    if (!movedTab) return

    const boundedIndex = Math.max(0, Math.min(insertIndex, tabs.value.length))
    tabs.value.splice(boundedIndex, 0, movedTab)
    setActiveTab(movedTab.id)
  }
  
  async function closeTab(tabId: string): Promise<boolean> {
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index === -1) return false
    
    const tab = tabs.value[index]
    
    // Check if tab has unsaved changes
    if (tab && tab.isDirty) {
      if (!window.electronAPI?.showMessageBox) {
        console.warn('showMessageBox not available')
        return false
      }

      const isReadonlyDirty = isTabReadonly(tab)
      const isFileReadonlyDirty = isFileReadonly(tab)
      const result = await window.electronAPI.showMessageBox({
        message: t('dialog.saveChanges.message', { name: tab.name }),
        type: 'question',
        buttons: [
          isFileReadonlyDirty
            ? t('dialog.saveChanges.saveAs')
            : isReadonlyDirty
              ? t('dialog.saveChanges.disableReadonlyAndSave')
              : t('dialog.saveChanges.save'),
          t('dialog.saveChanges.dontSave'),
          t('dialog.saveChanges.cancel'),
        ],
        defaultId: 0,
        title: t('dialog.saveChanges.title'),
        detail: isReadonlyDirty
          ? isFileReadonlyDirty
            ? t('dialog.saveChanges.detailFileReadonly')
            : t('dialog.saveChanges.detailTabReadonly')
          : t('dialog.saveChanges.detailDefault'),
        cancelId: 2
      })

      switch (result.response) {
        //'save' or 'save as'
        case 0:
          if (isReadonlyDirty && !isFileReadonlyDirty) {
            tab.editReadonly = false
            syncReadonlyWindowState(tab)
          }
          if (await saveTab(tab, isFileReadonlyDirty) === false) {
            return false // If save failed, don't close the tab
          }
          break
        // 'dontSave'
        case 1:
          // User chose not to save, continue closing
          break
        // 'cancel'
        case 2:
          // User cancelled, don't close the tab
          return false
        default:
          return false
      }
    }

    // Remove the tab
    if (tab?.path) {
      const normalizedTabPath = pathUtils.normalize(tab.path)
      ignoredExternalChangePaths.delete(normalizedTabPath)
      externalChangePromptPaths.delete(normalizedTabPath)
      suspiciousEmptyExternalChangeRetries.delete(normalizedTabPath)
    }
    tabs.value.splice(index, 1)
    
    // If closing active tab, activate another tab
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newActiveIndex = Math.min(index, tabs.value.length - 1)
        if (tabs.value[newActiveIndex]) {
          activeTabId.value = tabs.value[newActiveIndex].id
          tabs.value[newActiveIndex].isActive = true
          return true
        }
      }
      activeTabId.value = null
    }
    
    return true
  }
  
  async function closeAllTab(): Promise<boolean> {
    let result: boolean = true

    const tabIds = tabs.value.map(tab => tab.id)
    for (const tabId of tabIds) {
      const closeResult = await closeTab(tabId)
      if (closeResult === false) {
        result = false
        break
      }
    }

    return result
  }

  async function closeOtherTabs(keepTabId: string): Promise<boolean> {
    const ids = tabs.value.filter(t => t.id !== keepTabId).map(t => t.id)
    for (const id of ids) {
      if (await closeTab(id) === false) return false
    }
    return true
  }

  async function closeSavedTabs(): Promise<boolean> {
    const ids = tabs.value.filter(t => !t.isDirty).map(t => t.id)
    for (const id of ids) {
      if (await closeTab(id) === false) return false
    }
    return true
  }

  function setActiveTab(tabId: string) {
    const currentActiveTab = activeTab.value
    if (currentActiveTab && canRunAutoSave(currentActiveTab)) {
      saveTab(currentActiveTab, false, true)
    }
    tabs.value.forEach(tab => {
      tab.isActive = tab.id === tabId
    })
    activeTabId.value = tabId
  }
  
  function getFileNameFromTabContent(tab: FileTab): string {
    const defaultName = tab.name || `Untitled.${TEXT_IWT_EXTENSION}`

    if (!tab.editorInstance) return defaultName

    const editor = tab.editorInstance as import('@tiptap/core').Editor
    const json = editor.getJSON()
    const nodes = json.content ?? []

    // Find first heading or paragraph with non-empty text
    for (const node of nodes) {
      if (node.type === 'heading' || node.type === 'paragraph') {
        const text = (node.content ?? [])
          .filter((n: Record<string, unknown>) => n['type'] === 'text')
          .map((n: Record<string, unknown>) => (n['text'] as string | undefined) ?? '')
          .join('')
          .trim()
        if (text) {
          // Sanitize: remove characters not safe for filenames
          const safe = text.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 20)
          if (safe) {
            const ext = pathUtils.extension(defaultName)
            return ext ? `${safe}.${ext}` : safe
          }
        }
      }
    }

    return defaultName
  }

  async function saveTab(tab: FileTab, saveAs: boolean = false, silent: boolean = false): Promise<boolean> {
    if (!tab || !window.electronAPI) return false
    if (isFileReadonly(tab) && !saveAs) {
      if (!silent) {
        notify.warning(t('notify.readonly.fileReadonlyMessage'), t('notify.readonly.fileReadonlyContext'))
      }
      return false
    }
    if (isEditReadonly(tab) && !saveAs) {
      if (!silent) {
        notify.warning(t('notify.readonly.tabReadonlyMessage'), t('notify.readonly.tabReadonlyContext'))
      }
      return false
    }
    
    try {
      let originalPath: string | undefined = tab.path
      if (saveAs === true || !originalPath) {
        const fileName = getFileNameFromTabContent(tab)
        const defaultPath = !originalPath ? (currentFolder.value ? currentFolder.value + '/' + fileName : fileName) : originalPath
        const defaultExt = pathUtils.extension(defaultPath).toLowerCase()
        const specificFilters = [
          { name: 'iWriter Files', extensions: [...TEXT_IWT_EXTENSIONS] },
          { name: 'Markdown Files', extensions: [...TEXT_MD_EXTENSIONS] },
          { name: 'Text Files', extensions: [...TEXT_TXT_EXTENSIONS] },
        ]
        const matchIndex = specificFilters.findIndex(f => (f.extensions as string[]).includes(defaultExt))
        if (matchIndex > 0) specificFilters.unshift(specificFilters.splice(matchIndex, 1)[0]!)
        const result = await window.electronAPI.showSaveDialog({
          defaultPath,
          filters: [...specificFilters, { name: 'All Files', extensions: [...TEXT_EXTENSIONS] }]
        })
        if (!result.canceled && result.filePath) {
          originalPath = result.filePath
        } else {
          return false
        }
      }

      if (originalPath != null) {
        const content = convertContentTo(
          tab.editorInstance as import('@tiptap/core').Editor,
          pathUtils.extension(originalPath),
          tab.editState?.lineEnding ?? 'LF'
        )
        if (content === null) {
          throw new Error('Unsupport file format')
        }
        const expectedHash = saveAs ? undefined : tab.lastSavedHash

        const result = await window.electronAPI.saveFile(content, originalPath, { expectedHash })

        if (result === true) {
          const savedHash = buildSavedHash(content)
          tab.path = originalPath
          tab.isDirty = false
          tab.fileReadonly = false
          tab.editReadonly = false
          tab.lastSavedHash = savedHash
          tab.diskState = 'normal'
          syncReadonlyWindowState(tab)
          tab.name = pathUtils.basename(originalPath)
          tab.savedCheckPoint = undoDepth((tab.editorInstance as import('@tiptap/core').Editor).state)
          const normalizedPath = pathUtils.normalize(originalPath)
          ignoredExternalChangePaths.delete(normalizedPath)
          externalChangePromptPaths.delete(normalizedPath)
          suspiciousEmptyExternalChangeRetries.delete(normalizedPath)

          if (!silent) {
            notify.success(t('notify.file.saveSuccess', { path: originalPath }), t('notify.file.operation'))
          }
          if (isWorkspaceDeleted.value && currentFolder.value && isPathInsideWorkspace(originalPath, currentFolder.value)) {
            await checkWorkspaceDirectoryRestored(!silent)
          }
          return true
        }
      }
    } catch(error) {
      if (isFileContentChangedOnDiskError(error)) {
        tab.diskState = 'external-modified'
        notify.warning(t('notify.file.externalModifiedSaveBlocked'), t('notify.file.saveError'))
        return false
      }

      notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.saveError'))
    }

    return false 
  }

  async function saveActiveTab() {
    if (!activeTab.value || !window.electronAPI) return
    
    saveTab(activeTab.value)
  }

  async function saveActiveTabAs() {
    if (!activeTab.value || !window.electronAPI) return
    
    saveTab(activeTab.value, true)
  }
  
  // 或者使用 Promise.all（但要处理对话框冲突）
  async function saveAllTabs() {
    const dirtyTabs = tabs.value.filter(tab => tab.isDirty)
    let blockedReadonlyCount = 0
    let savedCount = 0

    // 分别处理有路径和无路径的文件
    const tabsWithPath = dirtyTabs.filter(tab => tab.path)
    const tabsWithoutPath = dirtyTabs.filter(tab => !tab.path)

    // 先保存有路径的文件（不需要对话框）
    const saveResults = await Promise.all(tabsWithPath.map(tab => saveTab(tab)))
    saveResults.forEach((saved, index) => {
      if (saved) {
        savedCount += 1
      } else if (isTabReadonly(tabsWithPath[index])) {
        blockedReadonlyCount += 1
      }
    })

    // 然后顺序保存无路径的文件（需要对话框）
    for (const tab of tabsWithoutPath) {
      const saved = await saveTab(tab)
      if (saved) {
        savedCount += 1
      } else if (isTabReadonly(tab)) {
        blockedReadonlyCount += 1
      }
    }

    if (blockedReadonlyCount > 0) {
      notify.warning(
        t('notify.tab.saveAllPartial', { saved: savedCount, blocked: blockedReadonlyCount }),
        t('notify.tab.saveAllContext')
      )
    }
  }

  function updateTabState(tabId: string, updates: Partial<FileTab>) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      // Toc providers are class instances. Deep-merging them corrupts their internal shape
      // when switching between provider implementations (for example PDF -> Markdown).
      if (Object.prototype.hasOwnProperty.call(updates, 'tocProvider') && tab.tocProvider !== updates.tocProvider) {
        tab.tocProvider?.destroy()
      }

      const { editState, ...otherUpdates } = updates

      if (editState) {
        tab.editState = {
          ...tab.editState,
          ...editState
        }
      }

      Object.assign(tab, otherUpdates)
    }
  }

  function cleanTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab?.tocProvider) {
      tab.tocProvider.destroy()
      tab.tocProvider = undefined
    }
    if (tab?.editorInstance) {
      tab.editorInstance = undefined
    }
  }

  // Theme System Functions
  function initTheme() {
    systemPrefersDark.value = getSystemPrefersDark()

    if (typeof window.matchMedia === 'function') {
      systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      systemThemeChangeHandler = (event: MediaQueryListEvent) => {
        systemPrefersDark.value = event.matches
        if (currentThemeId.value === 'system') {
          applyCurrentTheme()
        }
      }

      if (typeof systemThemeMediaQuery.addEventListener === 'function') {
        systemThemeMediaQuery.addEventListener('change', systemThemeChangeHandler)
      } else {
        systemThemeMediaQuery.addListener(systemThemeChangeHandler)
      }
    }

    applyCurrentTheme()
  }

  function setTheme(themeId: string) {
    const theme = getThemeById(themeId)
    if (!theme) {
      notify.error(t('notify.theme.notFound', { themeId }), t('notify.theme.settingsError'))
      return
    }

    currentThemeId.value = themeId
    // StateStorage 会通过 watch 自动保存，不需要手动保存
    applyCurrentTheme()
  }

  function setLocale(nextLocale: string) {
    const normalized = resolveLocale(nextLocale)
    locale.value = normalized
    setAppLocale(normalized)
  }
  
  function applyCurrentTheme() {
    applyThemeSelection(currentThemeId.value, systemPrefersDark.value)
  }
  
  function getCurrentTheme(): ThemeOption | undefined {
    return getThemeById(currentThemeId.value)
  }
  
  function getAvailableThemes(): ThemeOption[] {
    return availableThemes
  }

  function openPreferences(tab: PreferencesTab = 'editor') {
    preferencesInitialTab.value = tab
    showPreferencesDialog.value = true
  }

  function closePreferences() {
    showPreferencesDialog.value = false
  }

  function openPrintPreview(
    html: string,
    title?: string,
    options?: { mode?: 'print' | 'export'; defaultSavePath?: string; skipSaveDialog?: boolean },
    profile: 'markdown' | 'image' = 'markdown',
    imageRotation = 0,
  ) {
    printPreviewSource.value = { kind: 'html' }
    printPreviewProfile.value = profile
    printPreviewImageRotation.value = imageRotation
    printPreviewHtml.value = html
    const activeTab = tabs.value.find(tab => tab.id === activeTabId.value)
    const previewTitle = title ?? activeTab?.name ?? 'Untitled'
    printPreviewTitle.value = pathUtils.basename(previewTitle, pathUtils.extension(previewTitle))
    printPreviewMode.value = options?.mode ?? 'print'
    printPreviewDefaultSavePath.value = options?.defaultSavePath ?? ''
    printPreviewSkipSaveDialog.value = options?.skipSaveDialog === true
    showPrintPreviewDialog.value = true
  }

  function openPdfPrintPreview(filePath: string, numPages: number, title?: string) {
    printPreviewSource.value = { kind: 'pdf', filePath, numPages }
    printPreviewHtml.value = ''
    const activeTab = tabs.value.find(tab => tab.id === activeTabId.value)
    const previewTitle = title ?? activeTab?.name ?? 'Untitled'
    printPreviewTitle.value = pathUtils.basename(previewTitle, pathUtils.extension(previewTitle))
    printPreviewMode.value = 'print'
    printPreviewDefaultSavePath.value = ''
    printPreviewSkipSaveDialog.value = false
    showPrintPreviewDialog.value = true
  }

  function openImagePrintPreview(
    filePath: string,
    rotation: number,
    title?: string,
    options?: { mode?: 'print' | 'export'; defaultSavePath?: string; skipSaveDialog?: boolean },
  ) {
    // Produce a minimal HTML body; CSS is built per-render in PrintDialog via buildImagePrintCss.
    const normalised = filePath.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, (_, d: string) => `/${d}`)
    const imgHtml = `<div class="iw-image-page"><img class="iw-print-image" src="file://${normalised}" /></div>`
    openPrintPreview(imgHtml, title, options, 'image', rotation)
  }

  function closePrintPreview() {
    showPrintPreviewDialog.value = false
    printPreviewSource.value = null
    printPreviewHtml.value = ''
    printPreviewTitle.value = ''
    printPreviewMode.value = 'print'
    printPreviewDefaultSavePath.value = ''
    printPreviewSkipSaveDialog.value = false
    printPreviewProfile.value = 'markdown'
    printPreviewImageRotation.value = 0
  }

  // Handle menu actions for the application
  // There are Paragraph / Format Menu Actions handled in MarkdownEditor.vue
  async function handleMenuAction(action: string): Promise<boolean> {
    switch (action) {
      // File Menu Actions
      case 'new-file':
        createOrActivateTab(undefined, undefined, DocumentType.MARKDOWN_EDITOR)
        return true
      case 'new-from-template':
        notify.error(`${action}`, t('notify.menu.notImplemented'))
        return true
      case 'open-file':
        await openFileDialog()
        return true
      case 'open-folder':
        await openFolder()
        return true
      case 'import-document':
        await importWithPandoc()
        return true
      case 'save':
        await saveActiveTab()
        return true
      case 'save-as':
        await saveActiveTabAs()
        return true
      case 'toggle-auto-save':
        toggleAutoSave()
        return true
      case 'save-all':
        await saveAllTabs()
        return true
      case 'export-pdf':
        if (activeTab.value?.documentType === DocumentType.MARKDOWN_EDITOR && activeTab.value.editorInstance) {
          const baseName = (activeTab.value.path ? pathUtils.basename(activeTab.value.path) : activeTab.value.name).replace(/\.[^.]+$/, '')
          const preferredDirectory = getPreferredExportDirectory(activeTab.value)
          const skipSaveDialog =
            (globalExportSetting.common.defaultFolderMode === 'same-directory' && !!preferredDirectory) ||
            (globalExportSetting.common.defaultFolderMode === 'custom' && !!preferredDirectory)
          const defaultSavePath = preferredDirectory ? pathUtils.join(preferredDirectory, `${baseName}.pdf`) : `${baseName}.pdf`
          openPrintPreview(
            (activeTab.value.editorInstance as import('@tiptap/core').Editor).getHTML(),
            activeTab.value.name,
            { mode: 'export', defaultSavePath, skipSaveDialog }
          )
        }
        return true
      case 'export-html':
        await exportWithPandoc('html')
        return true
      case 'export-word':
        await exportWithPandoc('docx')
        return true
      case 'export-odt':
        await exportWithPandoc('odt')
        return true
      case 'export-rtf':
        await exportWithPandoc('rtf')
        return true
      case 'export-epub':
        await exportWithPandoc('epub')
        return true
      case 'export-latex':
        await exportWithPandoc('tex')
        return true
      case 'export-mediawiki':
        await exportWithPandoc('mediawiki')
        return true
      case 'export-rst':
        await exportWithPandoc('rst')
        return true
      case 'export-textile':
        await exportWithPandoc('textile')
        return true
      case 'export-opml':
        await exportWithPandoc('opml')
        return true
      case 'export-more-options':
        await exportWithPandoc()
        return true
      case 'close-file':
        if (activeTabId.value) {
          await closeTab(activeTabId.value)
        }
        return true
      case 'close-folder':
        closeFolder()
        return true
      
      // Edit Menu Actions

      // View Menu Actions
      case 'view-toggle-readonly':
        await toggleReadonlyMode()
        return true
      case 'view-toggle-focus-mode':
        toggleFocusMode()
        return true
      case 'view-toggle-typewriter-mode':
        toggleTypewriterMode()
        return true
      case 'view-editor-page-fixed-768':
        setMarkdownEditorPageMode('fixed-768')
        return true
      case 'view-editor-page-fixed-1024':
        setMarkdownEditorPageMode('fixed-1024')
        return true
      case 'view-editor-page-fixed-1280':
        setMarkdownEditorPageMode('fixed-1280')
        return true
      case 'view-editor-page-fluid':
        setMarkdownEditorPageMode('fluid')
        return true
      case 'view-explorer':
      case 'view-search':
      case 'view-tag':
      case 'view-toc':
        const mode = action.replace('view-', '') as keyof typeof SidebarMode
        setLeftSidebarMode(SidebarMode[mode.toUpperCase() as keyof typeof SidebarMode])
        return true
      case 'view-toggle-clean-mode':
        toggleCleanMode()
        return true
      case 'view-toggle-right-sidebar':
        toggleRightSidebar()
        return true

      case 'view-toggle-left-sidebar':
        toggleLeftSidebar()
        return true
      case 'view-toggle-statusbar':
        toggleStatusbar()
        return true
      case 'view-theme-follow-system':
        setTheme('system')
        return true
      case 'check-update':
        try {
          await updaterService.checkForUpdates()
        } catch (error) {
          notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.update.checkFailed'))
        }
        return true
      
      case 'auto-update-settings':
        // handled by MainView (opens PreferencesDialog → Updates tab)
        return false
      
      case 'help-changelog':
        try {
          updaterService.openReleaseNotes()
        } catch (error) {
          console.error('Error opening changelog:', error)
          window.electronAPI?.openWithShell?.('https://github.com/map9/iWriter/releases')
        }
        return true
      
      default:
        if (action.startsWith('open-path:')) {
          await openFile(action.slice('open-path:'.length))
          return true
        }

        if (action.startsWith('view-theme-')) {
          const theme = action.replace('view-theme-', '') as string
          setTheme(theme.toLowerCase())
          return true
        }

        return false
    }
  }

  // ===== 状态监听 =====

  // 监听 UI 状态变化（除了 leftSidebarWidth）
  watch(
    [isLeftSidebarVisible, isRightSidebarVisible, isStatusbarVisible, leftSidebarMode, isCleanMode],
    () => {
      saveUIState()
    }
  )

  watch([isFocusMode, isTypewriterMode, markdownEditorPageMode], () => saveUIState())

  // leftSidebarWidth / rightSidebarWidth 单独监听（拖拽时频繁变化，需要防抖）
  watch(leftSidebarWidth, () => saveUIState())
  watch(rightSidebarWidth, () => saveUIState())

  // 监听编辑设置变化
  watch(globalEditSetting, () => saveEditSettingDebounced(), { deep: true })
  watch(globalExportSetting, () => StateStorage.saveExportSetting(globalExportSetting), { deep: true })
  watch(globalMarkdownPrintSetting, () => StateStorage.saveMarkdownPrintSetting(globalMarkdownPrintSetting), { deep: true })
  watch([() => globalEditSetting.workspaceIgnoreRules, () => globalEditSetting.useGitignoreAsWorkspaceIgnore], () => {
    reloadWorkspaceFiltersDebounced()
  })
  watch([autoSaveEnabled, autoSaveIntervalSeconds], () => saveAutoSaveDebounced())

  // 监听主题变化
  watch(currentThemeId, (themeId) => {
    StateStorage.saveTheme(themeId)
  })

  watch(locale, (value) => {
    StateStorage.saveLocale(value)
  })

  // 监听工作区状态变化（使用计算属性）
  const workspaceStateSnapshot = computed(() => {
    const tabsData = tabs.value
      .filter(tab => tab.path)
      .map(tab => ({
        path: tab.path!,
        documentType: tab.documentType
      }))

    return {
      currentFolder: currentFolder.value,
      tabs: tabsData,
      activeTabPath: activeTab.value?.path || null
    }
  })

  watch(
    workspaceStateSnapshot,
    (newState) => {
      // 只在允许持久化时才保存状态
      if (shouldPersistState.value) {
        saveWorkspaceStateDebounced(newState)
      }
    },
    { deep: true }
  )

  const openDocumentWatchSnapshot = computed(() => ({
    currentFolder: currentFolder.value,
    paths: tabs.value
      .map(tab => tab.path ? pathUtils.normalize(tab.path) : null)
      .filter((path): path is string => !!path)
      .sort(),
  }))

  watch(
    openDocumentWatchSnapshot,
    () => {
      void syncOpenDocumentWatchers()
    },
    { deep: true }
  )

  return {
    // State
    isLeftSidebarVisible,
    isRightSidebarVisible,
    isStatusbarVisible,
    isCleanMode,
    isFocusMode,
    isTypewriterMode,
    markdownEditorPageMode,
    showPreferencesDialog,
    preferencesInitialTab,
    leftSidebarMode,
    searchFolderPath,
    searchIncludePattern,
    searchExcludePattern,
    searchRequestKey,
    leftSidebarWidth,
    minSidebarWidth,
    rightSidebarWidth,
    minRightSidebarWidth,
    currentThemeId,
    locale,
    systemPrefersDark,
    globalEditSetting,
    globalExportSetting,
    globalMarkdownPrintSetting,
    autoSaveEnabled,
    autoSaveIntervalSeconds,
    currentFolder,
    workspaceStatus,
    fileTree,
    selectedItem,
    currentFileTreeSortType,
    tabs,
    activeTabId,

    // Computed
    activeTab,
    hasOpenFolder,
    isWorkspaceDeleted,
    canUseWorkspaceFeatures,
    autoSave,
    autoSaveDelayMs,
    isFileReadonly,
    isEditReadonly,
    isTabReadonly,
    canEditTab,
    canSaveTab,
    canRunAutoSave,
    canRunProofread,

    initial,
    destroy,

    // Actions
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleStatusbar,
    setCleanMode,
    toggleCleanMode,
    setFocusMode,
    toggleFocusMode,
    toggleReadonlyMode,
    setTypewriterMode,
    toggleTypewriterMode,
    setMarkdownEditorPageMode,
    setLeftSidebarMode,
    searchInFolder,
    searchInWorkspace,
    setLeftSidebarWidth,
    setRightSidebarWidth,
    toggleAutoSave,
    setAutoSaveIntervalSeconds,
    updateWindowTitle,

    // Theme actions
    initTheme,
    setTheme,
    setLocale,
    applyCurrentTheme,
    getCurrentTheme,
    getAvailableThemes,
    openPreferences,
    closePreferences,
    showPrintPreviewDialog,
    printPreviewSource,
    printPreviewHtml,
    printPreviewTitle,
    printPreviewMode,
    printPreviewDefaultSavePath,
    printPreviewSkipSaveDialog,
    openPrintPreview,
    openPdfPrintPreview,
    openImagePrintPreview,
    closePrintPreview,
    printPreviewProfile,
    printPreviewImageRotation,

    // File operations
    openFile,
    openFileAt,
    openFolder,
    closeFolder,
    rebuildWorkspaceDirectory,
    checkWorkspaceDirectoryRestored,
    loadFileTree,
    sortFileTreeNodes,
    queryFileTreeNodes,
    setSelectedItem,
    openFileDialog,
    CreateFileOrFolder,
    deleteFileOrFolder,
    renameFileOrFolder,
    moveFileOrFolder,
    copyFileOrFolder,
    startAdvancedFileWatching,
    stopAdvancedFileWatching,
    findNodeByPath,

    // Tab operations
    findExistingTab,
    createTab,
    createOrActivateTab,
    moveTab,
    closeTab,
    closeAllTab,
    closeOtherTabs,
    closeSavedTabs,
    saveTab,
    setActiveTab,
    saveActiveTab,
    saveActiveTabAs,
    saveAllTabs,
    cleanTab,
    updateTabState,

    // Office operations
    importOfficeToMarkdown,
    getConfiguredSofficePath,

    // Menu actions
    handleMenuAction,
  }
})
