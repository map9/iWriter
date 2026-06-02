import { app, ipcMain } from 'electron'
import { autoUpdater, AppUpdater } from 'electron-updater'
import type { UpdateInfo as ElectronUpdateInfo, UpdateDownloadedEvent } from 'electron-updater'
import log from 'electron-log/main'
import Store from 'electron-store'
import type {
  UpdaterConfig,
  UpdateStatus,
  UpdateInfo,
  UpdateCheckResult,
  UpdaterStateMessage,
  UpdaterStateSnapshot,
} from './types'
import {
  DEFAULT_UPDATER_CONFIG,
  UPDATE_STATUS_MESSAGES,
  UPDATE_IPC_EVENTS
} from './types'

export class UpdaterManager {
  private sendAppUpdateInfo: (action: string, data?: UpdaterStateMessage) => void
  private updater: AppUpdater
  private store: Store<UpdaterConfig>
  private currentStatus: UpdateStatus = { type: 'idle', message: '' }
  private updateInfo: UpdateInfo | null = null
  private checkTimer: NodeJS.Timeout | null = null
  private releaseNotesCache = new Map<string, string>()

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

  setSendAppUpdateInfo(callback: (action: string, data?: UpdaterStateMessage) => void) {
    this.sendAppUpdateInfo = callback;
  }

  private configure() {
    const config = this.getConfig()

    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    // 设置更新服务器
    const ghToken = process.env.GH_TOKEN
    if (!ghToken) {
      console.warn('GH_TOKEN not set, using GitHub updater without token')
    }

    this.updater.setFeedURL({
      provider: 'github',
      owner: 'map9',
      repo: 'iWriter',
      private: false,
      ...(ghToken ? { token: ghToken } : {})
    })
    console.info('Updater configured with GitHub provider')

    // 关闭自动更新时，仍允许手动检查，但不再自动下载/自动安装
    this.updater.autoDownload = config.enabled && config.autoDownload
    this.updater.autoInstallOnAppQuit = config.enabled && config.autoInstall

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
      if (this.isSkippedVersion(info.version)) {
        this.updateInfo = null
        this.updateStatus('idle', '')
        return
      }

      void this.handleUpdateAvailable(info)
    })

    this.updater.on('update-not-available', () => {
      this.updateInfo = null
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
      void this.handleUpdateDownloaded(info)
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

  private async handleUpdateAvailable(info: ElectronUpdateInfo) {
    const updateInfo = await this.buildUpdateInfo(info)
    this.updateInfo = updateInfo
    this.updateStatus('available', UPDATE_STATUS_MESSAGES.available, {
      updateInfo
    })
  }

  private async handleUpdateDownloaded(info: UpdateDownloadedEvent) {
    const updateInfo = await this.buildUpdateInfo(info)
    this.updateInfo = updateInfo
    this.updateStatus('downloaded', UPDATE_STATUS_MESSAGES.downloaded, {
      updateInfo
    })
  }

  private setupIpcHandlers() {
    // 检查更新
    ipcMain.handle(UPDATE_IPC_EVENTS.CHECK_FOR_UPDATES, async (): Promise<UpdateCheckResult> => {
      try {
        const result = await this.checkForUpdates(true)
        return result
      } catch (error) {
        console.error('Check for updates failed:', error)
        return { 
          available: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      }
    })

    ipcMain.handle(UPDATE_IPC_EVENTS.DOWNLOAD_UPDATE, async () => {
      await this.downloadUpdate()
    })

    // 安装更新
    ipcMain.handle(UPDATE_IPC_EVENTS.INSTALL_UPDATE, () => {
      this.quitAndInstall()
    })

    // 获取更新状态
    ipcMain.handle(UPDATE_IPC_EVENTS.GET_UPDATE_STATUS, (): UpdateStatus => {
      return this.currentStatus
    })

    ipcMain.handle(UPDATE_IPC_EVENTS.GET_UPDATE_STATE, (): UpdaterStateSnapshot => {
      return {
        status: this.currentStatus,
        updateInfo: this.updateInfo ?? undefined,
      }
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
    const interval = intervalHours * 60 * 60 * 1000 // 转换为毫秒
    this.checkTimer = setInterval(() => {
      this.checkForUpdates()
    }, interval)
  }

  private isSkippedVersion(version: string | null | undefined): boolean {
    if (!version) return false
    return this.getConfig().skipVersion === version
  }

  private async buildUpdateInfo(info: Pick<ElectronUpdateInfo, 'version' | 'releaseNotes' | 'releaseDate' | 'files'>): Promise<UpdateInfo> {
    const files = info.files || []
    return {
      version: info.version,
      currentVersion: app.getVersion(),
      releaseNotes: await this.resolveReleaseNotes(info.version, info.releaseNotes),
      releaseDate: info.releaseDate,
      downloadSize: this.selectDownloadSize(files),
      files
    }
  }

  private selectDownloadSize(files: UpdateInfo['files']): number | undefined {
    if (!files.length) return undefined

    // 排除增量下载用的 .blockmap
    let candidates = files.filter(f => !f.url.endsWith('.blockmap'))

    // 按当前架构过滤：arm64 取 url 含 'arm64' 的；x64 取不含 'arm64' 的
    const isArm = process.arch === 'arm64'
    const archMatched = candidates.filter(f =>
      isArm ? f.url.includes('arm64') : !f.url.includes('arm64'))
    if (archMatched.length) candidates = archMatched

    // 按平台偏好实际下载的格式：mac 自动更新用 .zip，win 用 .exe，linux 用 .AppImage
    const ext = process.platform === 'darwin' ? '.zip'
      : process.platform === 'win32' ? '.exe'
      : '.AppImage'
    const formatMatched = candidates.filter(f => f.url.endsWith(ext))
    if (formatMatched.length) candidates = formatMatched

    // 兜底：取剩余候选里最大的单个文件，绝不求和
    const sizes = candidates.map(f => f.size || 0).filter(s => s > 0)
    return sizes.length ? Math.max(...sizes) : undefined
  }

  private async resolveReleaseNotes(version: string, releaseNotes: ElectronUpdateInfo['releaseNotes']): Promise<string> {
    const normalized = this.normalizeReleaseNotes(releaseNotes)
    if (normalized) {
      return normalized
    }

    return this.fetchReleaseNotesFromChangelog(version)
  }

  private normalizeReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string {
    if (typeof releaseNotes === 'string') {
      return releaseNotes.trim()
    }

    if (!Array.isArray(releaseNotes)) {
      return ''
    }

    return releaseNotes
      .map((item: unknown) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (!item || typeof item !== 'object') {
          return ''
        }

        const releaseNote = item as Record<string, unknown>
        const note = typeof releaseNote.note === 'string' ? releaseNote.note.trim() : ''
        const version = typeof releaseNote.version === 'string' ? releaseNote.version.trim() : ''

        if (version && note) {
          return `## ${version}\n\n${note}`
        }

        return note
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  private async fetchReleaseNotesFromChangelog(version: string): Promise<string> {
    if (!version) {
      return ''
    }

    const cached = this.releaseNotesCache.get(version)
    if (cached) {
      return cached
    }

    const changelogUrls = [
      'https://raw.githubusercontent.com/map9/iWriter/main/docs/changelog.md',
      'https://raw.githubusercontent.com/map9/iWriter/master/docs/changelog.md'
    ]

    for (const url of changelogUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': `iWriter/${app.getVersion()}`
          },
          signal: AbortSignal.timeout(5000)
        })

        if (!response.ok) {
          continue
        }

        const changelog = await response.text()
        const notes = this.extractReleaseNotesFromChangelog(changelog, version)
        if (notes) {
          this.releaseNotesCache.set(version, notes)
          return notes
        }
      } catch (error) {
        console.warn(`Failed to fetch release notes from ${url}:`, error)
      }
    }

    return ''
  }

  private extractReleaseNotesFromChangelog(changelog: string, version: string): string {
    const lines = changelog.split(/\r?\n/)
    let start = -1
    let end = lines.length

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!line) {
        continue
      }

      if (!line.startsWith('## ')) {
        continue
      }

      const heading = line.slice(3).trim().replace(/^`|`$/g, '')
      if (heading !== version) {
        continue
      }

      start = index + 1

      for (let cursor = start; cursor < lines.length; cursor += 1) {
        const nextLine = lines[cursor]
        if (nextLine?.startsWith('## ')) {
          end = cursor
          break
        }
      }

      break
    }

    if (start === -1) {
      return ''
    }

    return lines.slice(start, end).join('\n').trim()
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
        if (this.isSkippedVersion(result.updateInfo.version)) {
          return { available: false }
        }
        const updateInfo = await this.buildUpdateInfo(result.updateInfo)
        return {
          available: true,
          updateInfo
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
    // 先广播 installing 状态，让 UI 有机会在 quit 前反馈
    this.updateStatus('installing', UPDATE_STATUS_MESSAGES.installing, {
      updateInfo: this.updateInfo ?? undefined
    })
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
    if (config.checkOnStartup) {
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
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.DOWNLOAD_UPDATE)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.INSTALL_UPDATE)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.GET_UPDATE_STATUS)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.GET_UPDATE_STATE)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.GET_UPDATE_CONFIG)
    ipcMain.removeHandler(UPDATE_IPC_EVENTS.SET_UPDATE_CONFIG)
  }
}
