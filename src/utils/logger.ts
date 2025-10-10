import log from 'electron-log/renderer'

// 注意：Vite 在构建时会自动处理 import.meta.env
const isDev = import.meta.env.DEV

// 配置 Console Transport（渲染进程本地控制台）
// 开发环境：在 DevTools 中显示所有日志
// 生产环境：禁用本地控制台输出，避免性能影响
log.transports.console.level = isDev ? 'silly' : false

// 配置 IPC Transport（发送到主进程）
// 这是核心配置，确保渲染进程日志能写入文件
log.transports.ipc.level = isDev ? 'debug' : 'info'

// 替换全局 console
// 这样所有的 console.log/error/warn/info 都会自动使用 electron-log
Object.assign(console, log.functions)

// 开发环境：输出初始化信息
if (isDev) {
  console.info('[Renderer] iWriter Log System Initialized')
  console.info('[Renderer] Console level:', log.transports.console.level)
  console.info('[Renderer] IPC level:', log.transports.ipc.level)
}

export default log
