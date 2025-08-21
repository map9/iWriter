import type { BrowserWindow } from 'electron'
import Timer from '../src/utils/Timer'
import type { WindowContentState } from '../src/types/windowContentState'

// 窗口状态接口
export interface WindowState {
  id: number
  window: BrowserWindow
  isClosing: boolean
  alive: boolean
  aliveTimer?: Timer
  closeTimer?: Timer
  contentInfo?: WindowContentState
}

export interface GlobalParameters {
  autoSave: boolean
}

export interface ThemeListener{
  type: string
  handler: any 
}

export const HELLO_TIMEOUT = 5000              // 5秒
export const CLOSE_WINDOW_CONFIRMATION_TIMEOUT = 5000 // 5秒
export const QUIT_APP_CONFIRMATION_TIMEOUT = 10000 // 10秒
export const USE_CONFIRMATION_TIMEOUT = true

export interface IApp {
  readonly isAppQuitting: boolean
  exitApp: boolean
}