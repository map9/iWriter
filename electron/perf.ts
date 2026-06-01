/**
 * 启动性能计时器
 *
 * 必须作为 electron/main.ts 中的第一个 import，在 logger 之前求值，
 * 以捕获最早的进程时间戳。不依赖任何其它模块。
 *
 * 开发模式或环境变量 IWRITER_PERF=1 时输出日志。
 */

const _enabled =
  process.env.NODE_ENV !== 'production' || process.env['IWRITER_PERF'] === '1'

const _t0 = process.hrtime.bigint()

/**
 * 输出距进程启动的耗时（毫秒），label 用于标识阶段。
 * 生产环境下静默，不产生任何输出。
 */
export function perfLog(label: string): void {
  if (!_enabled) return
  const ms = Number(process.hrtime.bigint() - _t0) / 1e6
  // 直接写 stdout，避免依赖尚未初始化的 logger
  process.stdout.write(`[PERF][main] ${label}: +${ms.toFixed(1)}ms\n`)
}
