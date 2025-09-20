import { reactive, computed } from 'vue'
import type {
  INotificationManager,
  NotificationItem,
  NotificationDisplayOptions,
  NotificationState,
  ConflictStrategy
} from '../types'
import { NotificationType } from '../types'

export class NotificationManager implements INotificationManager {
  private notifications: NotificationItem[] = []
  private displayQueue: NotificationItem[] = []
  private conflictStrategy: ConflictStrategy = 'priority'
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1

  // 唯一的响应式状态对象
  private _state: {
    currentNotification: NotificationItem | null,
    displayOptions: NotificationDisplayOptions,
    isVisible: boolean
  } = reactive({
    currentNotification: null,
    displayOptions: {} as NotificationDisplayOptions,
    isVisible: computed(() => !!this._state.currentNotification)
  })
  
  // 默认优先级映射
  private static readonly DEFAULT_PRIORITIES = {
    [NotificationType.INFORMATION]: 1,
    [NotificationType.SUCCESS]: 2,
    [NotificationType.WARNING]: 3,
    [NotificationType.ERROR]: 4,
    [NotificationType.CRITICAL]: 5,
  }

  // 默认显示选项
  private static readonly DEFAULT_DISPLAY_OPTIONS = {
    [NotificationType.INFORMATION]: { duration: 1500, flash: false },
    [NotificationType.SUCCESS]: { duration: 1500, flash: false },
    [NotificationType.WARNING]: { duration: 2000, flash: false },
    [NotificationType.ERROR]: { duration: 0, flash: false },
    [NotificationType.CRITICAL]: { duration: 0, flash: true }
  }

  publish(
    message: string,
    type: NotificationType,
    options?: { context?: string, priority?: number }
  ): string {
    const id = `notification-${this.nextId++}`
    const priority = options?.priority || NotificationManager.DEFAULT_PRIORITIES[type]

    const notification: NotificationItem = {
      id,
      type,
      message,
      context: options?.context,
      timestamp: new Date(),
      priority
    }

    this.notifications.push(notification)
    this.processNotification(notification)
    return id
  }

  show(id: string, displayOptions?: NotificationDisplayOptions): void {
    const notification = this.notifications.find(n => n.id === id)
    if (!notification) return

    const options = {
      ...NotificationManager.DEFAULT_DISPLAY_OPTIONS[notification.type],
      ...displayOptions
    }

    this.displayNotification(notification, options)
  }

  dismiss(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }

    this._state.currentNotification = null
    this._state.displayOptions = {}

    // 处理下一个消息
    this.processQueue()
  }

  clearAll(): void {
    this.notifications = []
    this.displayQueue = []
    this.dismiss()
  }

  setConflictStrategy(strategy: ConflictStrategy): void {
    this.conflictStrategy = strategy
  }

  // 便捷方法
  success(message: string, context?: string): string {
    return this.publish(message, NotificationType.SUCCESS, { context })
  }

  info(message: string, context?: string): string {
    return this.publish(message, NotificationType.INFORMATION, { context })
  }

  warning(message: string, context?: string): string {
    return this.publish(message, NotificationType.WARNING, { context })
  }

  error(message: string, context?: string): string {
    return this.publish(message, NotificationType.ERROR, { context })
  }

  critical(message: string, context?: string): string {
    return this.publish(message, NotificationType.CRITICAL, { context })
  }

  getState(): NotificationState {
    return this._state
  }

  // 私有方法
  private processNotification(notification: NotificationItem): void {
    const options = NotificationManager.DEFAULT_DISPLAY_OPTIONS[notification.type]

    switch (this.conflictStrategy) {
      case 'priority':
        this.handlePriorityStrategy(notification, options)
        break
      case 'queue':
        this.handleQueueStrategy(notification, options)
        break
      case 'replace':
        this.handleReplaceStrategy(notification, options)
        break
    }
  }

  private handlePriorityStrategy(notification: NotificationItem, options: NotificationDisplayOptions): void {
    if (!this._state.currentNotification) {
      // 没有当前显示的消息，直接显示
      this.displayNotification(notification, options)
    } else if (notification.priority > this._state.currentNotification.priority) {
      // 新消息优先级更高，打断当前显示
      this.displayQueue.unshift(this._state.currentNotification)
      this.displayNotification(notification, options)
    } else {
      // 新消息优先级较低，加入队列
      this.addToQueue(notification)
    }
  }

  private handleQueueStrategy(notification: NotificationItem, options: NotificationDisplayOptions): void {
    if (!this._state.currentNotification) {
      this.displayNotification(notification, options)
    } else {
      this.addToQueue(notification)
    }
  }

  private handleReplaceStrategy(notification: NotificationItem, options: NotificationDisplayOptions): void {
    this.displayNotification(notification, options)
  }

  private addToQueue(notification: NotificationItem): void {
    // 按优先级插入队列
    const index = this.displayQueue.findIndex(n => n.priority < notification.priority)
    if (index === -1) {
      this.displayQueue.push(notification)
    } else {
      this.displayQueue.splice(index, 0, notification)
    }
  }

  private displayNotification(notification: NotificationItem, options: NotificationDisplayOptions): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }

    this._state.currentNotification = notification
    this._state.displayOptions = { ...options }

    // 设置自动关闭定时器
    if (options.duration && options.duration > 0) {
      this.autoCloseTimer = setTimeout(() => {
        this.dismiss()
      }, options.duration)
    }
  }

  private processQueue(): void {
    if (this.displayQueue.length > 0) {
      const next = this.displayQueue.shift()!
      const options = NotificationManager.DEFAULT_DISPLAY_OPTIONS[next.type]
      this.displayNotification(next, options)
    }
  }
}

// Singleton instance
export const notificationManager = new NotificationManager()