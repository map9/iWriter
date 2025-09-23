// Electron API 接口
export interface ElectronAPI {
  platform: string
  
  // alive monitoring
  hello: (windowId: number) => void,
  onWindowId: (callback: (windowId: number) => void) => void,
  removeWindowIdListeners: () => void,

  // Window Close Confirmation
  windowCloseConfirm: (windowId: number, canClose: boolean) => void,
  // Request Window Close Confirmation
  onRequestWindowClose: (callback: (windowId: number) => void) => void,
  removeRequestWindowCloseListeners: () => void

  // 文件操作
  readFile: (filePath: string) => Promise<string | null>
  readFileBinary: (filePath: string) => Promise<string | null>
  saveFile: (content: string, filePath?: string) => Promise<boolean>

  pathExists: (filePath: string) => Promise<boolean>
  getFiles: (folderPath: string, onlyself?: boolean) => Promise<import('@/types').FileInfo[]>
  // 在系统文件管理器中显示文件或文件夹
  revealInFolder: (path: string) => Promise<void>  
  // 使用系统默认应用程序打开文件
  openWithShell: (path: string) => Promise<void>

  // 对话框
  showOpenDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
    properties: string[]
  }) => Promise<{ canceled: boolean, filePaths: string[] }>
  showSaveDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  }) => Promise<{ canceled: boolean, filePath: string }>
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
  }) => Promise<{response: number, checkboxChecked: boolean}>

  // 文件系统操作
  createFile: (folderPath: string, fileName: string) => Promise<string>
  createFolder: (parentPath: string, folderName: string) => Promise<string>
  deleteFile: (filePath: string) => Promise<boolean>
  renameFile: (oldPath: string, newName: string) => Promise<string>
  moveFile: (sourcePath: string, targetDir: string) => Promise<import('@/types').FileOperationResult>
  
  // 文件监听
  startFileWatching: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
  stopFileWatching: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>
  stopAllFileWatching: () => Promise<{ success: boolean; error?: string }>
  getFileWatchingStatus: () => Promise<{ watchedPaths: string[]; totalWatchers: number }>
  
  // 文件变化事件
  onFileChange: (callback: (change: import('@/types').FileChange) => void) => void
  onFileWatchError: (callback: (error: { message: string; path: string; timestamp: Date }) => void) => void
  removeFileChangeListeners: () => void

  // 原生上下文菜单
  showContextMenu: (menuItems: import('@/types').ContextMenuItem[], position: { x: number; y: number }) => Promise<string | null>

  // 菜单操作
  onMenuAction: (callback: (action: string) => void) => void
  removeMenuActionListener: (listener?: any) => void

  // 窗口状态
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => void
  removeWindowStateChangedListeners: () => void

  getSystemColors: () => Promise<{ theme: 'light' | 'dark' | 'unknown', newColors: any }>,
  onSystemColorsChanged: (callback: (themeAndColors: { theme: 'light' | 'dark' | 'unknown', newColors: any }) => void) => void,
  removeSystemColorsChangedListeners: () => void

  // 设置
  setAutoSave: (enabled: boolean) => Promise<void>
  windowContentChange: (wContentState: Partial<import('@/types').WindowContentState>) => Promise<void>
  updateWindowTitle: (title: string) => Promise<{ success: boolean; error?: string }>

  // 更新器 API
  checkForUpdates: () => Promise<import('@/updater/types').UpdateCheckResult>
  installUpdate: () => Promise<void>
  getUpdaterStatus: () => Promise<import('@/updater/types').UpdateStatus>
  getUpdaterConfig: () => Promise<import('@/updater/types').UpdaterConfig>
  setUpdaterConfig: (config: Partial<import('@/updater/types').UpdaterConfig>) => Promise<void>
  
  // 更新器事件
  onUpdaterStateChanged: (callback: (stateMessage: import('@/updater/types').UpdaterStateMessage) => void) => void,
  removeUpdaterListeners: () => void,

  // 打印 API
  print: (options?: any) => Promise<{ success: boolean; error?: string; cancelled?: boolean }>
}