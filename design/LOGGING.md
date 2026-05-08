# iWriter 日志系统使用指南

## 📚 目录

- [概述](#概述)
- [基础使用](#基础使用)
- [高级功能](#高级功能)
- [配置调整](#配置调整)
- [性能优化](#性能优化)
- [隐私保护](#隐私保护)
- [故障排查](#故障排查)

---

## 概述

iWriter 使用 `electron-log` 作为统一日志系统，支持主进程和渲染进程的日志统一输出到文件和控制台。

### 核心特性

- ✅ 主进程和渲染进程日志统一管理
- ✅ 自动写入日志文件
- ✅ 开发/生产环境自动适配
- ✅ 日志文件自动轮转（5MB 限制）
- ✅ 性能优化（日志节流）
- ✅ 隐私保护（数据脱敏）

### 日志文件位置

- **macOS**: `~/Library/Logs/iWriter/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\iWriter\logs\main.log`
- **Linux**: `~/.config/iWriter/logs/main.log`

---

## 基础使用

### 1. 使用原生 console（推荐）

所有 `console.*` 方法已自动替换为 electron-log，**无需修改现有代码**：

```typescript
// 主进程 (electron/*.ts)
console.log('普通日志')
console.info('信息日志')
console.warn('警告日志')
console.error('错误日志')
console.debug('调试日志')
```

```typescript
// 渲染进程 (src/**/*.ts, src/**/*.vue)
console.log('渲染进程日志')
console.error('渲染进程错误')
```

### 2. 使用 electron-log API（可选）

如果需要更高级的功能，可以导入 log 对象：

```typescript
// 主进程
import log from './logger'

log.info('使用 log API')
log.error('错误信息', { code: 500 })
```

```typescript
// 渲染进程
import log from '@/utils/logger'

log.info('渲染进程 log API')
```

---

## 高级功能

### 日志级别

electron-log 支持以下日志级别（从高到低）：

```typescript
log.error('错误')   // 严重错误
log.warn('警告')    // 警告信息
log.info('信息')    // 一般信息
log.verbose('详细') // 详细信息
log.debug('调试')   // 调试信息
log.silly('冗余')   // 所有信息
```

**环境差异**：

| 级别 | 开发环境 | 生产环境 |
|------|---------|---------|
| Console | silly | info |
| File | debug | info |
| IPC | debug | info |

### 日志作用域（Scope）

使用作用域可以为日志添加标签，便于分类：

```typescript
import log from './logger'

const fileLog = log.scope('file-ops')
fileLog.info('文件保存成功', filePath)
// 输出: [12:34:56.789] [info] (file-ops) › 文件保存成功 /path/to/file

const networkLog = log.scope('network')
networkLog.error('网络请求失败', { url, status })
// 输出: [12:34:56.789] [error] (network) › 网络请求失败 {...}
```

---

## 配置调整

### 临时调整日志级别

在开发环境中，可以临时调整特定文件或模块的日志级别：

```typescript
import log from './logger'

// 临时启用 silly 级别（调试特定功能）
log.transports.console.level = 'silly'
log.transports.file.level = 'debug'

// 你的调试代码
console.debug('详细调试信息')

// 调试完成后恢复
log.transports.console.level = 'info'
```

### 仅记录特定模块的日志

使用作用域 + 级别控制：

```typescript
import log from './logger'

// 创建带作用域的 logger
const updateLog = log.scope('updater')

// 仅在需要时输出
if (process.env.DEBUG_UPDATER) {
  updateLog.debug('更新检查详情', updateInfo)
}
```

### 禁用特定传输通道

```typescript
import log from './logger'

// 临时禁用控制台输出（减少噪音）
log.transports.console.level = false

// 临时禁用文件输出
log.transports.file.level = false
```

---

## 性能优化

### 1. 使用日志节流

对于高频日志（如循环、事件监听器），使用 `throttleLog` 避免性能影响：

```typescript
import { throttleLog } from './logger'

// 示例：文件监听器中的高频日志
watcher.on('change', (filePath) => {
  // 使用节流，最多每秒记录一次
  throttleLog('file-watcher', console.debug, 'File changed:', filePath)
})
```

**效果**：
- 原始：可能产生数千条日志/秒
- 节流后：最多 1 条日志/秒

### 2. 条件日志

仅在必要时记录详细日志：

```typescript
// 仅在开发环境记录详细信息
if (isDev) {
  console.debug('详细调试信息', complexObject)
}

// 生产环境仅记录错误
if (!isDev) {
  console.error('生产环境错误', error)
}
```

### 3. 延迟日志计算

避免在不需要时计算日志内容：

```typescript
// ❌ 不好：总是计算 JSON
console.debug('数据:', JSON.stringify(largeObject))

// ✅ 好：仅在需要时计算
if (log.transports.file.level === 'debug') {
  console.debug('数据:', JSON.stringify(largeObject))
}
```

---

## 隐私保护

### 1. 脱敏文件路径

使用 `sanitizePath` 隐藏用户完整路径：

```typescript
import { sanitizePath } from './logger'

const filePath = '/Users/john/Documents/secret.txt'
console.info('文件已保存:', sanitizePath(filePath))
// 输出: 文件已保存: ***/secret.txt
```

### 2. 脱敏用户数据

使用 `sanitizeUserData` 自动移除敏感字段：

```typescript
import { sanitizeUserData } from './logger'

const userData = {
  name: 'John',
  email: 'john@example.com',
  password: 'secret123',
  apiToken: 'xyz-abc-123'
}

console.info('用户数据:', sanitizeUserData(userData))
// 输出: { name: 'John', email: 'john@example.com', password: '***REDACTED***', apiToken: '***REDACTED***' }
```

### 3. 安全日志记录

使用 `safeLog` 一站式脱敏：

```typescript
import { safeLog } from './logger'

// 自动脱敏路径和数据
safeLog('info', '文件操作', '/Users/john/secret.txt', {
  password: '123',
  content: 'data'
})
// 输出: [info] 文件操作 ***/secret.txt { password: '***REDACTED***', content: 'data' }
```

---

## 故障排查

### 查看日志文件

```bash
# macOS
tail -f ~/Library/Logs/iWriter/main.log

# Linux
tail -f ~/.config/iWriter/logs/main.log

# Windows (PowerShell)
Get-Content "$env:USERPROFILE\AppData\Roaming\iWriter\logs\main.log" -Wait
```

### 查找特定日志

```bash
# 查找错误日志
grep "\[error\]" ~/Library/Logs/iWriter/main.log

# 查找渲染进程日志
grep "\[renderer\]" ~/Library/Logs/iWriter/main.log

# 查找今天的日志
grep "$(date +%Y-%m-%d)" ~/Library/Logs/iWriter/main.log
```

### 清理旧日志

```bash
# macOS/Linux
rm ~/Library/Logs/iWriter/main.old.log

# Windows
del %USERPROFILE%\AppData\Roaming\iWriter\logs\main.old.log
```

### 调试日志系统本身

在开发环境启动应用时，会输出日志系统初始化信息：

```
============================================================
iWriter Log System Initialized
Log file location: /Users/xxx/Library/Logs/iWriter/main.log
Environment: Development
Console level: silly
File level: debug
Max file size: 5MB
Max files: 5
============================================================
```

---

## 常见问题

### Q: 渲染进程日志没有写入文件？

**A**: 确保以下配置正确：

1. [src/main.ts](../src/main.ts) 已导入 `import './utils/logger'`
2. [electron/logger.ts](../electron/logger.ts) 中 `log.initialize({ spyRendererConsole: true })`
3. 检查 IPC transport 是否启用：`log.transports.ipc.level !== false`

### Q: 如何临时提高某个模块的日志级别？

**A**: 在模块中临时调整：

```typescript
// 在模块开头
const originalLevel = log.transports.console.level
log.transports.console.level = 'debug'

// 你的调试代码
console.debug('详细信息')

// 模块结束时恢复
log.transports.console.level = originalLevel
```

### Q: 生产环境日志太多，如何减少？

**A**: 调整 [electron/logger.ts](../electron/logger.ts) 中的 `LOG_LEVELS.file.prod`：

```typescript
const LOG_LEVELS = {
  file: {
    prod: 'warn' as const  // 仅记录警告和错误
  }
}
```

### Q: 如何为不同功能模块使用不同的日志级别？

**A**: 使用作用域 + 条件判断：

```typescript
const DEBUG_MODULES = ['updater', 'file-watcher']
const moduleLog = log.scope('updater')

if (DEBUG_MODULES.includes('updater')) {
  moduleLog.debug('详细调试信息')
}
```

---

## 示例代码

### 文件操作日志

```typescript
import { safeLog, sanitizePath } from './logger'

async function saveFile(filePath: string, content: string) {
  try {
    safeLog('info', '开始保存文件', filePath)
    await fs.writeFile(filePath, content)
    safeLog('info', '文件保存成功', filePath)
  } catch (error) {
    console.error('文件保存失败:', sanitizePath(filePath), error)
  }
}
```

### 网络请求日志

```typescript
import { throttleLog } from './logger'

async function fetchData(url: string) {
  // 高频请求使用节流
  throttleLog('network-fetch', console.debug, 'Fetching:', url)

  try {
    const response = await fetch(url)
    console.info('请求成功:', response.status)
    return response.json()
  } catch (error) {
    console.error('请求失败:', url, error)
    throw error
  }
}
```

### 性能监控日志

```typescript
function measurePerformance(label: string, fn: () => void) {
  const start = performance.now()
  console.time(label)

  fn()

  console.timeEnd(label)
  const duration = performance.now() - start

  if (duration > 1000) {
    console.warn(`性能警告: ${label} 耗时 ${duration.toFixed(2)}ms`)
  }
}
```

---

## 参考资料

- [electron-log 官方文档](https://github.com/megahertz/electron-log)
- [日志系统设计方案](./LOGGING-DESIGN.md)
- [配置文件: electron/logger.ts](../electron/logger.ts)
- [配置文件: src/utils/logger.ts](../src/utils/logger.ts)

---

**版本**: 1.0
**最后更新**: 2025-10-10
