import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

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
    properties: string[]
    filters?: { name: string; extensions: string[] }[]
  }) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (fileName: string) => ipcRenderer.invoke('show-save-dialog', fileName),

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
  
  // Menu actions
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_, action) => callback(action))
  },
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action')
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
  setAutoSave: (enabled: boolean) => ipcRenderer.invoke('set-auto-save', enabled),
  windowContentChange: (contentInfo: any) => ipcRenderer.invoke('window-content-changed', contentInfo),
  updateWindowTitle: (title: string) => ipcRenderer.invoke('update-window-title', title),
})