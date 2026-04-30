import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
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
  saveFile: (content: string, filePath?: string) => 
    ipcRenderer.invoke('save-file', content, filePath),

  pathExists: (filePath: string) => ipcRenderer.invoke('path-exists', filePath),
  getFiles: (folderPath: string, onlyself?: boolean) => ipcRenderer.invoke('get-files', folderPath, onlyself),
  revealInFolder: (path: string) => ipcRenderer.invoke('reveal-in-folder', path),
  openWithShell: (path: string) => ipcRenderer.invoke('open-with-shell', path),
  
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
  
  // File watching
  startFileWatching: (folderPath: string) => ipcRenderer.invoke('start-file-watching', folderPath),
  stopFileWatching: (folderPath: string) => ipcRenderer.invoke('stop-file-watching', folderPath),
  stopAllFileWatching: () => ipcRenderer.invoke('stop-all-file-watching'),
  getFileWatchingStatus: () => ipcRenderer.invoke('get-file-watching-status'),
  
  // File change events
  onFileChange: (callback: (change: any) => void) => {
    ipcRenderer.on('file-change', (_, change) => callback(change))
  },
  onFileWatchError: (callback: (error: any) => void) => {
    ipcRenderer.on('file-watch-error', (_, error) => callback(error))
  },
  removeFileChangeListeners: () => {
    ipcRenderer.removeAllListeners('file-change')
    ipcRenderer.removeAllListeners('file-watch-error')
  },

  // Context menu
  showContextMenu: (menuItems: any[], position: { x: number; y: number }) =>
    ipcRenderer.invoke('show-context-menu', menuItems, position),

  // Shell execution (read-only commands only)
  execShell: (command: string, cwd?: string) =>
    ipcRenderer.invoke('exec-shell', command, cwd),
  formatCode: (code: string, language?: string | null) =>
    ipcRenderer.invoke('format-code', { code, language }),

  // Clipboard
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),

  // Menu actions
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_, action) => callback(action))
  },
  removeMenuActionListener: (listener?: any) => {
    if (listener) {
      ipcRenderer.removeListener('menu-action', listener)
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
  
  // Menu state updates
  windowContentChange: (wContentState: any) => ipcRenderer.invoke('window-content-changed', wContentState),
  updateWindowTitle: (title: string) => ipcRenderer.invoke('update-window-title', title),

  // Updater API
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download-update'),
  installUpdate: () => ipcRenderer.invoke('updater:install-update'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:get-status'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  getUpdaterConfig: () => ipcRenderer.invoke('updater:get-config'),
  setUpdaterConfig: (config: any) => ipcRenderer.invoke('updater:set-config', config),
  
  // Updater events
  onUpdaterStateChanged: (callback: (stateMessage: any) => void) => {
    ipcRenderer.on('updater:state-changed', (_, stateMessage) => callback(stateMessage))
  },
  removeUpdaterListeners: () => {
    ipcRenderer.removeAllListeners('updater:state-changed')
  },

  // Print API
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  print: (options: any = {}) => ipcRenderer.invoke('print', options),
  printFromHtml: (htmlContent: string, printOptions?: any) => ipcRenderer.invoke('print-from-html', htmlContent, printOptions),
  saveToPdfFromHtml: (htmlContent: string, printOptions?: any, saveOptions?: any) => ipcRenderer.invoke('save-to-pdf-from-html', htmlContent, printOptions, saveOptions),

  // ── AI Agent (main-process deepagents) ────────────────────────────────────
  aiSendMessage: (req: any) => ipcRenderer.invoke('ai:send-message', req),
  aiCompactInput: (req: any) => ipcRenderer.invoke('ai:compact-input', req),
  aiGetSessionContextStats: (req: any) => ipcRenderer.invoke('ai:get-session-context-stats', req),
  aiCancel: (threadId: string) => ipcRenderer.invoke('ai:cancel', { threadId }),
  aiResume: (req: any) => ipcRenderer.invoke('ai:resume', req),
  aiGetConfig: () => ipcRenderer.invoke('ai:get-config'),
  aiUpdateConfig: (patch: any) => ipcRenderer.invoke('ai:update-config', patch),
  aiGetThreads: () => ipcRenderer.invoke('ai:get-threads'),
  aiDeleteThread: (threadId: string) => ipcRenderer.invoke('ai:delete-thread', { threadId }),
  aiClearThreads: () => ipcRenderer.invoke('ai:clear-threads'),
  aiGetThreadMessages: (threadId: string) => ipcRenderer.invoke('ai:get-thread-messages', { threadId }),
  // Renderer sends snapshot back to main (not an invoke — fire-and-forget)
  aiSnapshotResponse: (resp: any) => ipcRenderer.send('ai:snapshot-response', resp),

  // Incoming events from main process
  onAiStreamChunk: (cb: (chunk: any) => void) => {
    ipcRenderer.on('ai:stream-chunk', (_, c) => cb(c))
  },
  /** New atomic interrupt event (replaces onAiInterruptReady). */
  onAiRunInterrupted: (cb: (e: any) => void) => {
    ipcRenderer.on('ai:run-interrupted', (_, e) => cb(e))
  },
  onAiRunDone: (cb: (e: any) => void) => {
    ipcRenderer.on('ai:run-done', (_, e) => cb(e))
  },
  onAiRunError: (cb: (e: any) => void) => {
    ipcRenderer.on('ai:run-error', (_, e) => cb(e))
  },
  onAiRequestSnapshot: (cb: (req: any) => void) => {
    ipcRenderer.on('ai:request-snapshot', (_, r) => cb(r))
  },
  removeAiListeners: () => {
    ;[
      'ai:stream-chunk',
      'ai:run-interrupted',
      'ai:run-done',
      'ai:run-error',
      'ai:request-snapshot',
    ].forEach(ch => ipcRenderer.removeAllListeners(ch))
  },

})
