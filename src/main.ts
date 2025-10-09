import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import './assets/styles/tiptap-toolbar.scss'
import './assets/styles/markdown-editor.scss'
import './assets/styles/proofread-highlight.scss'
import './assets/styles/popup-tools-highlight.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')