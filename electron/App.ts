import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { exec } from 'child_process'
import chokidar, { FSWatcher } from 'chokidar'

import Timer from '../src/utils/Timer'

import { isDev, isMac } from './utils'
import { USE_CONFIRMATION_TIMEOUT, QUIT_APP_CONFIRMATION_TIMEOUT } from './types'
import type { WindowState } from './types'
import { MenuManager } from './MenuManager'
import { WindowManager } from './WindowManager'
import { ThemeManager } from './ThemeManager'
import { UpdaterManager } from '../src/updater/UpdaterManager'
import { AgentEngine } from './ai/AgentEngine'
import { AiConfigStore } from './ai/config/AiConfigStore'
import type { AiSettings } from '../src/types/ai'
import { formatCodeInMain } from './CodeFormatService'
export class App {
  private fileWatchers: Map<string, FSWatcher>
  private menuManager: MenuManager
  private windowManager: WindowManager
  private themeManager: ThemeManager
  private updaterManager: UpdaterManager | null
  private agentEngine: AgentEngine
  private appQuitTimer: Timer | null = null
  private _isAppQuitting: boolean
  private _exitApp: boolean

  constructor() {
    this.fileWatchers = new Map()
    this.menuManager = new MenuManager()
    this.windowManager = new WindowManager(this)
    this.themeManager = new ThemeManager()
    this.updaterManager = null
    this._isAppQuitting = false
    this._exitApp = false
    this.agentEngine = new AgentEngine(
      () => BrowserWindow.getAllWindows()[0]?.webContents ?? null
    )

    this.setupIpcHandlers()
  }

  /**
   * HTML 转义辅助函数，防止 XSS 攻击
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * 智能提取上下文：结合固定长度和语义边界
   * @param text 完整文本
   * @param matchIndex 匹配位置
   * @param matchLength 匹配长度
   * @returns { beforeContext, afterContext, needPrefixEllipsis, needSuffixEllipsis }
   */
  private extractSmartContext(
    text: string,
    matchIndex: number,
    matchLength: number
  ): {
    beforeContext: string
    afterContext: string
    needPrefixEllipsis: boolean
    needSuffixEllipsis: boolean
  } {
    // 配置参数
    const IDEAL_LENGTH = 15      // 理想长度（每侧）
    const MAX_LENGTH = 20         // 最大长度（超过则强制截断）

    // 语义边界字符（中英文标点、换行等）
    const BOUNDARY_CHARS = new Set([
      // 英文标点
      '.', ',', ';', ':', '!', '?',
      '(', ')', '[', ']', '{', '}',
      '"', "'", '`',
      // 中文标点
      '\u3002', '\uFF0C', '\uFF1B', '\uFF1A', '\uFF01', '\uFF1F', // 。，；：！？
      '\u3001', '\u300A', '\u300B', '\u201C', '\u201D', '\u2018', '\u2019', // 、《》""''
      '\uFF08', '\uFF09', '\u3010', '\u3011', '\u300E', '\u300F', // （）【】『』
      // 空白字符
      ' ', '\t', '\n', '\r'
    ])

    // === 提取前置上下文 ===
    let beforeContext = ''
    let needPrefixEllipsis = false

    if (matchIndex > 0) {
      // 1. 先按理想长度提取
      const idealStart = Math.max(0, matchIndex - IDEAL_LENGTH)
      const beforeText = text.substring(idealStart, matchIndex)

      // 2. 在理想范围内查找语义边界
      let semanticBoundaryIndex = -1
      for (let i = beforeText.length - 1; i >= 0; i--) {
        if (BOUNDARY_CHARS.has(beforeText[i])) {
          semanticBoundaryIndex = i
          break
        }
      }

      // 3. 决定最终截取位置
      if (semanticBoundaryIndex !== -1) {
        // 找到语义边界，使用边界后的内容
        beforeContext = beforeText.substring(semanticBoundaryIndex + 1).trimStart()
        needPrefixEllipsis = idealStart > 0
      } else {
        // 未找到语义边界，检查是否需要扩展到最大长度
        const maxStart = Math.max(0, matchIndex - MAX_LENGTH)
        const extendedText = text.substring(maxStart, matchIndex)

        // 在扩展范围内再次查找边界
        for (let i = extendedText.length - 1; i >= 0; i--) {
          if (BOUNDARY_CHARS.has(extendedText[i])) {
            beforeContext = extendedText.substring(i + 1).trimStart()
            needPrefixEllipsis = maxStart > 0
            semanticBoundaryIndex = i
            break
          }
        }

        // 仍未找到边界或超过最大长度，按固定长度截断
        if (semanticBoundaryIndex === -1 || beforeContext.length > MAX_LENGTH) {
          beforeContext = beforeText
          needPrefixEllipsis = idealStart > 0
        }
      }
    }

    // === 提取后置上下文 ===
    let afterContext = ''
    let needSuffixEllipsis = false

    const matchEnd = matchIndex + matchLength
    if (matchEnd < text.length) {
      // 1. 先按理想长度提取
      const idealEnd = Math.min(text.length, matchEnd + IDEAL_LENGTH)
      const afterText = text.substring(matchEnd, idealEnd)

      // 2. 在理想范围内查找语义边界
      let semanticBoundaryIndex = -1
      for (let i = 0; i < afterText.length; i++) {
        if (BOUNDARY_CHARS.has(afterText[i])) {
          semanticBoundaryIndex = i
          break
        }
      }

      // 3. 决定最终截取位置
      if (semanticBoundaryIndex !== -1) {
        // 找到语义边界，使用边界前的内容（包含边界符号）
        afterContext = afterText.substring(0, semanticBoundaryIndex + 1).trimEnd()
        needSuffixEllipsis = idealEnd < text.length
      } else {
        // 未找到语义边界，检查是否需要扩展到最大长度
        const maxEnd = Math.min(text.length, matchEnd + MAX_LENGTH)
        const extendedText = text.substring(matchEnd, maxEnd)

        // 在扩展范围内再次查找边界
        for (let i = 0; i < extendedText.length; i++) {
          if (BOUNDARY_CHARS.has(extendedText[i])) {
            afterContext = extendedText.substring(0, i + 1).trimEnd()
            needSuffixEllipsis = maxEnd < text.length
            semanticBoundaryIndex = i
            break
          }
        }

        // 仍未找到边界或超过最大长度，按固定长度截断
        if (semanticBoundaryIndex === -1 || afterContext.length > MAX_LENGTH) {
          afterContext = afterText
          needSuffixEllipsis = idealEnd < text.length
        }
      }
    }

    return {
      beforeContext,
      afterContext,
      needPrefixEllipsis,
      needSuffixEllipsis
    }
  }

  private startAppQuitCheck() {
    console.debug({
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
    this.registerExecShellHandler()
    this.registerCodeFormatHandler()
    this.registerAgentIpcHandlers()
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
      console.debug({
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
            let isWritable = true
            try { fs.accessSync(filePath, fs.constants.W_OK) } catch { isWritable = false }
            return {
              name: file.name,
              isDirectory: file.isDirectory(),
              path: filePath,
              size: stats?.size,
              created: stats?.birthtime,
              modified: stats?.mtime,
              accessed: stats?.atime,
              changed: stats?.ctime,
              isWritable
            }
          })
        } else {
          stats = fs.statSync(folderPath)
          let isWritable = true
          try { fs.accessSync(folderPath, fs.constants.W_OK) } catch { isWritable = false }
          return [{
            name: path.basename(folderPath),
            isDirectory: stats?.isDirectory(),
            path: folderPath,
            size: stats?.size,
            created: stats?.birthtime,
            modified: stats?.mtime,
            accessed: stats?.atime,
            changed: stats?.ctime,
            isWritable
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
        console.debug('Moving file:', { sourcePath, targetDir })
        
        const fileName = path.basename(sourcePath)
        const sourceDir = path.dirname(sourcePath)
        const targetPath = path.join(targetDir, fileName)
        
        console.debug('Paths:', { fileName, sourceDir, targetPath })
        
        // Check if trying to move to the same directory
        if (sourceDir === targetDir) {
          console.debug('Source and target directories are the same, skipping move')
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
            console.debug('Move successful with new name:', newTargetPath)
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
            console.debug('Move successful:', targetPath)
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
        console.debug('Move successful:', targetPath)
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
            console.debug(`File watcher ready for: ${folderPath}`);
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
          console.debug(`File watcher stopped for: ${folderPath}`);
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
        console.debug('All file watchers stopped');
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

    // 跨文件搜索
    ipcMain.handle('search-in-files', async (_, options: any) => {
      try {
        const {
          folderPath,
          searchTerm,
          options: searchOptions,
          includePattern,
          excludePattern,
          maxResults = 10000
        } = options

        if (!searchTerm || !folderPath) {
          return []
        }

        // 默认排除的目录和文件模式
        const defaultExcludePatterns = [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '.vscode/**',
          '.idea/**',
          '*.min.js',
          '*.min.css',
          'package-lock.json',
          'yarn.lock'
        ]

        // 二进制文件扩展名
        const binaryExtensions = new Set([
          '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
          '.mp3', '.mp4', '.avi', '.mov', '.wmv',
          '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
          '.zip', '.rar', '.7z', '.tar', '.gz',
          '.exe', '.dll', '.so', '.dylib'
        ])

        const results: any[] = []
        let totalMatches = 0

        // 递归搜索文件
        const searchInDirectory = (dir: string) => {
          if (totalMatches >= maxResults) return

          try {
            const items = fs.readdirSync(dir, { withFileTypes: true })

            for (const item of items) {
              if (totalMatches >= maxResults) break

              const fullPath = path.join(dir, item.name)
              const relativePath = path.relative(folderPath, fullPath)

              // 检查是否应该排除
              const shouldExclude = defaultExcludePatterns.some(pattern => {
                const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\//g, '\\/'))
                return regex.test(relativePath) || regex.test(item.name)
              })

              if (shouldExclude) continue

              if (item.isDirectory()) {
                searchInDirectory(fullPath)
              } else if (item.isFile()) {
                // 检查文件扩展名
                const ext = path.extname(item.name).toLowerCase()
                if (binaryExtensions.has(ext)) continue

                // 检查文件大小（跳过大于 10MB 的文件）
                try {
                  const stats = fs.statSync(fullPath)
                  if (stats.size > 10 * 1024 * 1024) continue
                } catch (err) {
                  continue
                }

                // 读取文件内容并搜索
                try {
                  const content = fs.readFileSync(fullPath, 'utf8')
                  const lines = content.split('\n')
                  const matches: any[] = []

                  // 构建搜索正则表达式
                  let pattern = searchTerm
                  if (!searchOptions.regex) {
                    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  }
                  if (searchOptions.wholeWord) {
                    pattern = `\\b${pattern}\\b`
                  }
                  const flags = searchOptions.caseSensitive ? 'g' : 'gi'
                  const regex = new RegExp(pattern, flags)

                  // 在每一行中搜索
                  lines.forEach((line, index) => {
                    if (totalMatches >= maxResults) return

                    // 获取一行中的所有匹配
                    const lineMatches = Array.from(line.matchAll(new RegExp(regex.source, flags)))

                    // 处理一行中的所有匹配
                    for (const match of lineMatches) {
                      if (totalMatches >= maxResults) break

                      const matchIndex = match.index || 0
                      const matchLength = match[0].length

                      // 使用智能上下文提取（语义边界优先）
                      const {
                        beforeContext,
                        afterContext,
                        needPrefixEllipsis,
                        needSuffixEllipsis
                      } = this.extractSmartContext(line, matchIndex, matchLength)

                      // 构建带高亮的 HTML
                      const prefix = needPrefixEllipsis ? '...' : ''
                      const suffix = needSuffixEllipsis ? '...' : ''

                      const matchText = line.substring(matchIndex, matchIndex + matchLength)

                      const contextHtml = `${prefix}${this.escapeHtml(beforeContext)}<mark>${this.escapeHtml(matchText)}</mark>${this.escapeHtml(afterContext)}${suffix}`

                      matches.push({
                        line: index + 1,
                        column: matchIndex,
                        text: match[0],
                        contextHtml
                      })
                      totalMatches++
                    }
                  })

                  if (matches.length > 0) {
                    results.push({
                      filePath: fullPath,
                      fileName: item.name,
                      relativePath,
                      matches,
                      totalMatches: matches.length
                    })
                  }
                } catch (err) {
                  // 跳过无法读取的文件
                  console.error(`Error reading file ${fullPath}:`, err)
                }
              }
            }
          } catch (err) {
            console.error(`Error reading directory ${dir}:`, err)
          }
        }

        // 开始搜索
        searchInDirectory(folderPath)

        return results
      } catch (error) {
        console.error('Error searching in files:', error)
        throw error
      }
    })

  }

  private registerExecShellHandler() {
    // Allowed read-only commands (prefix match)
    const ALLOWED_PREFIXES = [
      'ls', 'dir', 'find', 'cat', 'head', 'tail', 'grep',
      'wc', 'pwd', 'echo', 'file', 'stat', 'type', 'findstr', 'where',
    ]

    ipcMain.handle('exec-shell', async (_, command: string, cwd?: string) => {
      const cmdTrimmed = command.trim()
      const firstWord = cmdTrimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
      if (!ALLOWED_PREFIXES.includes(firstWord)) {
        return { stdout: '', stderr: `Command not permitted: "${firstWord}". Allowed: ${ALLOWED_PREFIXES.join(', ')}`, exitCode: 1 }
      }
      return new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => {
        exec(cmdTrimmed, { cwd: cwd || undefined, timeout: 5000 }, (error, stdout, stderr) => {
          resolve({
            stdout: stdout.slice(0, 20000),
            stderr: stderr.slice(0, 2000),
            exitCode: error?.code ?? 0,
          })
        })
      })
    })
  }

  private registerCodeFormatHandler() {
    ipcMain.handle('format-code', async (_, { code, language }: { code: string; language?: string | null }) => {
      return formatCodeInMain(code, language)
    })
  }

  private registerAgentIpcHandlers() {
    ipcMain.handle('ai:send-message', async (_, req) => {
      return this.agentEngine.sendMessage(req)
    })

    ipcMain.handle('ai:compact-input', async (_, req) => {
      return this.agentEngine.compactInput(req)
    })

    ipcMain.handle('ai:get-session-context-stats', async (_, req) => {
      return this.agentEngine.getSessionContextStats(req)
    })

    ipcMain.handle('ai:cancel', async (_, { threadId }: { threadId: string }) => {
      this.agentEngine.cancel(threadId)
    })

    // HITL resume — batch decisions array (approve / edit / reject)
    ipcMain.handle('ai:resume', async (_, req: import('./ai/ipc/protocol').ResumeRunRequest) => {
      await this.agentEngine.resumeRun(req.threadId, req.decisions)
    })

    ipcMain.handle('ai:get-config', async () => {
      return AiConfigStore.loadSettings()
    })

    ipcMain.handle('ai:update-config', async (_, settings: AiSettings) => {
      AiConfigStore.saveSettings(settings)
    })

    ipcMain.handle('ai:get-threads', async () => {
      return this.agentEngine.getThreads()
    })

    ipcMain.handle('ai:delete-thread', async (_, { threadId }: { threadId: string }) => {
      this.agentEngine.deleteThread(threadId)
    })

    ipcMain.handle('ai:clear-threads', async () => {
      this.agentEngine.clearThreads()
    })

    ipcMain.handle('ai:get-thread-messages', async (_, { threadId }: { threadId: string }) => {
      return this.agentEngine.getThreadMessages(threadId)
    })
  }

  private removeAllHandler() {
    ipcMain.removeHandler('exec-shell')
    ipcMain.removeHandler('format-code')
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
    ipcMain.removeHandler('search-in-files')

    ipcMain.removeAllListeners('hello');
    ipcMain.removeAllListeners('window-close-confirm');

    ipcMain.removeHandler('ai:send-message')
    ipcMain.removeHandler('ai:compact-input')
    ipcMain.removeHandler('ai:get-session-context-stats')
    ipcMain.removeHandler('ai:cancel')
    ipcMain.removeHandler('ai:resume')
    ipcMain.removeHandler('ai:get-config')
    ipcMain.removeHandler('ai:update-config')
    ipcMain.removeHandler('ai:get-threads')
    ipcMain.removeHandler('ai:delete-thread')
    ipcMain.removeHandler('ai:clear-threads')
    ipcMain.removeHandler('ai:get-thread-messages')
  }

  // Send menu action to the focused window
  private handleMenuAction(action: string) {
    if (action === 'new-window') {
      this.windowManager.createWindow()
      return
    }

    if (
      (this.windowManager.getWindowCount() === 0) &&
      ((action === 'new-file') || (action === 'open-file') || action === 'open-folder')
    ) {
      this.windowManager.createWindow()      
    }
  
    BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', action)
  }
  
  private handleUpdateMenu() {
    let wState: WindowState | undefined = undefined
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      wState = this.windowManager.getWindowStateById(focusedWindow.id);
    }

    if (wState) this.menuManager.setupMenu(wState, this.g);
  }

  run() {
    app.on('window-all-closed', () => {
      console.debug({
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
      console.debug({
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
      console.debug({
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
        console.debug('All file watchers stopped');
      } catch (error) {
        console.error('Error stopping all file watchers:', error);
      }
      this.removeAllHandler()
    });
      
    app.on('activate', () =>{
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
        console.debug('UpdaterManager disabled in development mode')
      }
    })
  }
}
