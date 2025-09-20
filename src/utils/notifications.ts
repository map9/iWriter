import { useNotification } from '@/components/common/statusbar'
const notification = useNotification()

// 导出便捷的全局通知方法
export const notify = {
  success: (message: string, context?: string) => {
    notification.success(message, context)
    console.info(`${context}: ${message}.`)
  },
  
  info: (message: string, context?: string) => {
    notification.info(message, context)
    console.info(`${context}: ${message}.`)
  },
  
  warning: (message: string, context?: string) => {
    notification.warning(message, context)
    console.warn(`${context}: ${message}.`)
  },
  
  error: (message: string, context?: string) => {
    notification.error(message, context)
    console.error(`${context}: ${message}.`)
  },
  
  critical: (message: string, context?: string) => {
    notification.critical(message, context)
    console.error(`${context}: ${message}.`)
  }
}

export default notify