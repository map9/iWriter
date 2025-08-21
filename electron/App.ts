import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import chokidar, { FSWatcher } from 'chokidar'

import Timer from '../src/utils/Timer'

import { isDev, isMac } from './utils'
import { USE_CONFIRMATION_TIMEOUT, QUIT_APP_CONFIRMATION_TIMEOUT } from './types'
import type { GlobalParameters, WindowState } from './types'
import { MenuManager } from './MenuManager'
import { WindowManager } from './WindowManager'
import { ThemeManager } from './ThemeManager'
import { UpdaterManager } from '../src/updater/UpdaterManager'

export class App {
  private g: GlobalParameters
  private fileWatchers: Map<string, FSWatcher>
  private menuManager: MenuManager
  private windowManager: WindowManager
  private themeManager: ThemeManager
  private updaterManager: UpdaterManager | null
  private appQuitTimer: Timer | null = null
  private _isAppQuitting: boolean
  private _exitApp: boolean

  constructor() {
    this.g = {
      autoSave: true,
    }
    this.fileWatchers = new Map()
    this.menuManager = new MenuManager()
    this.windowManager = new WindowManager(this)
    this.themeManager = new ThemeManager()
    this.updaterManager = null
    this._isAppQuitting = false
    this._exitApp = false

    this.setupIpcHandlers()
  }

  private startAppQuitCheck() {
    console.log({
      function: 'startAppQuitCheck',
      windowsSize: this.windowManager.getWindowCount(),
      isAppQuitting: this._isAppQuitting,
      exitApp: this._exitApp
    })
  
    if (!this.appQuitTimer) {
      this.appQuitTimer = new Timer(() => {
        console.warn(`应用程序关闭确认超时，强制关闭`);
        this._exitApp = true
        app.quit()
      }, QUIT_APP_CONFIRMATION_TIMEOUT)
    }
  
    this.appQuitTimer.start()
  }
  
  get isAppQuitting(): boolean {
    return this._isAppQuitting
  }

  get exitApp(): boolean {
    return this._exitApp
  }

  set exitApp(isExitApp: boolean) {
    this._exitApp = isExitApp
    if (isExitApp) app.quit()
  }

  private setupIpcHandlers() {
    ipcMain.on('hello', (_, windowId: number) => {
      this.windowManager.handleHello(windowId)
      
      if (
        USE_CONFIRMATION_TIMEOUT &&
        this._exitApp === false &&
        this._isAppQuitting === true
      ) {
        // 先不着急强制退出应用，先等待
        this.startAppQuitCheck()
      }
    })

    ipcMain.on('window-close-confirm', (_, windowId: number, canClose: boolean) => {
      console.log({
        wId: windowId,
        canClose: canClose,
        isAppQuitting: this.isAppQuitting,
        exitApp: this.exitApp
      })

      this.windowManager.handleWindowCloseConfirm(windowId, canClose)
      // 只要有一个窗口坚持不退出，整个应用就不退出
      if (
        canClose === false &&
        this._isAppQuitting
      ) {
        this._isAppQuitting = false
        this._exitApp = false
        this.appQuitTimer?.end()
      }
    })

    ipcMain.handle('read-file', async (_, filePath: string) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        app.addRecentDocument(filePath)
        console.log('File read successfully:', filePath)
        return content
      } catch (error) {
        console.error('Error reading file:', error)
        throw(error)
      }
    })

    ipcMain.handle('read-file-binary', async (_, filePath: string) => {
      try {
        const buffer = fs.readFileSync(filePath)
        app.addRecentDocument(filePath)
        return buffer.toString('base64')
      } catch (error) {
        console.error('Error reading binary file:', error)
        throw(error)
      }
    })

    ipcMain.handle('save-file', async (_, content: string, filePath: string) => {
      try {
        fs.writeFileSync(filePath, content, 'utf8')
        app.addRecentDocument(filePath)
      } catch (error) {
        console.error('Error saving file:', error)
        throw(error)
      }
      return true
    })

    ipcMain.handle('path-exists', async (_, filePath: string) => {
      try {
        return fs.existsSync(filePath)
      } catch (error) {
        console.error('Error checking path existence:', error)
        return false
      }
    })

    ipcMain.handle('get-files', async (_, folderPath: string, onlyself?: boolean) => {
      try {
        let stats: fs.Stats | null = null
        if (onlyself !== true) {
          const files = fs.readdirSync(folderPath, { withFileTypes: true })
          return files.map(file => {
            const filePath = path.join(folderPath, file.name)
            stats = fs.statSync(filePath)
            
            return {
              name: file.name,
              isDirectory: file.isDirectory(),
              path: filePath,
              size: stats?.size,
              created: stats?.birthtime,
              modified: stats?.mtime,
              accessed: stats?.atime,
              changed: stats?.ctime
            }
          })
        } else {
          stats = fs.statSync(folderPath)
          return [{
            name: path.basename(folderPath),
            isDirectory: stats?.isDirectory(),
            path: folderPath,
            size: stats?.size,
            created: stats?.birthtime,
            modified: stats?.mtime,
            accessed: stats?.atime,
            changed: stats?.ctime
          }]
        }
      } catch (error) {
          console.error('Error get file/folder information:', error)
          throw error
      }
    })

    ipcMain.handle('reveal-in-folder', async (event, filePath: string) => {
      try {
        // 使用 shell.showItemInFolder 在系统文件管理器中显示文件或文件夹
        shell.showItemInFolder(filePath);
      } catch (error) {
        console.error('Error revealing file in folder:', error);
        throw error;
      }
    })

    // Open with system default application handler
    ipcMain.handle('open-with-shell', async (event, filePath: string) => {
      try {
        // 使用 shell.openPath 用系统默认应用程序打开文件
        if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('https://')) {
          await shell.openExternal(filePath)
        }
        else {
          await shell.openPath(filePath);
        }
        
      } catch (error) {
        console.error('Error opening file with shell:', error);
        throw error;
      }
    })

    // Show open dialog
    ipcMain.handle('show-open-dialog', async (_, options: any) => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow == null) return null
      
      try {
        const result = await dialog.showOpenDialog(focusedWindow, options)
        
        return result
      } catch(error) {
        console.error('Error show open dialog file:', error)
        throw error
      }
    })

    // Show open dialog
    ipcMain.handle('show-save-dialog', async (_, options: any) => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow == null) return null
      
      try {
        const result = await dialog.showSaveDialog(focusedWindow, options)
        
        return result
      } catch(error) {
        console.error('Error show save dialog file:', error)
        throw error
      }
    })

    // Show save dialog
    ipcMain.handle('show-message-box', async (_, options) => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow == null) return null

      const result = await dialog.showMessageBox(focusedWindow, options)
      
      return result
    })

    // File operations
    ipcMain.handle('create-file', async (_, folderPath: string, fileName: string) => {
      try {
        const filePath = path.join(folderPath, fileName)
        
        // Check if file already exists
        if (fs.existsSync(filePath)) {
          throw new Error('File already exists')
        }
        
        // Create file with default content
        const defaultContent = ''
        fs.writeFileSync(filePath, defaultContent, 'utf8')
        return filePath
      } catch (error) {
        console.error('Error creating file:', error)
        throw error
      }
    })

    ipcMain.handle('create-folder', async (_, parentPath: string, folderName: string) => {
      try {
        const folderPath = path.join(parentPath, folderName)
        
        // Check if folder already exists
        if (fs.existsSync(folderPath)) {
          throw new Error('Folder already exists')
        }
        
        fs.mkdirSync(folderPath, { recursive: true })
        return folderPath
      } catch (error) {
        console.error('Error creating folder:', error)
        throw error
      }
    })

    ipcMain.handle('delete-file', async (_, filePath: string) => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow == null) return null

      try {
        const stats = fs.statSync(filePath)
        const { response } = await dialog.showMessageBox(focusedWindow, {
          type: 'warning',
          title: 'Delete',
          message: `Are you sure you want to delete '${filePath}'?`,
          buttons: ['Yes', 'No'],
          defaultId: 0,
          cancelId: 1
        })
        
        if (response == 1) {
          return false
        }

        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(filePath)
        }
        
        return true
      } catch (error) {
        console.error('Error deleting file:', error)
        throw error
      }
    })

    ipcMain.handle('rename-file', async (_, oldPath: string, newName: string) => {
      try {
        const parentDir = path.dirname(oldPath)
        const oldName = path.basename(oldPath)
        const newPath = path.join(parentDir, newName)
        
        // If the new name is the same as the old name, no need to rename
        if (oldName === newName) {
          return oldPath
        }
        
        // Check if target already exists (different from source)
        if (fs.existsSync(newPath)) {
          throw new Error('Target already exists')
        }
        
        fs.renameSync(oldPath, newPath)
        return newPath
      } catch (error) {
        console.error('Error renaming file:', error)
        throw error
      }
    })

    ipcMain.handle('move-file', async (_, sourcePath: string, targetDir: string) => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow == null) return null

      try {
        console.log('Moving file:', { sourcePath, targetDir })
        
        const fileName = path.basename(sourcePath)
        const sourceDir = path.dirname(sourcePath)
        const targetPath = path.join(targetDir, fileName)
        
        console.log('Paths:', { fileName, sourceDir, targetPath })
        
        // Check if trying to move to the same directory
        if (sourceDir === targetDir) {
          console.log('Source and target directories are the same, skipping move')
          return {
            success: false,
            conflictAction: 'skip'
          }
        }
        
        // Check if target already exists
        if (fs.existsSync(targetPath)) {
          const { response } = await dialog.showMessageBox(focusedWindow, {
            type: 'warning',
            title: 'Move',
            message: `An older item named '${fileName}' already exists here. Replace it with the newer item being moved?`,
            buttons: ['KeepBoth', 'No', 'Replace'],
            defaultId: 0,
            cancelId: 2
          })
          
          // keepBoth
          if (response == 0) {
            // Generate a new name for the moved file
            const nameWithoutExt = path.parse(fileName).name
            const ext = path.parse(fileName).ext
            let counter = 1
            let newFileName = `${nameWithoutExt} (${counter})${ext}`
            let newTargetPath = path.join(targetDir, newFileName)
            
            while (fs.existsSync(newTargetPath)) {
              counter++
              newFileName = `${nameWithoutExt} (${counter})${ext}`
              newTargetPath = path.join(targetDir, newFileName)
            }
            
            fs.renameSync(sourcePath, newTargetPath)
            console.log('Move successful with new name:', newTargetPath)
            return {
              success: true,
              conflictAction: 'keepBoth',
              newPath: newTargetPath,
            }
          }
          // replace
          else if (response == 2) {
            // Delete existing file/folder
            if (fs.statSync(targetPath).isDirectory()) {
              fs.rmSync(targetPath, { recursive: true, force: true })
            } else {
              fs.unlinkSync(targetPath)
            }

            fs.renameSync(sourcePath, targetPath)
            console.log('Move successful:', targetPath)
            return {
              success: true,
              conflictAction: 'replace',
              newPath: targetPath,
            }
          }
          // cancel
          return {
            success: false,
            conflictAction: 'cancel'
          }
        }
        
        fs.renameSync(sourcePath, targetPath)
        console.log('Move successful:', targetPath)
        return {
          success: true,
          newPath: targetPath,
        }
      } catch (error) {
        console.error('Error moving file:', error)
        throw error
      }
    })

    // 文件监听相关的 IPC 处理器
    ipcMain.handle('start-file-watching', async (event, folderPath: string) => {
      try {
        // 停止已存在的监听器
        if (this.fileWatchers.has(folderPath)) {
          const existingWatcher = this.fileWatchers.get(folderPath);
          existingWatcher?.close();
          this.fileWatchers.delete(folderPath);
        }

        // 创建新的监听器
        const watcher = chokidar.watch(folderPath, {
          ignored: /(^|[\/\\])\../, // 忽略隐藏文件
          awaitWriteFinish: true, // emit single event when chunked writes are completed
          atomic: true, // emit proper events when "atomic writes" (mv _tmp file) are used
          // The options also allow specifying custom intervals in ms
          // awaitWriteFinish: {
          //   stabilityThreshold: 2000,
          //   pollInterval: 100
          // },
          // atomic: 100,
          persistent: true,
          ignoreInitial: true,
          followSymlinks: false,
          depth: 10, // 限制监听深度
          usePolling: false, // 优先使用原生事件
          interval: 1000, // 轮询间隔（当原生事件不可用时）
          binaryInterval: 3000
        });

        // 监听各种文件事件
        watcher
          .on('add', (filePath) => {
            event.sender.send('file-change', {
              type: 'add',
              path: filePath,
              timestamp: new Date()
            });
          })
          .on('change', (filePath) => {
            event.sender.send('file-change', {
              type: 'change',
              path: filePath,
              timestamp: new Date()
            });
          })
          .on('unlink', (filePath) => {
            event.sender.send('file-change', {
              type: 'unlink',
              path: filePath,
              timestamp: new Date()
            });
          })
          .on('addDir', (dirPath) => {
            event.sender.send('file-change', {
              type: 'addDir',
              path: dirPath,
              timestamp: new Date()
            });
          })
          .on('unlinkDir', (dirPath) => {
            event.sender.send('file-change', {
              type: 'unlinkDir',
              path: dirPath,
              timestamp: new Date()
            });
          })
          .on('error', (error) => {
            event.sender.send('file-watch-error', {
              message: error instanceof Error ? error.message : error instanceof Error ? error.message : String(error),
              path: folderPath,
              timestamp: new Date()
            });
          })
          .on('ready', () => {
            console.log(`File watcher ready for: ${folderPath}`);
          });

        this.fileWatchers.set(folderPath, watcher);
        return { success: true, path: folderPath };
      } catch (error) {
        console.error('Error starting file watcher:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    })

    ipcMain.handle('stop-file-watching', async (event, folderPath: string) => {
      try {
        if (this.fileWatchers.has(folderPath)) {
          const watcher = this.fileWatchers.get(folderPath);
          await watcher?.close();
          this.fileWatchers.delete(folderPath);
          console.log(`File watcher stopped for: ${folderPath}`);
          return { success: true, path: folderPath };
        }
        return { success: false, error: 'Watcher not found' };
      } catch (error) {
        console.error('Error stopping file watcher:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    })

    ipcMain.handle('stop-all-file-watching', async () => {
      try {
        const promises = Array.from(this.fileWatchers.values()).map(watcher => watcher.close());
        await Promise.all(promises);
        this.fileWatchers.clear();
        console.log('All file watchers stopped');
        return { success: true };
      } catch (error) {
        console.error('Error stopping all file watchers:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    })

    ipcMain.handle('get-file-watching-status', async () => {
      return {
        watchedPaths: Array.from(this.fileWatchers.keys()),
        totalWatchers: this.fileWatchers.size
      };
    })

    // Context menu handler
    ipcMain.handle('show-context-menu', async (event, menuItems: any[], position: { x: number; y: number }) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return null;
      }

      // 将菜单项转换为 Electron 菜单格式
      const convertMenuItems = (items: any[]): any[] => {
        return items.map(item => {
          if (item.type === 'separator') {
            return { type: 'separator' };
          }
          
          const menuItem: any = {}
          if (item.id) {
            menuItem.id = item.id
          }
          if (item.label) {
            menuItem.label = item.label
          }
          if (item.type) {
            menuItem.type = item.type || 'normal'
          }
          if (item.enabled) {
            menuItem.enabled = item.enabled !== false
          }
          if (item.visible) {
            menuItem.visible = item.visible !== false
          }
          if (item.checked) {
            if ( menuItem.type !== 'radio' && menuItem.type !== 'checkbox' ) {
              menuItem.type = 'checkbox'
            }
            menuItem.checked = item.checked !== false
          }
          if (item.role) {
            menuItem.role = item.role
          }
          if (item.accelerator) {
            menuItem.accelerator = item.accelerator;
          }

          if (item.submenu && item.submenu.length > 0) {
            menuItem.submenu = convertMenuItems(item.submenu);
          } else {
            menuItem.click = () => {
              if (item.id)
                window.webContents.send('menu-action', item.id);
            };
          }

          return menuItem;
        });
      };

      try {
        const menu = Menu.buildFromTemplate(convertMenuItems(menuItems));
        
        return new Promise<string | null>((resolve) => {
          menu.popup({
            window,
            x: position.x,
            y: position.y,
            callback: () => {
              resolve(null);
            }
          });
        });
      } catch (error) {
        console.error('Error showing context menu:', error);
        return null;
      }
    })

    ipcMain.handle('set-auto-save', async (event, autoSave: boolean) => {
      this.g.autoSave = autoSave;

      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        if (BrowserWindow.getFocusedWindow()?.id === window.id) {
          this.handleUpdateMenu();
        }
      }
    })
  }

  private removeAllHandler() {
    ipcMain.removeHandler('hello')
    ipcMain.removeHandler('read-file')
    ipcMain.removeHandler('read-file-binary')
    ipcMain.removeHandler('save-file')
    ipcMain.removeHandler('path-exists')
    ipcMain.removeHandler('get-files')
    ipcMain.removeHandler('reveal-in-folder')
    ipcMain.removeHandler('open-with-shell')
    ipcMain.removeHandler('show-open-dialog')
    ipcMain.removeHandler('show-save-dialog')
    ipcMain.removeHandler('show-message-box')
    ipcMain.removeHandler('create-file')
    ipcMain.removeHandler('create-folder')
    ipcMain.removeHandler('rename-file')
    ipcMain.removeHandler('move-file')
    ipcMain.removeHandler('start-file-watching')
    ipcMain.removeHandler('stop-file-watching')
    ipcMain.removeHandler('stop-all-file-watching')
    ipcMain.removeHandler('get-file-watching-status')
    ipcMain.removeHandler('show-context-menu')
    ipcMain.removeHandler('set-auto-save')

    ipcMain.removeAllListeners('hello');
    ipcMain.removeAllListeners('window-close-confirm');
  }

  // Send menu action to the focused window
  private handleMenuAction(action: string) {
    if (action === 'new-window') {
      this.windowManager.createWindow()
      return
    } else if (action === 'toggle-auto-save') {
      this.g.autoSave = !this.g.autoSave
    }
  
    BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', action)
  }
  
  private handleUpdateMenu() {
    let wState: WindowState | undefined = undefined
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      wState = this.windowManager.getWindowStateById(focusedWindow.id);
    }

    this.menuManager.setupMenu(wState, this.g);
  }

  run() {
    app.on('window-all-closed', () => {
      console.log({
        function: 'window-all-closed',
      })

      if (!isMac) app.quit()
    });

    /*
    当调用 app.quit() 后，事件触发顺序为：​
    1.主进程：app.before-quit（可阻止退出）​
    2.所有窗口：window.close（逐个触发，可阻止单个窗口关闭）​
    3.所有窗口：window.closed（窗口关闭后）​
    4.主进程：app.will-quit（所有窗口关闭后）​
    5.渲染进程：beforeunload → unload（页面卸载）​
    6.主进程：app.quit（应用完全退出）
    */
    app.on('before-quit', async (event) => {
      console.log({
        function: 'before-quit',
        windowsSize: this.windowManager.getWindowCount(),
        isAppQuitting: this._isAppQuitting,
        exitApp: this._exitApp
      })
      if (this.windowManager.getWindowCount() === 0) return

      // 如果不是坚决要退出，先阻止，并通知所有的window
      if (this._exitApp === false) {
        event.preventDefault(); // 阻止默认退出行为
        if (this._isAppQuitting) return; // 防止重复处理  
        this._isAppQuitting = true;
        
        // 向所有窗口发送退出询问​
        this.windowManager.closeAllWindows()

        // 超时处理：强制关闭应用
        if (USE_CONFIRMATION_TIMEOUT) {
          this.startAppQuitCheck()
        }
      }
    });

    app.on('will-quit', async (event) => {
      console.log({
        function: 'will-quit',
        isAppQuitting: this._isAppQuitting,
        exitApp: this._exitApp
      })
      
      // 清理应用强制退出定时器
      this.appQuitTimer?.end()

      if (this.updaterManager) {
        this.updaterManager.destroy()
        this.updaterManager = null
      }
      this.themeManager.destroy()
      this.windowManager.destroy()
      this.menuManager.destroy()

      // 清理文件监听器
      try {
        const promises = Array.from(this.fileWatchers.values()).map(watcher => watcher.close());
        await Promise.all(promises);
        this.fileWatchers.clear();
        console.log('All file watchers stopped');
      } catch (error) {
        console.error('Error stopping all file watchers:', error);
      }
      this.removeAllHandler()
    });
      
    app.on('activate', function () {
      if (
        this._exitApp === false &&
        BrowserWindow.getAllWindows().length === 0
      ) {
        this.windowManager.createWindow()
      }
    })

    app.whenReady().then(() => {
      this.menuManager.setSendMenuAction((action: string) => {
        this.handleMenuAction(action)
      })
      this.windowManager.createWindow()
      this.themeManager.setSendSystemColorsChanged((colors: any) => {
        this.windowManager.handleSystemColorsChanged(colors)
      })
      this.windowManager.setUpdateMenu(() => {
        this.handleUpdateMenu()
      })
      
      // 只在生产环境启用更新器
      if (!isDev) {
        try {
          this.updaterManager = new UpdaterManager()
          this.updaterManager.setSendAppUpdateInfo((channel: string, data?: any)=>{
            this.windowManager.handleAppUpdateInfo(channel, data)
          })
          this.updaterManager.checkOnStartup()
        } catch (error) {
          console.error('Failed to initialize UpdaterManager:', error)
        }
      } else {
        console.log('UpdaterManager disabled in development mode')
      }
    })
  }
}