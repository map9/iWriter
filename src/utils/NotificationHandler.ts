import { ref } from 'vue'
import type { Notification } from '@/types'
import { NotificationType } from '@/types'

// 全局通知状态
const notifications = ref<Notification[]>([])
const callbacks = ref<Array<(notification: Notification) => void>>([])

// 默认显示时长配置
const DEFAULT_DURATIONS = {
  success: 3000,
  information: 3000,
  warning: 5000,
  error: 0, // 不自动关闭
  critical: 0 // 不自动关闭，强制手动关闭
}

export class NotificationHandler {
  // 添加通知
  static showNotification(notification: Notification) {
    // 设置默认时长
    if (!notification.duration) {
      notification.duration = DEFAULT_DURATIONS[notification.type] || 3000
    }
    
    notifications.value.push(notification)
    
    // 通知回调函数
    callbacks.value.forEach(callback => {
      callback(notification)
    })
    
    // console.log('Notification added:', notification)
  }

  // 快捷方法：成功通知
  static success(message: string, context?: string, duration?: number) {
    NotificationHandler.showNotification({
      type: NotificationType.SUCCESS,
      message,
      context,
      timestamp: new Date(),
      duration
    })
  }

  // 快捷方法：信息通知
  static info(message: string, context?: string, duration?: number) {
    NotificationHandler.showNotification({
      type: NotificationType.INFORMATION,
      message,
      context,
      timestamp: new Date(),
      duration
    })
  }

  // 快捷方法：警告通知
  static warning(message: string, context?: string, duration?: number) {
    NotificationHandler.showNotification({
      type: NotificationType.WARNING,
      message,
      context,
      timestamp: new Date(),
      duration
    })
  }

  // 快捷方法：错误通知
  static error(message: string, context?: string, duration?: number) {
    NotificationHandler.showNotification({
      type: NotificationType.ERROR,
      message,
      context,
      timestamp: new Date(),
      duration
    })
  }

  // 快捷方法：严重错误通知
  static critical(message: string, context?: string, duration?: number) {
    NotificationHandler.showNotification({
      type: NotificationType.CRITICAL,
      message,
      context,
      timestamp: new Date(),
      duration
    })
  }

  // 获取所有通知
  static getNotifications() {
    return notifications.value
  }

  // 清除指定通知
  static removeNotification(notification: Notification) {
    const index = notifications.value.findIndex(n => 
      n.timestamp.getTime() === notification.timestamp.getTime()
    )
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  // 清除所有通知
  static clearAll() {
    notifications.value.splice(0)
  }

  // 注册回调函数
  static onNotification(callback: (notification: Notification) => void) {
    callbacks.value.push(callback)
  }

  // 移除回调函数
  static removeCallback(callback: (notification: Notification) => void) {
    const index = callbacks.value.indexOf(callback)
    if (index > -1) {
      callbacks.value.splice(index, 1)
    }
  }
}

// 创建可在组件中使用的 composable
export function useNotificationHandler() {
  return {
    notifications,
    showNotification: NotificationHandler.showNotification,
    success: NotificationHandler.success,
    info: NotificationHandler.info,
    warning: NotificationHandler.warning,
    error: NotificationHandler.error,
    critical: NotificationHandler.critical,
    removeNotification: NotificationHandler.removeNotification,
    clearAll: NotificationHandler.clearAll,
    onNotification: NotificationHandler.onNotification,
    removeCallback: NotificationHandler.removeCallback
  }
}