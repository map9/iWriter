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

  // Search in files
  searchInFiles: (options: any) => ipcRenderer.invoke('search-in-files', options),

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
  
  getSystemColors: () => ipcRenderer.invoke('get-system-colors'),
  onSystemColorsChanged: (callback: (themeAndColors: any) => void) => {
    ipcRenderer.on('system-colors-changed', (_, themeAndColors) => callback(themeAndColors))
  },
  removeSystemColorsChangedListeners: () => {
    ipcRenderer.removeAllListeners('system-colors-changed')
  },

  // Menu state updates
  windowContentChange: (wContentState: any) => ipcRenderer.invoke('window-content-changed', wContentState),
  updateWindowTitle: (title: string) => ipcRenderer.invoke('update-window-title', title),

  // Updater API
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('updater:install-update'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:get-status'),
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
  print: (options: any = {}) => ipcRenderer.invoke('print', options),

  // ACP (Agent Client Protocol) — external agent process management
  acpLaunch: (params: {
    sessionId: string
    command: string
    args?: string[]
    env?: Record<string, string>
    workspacePath: string | null
    filePath: string | null
  }) => ipcRenderer.invoke('acp:launch', params),
  acpInitialize: (params: { sessionId: string; workspacePath: string | null; filePath: string | null }) =>
    ipcRenderer.invoke('acp:initialize', params),
  acpNewSession: (params: { sessionId: string; cwd: string | null }) =>
    ipcRenderer.invoke('acp:newSession', params),
  acpSend: (params: { sessionId: string; acpSessionId: string; content: string }) =>
    ipcRenderer.invoke('acp:send', params),
  acpSetModel: (params: { sessionId: string; acpSessionId: string; modelId: string }) =>
    ipcRenderer.invoke('acp:set-model', params),
  acpSetMode: (params: { sessionId: string; acpSessionId: string; modeId: string }) =>
    ipcRenderer.invoke('acp:set-mode', params),
  acpCancel: (sessionId: string) => ipcRenderer.invoke('acp:cancel', sessionId),
  /** Reply to an agent's session/request_permission with allow_once, allow_always, or deny. */
  acpPermissionRespond: (params: { sessionId: string; requestId: number; response: string }) =>
    ipcRenderer.invoke('acp:permission-respond', params),
  onAcpChunk: (callback: (data: { sessionId: string; data: string }) => void) => {
    ipcRenderer.on('acp:chunk', (_, data) => callback(data))
  },
  onAcpDone: (callback: (data: { sessionId: string; exitCode?: number }) => void) => {
    ipcRenderer.on('acp:done', (_, data) => callback(data))
  },
  onAcpError: (callback: (data: { sessionId: string; message: string }) => void) => {
    ipcRenderer.on('acp:error', (_, data) => callback(data))
  },
  onAcpStderr: (callback: (data: { sessionId: string; line: string }) => void) => {
    ipcRenderer.on('acp:stderr', (_, data) => callback(data))
  },
  removeAcpListeners: () => {
    ipcRenderer.removeAllListeners('acp:chunk')
    ipcRenderer.removeAllListeners('acp:done')
    ipcRenderer.removeAllListeners('acp:error')
  },
  removeAcpStderrListeners: () => {
    ipcRenderer.removeAllListeners('acp:stderr')
  },
})