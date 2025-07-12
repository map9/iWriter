/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

import type { ElectronAPI } from './src/types/index'

interface Window {
  electronAPI: ElectronAPI
}