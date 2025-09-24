import { useNotification } from '@/components/common/statusbar'
const notification = useNotification()

// 导出便捷的全局通知方法
export const notify = {
  success: (message: string, context?: string) => {
    notification.success(message, context)
    console.info(context ? `${context}: ${message}` : message)
  },
  
  info: (message: string, context?: string) => {
    notification.info(message, context)
    console.info(context ? `${context}: ${message}` : message)
  },
  
  warning: (message: string, context?: string) => {
    notification.warning(message, context)
    console.warn(context ? `${context}: ${message}` : message)
  },
  
  error: (message: string, context?: string) => {
    notification.error(message, context)
    console.error(context ? `${context}: ${message}` : message)
  },
  
  critical: (message: string, context?: string) => {
    notification.critical(message, context)
    console.error(context ? `${context}: ${message}` : message)
  }
}

export default notify