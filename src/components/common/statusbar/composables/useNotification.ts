import { notificationManager } from '../core/NotificationManager'
import type { NotificationDisplayOptions, ConflictStrategy } from '../types'
import { NotificationType } from '../types'

export function useNotification() {
  const state = notificationManager.getState()

  // 发布消息
  const publish = (message: string, type: NotificationType, options?: { context?: string, priority?: number }) => {
    return notificationManager.publish(message, type, options)
  }

  // 显示消息
  const show = (id: string, displayOptions?: NotificationDisplayOptions) => {
    notificationManager.show(id, displayOptions)
  }

  // 关闭当前通知
  const dismiss = () => {
    notificationManager.dismiss()
  }

  // 清空所有通知
  const clearAll = () => {
    notificationManager.clearAll()
  }

  // 设置冲突策略
  const setConflictStrategy = (strategy: ConflictStrategy) => {
    notificationManager.setConflictStrategy(strategy)
  }

  // 便捷方法
  const success = (message: string, context?: string) => {
    return notificationManager.success(message, context)
  }

  const info = (message: string, context?: string) => {
    return notificationManager.info(message, context)
  }

  const warning = (message: string, context?: string) => {
    return notificationManager.warning(message, context)
  }

  const error = (message: string, context?: string) => {
    return notificationManager.error(message, context)
  }

  const critical = (message: string, context?: string) => {
    return notificationManager.critical(message, context)
  }

  return {
    // 响应式状态
    state,

    // 核心方法
    publish,
    show,
    dismiss,
    clearAll,
    setConflictStrategy,

    // 便捷方法
    success,
    info,
    warning,
    error,
    critical
  }
}