import { ref } from 'vue'
import type { AppError } from '@/types'
import { ErrorType, ErrorSeverity, NotificationType } from '@/types'
import { notify } from '@/utils/notifications'

// 错误状态管理
export const errors = ref<AppError[]>([])
export const lastError = ref<AppError | null>(null)

// 错误处理器类
export class ErrorHandler {
  private static instance: ErrorHandler
  private maxErrors = 100 // 最大错误数量
  private errorCallbacks: ((error: AppError) => void)[] = []

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
  }

  // 创建错误对象
  static createError(
    type: ErrorType,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: string,
    details?: string,
    code?: string
  ): AppError {
    return {
      type,
      severity,
      message,
      details,
      code,
      context,
      timestamp: new Date(),
      stack: new Error().stack
    }
  }

  // 处理错误
  static handle(error: AppError | Error | string, context?: string): void {
    const handler = ErrorHandler.getInstance()
    
    let appError: AppError

    if (typeof error === 'string') {
      appError = ErrorHandler.createError(
        ErrorType.UNKNOWN,
        error,
        ErrorSeverity.MEDIUM,
        context
      )
    } else if (error instanceof Error) {
      appError = ErrorHandler.createError(
        ErrorHandler.getErrorTypeFromMessage(error.message),
        error.message,
        ErrorSeverity.MEDIUM,
        context,
        error.stack
      )
    } else {
      appError = { ...error, context: context || error.context }
    }

    handler.addError(appError)
    handler.notifyCallbacks(appError)
    handler.logError(appError)
    
    // 使用通知系统显示错误
    handler.showErrorNotification(appError)
  }

  // 文件系统错误处理
  static handleFileSystemError(error: any, operation: string, filePath?: string): AppError {
    let message = `文件操作失败: ${operation}`
    let code = 'FS_ERROR'
    
    if (filePath) {
      message += ` (${filePath})`
    }

    if (error.code) {
      switch (error.code) {
        case 'ENOENT':
          message = '文件或目录不存在'
          code = 'FILE_NOT_FOUND'
          break
        case 'EACCES':
          message = '没有访问权限'
          code = 'PERMISSION_DENIED'
          break
        case 'EEXIST':
          message = '文件或目录已存在'
          code = 'FILE_EXISTS'
          break
        case 'EMFILE':
          message = '打开的文件过多'
          code = 'TOO_MANY_FILES'
          break
        case 'ENOSPC':
          message = '磁盘空间不足'
          code = 'NO_SPACE'
          break
        default:
          message += `: ${error.message}`
      }
    }

    const appError = ErrorHandler.createError(
      ErrorType.FILE_SYSTEM,
      message,
      ErrorSeverity.HIGH,
      `文件操作: ${operation}`,
      error.stack,
      code
    )

    ErrorHandler.handle(appError)
    return appError
  }

  // 网络错误处理
  static handleNetworkError(error: any, context?: string): AppError {
    const appError = ErrorHandler.createError(
      ErrorType.NETWORK,
      `网络错误: ${error.message || '未知网络错误'}`,
      ErrorSeverity.MEDIUM,
      context,
      error.stack,
      error.code
    )

    ErrorHandler.handle(appError)
    return appError
  }

  // 验证错误处理
  static handleValidationError(message: string, context?: string): AppError {
    const appError = ErrorHandler.createError(
      ErrorType.VALIDATION,
      message,
      ErrorSeverity.LOW,
      context
    )

    ErrorHandler.handle(appError)
    return appError
  }

  // 权限错误处理
  static handlePermissionError(message: string, context?: string): AppError {
    const appError = ErrorHandler.createError(
      ErrorType.PERMISSION,
      message,
      ErrorSeverity.HIGH,
      context,
      undefined,
      'PERMISSION_DENIED'
    )

    ErrorHandler.handle(appError)
    return appError
  }

  // 添加错误到列表
  private addError(error: AppError): void {
    errors.value.unshift(error)
    lastError.value = error

    // 限制错误数量
    if (errors.value.length > this.maxErrors) {
      errors.value = errors.value.slice(0, this.maxErrors)
    }
  }

  // 记录错误日志
  private logError(error: AppError): void {
    const logLevel = this.getLogLevel(error.severity)
    const logMessage = `[${error.type}] ${error.message}`
    
    if (error.context) {
      console.log(`Context: ${error.context}`)
    }
    
    if (error.details) {
      console.log(`Details: ${error.details}`)
    }

    switch (logLevel) {
      case 'error':
        console.error(logMessage, error)
        break
      case 'warn':
        console.warn(logMessage, error)
        break
      default:
        console.log(logMessage, error)
    }
  }

  // 使用通知系统显示错误
  private showErrorNotification(error: AppError): void {
    // 将错误严重程度映射到通知类型
    let notificationType: NotificationType
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        notificationType = NotificationType.CRITICAL
        break
      case ErrorSeverity.HIGH:
        notificationType = NotificationType.ERROR
        break
      case ErrorSeverity.MEDIUM:
        notificationType = NotificationType.WARNING
        break
      case ErrorSeverity.LOW:
        notificationType = NotificationType.WARNING
        break
      default:
        notificationType = NotificationType.ERROR
    }
    
    // 根据通知类型调用相应的通知方法
    const context = error.context || this.getErrorTypeLabel(error.type)
    
    switch (notificationType) {
      case NotificationType.CRITICAL:
        notify.critical(error.message, context)
        break
      case NotificationType.ERROR:
        notify.error(error.message, context)
        break
      case NotificationType.WARNING:
        notify.warning(error.message, context)
        break
      default:
        notify.error(error.message, context)
    }
  }
  
  // 获取错误类型标签
  private getErrorTypeLabel(type: ErrorType): string {
    switch (type) {
      case ErrorType.FILE_SYSTEM:
        return '文件系统错误'
      case ErrorType.NETWORK:
        return '网络错误'
      case ErrorType.VALIDATION:
        return '验证错误'
      case ErrorType.PERMISSION:
        return '权限错误'
      default:
        return '系统错误'
    }
  }

  // 获取日志级别
  private getLogLevel(severity: ErrorSeverity): 'log' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error'
      case ErrorSeverity.MEDIUM:
        return 'warn'
      default:
        return 'log'
    }
  }

  // 从错误消息推断错误类型
  private static getErrorTypeFromMessage(message: string): ErrorType {
    if (message.includes('ENOENT') || message.includes('file') || message.includes('directory')) {
      return ErrorType.FILE_SYSTEM
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return ErrorType.NETWORK
    }
    if (message.includes('permission') || message.includes('access')) {
      return ErrorType.PERMISSION
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorType.VALIDATION
    }
    return ErrorType.UNKNOWN
  }

  // 注册错误回调
  onError(callback: (error: AppError) => void): void {
    this.errorCallbacks.push(callback)
  }

  // 移除错误回调
  offError(callback: (error: AppError) => void): void {
    const index = this.errorCallbacks.indexOf(callback)
    if (index > -1) {
      this.errorCallbacks.splice(index, 1)
    }
  }

  // 通知所有回调
  private notifyCallbacks(error: AppError): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error)
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError)
      }
    })
  }

  // 清除错误
  static clearErrors(): void {
    errors.value = []
    lastError.value = null
  }

  // 清除特定类型的错误
  static clearErrorsByType(type: ErrorType): void {
    errors.value = errors.value.filter(error => error.type !== type)
    if (lastError.value?.type === type) {
      lastError.value = errors.value[0] || null
    }
  }

  // 获取错误统计
  static getErrorStats(): Record<ErrorType, number> {
    const stats: Record<ErrorType, number> = {
      [ErrorType.FILE_SYSTEM]: 0,
      [ErrorType.NETWORK]: 0,
      [ErrorType.VALIDATION]: 0,
      [ErrorType.PERMISSION]: 0,
      [ErrorType.UNKNOWN]: 0
    }

    errors.value.forEach(error => {
      stats[error.type]++
    })

    return stats
  }
}

// 便捷的错误处理函数
export const handleError = ErrorHandler.handle
export const handleFileSystemError = ErrorHandler.handleFileSystemError
export const handleNetworkError = ErrorHandler.handleNetworkError
export const handleValidationError = ErrorHandler.handleValidationError
export const handlePermissionError = ErrorHandler.handlePermissionError

// Vue 组合式 API
export function useErrorHandler() {
  const errorHandler = ErrorHandler.getInstance()

  return {
    errors,
    lastError,
    handleError: ErrorHandler.handle,
    handleFileSystemError: ErrorHandler.handleFileSystemError,
    handleNetworkError: ErrorHandler.handleNetworkError,
    handleValidationError: ErrorHandler.handleValidationError,
    handlePermissionError: ErrorHandler.handlePermissionError,
    clearErrors: ErrorHandler.clearErrors,
    clearErrorsByType: ErrorHandler.clearErrorsByType,
    getErrorStats: ErrorHandler.getErrorStats,
    onError: errorHandler.onError.bind(errorHandler),
    offError: errorHandler.offError.bind(errorHandler)
  }
}