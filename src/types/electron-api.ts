import type { ThemeColors } from '@/utils/themes'

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

  // Shell execution (read-only commands, enforced in main process)
  execShell: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>

  // 菜单操作
  onMenuAction: (callback: (action: string) => void) => void
  removeMenuActionListener: (listener?: unknown) => void

  // 窗口状态
  onWindowStateChanged: (callback: (state: { maximized: boolean }) => void) => void
  removeWindowStateChangedListeners: () => void

  getSystemColors: () => Promise<{ theme: 'light' | 'dark' | 'unknown', newColors: ThemeColors }>,
  onSystemColorsChanged: (callback: (themeAndColors: { theme: 'light' | 'dark' | 'unknown', newColors: ThemeColors }) => void) => void,
  removeSystemColorsChangedListeners: () => void

  // 设置
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
  print: (options?: Electron.WebContentsPrintOptions) => Promise<{ success: boolean; error?: string; cancelled?: boolean }>

  // ── AI Agent (main-process deepagents) ──────────────────────────────────────
  aiSendMessage?: (req: import('./ai-ipc').SendMessageRequest) => Promise<{ threadId: string }>
  aiCancel?: (threadId: string) => Promise<void>
  aiResume?: (req: import('./ai-ipc').ResumeRunRequest) => Promise<void>
  /** @deprecated Use aiResume instead */
  aiApproveProposal?: (req: { sessionId: string; proposalId: string }) => Promise<void>
  /** @deprecated Use aiResume instead */
  aiRejectProposal?: (req: { sessionId: string; proposalId: string }) => Promise<void>
  aiGetConfig?: () => Promise<import('./ai').AiSettings>
  aiUpdateConfig?: (patch: Partial<import('./ai').AiSettings>) => Promise<void>
  aiGetThreads?: () => Promise<import('./ai').AiThread[]>
  aiDeleteThread?: (threadId: string) => Promise<void>
  aiClearThreads?: () => Promise<void>
  aiGetThreadMessages?: (threadId: string) => Promise<import('./ai').ThreadMessage[]>
  aiSnapshotResponse?: (resp: import('./ai-ipc').SnapshotResponse) => void

  onAiStreamChunk?: (cb: (chunk: import('./ai-ipc').StreamChunkEvent) => void) => void
  onAiRunInterrupted?: (cb: (e: import('./ai-ipc').RunInterruptedEvent) => void) => void
  onAiRunDone?: (cb: (e: import('./ai-ipc').RunDoneEvent) => void) => void
  onAiRunError?: (cb: (e: import('./ai-ipc').RunErrorEvent) => void) => void
  onAiRequestSnapshot?: (cb: (req: import('./ai-ipc').SnapshotRequestEvent) => void) => void
  removeAiListeners?: () => void

  // ACP (Agent Client Protocol) — external agent process management
  acpLaunch?: (params: { sessionId: string; command: string; args?: string[]; env?: Record<string, string>; workspacePath: string | null; filePath: string | null }) => Promise<{ success: boolean; error?: string }>
  acpInitialize?: (params: { sessionId: string; workspacePath: string | null; filePath: string | null }) => Promise<{ success: boolean; error?: string }>
  acpNewSession?: (params: { sessionId: string; cwd: string | null }) => Promise<{ success: boolean; error?: string }>
  acpSend?: (params: { sessionId: string; acpSessionId: string; content: string }) => Promise<{ success: boolean; error?: string }>
  acpSetModel?: (params: { sessionId: string; acpSessionId: string; modelId: string }) => Promise<{ success: boolean; error?: string }>
  acpSetMode?: (params: { sessionId: string; acpSessionId: string; modeId: string }) => Promise<{ success: boolean; error?: string }>
  acpCancel?: (sessionId: string) => Promise<{ success: boolean }>
  /** Reply to an agent's session/request_permission. response: 'allow_once' | 'allow_always' | 'deny' */
  acpPermissionRespond?: (params: { sessionId: string; requestId: number; response: string }) => Promise<{ success: boolean; error?: string }>
  /** Send a JSON-RPC response to the agent for an fs/read_text_file or fs/write_text_file request. */
  acpFsRespond?: (params: { sessionId: string; requestId: number; result?: unknown; error?: { code: number; message: string } }) => Promise<{ success: boolean; error?: string }>
  onAcpChunk?: (callback: (data: { sessionId: string; data: string }) => void) => void
  onAcpDone?: (callback: (data: { sessionId: string; exitCode?: number }) => void) => void
  onAcpError?: (callback: (data: { sessionId: string; message: string }) => void) => void
  onAcpStderr?: (callback: (data: { sessionId: string; line: string }) => void) => void
  removeAcpListeners?: () => void
  removeAcpStderrListeners?: () => void
}