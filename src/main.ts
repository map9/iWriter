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

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(router)

app.mount('#app')

requestAnimationFrame(() => {
  document.documentElement.removeAttribute('data-theme-bootstrapping')
})
