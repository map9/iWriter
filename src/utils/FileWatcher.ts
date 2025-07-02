import { ref, watch } from 'vue'
import type { FileChange, FileWatcher, AppError } from '@/types'
import { ErrorType, ErrorSeverity } from '@/types'
import { ErrorHandler } from './ErrorHandler'

// 文件监听器状态
const watchers = ref<Map<string, FileWatcher>>(new Map())
const isWatchingEnabled = ref(true)

// 文件系统监听器类
export class FileSystemWatcher {
  private static instance: FileSystemWatcher
  private watchInterval = 2000 // 默认2秒检查间隔
  private maxWatchers = 10 // 最大监听器数量
  private changeCallbacks: ((change: FileChange) => void)[] = []
  private isInitialized = false

  private constructor() {}

  static getInstance(): FileSystemWatcher {
    if (!FileSystemWatcher.instance) {
      FileSystemWatcher.instance = new FileSystemWatcher()
    }
    return FileSystemWatcher.instance
  }

  // 初始化监听器
  initialize(interval: number = 2000): void {
    if (this.isInitialized) return
    
    this.watchInterval = interval
    this.isInitialized = true
    
    // 监听全局启用/禁用状态
    watch(isWatchingEnabled, (enabled) => {
      if (enabled) {
        this.resumeAllWatchers()
      } else {
        this.pauseAllWatchers()
      }
    })
  }

  // 添加文件夹监听
  async watchFolder(
    folderPath: string,
    onChange: (changes: FileChange[]) => void,
    onError?: (error: AppError) => void
  ): Promise<boolean> {
    try {
      // 检查是否已经在监听
      if (watchers.value.has(folderPath)) {
        this.stopWatching(folderPath)
      }

      // 检查监听器数量限制
      if (watchers.value.size >= this.maxWatchers) {
        const error = ErrorHandler.createError(
          ErrorType.FILE_SYSTEM,
          `监听器数量已达上限 (${this.maxWatchers})`,
          ErrorSeverity.MEDIUM,
          'FileSystemWatcher.watchFolder'
        )
        ErrorHandler.handle(error)
        return false
      }

      // 创建新的监听器
      const watcher: FileWatcher = {
        path: folderPath,
        isWatching: true,
        lastCheck: new Date(),
        onChange,
        onError: onError || ((error) => ErrorHandler.handle(error))
      }

      watchers.value.set(folderPath, watcher)

      // 启动监听
      if (isWatchingEnabled.value) {
        this.startWatching(folderPath)
      }

      return true
    } catch (error) {
      const appError = ErrorHandler.handleFileSystemError(error, 'watchFolder', folderPath)
      return false
    }
  }

  // 停止监听特定文件夹
  stopWatching(folderPath: string): void {
    const watcher = watchers.value.get(folderPath)
    if (watcher) {
      watcher.isWatching = false
      watchers.value.delete(folderPath)
    }
  }

  // 停止所有监听
  stopAllWatchers(): void {
    watchers.value.forEach((watcher, path) => {
      this.stopWatching(path)
    })
  }

  // 暂停所有监听器
  private pauseAllWatchers(): void {
    watchers.value.forEach(watcher => {
      watcher.isWatching = false
    })
  }

  // 恢复所有监听器
  private resumeAllWatchers(): void {
    watchers.value.forEach((watcher, path) => {
      watcher.isWatching = true
      this.startWatching(path)
    })
  }

  // 启动特定路径的监听
  private startWatching(folderPath: string): void {
    const watcher = watchers.value.get(folderPath)
    if (!watcher || !watcher.isWatching) return

    this.scheduleCheck(folderPath)
  }

  // 调度检查
  private scheduleCheck(folderPath: string): void {
    setTimeout(() => {
      this.checkForChanges(folderPath)
    }, this.watchInterval)
  }

  // 检查文件变化
  private async checkForChanges(folderPath: string): Promise<void> {
    const watcher = watchers.value.get(folderPath)
    if (!watcher || !watcher.isWatching || !isWatchingEnabled.value) {
      return
    }

    try {
      // 使用 Electron API 获取文件列表
      if (!window.electronAPI) {
        throw new Error('Electron API not available')
      }

      const currentFiles = await window.electronAPI.getFiles(folderPath)
      const changes = await this.detectChanges(folderPath, currentFiles)

      if (changes.length > 0) {
        // 通知变化
        watcher.onChange(changes)
        this.notifyGlobalCallbacks(changes)
      }

      watcher.lastCheck = new Date()

      // 调度下一次检查
      if (watcher.isWatching) {
        this.scheduleCheck(folderPath)
      }

    } catch (error) {
      const appError = ErrorHandler.handleFileSystemError(
        error,
        'checkForChanges',
        folderPath
      )
      watcher.onError(appError)

      // 如果是严重错误，停止监听
      if (appError.severity === 'critical' || appError.severity === 'high') {
        this.stopWatching(folderPath)
      } else {
        // 继续监听，但增加检查间隔
        setTimeout(() => {
          this.scheduleCheck(folderPath)
        }, this.watchInterval * 2)
      }
    }
  }

  // 检测文件变化
  private async detectChanges(folderPath: string, currentFiles: any[]): Promise<FileChange[]> {
    const changes: FileChange[] = []
    const timestamp = new Date()

    // 这里简化处理，在实际应用中需要更复杂的变化检测逻辑
    // 可以通过比较文件修改时间、大小等来检测变化
    
    // TODO: 实现更精确的变化检测
    // 1. 比较文件列表，检测新增/删除
    // 2. 比较文件修改时间，检测修改
    // 3. 缓存之前的状态进行对比

    return changes
  }

  // 设置监听间隔
  setWatchInterval(interval: number): void {
    this.watchInterval = Math.max(1000, interval) // 最小1秒
  }

  // 获取监听间隔
  getWatchInterval(): number {
    return this.watchInterval
  }

  // 启用/禁用监听
  setWatchingEnabled(enabled: boolean): void {
    isWatchingEnabled.value = enabled
  }

  // 获取监听状态
  isEnabled(): boolean {
    return isWatchingEnabled.value
  }

  // 获取所有监听器
  getWatchers(): Map<string, FileWatcher> {
    return new Map(watchers.value)
  }

  // 获取监听器统计信息
  getStats(): {
    totalWatchers: number
    activeWatchers: number
    enabledWatchers: number
  } {
    const total = watchers.value.size
    const active = Array.from(watchers.value.values()).filter(w => w.isWatching).length
    const enabled = isWatchingEnabled.value ? active : 0

    return {
      totalWatchers: total,
      activeWatchers: active,
      enabledWatchers: enabled
    }
  }

  // 注册全局变化回调
  onFileChange(callback: (change: FileChange) => void): void {
    this.changeCallbacks.push(callback)
  }

  // 移除全局变化回调
  offFileChange(callback: (change: FileChange) => void): void {
    const index = this.changeCallbacks.indexOf(callback)
    if (index > -1) {
      this.changeCallbacks.splice(index, 1)
    }
  }

  // 通知全局回调
  private notifyGlobalCallbacks(changes: FileChange[]): void {
    changes.forEach(change => {
      this.changeCallbacks.forEach(callback => {
        try {
          callback(change)
        } catch (error) {
          ErrorHandler.handle(
            ErrorHandler.createError(
              ErrorType.UNKNOWN,
              `File change callback error: ${error}`,
              ErrorSeverity.LOW,
              'FileSystemWatcher.notifyGlobalCallbacks'
            )
          )
        }
      })
    })
  }

  // 清理资源
  destroy(): void {
    this.stopAllWatchers()
    this.changeCallbacks = []
    this.isInitialized = false
  }
}

// 高级文件系统监听器（使用原生文件系统事件）
export class AdvancedFileWatcher {
  private static instance: AdvancedFileWatcher
  private nativeWatchers: Map<string, any> = new Map()

  private constructor() {}

  static getInstance(): AdvancedFileWatcher {
    if (!AdvancedFileWatcher.instance) {
      AdvancedFileWatcher.instance = new AdvancedFileWatcher()
    }
    return AdvancedFileWatcher.instance
  }

  // 使用原生文件系统事件监听（需要在主进程中实现）
  async watchWithNativeEvents(
    folderPath: string,
    onChange: (changes: FileChange[]) => void
  ): Promise<boolean> {
    try {
      // 这里需要通过 IPC 与主进程通信，在主进程中使用 chokidar 或 fs.watch
      if (window.electronAPI) {
        // TODO: 实现原生文件系统监听的 IPC 通信
        console.log('Native file watching not implemented yet')
      }
      return false
    } catch (error) {
      ErrorHandler.handleFileSystemError(error, 'watchWithNativeEvents', folderPath)
      return false
    }
  }
}

// Vue 组合式 API
export function useFileWatcher() {
  const watcher = FileSystemWatcher.getInstance()

  return {
    watchers,
    isWatchingEnabled,
    watchFolder: watcher.watchFolder.bind(watcher),
    stopWatching: watcher.stopWatching.bind(watcher),
    stopAllWatchers: watcher.stopAllWatchers.bind(watcher),
    setWatchInterval: watcher.setWatchInterval.bind(watcher),
    getWatchInterval: watcher.getWatchInterval.bind(watcher),
    setWatchingEnabled: watcher.setWatchingEnabled.bind(watcher),
    isEnabled: watcher.isEnabled.bind(watcher),
    getWatchers: watcher.getWatchers.bind(watcher),
    getStats: watcher.getStats.bind(watcher),
    onFileChange: watcher.onFileChange.bind(watcher),
    offFileChange: watcher.offFileChange.bind(watcher)
  }
}

// 初始化文件监听器
export function initializeFileWatcher(interval: number = 2000): void {
  const watcher = FileSystemWatcher.getInstance()
  watcher.initialize(interval)
}