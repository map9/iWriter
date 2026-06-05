import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import type { Event, PrintToPDFOptions, WebContentsPrintOptions } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { merge } from 'lodash'

import Timer from '../src/utils/Timer'
import type { WindowContentState } from '../src/types/window-content-state'
import type { HtmlPrintReadyOptions, PdfSaveOptions } from '../src/types/electron-api'

import { isDev } from './utils'
import type { WindowState, IApp } from './types'
import { USE_CONFIRMATION_TIMEOUT, HELLO_TIMEOUT, CLOSE_WINDOW_CONFIRMATION_TIMEOUT } from './types'
import { normalizeLocale } from './i18n'
import { perfLog } from './perf'


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
    perfLog('createWindow() start')
    // 用系统颜色模式设置背景色，消除 ready-to-show 前的白屏闪烁
    const backgroundColor = nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f5f5f5'
    const window = new BrowserWindow({
      height: 800,
      width: 1200,
      minWidth: 800,
      minHeight: 600,
      backgroundColor,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: !isDev
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

    const handleWindowClose = async (event: Event) => {
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
          const firstWindow = this._windows[0]
          if (!firstWindow) return
          if (firstWindow.window.isMinimized()) {
            firstWindow.window.restore();
          }
          firstWindow.window.focus();
        }
      }
    })

    window.once('ready-to-show', () => {
      perfLog('ready-to-show (window visible)')
      window.show()
      window.on('enter-full-screen', handleEnterFullScreen)
      window.on('leave-full-screen', handleLeaveFullScreen)
    })

    window.webContents.on('did-finish-load', () => {
      perfLog('did-finish-load (renderer loaded)')
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

  handleSystemColorsChanged({ theme, newColors }: { theme: string; newColors: unknown }) {
    this._windows.forEach(w => {
      if (w.window && !w.window.isDestroyed()) {
        w.window.webContents.send('system-colors-changed', {theme, newColors});
      }
    })
  }

  handleAppUpdateInfo(channel: string, data?: unknown) {
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

    ipcMain.handle('window-bootstrap-locale', async (event, locale: string) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const normalizedLocale = normalizeLocale(locale)

      if (!window) return normalizedLocale

      const windowIndex = this._windows.findIndex(w => w.id === window.id)
      if (windowIndex === -1) return normalizedLocale

      const wState = this._windows[windowIndex]
      if (!wState) return normalizedLocale
      wState.wContentState = merge(
        wState.wContentState,
        { view: { locale: normalizedLocale } },
      )

      if (BrowserWindow.getFocusedWindow()?.id === window.id) {
        this.updateMenu()
      }

      return normalizedLocale
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

    ipcMain.handle('print-from-html', async (
      event,
      htmlContent: string,
      printOptions: WebContentsPrintOptions = {},
      readyOptions: HtmlPrintReadyOptions = {},
    ) => {
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
          }),
          readyOptions,
        )
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    })

    ipcMain.handle('print-pdf-file', async (event, filePath: string, printOptions: WebContentsPrintOptions = {}) => {
      if (!BrowserWindow.fromWebContents(event.sender)) return { success: false, error: 'Window not found' }
      try {
        return await this.renderInHiddenPdfWindow(filePath, (hidden) =>
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
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    })

    ipcMain.handle('save-to-pdf-from-html', async (event, htmlContent: string, pdfOptions: PrintToPDFOptions = {}, saveOptions: PdfSaveOptions = {}) => {
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
            generateDocumentOutline: true,
            generateTaggedPDF: true,
          })
          await fs.promises.writeFile(filePath, Buffer.from(buffer))
          return { success: true, filePath }
        })
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
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
          const wState = this._windows[windowIndex]
          if (!wState) return
          wState.wContentState = merge(
            wState.wContentState, 
            wContentState
          );
          if (BrowserWindow.getFocusedWindow()?.id === window.id) {
            this.updateMenu();
          }
        }
      }
    })
  }

  private isPrintCancelled(errorType?: string): boolean {
    const t = (errorType ?? '').toLowerCase()
    return t.includes('cancel') || t.includes('user abort') || t.includes('abort')
  }

  private async waitForHiddenHtmlReady(
    hidden: BrowserWindow,
    readyOptions: HtmlPrintReadyOptions = {},
  ): Promise<void> {
    const strategy = readyOptions.strategy ?? 'pagedjs'
    const settleMs = readyOptions.settleMs ?? 600

    if (strategy === 'dom-ready') {
      await new Promise<void>(resolve => setTimeout(resolve, settleMs))
      return
    }

    const selector = strategy === 'selector'
      ? readyOptions.selector ?? '[data-iw-print-ready="true"]'
      : readyOptions.selector ?? '.pagedjs_page, .pps_pages_sheet'
    const timeoutMs = readyOptions.timeoutMs ?? 30000

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const poll = async () => {
        if (Date.now() > deadline) {
          reject(new Error(`html print rendering timeout: ${selector}`))
          return
        }
        try {
          const ready = await hidden.webContents.executeJavaScript(
            `document.querySelector(${JSON.stringify(selector)}) !== null`
          )
          if (ready) { setTimeout(resolve, settleMs); return }
        } catch { /* executeJavaScript may fail briefly after load */ }
        setTimeout(poll, 300)
      }
      setTimeout(poll, 800)
    })
  }

  private async renderInHiddenHtmlWindow<T>(
    htmlContent: string,
    action: (hidden: BrowserWindow) => Promise<T>,
    readyOptions: HtmlPrintReadyOptions = {},
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
      // loadFile() resolves after did-finish-load; callers choose how the HTML declares readiness.
      await this.waitForHiddenHtmlReady(hidden, readyOptions)
      return await action(hidden)
    } finally {
      hidden.close()
      fs.promises.unlink(tmpFile).catch(() => {})
    }
  }

  /**
   * Load a native PDF file into an off-screen BrowserWindow (Chromium PDF viewer)
   * and run an action against it.  We wait for did-finish-load + a settle delay
   * because the Chromium PDF plugin renders asynchronously after navigation ends.
   */
  private async renderInHiddenPdfWindow<T>(
    filePath: string,
    action: (hidden: BrowserWindow) => Promise<T>
  ): Promise<T> {
    const hidden = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        plugins: true,       // required for the built-in PDF viewer
      },
    })
    try {
      // loadURL resolves after did-finish-load
      await hidden.loadURL(`file://${filePath}`)
      // The PDF plugin renders asynchronously after navigation; give it time to settle.
      // 1 500 ms works well in practice; increase if printers report blank pages.
      await new Promise<void>(resolve => setTimeout(resolve, 1500))
      return await action(hidden)
    } finally {
      hidden.close()
    }
  }

  destroy(): void {
    ipcMain.removeHandler('update-window-title')
    ipcMain.removeHandler('window-content-changed')
  }
}
