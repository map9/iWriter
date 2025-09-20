/**
 * Notification item types
 */
export enum NotificationType {
  INFORMATION = 'information', 
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Notification item interface
 */
export interface NotificationItem {
  readonly id: string
  readonly type: NotificationType
  message: string
  context?: string
  timestamp: Date
  priority: number
}

/**
 * Notification display options interface
 */
export interface NotificationDisplayOptions {
  // 显示时长，0表示永久显示
  duration?: number
  // 是否闪烁效果
  flash?: boolean
  // 文字颜色
  color?: string
  // 背景颜色
  backgroundColor?: string
}

/**
 * Conflict handling strategies
 */
export type ConflictStrategy = 'priority' | 'queue' | 'replace'

/**
 * Notification state for reactive display
 */
export interface NotificationState {
  currentNotification: NotificationItem | null
  displayOptions: NotificationDisplayOptions
  isVisible: boolean
}

/**
 * Notification manager interface
 */
export interface INotificationManager {
  // 发布消息
  publish(message: string, type: NotificationType, options?: { context?: string, priority?: number }): string

  // 显示消息（带显示选项）
  show(id: string, displayOptions?: NotificationDisplayOptions): void

  // 关闭当前显示的消息
  dismiss(): void

  // 清空所有消息
  clearAll(): void

  // 设置冲突策略
  setConflictStrategy(strategy: ConflictStrategy): void

  // 便捷方法
  success(message: string, context?: string): string
  info(message: string, context?: string): string
  warning(message: string, context?: string): string
  error(message: string, context?: string): string
  critical(message: string, context?: string): string

  // 获取响应式状态
  getState(): NotificationState
}