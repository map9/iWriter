import { ref } from 'vue'
import type {
  UpdaterConfig,
  UpdateStatus,
  UpdateInfo,
  UpdateCheckResult,
  UpdaterStateMessage
} from './types'

class UpdaterService {
  // 响应式状态
  public status = ref<UpdateStatus>({ type: 'idle', message: '' })
  public config = ref<UpdaterConfig | null>(null)
  public updateInfo = ref<UpdateInfo | null>(null)
  public isUpdateAvailable = ref(false)
  public downloadProgress = ref(0)
  public downloadDetails = ref<
  {
    progress: number
    bytesPerSecond: number
    transferred: number
    total: number
  } | null
  >(null)

  constructor() {
    this.setupEventListeners()
    this.loadConfig()
    this.loadCurrentStatus()
  }

  private setupEventListeners() {
    if (!window.electronAPI) return

    // 监听统一的状态变化事件
    window.electronAPI.onUpdaterStateChanged?.((stateMessage: UpdaterStateMessage) => {
      // 更新基础状态
      this.status.value = stateMessage.status
      
      // 根据状态类型更新相应的响应式状态
      switch (stateMessage.status.type) {
        case 'available':
          if (stateMessage.updateInfo) {
            this.updateInfo.value = stateMessage.updateInfo
            this.isUpdateAvailable.value = true
          }
          break
          
        case 'downloading':
          if (stateMessage.downloadProgress) {
            this.downloadProgress.value = stateMessage.downloadProgress.progress
            this.downloadDetails.value = stateMessage.downloadProgress
          }
          break
          
        case 'downloaded':
        case 'installing':
          if (stateMessage.updateInfo) {
            this.updateInfo.value = stateMessage.updateInfo
          }
          break
          
        case 'idle':
          this.isUpdateAvailable.value = false
          this.updateInfo.value = null
          this.downloadProgress.value = 0
          this.downloadDetails.value = null
          break
          
        case 'error':
          if (stateMessage.error) {
            console.error('Updater error:', stateMessage.error)
          }
          break
      }
    })
  }

  private async loadConfig() {
    try {
      if (window.electronAPI?.getUpdaterConfig) {
        this.config.value = await window.electronAPI.getUpdaterConfig()
      }
    } catch (error) {
      console.error('Failed to load updater config:', error)
    }
  }

  private async loadCurrentStatus() {
    try {
      if (window.electronAPI?.getUpdaterStatus) {
        this.status.value = await window.electronAPI.getUpdaterStatus()
      }
    } catch (error) {
      console.error('Failed to load updater status:', error)
    }
  }

  // 公共方法
  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!window.electronAPI?.checkForUpdates) {
      throw new Error('Updater API not available')
    }

    try {
      return await window.electronAPI.checkForUpdates()
    } catch (error) {
      console.error('Check for updates failed:', error)
      throw error
    }
  }

  async installUpdate(): Promise<void> {
    if (!window.electronAPI?.installUpdate) {
      throw new Error('Updater API not available')
    }

    return window.electronAPI.installUpdate()
  }

  async updateConfig(newConfig: Partial<UpdaterConfig>): Promise<void> {
    if (!window.electronAPI?.setUpdaterConfig) {
      throw new Error('Updater API not available')
    }

    await window.electronAPI.setUpdaterConfig(newConfig)
    await this.loadConfig()
  }


  // 便捷方法
  get isChecking() {
    return this.status.value.type === 'checking'
  }

  get isDownloading() {
    return this.status.value.type === 'downloading'
  }

  get isInstalling() {
    return this.status.value.type === 'installing'
  }

  get hasError() {
    return this.status.value.type === 'error'
  }

  get currentDownloadProgress() {
    return this.downloadProgress.value
  }

  get statusMessage() {
    return this.status.value.message
  }

  // 格式化辅助方法
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  formatReleaseNotes(notes: string): string {
    // 简单的 Markdown 到 HTML 转换
    return notes
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/# (.*)/g, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
  }

  openReleaseNotes(version?: string) {
    const url = version 
      ? `https://github.com/map9/iWriter/releases/tag/v${version}`
      : 'https://github.com/map9/iWriter/releases'
    
    window.electronAPI?.openWithShell?.(url)
  }

  destroy() {
    // 清理 IPC 事件监听器
    window.electronAPI.removeUpdaterListeners?.()
  }
}

// 单例导出
export const updaterService = new UpdaterService()
export default updaterService