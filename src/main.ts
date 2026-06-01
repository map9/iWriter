// 必须在最开始导入日志配置，确保所有日志都被捕获
import './utils/logger'
// Initialize AI provider registry
import './ai/index'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './style.css'

// pdfjs-dist 5.x 使用 Map.prototype.getOrInsertComputed（TC39 提案），
// Electron 40（Chrome 130）尚未内置此 API，此处提前注入 polyfill。
// 必须在任何 pdfjs-dist 代码求值之前运行（pdfjs 已改为懒加载，此处 always-before）。
if (!('getOrInsertComputed' in Map.prototype)) {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value: function <K, V>(this: Map<K, V>, key: K, computeFn: (key: K) => V): V {
      if (!this.has(key)) this.set(key, computeFn(key))
      return this.get(key) as V
    },
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

// Phase 0: 渲染进程启动计时（dev 或 IWRITER_PERF=1 时输出）
const _perfEnabled = import.meta.env.DEV || import.meta.env.VITE_IWRITER_PERF === '1'
function _perfLog(label: string): void {
  if (!_perfEnabled) return
  console.info(`[PERF][renderer] ${label}: +${performance.now().toFixed(1)}ms`)
  performance.mark(label)
}

_perfLog('modules imported')

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(router)

app.mount('#app')
_perfLog('app.mount done')

requestAnimationFrame(() => {
  document.documentElement.removeAttribute('data-theme-bootstrapping')
})
