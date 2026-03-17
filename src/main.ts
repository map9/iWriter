// 必须在最开始导入日志配置，确保所有日志都被捕获
import './utils/logger'
// Initialize AI provider registry
import './ai/index'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import './assets/styles/tiptap-toolbar.scss'
import './assets/styles/markdown-editor.scss'
import './assets/styles/proofread-highlight.scss'
import './assets/styles/popup-tools-highlight.scss'
import './assets/styles/popup-tools-highlight.scss'
import './assets/styles/search-highlight.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')