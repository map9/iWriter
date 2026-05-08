import log from 'electron-log/main'
import { isDev } from './utils'

// ============================================================
// 日志系统配置常量
// ============================================================

// 日志级别配置
const LOG_LEVELS = {
  console: {
    dev: 'silly' as const,
    prod: 'info' as const
  },
  file: {
    dev: 'debug' as const,
    prod: 'info' as const
  },
  ipc: {
    dev: 'debug' as const,
    prod: 'info' as const
  }
}

// 日志文件配置
const FILE_CONFIG = {
  maxSize: 5 * 1024 * 1024,  // 5MB
  maxFiles: 5,                 // 保留最多 5 个日志文件
}

// ============================================================
// 初始化日志系统
// ============================================================

// 启用渲染进程日志捕获
// spyRendererConsole 已禁用：渲染进程通过 IPC transport 主动发送日志，避免重复输出
log.initialize({
  preload: true,
  spyRendererConsole: false
})

// ============================================================
// Console Transport 配置
// ============================================================

log.transports.console.level = isDev ? LOG_LEVELS.console.dev : LOG_LEVELS.console.prod
log.transports.console.format = isDev
  ? '[{h}:{i}:{s}.{ms}] [{level}] {text}'
  : '[{level}] {text}'

// ============================================================
// File Transport 配置
// ============================================================

log.transports.file.level = isDev ? LOG_LEVELS.file.dev : LOG_LEVELS.file.prod
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{processType}] [{level}] {text}'

// 日志文件大小和轮转配置
log.transports.file.maxSize = FILE_CONFIG.maxSize

// 自定义日志文件名（包含日期）
log.transports.file.fileName = isDev ? 'main.log' : 'main.log'

// ============================================================
// IPC Transport 配置（接收渲染进程日志）
// ============================================================

log.transports.ipc.level = isDev ? LOG_LEVELS.ipc.dev : LOG_LEVELS.ipc.prod

// ============================================================
// 性能优化：日志节流
// ============================================================

// 为高频日志添加节流机制
const throttledLogs = new Map<string, number>()
const THROTTLE_INTERVAL = 1000 // 1秒

/**
 * 节流日志输出，避免高频日志影响性能
 * @param key 日志唯一标识
 * @param logFn 日志函数
 * @param args 日志参数
 */
function throttleLog(key: string, logFn: (...args: unknown[]) => void, ...args: unknown[]) {
  const now = Date.now()
  const lastLog = throttledLogs.get(key)

  if (!lastLog || now - lastLog > THROTTLE_INTERVAL) {
    throttledLogs.set(key, now)
    logFn(...args)
  }
}

// ============================================================
// 隐私保护：数据脱敏工具
// ============================================================

/**
 * 脱敏文件路径，仅保留文件名
 * @param filePath 完整文件路径
 * @returns 脱敏后的路径
 */
function sanitizePath(filePath: string): string {
  if (!filePath) return ''

  // 仅返回文件名，隐藏完整路径
  const fileName = filePath.split(/[/\\]/).pop() || filePath
  return `***/${fileName}`
}

/**
 * 脱敏用户数据，移除敏感信息
 * @param data 用户数据对象
 * @returns 脱敏后的数据
 */
function sanitizeUserData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data

  const sanitized: Record<string, unknown> = { ...(data as Record<string, unknown>) }
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'credential']

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '***REDACTED***'
    }
  }

  return sanitized
}

/**
 * 安全日志记录：自动脱敏文件路径
 * @param level 日志级别
 * @param message 日志消息
 * @param filePath 文件路径（可选）
 * @param extra 额外数据（可选）
 */
function safeLog(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  filePath?: string,
  extra?: unknown
) {
  const sanitizedPath = filePath ? sanitizePath(filePath) : undefined
  const sanitizedExtra = extra ? sanitizeUserData(extra) : undefined

  if (sanitizedPath && sanitizedExtra) {
    log[level](message, sanitizedPath, sanitizedExtra)
  } else if (sanitizedPath) {
    log[level](message, sanitizedPath)
  } else if (sanitizedExtra) {
    log[level](message, sanitizedExtra)
  } else {
    log[level](message)
  }
}

// ============================================================
// 全局 console 替换
// ============================================================

Object.assign(console, log.functions)

// ============================================================
// 开发环境：输出初始化信息
// ============================================================

if (isDev) {
  console.info('='.repeat(60))
  console.info('iWriter Log System Initialized')
  console.info('Log file location:', log.transports.file.getFile()?.path)
  console.info('Environment:', isDev ? 'Development' : 'Production')
  console.info('Console level:', log.transports.console.level)
  console.info('File level:', log.transports.file.level)
  console.info('Max file size:', `${FILE_CONFIG.maxSize / 1024 / 1024}MB`)
  console.info('Max files:', FILE_CONFIG.maxFiles)
  console.info('='.repeat(60))
}

// ============================================================
// 生产环境：错误捕获
// ============================================================

if (!isDev) {
  log.errorHandler.startCatching({
    showDialog: false,
    onError: (error) => {
      log.error('Uncaught error:', error)
    }
  })
}

// ============================================================
// 导出日志工具
// ============================================================

export default log

export {
  throttleLog,
  sanitizePath,
  sanitizeUserData,
  safeLog,
  LOG_LEVELS,
  FILE_CONFIG
}
