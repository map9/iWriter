export interface UpdaterConfig {
  enabled: boolean                    // 是否启用自动更新
  checkOnStartup: boolean            // 启动时检查
  autoDownload: boolean              // 自动下载更新
  autoInstall: boolean               // 自动安装，需要用户确认
  checkInterval: number              // 检查间隔（小时）
  updateServer: string               // 更新服务器类型
  channel: 'stable' | 'beta'         // 更新渠道
  notificationEnabled: boolean       // 启用更新通知
  skipVersion: string | null         // 跳过的版本号
}

export interface UpdateStatus {
  type: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  message: string
  progress?: number                  // 下载进度 0-100
  error?: string                     // 错误信息
}

export interface UpdateInfo {
  version: string                    // 新版本号
  currentVersion: string             // 当前版本号
  releaseNotes: string              // 更新说明
  releaseDate: string               // 发布时间
  downloadSize?: number             // 下载大小（字节）
  files: Array<{
    url: string
    sha512: string
    size?: number
  }>
}

export interface UpdateDialogData {
  updateInfo: UpdateInfo
  onUpdate: () => void              // 立即更新回调
  onLater: () => void               // 稍后提醒回调
  onSkip: () => void                // 跳过此版本回调
  onViewDetails: () => void         // 查看详情回调
}

export interface UpdateCheckResult {
  available: boolean
  updateInfo?: UpdateInfo
  error?: string
}

export interface UpdaterStateMessage {
  status: UpdateStatus
  updateInfo?: UpdateInfo
  downloadProgress?: {
    progress: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: {
    message: string
    stack?: string
  }
}

// 默认配置
export const DEFAULT_UPDATER_CONFIG: UpdaterConfig = {
  enabled: true,
  checkOnStartup: true,
  autoDownload: true,
  autoInstall: false,
  checkInterval: 24,                // 24小时检查一次
  updateServer: 'github',
  channel: 'stable',
  notificationEnabled: true,
  skipVersion: null
}

// 更新状态消息
export const UPDATE_STATUS_MESSAGES = {
  idle: '',
  checking: '正在检查更新...',
  available: '有更新包',
  downloading: '正在下载更新包',
  downloaded: '更新包已下载完成',
  installing: '正在安装更新包',
  error: '更新检查失败'
} as const

// IPC 事件名称
export const UPDATE_IPC_EVENTS = {
  CHECK_FOR_UPDATES: 'updater:check-for-updates',
  STATE_CHANGED: 'updater:state-changed',
  INSTALL_UPDATE: 'updater:install-update',
  GET_UPDATE_STATUS: 'updater:get-status',
  SET_UPDATE_CONFIG: 'updater:set-config',
  GET_UPDATE_CONFIG: 'updater:get-config'
} as const