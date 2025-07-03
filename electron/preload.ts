import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // File operations
  openFolder: () => ipcRenderer.invoke('open-folder'),
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (content: string, filePath?: string) => 
    ipcRenderer.invoke('save-file', content, filePath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  getFiles: (folderPath: string) => ipcRenderer.invoke('get-files', folderPath),
  
  // File operations
  createFile: (folderPath: string, fileName: string) => 
    ipcRenderer.invoke('create-file', folderPath, fileName),
  createFolder: (parentPath: string, folderName: string) => 
    ipcRenderer.invoke('create-folder', parentPath, folderName),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  renameFile: (oldPath: string, newName: string) => 
    ipcRenderer.invoke('rename-file', oldPath, newName),
  moveFile: (sourcePath: string, targetDir: string, conflictAction?: 'keepBoth' | 'replace' | 'cancel') => 
    ipcRenderer.invoke('move-file', sourcePath, targetDir, conflictAction),
  
  // Window controls
  close: () => ipcRenderer.send('close'),
  updateWindowTitle: (title: string) => ipcRenderer.invoke('update-window-title', title),
  
  // Menu actions
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_, action) => callback(action))
  },
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action')
  },
    
  // Save dialog
  showSaveDialog: (fileName: string) => ipcRenderer.invoke('show-save-dialog', fileName),
  
  // Window state changes
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => {
    ipcRenderer.on('window-state-changed', (_, state) => callback(state))
  },
  
  // Menu state updates
  setAutoSave: (enabled: boolean) => ipcRenderer.invoke('set-auto-save', enabled),
  windowContentChange: (contentInfo: any) => ipcRenderer.invoke('window-content-changed', contentInfo),
  
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
})