// 通知类型枚举
export enum NotificationType {
  SUCCESS = 'success',
  INFORMATION = 'information', 
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// 通用通知接口
export interface Notification {
  type: NotificationType
  message: string
  details?: string
  context?: string
  timestamp: Date
  duration?: number  // 自定义显示时长，毫秒
}