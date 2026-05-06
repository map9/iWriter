import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { merge } from 'lodash'

import Timer from '../src/utils/Timer'
import type { WindowContentState } from '../src/types/windowContentState'

import { isDev } from './utils'
import type { WindowState, IApp } from './types'
import { USE_CONFIRMATION_TIMEOUT, HELLO_TIMEOUT, CLOSE_WINDOW_CONFIRMATION_TIMEOUT } from './types'


export class WindowManager {
  private appInstance: IApp
  private updateMenu: () => void
  private updateMenuTimer: NodeJS.Timeout | null
  private _windows: WindowState[]

  constructor(appInstance: IApp) {
    this.appInstance = appInstance
    this.updateMenu = () => {}
    this.updateMenuTimer = null
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

  private scheduleUpdateMenu(): void {
    if (this.updateMenuTimer) {
      clearTimeout(this.updateMenuTimer)
    }

    this.updateMenuTimer = setTimeout(() => {
      this.updateMenuTimer = null
      this.updateMenu()
    }, 50)
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

    // 渲染进程崩溃时自动重载（macOS 休眠恢复等场景）
    window.webContents.on('render-process-gone', (_, details) => {
      console.error(`Renderer process gone for window ${windowId}: ${details.reason}`)
      if (!window.isDestroyed()) {
        setTimeout(() => window.webContents.reload(), 500)
      }
    })

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
          resolve({
            success,
            error: errorType || (success ? null : 'Unknown print error'),
            cancelled: this.isPrintCancelled(errorType),
          });
        });
      });
    })

    ipcMain.handle('get-printers', async (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return []
      try {
        return await window.webContents.getPrintersAsync()
      } catch {
        return []
      }
    })

    ipcMain.handle('print-from-html', async (event, htmlContent: string, printOptions: any = {}) => {
      if (!BrowserWindow.fromWebContents(event.sender)) return { success: false, error: 'Window not found' }
      try {
        return await this.renderInHiddenHtmlWindow(htmlContent, (hidden) =>
          new Promise((resolve) => {
            hidden.webContents.print(printOptions, (success: boolean, errorType?: string) => {
              resolve({
                success,
                error: errorType || (success ? null : 'Unknown print error'),
                cancelled: this.isPrintCancelled(errorType),
              })
            })
          })
        )
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) }
      }
    })

    ipcMain.handle('save-to-pdf-from-html', async (event, htmlContent: string, pdfOptions: any = {}, saveOptions: any = {}) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { success: false, error: 'Window not found' }

      let filePath = saveOptions?.defaultPath ?? saveOptions?.defaultName ?? 'document.pdf'
      if (!saveOptions?.skipDialog) {
        const saveResult = await dialog.showSaveDialog(win, {
          title: '保存为 PDF',
          defaultPath: filePath,
          filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        })
        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, cancelled: true }
        }
        filePath = saveResult.filePath
      }
      try {
        return await this.renderInHiddenHtmlWindow(htmlContent, async (hidden) => {
          const buffer = await hidden.webContents.printToPDF({
            printBackground: pdfOptions.printBackground ?? false,
            landscape: pdfOptions.landscape ?? false,
            pageSize: pdfOptions.pageSize,
            pageRanges: pdfOptions.pageRanges ?? '',
            displayHeaderFooter: pdfOptions.displayHeaderFooter ?? false,
            scale: pdfOptions.scale ?? 1,
            preferCSSPageSize: pdfOptions.preferCSSPageSize ?? true,
            margins: pdfOptions.margins ?? { top: 0, bottom: 0, left: 0, right: 0 },
          })
          await fs.promises.writeFile(filePath, Buffer.from(buffer))
          return { success: true, filePath }
        })
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) }
      }
    })

    // Save current window content as PDF via native save dialog
    ipcMain.handle('save-to-pdf', async (event, printOptions: any = {}, saveOptions: any = {}) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return { success: false, error: 'Window not found' }

      const saveResult = await dialog.showSaveDialog(window, {
        title: '保存为 PDF',
        defaultPath: saveOptions.defaultName ?? 'document.pdf',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true }
      }

      try {
        const pdfBuffer = await window.webContents.printToPDF(printOptions)
        await fs.promises.writeFile(saveResult.filePath, pdfBuffer)
        return { success: true, filePath: saveResult.filePath }
      } catch (err: any) {
        return { success: false, error: err?.message ?? String(err) }
      }
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
            this.scheduleUpdateMenu();
          }
        }
      }
    })
  }

  private isPrintCancelled(errorType?: string): boolean {
    const t = (errorType ?? '').toLowerCase()
    return t.includes('cancel') || t.includes('user abort') || t.includes('abort')
  }

  private async renderInHiddenHtmlWindow<T>(
    htmlContent: string,
    action: (hidden: BrowserWindow) => Promise<T>
  ): Promise<T> {
    const tmpFile = path.join(app.getPath('temp'), `iwriter-print-${Date.now()}.html`)
    await fs.promises.writeFile(tmpFile, htmlContent, 'utf-8')
    const hidden = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    try {
      await hidden.loadFile(tmpFile)
      // loadFile() resolves after did-finish-load; poll until paged.js renders its first page element
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30000
        const poll = async () => {
          if (Date.now() > deadline) { reject(new Error('pagedjs rendering timeout')); return }
          try {
            const ready = await hidden.webContents.executeJavaScript(
              'document.querySelector(".pagedjs_page, .pps_pages_sheet") !== null'
            )
            if (ready) { setTimeout(resolve, 600); return }
          } catch { /* executeJavaScript may fail briefly after load */ }
          setTimeout(poll, 300)
        }
        setTimeout(poll, 800)
      })
      return await action(hidden)
    } finally {
      hidden.close()
      fs.promises.unlink(tmpFile).catch(() => {})
    }
  }

  destroy(): void {
    ipcMain.removeHandler('update-window-title')
    ipcMain.removeHandler('window-content-changed')
  }
}
