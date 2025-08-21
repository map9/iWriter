import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, AppUpdater } from 'electron-updater'
import type { UpdateInfo as ElectronUpdateInfo, UpdateDownloadedEvent } from 'electron-updater'
import log from 'electron-log/main'
import Store from 'electron-store'
import type {
  UpdaterConfig,
  UpdateStatus,
  UpdateInfo,
  UpdateCheckResult,
  UpdaterStateMessage
} from './types'
import {
  DEFAULT_UPDATER_CONFIG,
  UPDATE_STATUS_MESSAGES,
  UPDATE_IPC_EVENTS
} from './types'

export class UpdaterManager {
  private sendAppUpdateInfo: (action: string, data?: any) => void
  private updater: AppUpdater
  private store: Store<UpdaterConfig>
  private currentStatus: UpdateStatus = { type: 'idle', message: '' }
  private updateInfo: UpdateInfo | null = null
  private checkTimer: NodeJS.Timeout | null = null

  constructor() {
    autoUpdater.logger = log;

    try {
      this.sendAppUpdateInfo = () => {}
      this.updater = autoUpdater
      this.store = new Store({
        name: 'updater-config',
        defaults: DEFAULT_UPDATER_CONFIG
      })

      this.setupUpdaterEvents()
      this.setupIpcHandlers()
      this.configure()
    } catch (error) {
      console.error('Failed to initialize UpdaterManager:', error)
      throw error
    }
  }

  setSendAppUpdateInfo(callback: (action: string, data?: any) => void) {
    this.sendAppUpdateInfo = callback;
  }

  private configure() {
    const config = this.getConfig()
    
    // 设置更新服务器
    const ghToken = process.env.GH_TOKEN
    if (!ghToken) {
      console.warn('GH_TOKEN not set, auto-updates may not work')
      return
    }
    
    this.updater.setFeedURL({
      provider: 'github',
      owner: 'map9',
      repo: 'iWriter',
      private: false,
      token: ghToken
    })
    console.log('Updater configured with GitHub provider')

    // 配置自动下载
    this.updater.autoDownload = config.autoDownload
    this.updater.autoInstallOnAppQuit = config.autoInstall

    // 设置定时检查
    if (config.enabled && config.checkInterval > 0) {
      this.scheduleUpdateCheck(config.checkInterval)
    }
  }

  private setupUpdaterEvents() {
    this.updater.on('checking-for-update', () => {
      this.updateStatus('checking', UPDATE_STATUS_MESSAGES.checking)
    })

    this.updater.on('update-available', (info: ElectronUpdateInfo) => {
      const updateInfo: UpdateInfo = {
        version: info.version,
        currentVersion: app.getVersion(),
        releaseNotes: info.releaseNotes as string || '',
        releaseDate: info.releaseDate,
        files: info.files || []
      }
      
      this.updateInfo = updateInfo
      this.updateStatus('available', UPDATE_STATUS_MESSAGES.available, {
        updateInfo
      })
    })

    this.updater.on('update-not-available', () => {
      this.updateStatus('idle', '')
    })

    this.updater.on('download-progress', (progress) => {
      const message = `${UPDATE_STATUS_MESSAGES.downloading} (${Math.round(progress.percent)}%)`
      this.updateStatus('downloading', message, {
        downloadProgress: {
          progress: Math.round(progress.percent),
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total
        }
      })
    })

    this.updater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
      this.updateStatus('installing', UPDATE_STATUS_MESSAGES.installing, {
        updateInfo: {
          version: info.version,
          currentVersion: app.getVersion(),
          releaseNotes: info.releaseNotes as string || '',
          releaseDate: info.releaseDate,
          files: info.files || []
        }
      })
    })

    this.updater.on('error', (error) => {
      this.updateStatus('error', UPDATE_STATUS_MESSAGES.error, {
        error: {
          message: error.message,
          stack: error.stack
        }
      })
    })
  }

  private setupIpcHandlers() {
    // 检查更新
    ipcMain.handle(UPDATE_IPC_EVENTS.CHECK_FOR_UPDATES, async (): Promise<UpdateCheckResult> => {
      try {
        const result = await this.checkForUpdates()
        return result
      } catch (error) {
        console.error('Check for updates failed:', error)
        return { 
          available: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      }
    })

    // 安装更新
    ipcMain.handle(UPDATE_IPC_EVENTS.INSTALL_UPDATE, () => {
      this.quitAndInstall()
    })

    // 获取更新状态
    ipcMain.handle(UPDATE_IPC_EVENTS.GET_UPDATE_STATUS, (): UpdateStatus => {
      return this.currentStatus
    })

    // 获取配置
    ipcMain.handle(UPDATE_IPC_EVENTS.GET_UPDATE_CONFIG, (): UpdaterConfig => {
      return this.getConfig()
    })

    // 设置配置
    ipcMain.handle(UPDATE_IPC_EVENTS.SET_UPDATE_CONFIG, (_, config: Partial<UpdaterConfig>) => {
      this.setConfig(config)
      this.configure()
    })
  }

  private updateStatus(
    type: UpdateStatus['type'], 
    message: string, 
    additionalData?: Partial<UpdaterStateMessage>
  ) {
    const progress: number | undefined = additionalData?.downloadProgress?.progress
    const error: string | undefined = additionalData?.error?.message
    this.currentStatus = { type, message, progress, error }
    
    const stateMessage: UpdaterStateMessage = {
      status: this.currentStatus,
      ...additionalData
    }
    
    this.sendAppUpdateInfo(UPDATE_IPC_EVENTS.STATE_CHANGED, stateMessage)
  }

  private scheduleUpdateCheck(intervalHours: number) {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
    }

    const interval = intervalHours * 60 * 60 * 1000 // 转换为毫秒
    this.checkTimer = setInterval(() => {
      this.checkForUpdates()
    }, interval)
  }

  // 公共方法
  async checkForUpdates(manual = false): Promise<UpdateCheckResult> {
    const config = this.getConfig()
    if (!config.enabled && !manual) {
      return { available: false }
    }

    try {
      const result = await this.updater.checkForUpdates()
      if (result && result.updateInfo) {
        return {
          available: true,
          updateInfo: {
            version: result.updateInfo.version,
            currentVersion: app.getVersion(),
            releaseNotes: result.updateInfo.releaseNotes as string || '',
            releaseDate: result.updateInfo.releaseDate,
            files: result.updateInfo.files || []
          }
        }
      }
      return { available: false }
    } catch (error) {
      console.error('Failed to check for updates:', error)
      return { 
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  async downloadUpdate(): Promise<void> {
    await this.updater.downloadUpdate()
  }

  quitAndInstall(): void {
    this.updater.quitAndInstall()
  }

  getConfig(): UpdaterConfig {
    return this.store.store
  }

  setConfig(config: Partial<UpdaterConfig>): void {
    // 逐个设置配置项，避免使用 clear() 导致的原子性问题
    Object.entries(config).forEach(([key, value]) => {
      this.store.set(key as keyof UpdaterConfig, value)
    })
  }

  // 启动时检查更新
  async checkOnStartup(): Promise<void> {
    const config = this.getConfig()
    if (config.enabled && config.checkOnStartup) {
      // 延迟几秒钟再检查，让应用完全启动
      setTimeout(() => {
        this.checkForUpdates()
      }, 3000)
    }
  }

  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    
    // 移除所有 IPC 处理器
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.CHECK_FOR_UPDATES)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.INSTALL_UPDATE)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.GET_UPDATE_STATUS)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.GET_UPDATE_CONFIG)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.SET_UPDATE_CONFIG)
  }
}