import { ipcMain, systemPreferences, nativeTheme } from 'electron'

import { isMac } from './utils'
import type { ThemeListener } from './types'

export class ThemeManager {
  private themeListeners: ThemeListener[]
  private sendSystemColorsChanged: ({theme, newColors}) => void

  constructor() {
    this.themeListeners = []
    this.sendSystemColorsChanged = ({theme, newColors}) => {}

    this.setupIpcHandlers()
    this.setupThemeListeners()
  }

  setSendSystemColorsChanged(callback: ({theme, newColors}) => void) {
    this.sendSystemColorsChanged = callback;
  }

  // 获取系统颜色
  getSystemColors() {  
    let colors: any = null
    
    try {
      if (isMac) {
        colors = {
          // 风格色
          accent: {
            primary: systemPreferences.getAccentColor(),
          },
          // 背景色
          background: {
            window: systemPreferences.getColor('window-background'),
            content: systemPreferences.getColor('control-background'),
            underpage: systemPreferences.getColor('under-page-background'),
            selected: systemPreferences.getColor('selected-content-background')
          },
          // 文本色
          text: {
            base: systemPreferences.getColor('text'),
            primary: systemPreferences.getColor('label'),
            secondary: systemPreferences.getColor('secondary-label'),
            tertiary: systemPreferences.getColor('tertiary-label'),
          },
          // 边框和分隔线
          border: {
            primary: systemPreferences.getColor('separator'),
            secondary: systemPreferences.getColor('grid'),
            shadow: systemPreferences.getColor('shadow'),
          },
          // 交互色
          interactive: {
            control: systemPreferences.getColor('control'),
            elevated: systemPreferences.getColor('selected-text-background'),
            focus: systemPreferences.getColor('keyboard-focus-indicator'),
            link: systemPreferences.getColor('link'),
            highlight: systemPreferences.getColor('find-highlight'),
          },
          other: {
            controlText: systemPreferences.getColor('control-text'),
            disabledControlText: systemPreferences.getColor('disabled-control-text'),
            headerText: systemPreferences.getColor('header-text'),
            highlight0: systemPreferences.getColor('highlight'),
            placeholderText: systemPreferences.getColor('placeholder-text'),
            scrubberTexturedBackground: systemPreferences.getColor('scrubber-textured-background'),
            selectedControl: systemPreferences.getColor('selected-control'),
            selectedControlText: systemPreferences.getColor('selected-control-text'),
            selectedMenuItemText: systemPreferences.getColor('selected-menu-item-text'),
            selectedText: systemPreferences.getColor('selected-text'),
            textBackground: systemPreferences.getColor('text-background'),
            windowFrameText: systemPreferences.getColor('window-frame-text'),
            unemphasizedSelectedContentBackground: systemPreferences.getColor('unemphasized-selected-content-background'),
            unemphasizedSelectedTextBackground: systemPreferences.getColor('unemphasized-selected-text-background'),
            unemphasizedSelectedText: systemPreferences.getColor('unemphasized-selected-text'),
          }
        }
      } else if (process.platform === 'win32') {
        console.warn('need to fixed')

      }
    } catch (error) {
      console.warn('获取系统颜色失败:', error)
    }

    return colors
  }

  private setupIpcHandlers() {
    // 向渲染进程提供系统颜色
    ipcMain.handle('get-system-colors', () => {
      let theme = 'unknown'
      if (isMac) {
        theme = systemPreferences.getEffectiveAppearance()
      }
      else if (process.platform === 'win32' || process.platform === 'linux') {
        theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
      }

      return {theme, newColors: this.getSystemColors()}
    })
  }

  private setupThemeListeners() {
    if (isMac) {
      const themeHandler = () => {
        const theme = systemPreferences.getEffectiveAppearance()
        // 系统主题改变时的回调
        const newColors = this.getSystemColors()
        this.sendSystemColorsChanged({theme, newColors})
      }
      // macOS: 使用 systemPreferences.subscribeNotification
      const themeId = systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', themeHandler)
      const colorId = systemPreferences.subscribeNotification('AppleColorPreferencesChangedNotification', themeHandler)
      
      this.themeListeners.push({ type: 'notification', handler: themeId })
      this.themeListeners.push({ type: 'notification', handler: colorId })
      
    } else if (process.platform === 'win32') {
      // Windows: 使用 nativeTheme 事件
      const themeHandler = () => {
        const newColors = this.getSystemColors()
        const theme = nativeTheme.shouldUseDarkColors
        this.sendSystemColorsChanged({theme, newColors})
      }
      
      nativeTheme.on('updated', themeHandler)
      this.themeListeners.push({ type: 'event', handler: themeHandler })
      
    } else if (process.platform === 'linux') {
      // Linux: 可以使用 nativeTheme 或者监听 GTK 主题变化
      const themeHandler = () => {
        const theme = nativeTheme.shouldUseDarkColors
        // Linux 下的系统颜色获取比较有限
        this.sendSystemColorsChanged({theme, newColors: null})
      }
      
      nativeTheme.on('updated', themeHandler)
      this.themeListeners.push({ type: 'event', handler: themeHandler })
    }
  }

  private removeThemeListeners() {
    this.themeListeners.forEach(listener => {
      if (listener.type === 'notification') {
        // macOS 通知取消
        systemPreferences.unsubscribeNotification(listener.handler)
      } else if (listener.type === 'event') {
        // Windows/Linux 事件取消
        nativeTheme.removeListener('updated', listener.handler)
      }
    })
    this.themeListeners.length = 0
  }

  destroy(): void {
    ipcMain.removeHandler('get-system-colors')
    this.removeThemeListeners()
  }
}