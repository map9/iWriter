import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { ElectronAPI, HtmlPrintReadyOptions, PdfSaveOptions, SaveFileOptions } from '../src/types/electron-api'
import type { SendMessageRequest, CompactInputRequest, CompactInputResponse, SessionContextStatsResponse, ResumeRunRequest, SnapshotResponse, StreamChunkEvent, RunInterruptedEvent, RunDoneEvent, RunErrorEvent, RunContextCompressedEvent, RunModelFallbackEvent, RunFilesystemAutoRejectEvent, SnapshotRequestEvent } from '../src/types/ai-ipc'
import type { AiSettings } from '../src/types/ai'
import { createAppMenuRequest, createContextMenuRequest } from '../src/types/menu'
import type { ContextMenuItem, MenuPosition } from '../src/types/menu'
import type { FileChange } from '../src/types/file-operation'
import type { WindowContentState } from '../src/types/window-content-state'
import type { PandocAvailabilityResult, PandocImportRequest, PandocImportResult, PandocExportRequest, PandocExportResult } from '../src/types/pandoc'
import type { LibreOfficeAvailabilityResult, OfficeConvertRequest, OfficeConvertResult } from '../src/types/libreoffice'
import type { UpdaterConfig, UpdaterStateMessage } from '../src/updater/types'

const electronAPI: ElectronAPI = {
  platform: process.platform,

  // alive monitoring
  hello: (windowId: number) => ipcRenderer.send('hello', windowId),
  onWindowId: (callback: (windowId: number) => void) => {
    ipcRenderer.on('window-id', (_, windowId) => callback(windowId))
  },
  removeWindowIdListeners: () => {
    ipcRenderer.removeAllListeners('window-id')
  },

  // Window Close Confirmation
  windowCloseConfirm: (windowId: number, canClose: boolean) => ipcRenderer.send('window-close-confirm', windowId, canClose),
  // Request Window Close Confirmation
  onRequestWindowClose: (callback: (windowId: number) => void) => {
    ipcRenderer.on('request-window-close', (_, windowId) => callback(windowId))
  },
  removeRequestWindowCloseListeners: () => {
    ipcRenderer.removeAllListeners('request-window-close')
  },

  // File operations
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  readFileSilent: (filePath: string) => ipcRenderer.invoke('read-file-silent', filePath),
  readFileBinary: (filePath: string) => ipcRenderer.invoke('read-file-binary', filePath),
  saveFile: (content: string, filePath?: string, options?: SaveFileOptions) =>
    ipcRenderer.invoke('save-file', content, filePath, options),

  pathExists: (filePath: string) => ipcRenderer.invoke('path-exists', filePath),
  ensureDirectory: (folderPath: string) => ipcRenderer.invoke('ensure-directory', folderPath),
  getFiles: (folderPath: string, onlyself?: boolean) => ipcRenderer.invoke('get-files', folderPath, onlyself),
  revealInFolder: (path: string) => ipcRenderer.invoke('reveal-in-folder', path),
  openWithShell: (path: string) => ipcRenderer.invoke('open-with-shell', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  
  showOpenDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  }) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  }) => ipcRenderer.invoke('show-save-dialog', options),
  showMessageBox: (options: {
    message: string,
    type?: string,
    buttons?: string[],
    defaultId?: number,
    title?: string,
    detail: string,
    checkboxLabel?: string,
    checkboxChecked?: boolean,
    cancelId?: number,
    noLink?: boolean
  }) => ipcRenderer.invoke('show-message-box', options),

  createFile: (folderPath: string, fileName: string) => 
    ipcRenderer.invoke('create-file', folderPath, fileName),
  createFolder: (parentPath: string, folderName: string) => 
    ipcRenderer.invoke('create-folder', parentPath, folderName),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  renameFile: (oldPath: string, newName: string) => 
    ipcRenderer.invoke('rename-file', oldPath, newName),
  moveFile: (sourcePath: string, targetDir: string, conflictAction?: 'keepBoth' | 'replace' | 'cancel') => 
    ipcRenderer.invoke('move-file', sourcePath, targetDir, conflictAction),
  copyFile: (sourcePath: string, targetDir: string) =>
    ipcRenderer.invoke('copy-file', sourcePath, targetDir),
  
  // File watching
  startFileWatching: (folderPath: string, options?: { depth?: number; ignoreRulesText?: string }) => ipcRenderer.invoke('start-file-watching', folderPath, options),
  stopFileWatching: (folderPath: string) => ipcRenderer.invoke('stop-file-watching', folderPath),
  stopAllFileWatching: () => ipcRenderer.invoke('stop-all-file-watching'),
  getFileWatchingStatus: () => ipcRenderer.invoke('get-file-watching-status'),
  
  // File change events
  onFileChange: (callback: (change: FileChange) => void) => {
    ipcRenderer.on('file-change', (_, change) => callback(change))
  },
  onFileWatchError: (callback: (error: { message: string; path: string; timestamp: Date }) => void) => {
    ipcRenderer.on('file-watch-error', (_, error) => callback(error))
  },
  removeFileChangeListeners: () => {
    ipcRenderer.removeAllListeners('file-change')
    ipcRenderer.removeAllListeners('file-watch-error')
  },

  // Context menu
  showContextMenu: (menuItems: ContextMenuItem[], position: { x: number; y: number }) =>
    ipcRenderer.invoke('show-menu', createContextMenuRequest(menuItems, position)),
  showAppMenu: (position: MenuPosition) =>
    ipcRenderer.invoke('show-menu', createAppMenuRequest(position)).then(() => undefined),

  // Shell execution (read-only commands only)
  execShell: (command: string, cwd?: string) =>
    ipcRenderer.invoke('exec-shell', command, cwd),
  formatCode: (code: string, language?: string | null) =>
    ipcRenderer.invoke('format-code', { code, language }),
  pandocCheck: (req?: { pandocPath?: string }): Promise<PandocAvailabilityResult> => ipcRenderer.invoke('pandoc:check', req),
  pandocImportFile: (req: PandocImportRequest): Promise<PandocImportResult> => ipcRenderer.invoke('pandoc:import-file', req),
  pandocExportFile: (req: PandocExportRequest): Promise<PandocExportResult> => ipcRenderer.invoke('pandoc:export-file', req),

  officeCheck: (req?: { sofficePath?: string }): Promise<LibreOfficeAvailabilityResult> => ipcRenderer.invoke('office:check', req),
  officeConvertToPdf: (req: OfficeConvertRequest): Promise<OfficeConvertResult> => ipcRenderer.invoke('office:convert', req),

  git: {
    detect: () => ipcRenderer.invoke('git:detect'),
    isRepo: (root: string) => ipcRenderer.invoke('git:is-repo', root),
    init: (root: string) => ipcRenderer.invoke('git:init', root),
    status: (root: string) => ipcRenderer.invoke('git:status', root),
    branches: (root: string) => ipcRenderer.invoke('git:branches', root),
    diff: (root: string, filePath: string, opts: { staged: boolean }) => ipcRenderer.invoke('git:diff', root, filePath, opts),
    log: (root: string, opts: { filePath?: string; allBranches?: boolean; limit?: number; skip?: number }) => ipcRenderer.invoke('git:log', root, opts),
    commitFiles: (root: string, hash: string) => ipcRenderer.invoke('git:commit-files', root, hash),
    commitFileDiff: (root: string, hash: string, filePath: string) => ipcRenderer.invoke('git:commit-file-diff', root, hash, filePath),
    stage: (root: string, paths: string[]) => ipcRenderer.invoke('git:stage', root, paths),
    unstage: (root: string, paths: string[]) => ipcRenderer.invoke('git:unstage', root, paths),
    stageAll: (root: string) => ipcRenderer.invoke('git:stage-all', root),
    unstageAll: (root: string) => ipcRenderer.invoke('git:unstage-all', root),
    discard: (root: string, paths: string[]) => ipcRenderer.invoke('git:discard', root, paths),
    commit: (root: string, message: string, opts: { all?: boolean; amend?: boolean }) => ipcRenderer.invoke('git:commit', root, message, opts),
    identityGet: (root: string) => ipcRenderer.invoke('git:identity-get', root),
    identitySet: (root: string, name: string, email: string, global: boolean) => ipcRenderer.invoke('git:identity-set', root, name, email, global),
    checkout: (root: string, ref: string) => ipcRenderer.invoke('git:checkout', root, ref),
    createBranch: (root: string, name: string, base?: string, checkout?: boolean) => ipcRenderer.invoke('git:create-branch', root, name, base, checkout),
    deleteBranch: (root: string, name: string, force: boolean) => ipcRenderer.invoke('git:delete-branch', root, name, force),
    addToGitignore: (root: string, relPath: string) => ipcRenderer.invoke('git:add-to-gitignore', root, relPath),
    clone: (url: string, dir: string) => ipcRenderer.invoke('git:clone', url, dir),
    fetch: (root: string) => ipcRenderer.invoke('git:fetch', root),
    pull: (root: string, opts: { rebase?: boolean }) => ipcRenderer.invoke('git:pull', root, opts),
    push: (root: string, opts: { setUpstream?: boolean }) => ipcRenderer.invoke('git:push', root, opts),
    sync: (root: string, opts: { rebase?: boolean }) => ipcRenderer.invoke('git:sync', root, opts),
    publish: (root: string) => ipcRenderer.invoke('git:publish', root),
  },

  // Clipboard
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  writeClipboardText: (text: string): Promise<void> => ipcRenderer.invoke('write-clipboard-text', text),

  // Shell: open external URL in default browser
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  resolveImageUrl: (url: string) => ipcRenderer.invoke('resolve-image-url', url),

  // Menu actions
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_, action) => callback(action))
  },
  removeMenuActionListener: (listener?: unknown) => {
    if (typeof listener === 'function') {
      ipcRenderer.removeListener('menu-action', listener as (event: IpcRendererEvent, ...args: unknown[]) => void)
    } else {
      ipcRenderer.removeAllListeners('menu-action')
    }
  },
  
  // Window state changes
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => {
    ipcRenderer.on('window-state-changed', (_, state) => callback(state))
  },
  removeWindowStateChangedListeners: () => {
    ipcRenderer.removeAllListeners('window-state-changed')
  },
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  getWindowMaximized: () => ipcRenderer.invoke('get-window-maximized'),
  getWindowFullscreen: () => ipcRenderer.invoke('get-window-fullscreen'),
  setWindowFullscreen: (enabled: boolean) => ipcRenderer.invoke('set-window-fullscreen', enabled),
  
  // Menu state updates
  bootstrapWindowLocale: (locale: string) => ipcRenderer.invoke('window-bootstrap-locale', locale),
  windowContentChange: (wContentState: Partial<WindowContentState>) => ipcRenderer.invoke('window-content-changed', wContentState),
  updateWindowTitle: (title: string) => ipcRenderer.invoke('update-window-title', title),

  // Updater API
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download-update'),
  installUpdate: () => ipcRenderer.invoke('updater:install-update'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:get-status'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  getUpdaterConfig: () => ipcRenderer.invoke('updater:get-config'),
  setUpdaterConfig: (config: Partial<UpdaterConfig>) => ipcRenderer.invoke('updater:set-config', config),
  
  // Updater events
  onUpdaterStateChanged: (callback: (stateMessage: UpdaterStateMessage) => void) => {
    ipcRenderer.on('updater:state-changed', (_, stateMessage) => callback(stateMessage))
  },
  removeUpdaterListeners: () => {
    ipcRenderer.removeAllListeners('updater:state-changed')
  },

  // Print API
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printFromHtml: (htmlContent: string, printOptions?: Electron.WebContentsPrintOptions, readyOptions?: HtmlPrintReadyOptions) => ipcRenderer.invoke('print-from-html', htmlContent, printOptions, readyOptions),
  printPdfFile: (filePath: string, printOptions?: Electron.WebContentsPrintOptions) => ipcRenderer.invoke('print-pdf-file', filePath, printOptions),
  saveToPdfFromHtml: (htmlContent: string, printOptions?: Electron.PrintToPDFOptions, saveOptions?: PdfSaveOptions) => ipcRenderer.invoke('save-to-pdf-from-html', htmlContent, printOptions, saveOptions),

  // ── Custom Markdown Themes ────────────────────────────────────────────────
  customThemes: {
    load: () => ipcRenderer.invoke('custom-themes:load'),
    openFolder: () => ipcRenderer.invoke('custom-themes:open-folder'),
    createExample: () => ipcRenderer.invoke('custom-themes:create-example'),
    onChanged: (callback: (themes: unknown[]) => void) => {
      ipcRenderer.on('custom-themes:changed', (_, themes) => callback(themes))
    },
    removeChangedListeners: () => {
      ipcRenderer.removeAllListeners('custom-themes:changed')
    },
  },

  // ── AI Agent (main-process deepagents) ────────────────────────────────────
  aiSendMessage: (req: SendMessageRequest): Promise<{ threadId: string }> => ipcRenderer.invoke('ai:send-message', req),
  aiCompactInput: (req: CompactInputRequest): Promise<CompactInputResponse> => ipcRenderer.invoke('ai:compact-input', req),
  aiGetSessionContextStats: (req: CompactInputRequest): Promise<SessionContextStatsResponse> => ipcRenderer.invoke('ai:get-session-context-stats', req),
  aiCancel: (threadId: string) => ipcRenderer.invoke('ai:cancel', { threadId }),
  aiResume: (req: ResumeRunRequest) => ipcRenderer.invoke('ai:resume', req),
  aiGetConfig: () => ipcRenderer.invoke('ai:get-config'),
  aiUpdateConfig: (patch: Partial<AiSettings>) => ipcRenderer.invoke('ai:update-config', patch),
  aiGetThreads: () => ipcRenderer.invoke('ai:get-threads'),
  aiDeleteThread: (threadId: string) => ipcRenderer.invoke('ai:delete-thread', { threadId }),
  aiClearThreads: () => ipcRenderer.invoke('ai:clear-threads'),
  aiGetThreadMessages: (threadId: string) => ipcRenderer.invoke('ai:get-thread-messages', { threadId }),
  // Renderer sends snapshot back to main (not an invoke — fire-and-forget)
  aiSnapshotResponse: (resp: SnapshotResponse) => ipcRenderer.send('ai:snapshot-response', resp),

  // Incoming events from main process
  onAiStreamChunk: (cb: (chunk: StreamChunkEvent) => void) => {
    ipcRenderer.on('ai:stream-chunk', (_, c) => cb(c))
  },
  /** New atomic interrupt event (replaces onAiInterruptReady). */
  onAiRunInterrupted: (cb: (e: RunInterruptedEvent) => void) => {
    ipcRenderer.on('ai:run-interrupted', (_, e) => cb(e))
  },
  onAiRunDone: (cb: (e: RunDoneEvent) => void) => {
    ipcRenderer.on('ai:run-done', (_, e) => cb(e))
  },
  onAiRunError: (cb: (e: RunErrorEvent) => void) => {
    ipcRenderer.on('ai:run-error', (_, e) => cb(e))
  },
  onAiRequestSnapshot: (cb: (req: SnapshotRequestEvent) => void) => {
    ipcRenderer.on('ai:request-snapshot', (_, r) => cb(r))
  },
  onAiContextCompressed: (cb: (e: RunContextCompressedEvent) => void) => {
    ipcRenderer.on('ai:context-compressed', (_, e) => cb(e))
  },
  onAiModelFallback: (cb: (e: RunModelFallbackEvent) => void) => {
    ipcRenderer.on('ai:model-fallback', (_, e) => cb(e))
  },
  onAiFilesystemAutoReject: (cb: (e: RunFilesystemAutoRejectEvent) => void) => {
    ipcRenderer.on('ai:filesystem-auto-reject', (_, e) => cb(e))
  },
  removeAiListeners: () => {
    ;[
      'ai:stream-chunk',
      'ai:run-interrupted',
      'ai:run-done',
      'ai:run-error',
      'ai:request-snapshot',
      'ai:context-compressed',
      'ai:model-fallback',
      'ai:filesystem-auto-reject',
    ].forEach(ch => ipcRenderer.removeAllListeners(ch))
  },

}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
