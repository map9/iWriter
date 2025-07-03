// 全局通知工具 - 可在应用的任何位置调用
import { NotificationHandler } from './NotificationHandler'

// 导出便捷的全局通知方法
export const notify = {
  success: (message: string, context?: string, duration?: number) => {
    NotificationHandler.success(message, context, duration)
  },
  
  info: (message: string, context?: string, duration?: number) => {
    NotificationHandler.info(message, context, duration)
  },
  
  warning: (message: string, context?: string, duration?: number) => {
    NotificationHandler.warning(message, context, duration)
  },
  
  error: (message: string, context?: string, duration?: number) => {
    NotificationHandler.error(message, context, duration)
  },
  
  critical: (message: string, context?: string, duration?: number) => {
    NotificationHandler.critical(message, context, duration)
  }
}

// 使用示例:
// import { notify } from '@/utils/notifications'
// notify.success('文件保存成功!')
// notify.error('无法连接到服务器')
// notify.critical('严重错误：数据损坏')

export default notify