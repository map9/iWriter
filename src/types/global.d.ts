// This file can be used for other global type declarations
import type { ElectronAPI } from './index'

declare global {
    interface Window {
    electronAPI: ElectronAPI
  }
}

export {}