import { BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import { merge } from 'lodash'

import Timer from '../src/utils/Timer'
import type { WindowContentState } from '../src/types/windowContentState'

import { isDev } from './utils'
import type { WindowState, IApp } from './types'
import { USE_CONFIRMATION_TIMEOUT, HELLO_TIMEOUT, CLOSE_WINDOW_CONFIRMATION_TIMEOUT } from './types'


export class WindowManager {
  private appInstance: IApp
  private updateMenu: () => void
  private _windows: WindowState[]

  constructor(appInstance: IApp) {
    this.appInstance = appInstance
    this.updateMenu = () => {}
    this._windows = []
    
    this.setupIpcHandlers()
  }

  get windows(): WindowState[] {
    return this._windows
  }

  getWindowCount(): number {
    return this.windows.length
  }

  getWindowStateById(windowId: number): WindowState | undefined {
    return this._windows.find(w => w.id === windowId)
  }

  closeAllWindows() {
    this.windows.forEach(w => {
      w.window.close()
    })
  }

  setUpdateMenu(callback: () => void) {
    this.updateMenu = callback;
  }

  // 循环心跳检测
  private loopHeartbeatCheck(wState: WindowState) {
    if (!wState.aliveTimer) {
      wState.aliveTimer = new Timer(() => {
        if (!wState.window.isMinimized() && !wState.window.isVisible()) {
          wState.alive = false
          console.warn(`窗口 ${wState.id} 超时没有检测到心跳。`)
        }
      }, HELLO_TIMEOUT)
    }

    wState.aliveTimer.loop()
  }

  // 开始窗口关闭超时检测
  private startWindowCloseCheck(wState: WindowState) {
    if (!wState.closeTimer) {
      wState.closeTimer = new Timer(() => {
        console.warn(`窗口 ${wState.id} 关闭确认超时，强制关闭`);
        try {
          if (wState?.window && !wState.window.isDestroyed()) {
            wState.window.destroy();
          }
        } catch (error) {
          console.error('强制关闭窗口时出错:', error);
        }
      }, CLOSE_WINDOW_CONFIRMATION_TIMEOUT)
    }

    wState.closeTimer?.start()
  }

  // 创建一个新的窗口
  createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      height: 800,
      width: 1200,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: false
      },
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 20, y: 10 },
      show: false
    })

    const windowId = window.id;
    const startUrl = isDev
      ? 'http://localhost:57173'
      : `file://${path.join(__dirname, '../dist/index.html')}`
    window.loadURL(startUrl)

    const windowState: WindowState = {
      id: windowId,
      window: window,
      isClosing: false,
      alive: true,
    };
    this._windows.push(windowState);

    const handleEnterFullScreen = () => {
      window.webContents.send('window-state-changed', { maximized: true })
    }

    const handleLeaveFullScreen = () => {
      window.webContents.send('window-state-changed', { maximized: false })
    }

    const handleFocus = () => {
      this.updateMenu();
    }

    const handleWindowClose = async (event: any) => {
      const wState = this.getWindowStateById(window.id)
      if (!wState) {
        console.error(`Find a unkown window id: ${window.id} request close`)
        return
      }

      // 如果不是坚决要退出，先阻止，并通知window
      if (!this.appInstance.exitApp) {
        event.preventDefault(); // 阻止默认关闭行为
        if (wState.isClosing === true) return
        wState.isClosing = true
        
        // 超时处理：强制关闭窗口
        if (USE_CONFIRMATION_TIMEOUT) {
          this.startWindowCloseCheck(wState)
        }

        window.webContents.send('request-window-close', window.id);
      }
    }

    // Handle window messages
    window.on('focus', handleFocus)
    window.on('close', handleWindowClose);
    window.on('closed', () => {
      windowState.aliveTimer?.end()
      windowState.closeTimer?.end()

      // 从 windows 列表中，清除要关闭的 window
      const index = this._windows.findIndex(w => w.id === window.id);
      if (index !== -1) {
        this._windows.splice(index, 1);
      }
      
      window.removeListener('enter-full-screen', handleEnterFullScreen)
      window.removeListener('leave-full-screen', handleLeaveFullScreen)
      window.removeListener('focus', handleFocus)
      window.removeListener('close', handleWindowClose)

      // 如果是退出应用，且windows数组已经清空，则设置退出应用标记，退出应用
      if (this.appInstance.isAppQuitting && this._windows.length === 0) {
        this.appInstance.exitApp = true
      } else if (BrowserWindow.getFocusedWindow()?.id === window.id) {
        if (this._windows.length > 0) {
          if (this._windows[0].window.isMinimized()) {
            this._windows[0].window.restore();
          }
          this._windows[0].window.focus();
        }
      }
    })

    window.once('ready-to-show', () => {
      window.show()
      window.on('enter-full-screen', handleEnterFullScreen)
      window.on('leave-full-screen', handleLeaveFullScreen)
    })

    window.webContents.on('did-finish-load', () => {
      window.webContents.send('window-id', window.id);
      this.loopHeartbeatCheck(windowState)
    });

    if (isDev) {
      window.webContents.openDevTools()
    }
    
    return window
  }

  handleHello(windowId: number): boolean {
    const wState = this.getWindowStateById(windowId);
    if (!wState) {
      console.error(`Find a unkown window id: ${windowId} say hello`)
      return false
    }
    
    wState.alive = true
    this.loopHeartbeatCheck(wState)

    // 发现还有窗口活着，先不着急退出窗口，先等待
    if (
      USE_CONFIRMATION_TIMEOUT &&
      !this.appInstance.exitApp &&
      wState.isClosing
    ) {
      this.startWindowCloseCheck(wState)
    }
    return true
  }

  handleWindowCloseConfirm(windowId: number, canClose: boolean): boolean {
    const wState = this.getWindowStateById(windowId);
    if (!wState) {
      console.error(`Find a unkown window id: ${windowId} close confirm`)
      return false
    }

    wState.closeTimer?.end()
    // 根据回复决定是否关闭
    if (canClose) {
      if (wState.isClosing && wState.window && !wState.window.isDestroyed()) {
        wState.window.destroy();
      }
    } else {
      // 只要有一个窗口坚持不退出，整个应用就不退出
      // 清除所有窗口退出定时器
      this._windows.forEach(w => {
        w.isClosing = false
        w.closeTimer?.end()
      });
    }

    return true
  }

  handleSystemColorsChanged({theme, newColors}) {
    this._windows.forEach(w => {
      if (w.window && !w.window.isDestroyed()) {
        w.window.webContents.send('system-colors-changed', {theme, newColors});
      }
    })
  }

  handleAppUpdateInfo(channel: string, data?: any) {
    this._windows.forEach(w => {
      if (w.window && !w.window.isDestroyed()) {
        w.window.webContents.send(channel, data);
      }
    });
  }

  private setupIpcHandlers() {
    // Window title update IPC handler
    ipcMain.handle('update-window-title', async (event, title: string) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.setTitle(title);
        return { success: true };
      }
      return { success: false, error: 'Window not found' };
    })

    // Print IPC handler
    ipcMain.handle('print', async (event, options: any = {}) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return { success: false, error: 'Window not found' };
      }

      return new Promise((resolve) => {
        const printOptions = {
          silent: false, // Show system print dialog
          printBackground: true,
          color: true,
          pageSize: 'A4',
          margins: { marginType: 'default' },
          ...options // Allow custom options to override defaults
        };

        window.webContents.print(printOptions, (success: boolean, errorType?: string) => {
          // Check if print was cancelled by user
          const isCancelled = errorType && (
            errorType.toLowerCase().includes('cancel') ||
            errorType.toLowerCase().includes('cancelled') ||
            errorType.toLowerCase().includes('user abort') ||
            errorType.toLowerCase().includes('abort')
          );
          
          resolve({ 
            success, 
            error: errorType || (success ? null : 'Unknown print error'),
            cancelled: isCancelled || false
          });
        });
      });
    })

    ipcMain.handle('window-content-changed', async (event, wContentState: WindowContentState) => {
      // 通过webContents查找对应的窗口
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        const windowIndex = this._windows.findIndex(w => w.id === window.id);
        
        /*
        console.debug({
          function: 'window-content-changed',
          wID: window.id,
          newWContentState: wContentState,
          oldWContentState: this._windows[windowIndex].wContentState,
        });
        */
        
        if (windowIndex !== -1) {
          this._windows[windowIndex].wContentState = merge(
            this._windows[windowIndex].wContentState, 
            wContentState
          );
          if (BrowserWindow.getFocusedWindow()?.id === window.id) {
            this.updateMenu();
          }
        }
      }
    })
  }

  destroy(): void {
    ipcMain.removeHandler('update-window-title')
    ipcMain.removeHandler('window-content-changed')
  }
}
