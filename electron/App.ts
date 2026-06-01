import { app, BrowserWindow, ipcMain, Menu, shell, dialog, clipboard } from 'electron'
import type { MenuItemConstructorOptions, MessageBoxOptions, OpenDialogOptions, SaveDialogOptions } from 'electron'
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
import { UpdaterManager } from '../src/updater/UpdaterManager'
import { PandocService } from './PandocService'
import type { AgentEngine } from './ai/AgentEngine'
import { AiConfigStore } from './ai/config/AiConfigStore'
import { perfLog } from './perf'
import type { AiSettings } from '../src/types/ai'
import { formatCodeInMain } from './CodeFormatService'
import { createMainTranslator, formatMainText } from './i18n'
import {
  DEFAULT_WORKSPACE_IGNORE_RULES,
  WORKSPACE_IGNORE_FILENAME,
  parseWorkspaceIgnoreRules,
  shouldIncludeWorkspaceEntry,
} from '../src/services/workspace/filtering'
import type { ContextMenuItem } from '../src/types/menu'
import { CustomThemeLoader } from './CustomThemeLoader'

interface WorkspaceSearchOptions {
  regex?: boolean
  wholeWord?: boolean
  caseSensitive?: boolean
}

interface SearchInFilesRequest {
  folderPath: string
  searchTerm: string
  options: WorkspaceSearchOptions
  includePattern?: string
  excludePattern?: string
  maxResults?: number
}

interface SearchMatch {
  line: number
  column: number
  text: string
  contextHtml: string
}

interface SearchFileResult {
  filePath: string
  fileName: string
  relativePath: string
  matches: SearchMatch[]
  totalMatches: number
}

interface FileWatchingOptions {
  depth?: number
  ignoreRulesText?: string
}

function createWorkspaceIgnoredPredicate(
  workspaceRoot: string,
  ignoreRulesText?: string
): ((filePath: string, stats?: fs.Stats) => boolean) | undefined {
  if (!ignoreRulesText?.trim()) return undefined

  const normalizedRoot = path.resolve(workspaceRoot)
  const matcher = parseWorkspaceIgnoreRules(ignoreRulesText)
  const hasNegatedRules = matcher.rules.some(rule => rule.negated)

  return (filePath: string, stats?: fs.Stats): boolean => {
    const absolutePath = path.resolve(filePath)
    const relativePath = path.relative(normalizedRoot, absolutePath).replace(/\\/g, '/')

    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return false
    }

    if (path.basename(absolutePath) === WORKSPACE_IGNORE_FILENAME) {
      return false
    }

    if (!stats) return false

    if (stats.isDirectory() && hasNegatedRules) {
      return false
    }

    return !shouldIncludeWorkspaceEntry(
      {
        relativePath,
        isDirectory: stats.isDirectory(),
      },
      matcher
    )
  }
}

export class App {
  private fileWatchers: Map<string, FSWatcher>
  private menuManager: MenuManager
  private windowManager: WindowManager
  private updaterManager: UpdaterManager | null
  private pandocService: PandocService
  private _agentEngine: AgentEngine | null = null
  private customThemeLoader: CustomThemeLoader
  private appQuitTimer: Timer | null = null
  private _isAppQuitting: boolean
  private _exitApp: boolean

  constructor() {
    this.fileWatchers = new Map()
    this.menuManager = new MenuManager()
    this.windowManager = new WindowManager(this)
    this.updaterManager = null
    this.pandocService = new PandocService()
    this.customThemeLoader = new CustomThemeLoader()
    this._isAppQuitting = false
    this._exitApp = false
    // AgentEngine（langchain/deepagents）懒加载：首次 AI IPC 调用时再构造
    // 避免在 app.whenReady 之前同步求值整个 langchain 模块图

    this.setupIpcHandlers()
    perfLog('App constructor done')
  }

  /**
   * 懒加载 AgentEngine：首次调用时动态 import 并构造单例。
   * 确保 langchain/deepagents/provider SDK 不在启动关键路径上求值。
   */
  private async _getAgentEngine(): Promise<AgentEngine> {
    if (!this._agentEngine) {
      const { AgentEngine: AgentEngineClass } = await import('./ai/AgentEngine')
      this._agentEngine = new AgentEngineClass(
        () => BrowserWindow.getAllWindows()[0]?.webContents ?? null
      )
    }
    return this._agentEngine
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

  private t(key: string, fallback: string): string {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const locale = focusedWindow
      ? this.windowManager.getWindowStateById(focusedWindow.id)?.wContentState?.view?.locale
      : undefined
    const translator = createMainTranslator(locale)
    return translator(key, fallback)
  }

  private tf(
    key: string,
    fallback: string,
    params: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return formatMainText(this.t(key, fallback), params)
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
        if (BOUNDARY_CHARS.has(beforeText[i] ?? '')) {
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
          if (BOUNDARY_CHARS.has(extendedText[i] ?? '')) {
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
        if (BOUNDARY_CHARS.has(afterText[i] ?? '')) {
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
          if (BOUNDARY_CHARS.has(extendedText[i] ?? '')) {
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
    this.registerPandocHandlers()
    this.registerAgentIpcHandlers()
    this.registerCustomThemeHandlers()
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

    ipcMain.handle('read-clipboard-text', () => clipboard.readText())

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

    ipcMain.handle('read-file-silent', async (_, filePath: string) => {
      try {
        return fs.readFileSync(filePath, 'utf8')
      } catch (error) {
        console.error('Error reading file silently:', error)
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
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
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

    ipcMain.handle('ensure-directory', async (_, folderPath: string) => {
      try {
        fs.mkdirSync(folderPath, { recursive: true })
        return true
      } catch (error) {
        console.error('Error ensuring directory:', error)
        throw error
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
              isWritable,
              isHidden: file.name.startsWith('.')
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
            isWritable,
            isHidden: path.basename(folderPath).startsWith('.')
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
    ipcMain.handle('show-open-dialog', async (_, options: OpenDialogOptions) => {
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
    ipcMain.handle('show-save-dialog', async (_, options: SaveDialogOptions) => {
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
    ipcMain.handle('show-message-box', async (_, options: MessageBoxOptions) => {
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
          throw new Error(this.t('error.fileExists', 'File already exists'))
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
          throw new Error(this.t('error.folderExists', 'Folder already exists'))
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
          title: this.t('dialog.delete.title', 'Delete'),
          message: this.tf('dialog.delete.message', 'Are you sure you want to delete "{path}"?', {
            path: filePath,
          }),
          buttons: [
            this.t('dialog.common.yes', 'Yes'),
            this.t('dialog.common.no', 'No'),
          ],
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
          throw new Error(this.t('error.targetExists', 'Target already exists'))
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
        const fileName = path.basename(sourcePath)
        const sourceDir = path.dirname(sourcePath)
        const targetPath = path.join(targetDir, fileName)
                
        // Check if trying to move to the same directory
        if (sourceDir === targetDir) {
          return {
            success: false,
            conflictAction: 'skip'
          }
        }
        
        // Check if target already exists
        if (fs.existsSync(targetPath)) {
          const { response } = await dialog.showMessageBox(focusedWindow, {
            type: 'warning',
            title: this.t('dialog.move.title', 'Move'),
            message: this.tf(
              'dialog.move.message',
              'An older item named "{name}" already exists here. Replace it with the newer item being moved?',
              { name: fileName }
            ),
            buttons: [
              this.t('dialog.move.keepBoth', 'KeepBoth'),
              this.t('dialog.common.no', 'No'),
              this.t('dialog.move.replace', 'Replace'),
            ],
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
        return {
          success: true,
          newPath: targetPath,
        }
      } catch (error) {
        console.error('Error moving file:', error)
        throw error
      }
    })

    ipcMain.handle('copy-file', async (_, sourcePath: string, targetDir: string) => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow == null) return null

      const copyPathRecursive = (source: string, target: string) => {
        const sourceStats = fs.statSync(source)
        if (sourceStats.isDirectory()) {
          fs.mkdirSync(target, { recursive: true })
          const entries = fs.readdirSync(source, { withFileTypes: true })
          for (const entry of entries) {
            copyPathRecursive(path.join(source, entry.name), path.join(target, entry.name))
          }
          return
        }

        fs.copyFileSync(source, target)
      }

      const buildKeepBothTargetPath = (originalTargetPath: string) => {
        const fileName = path.basename(originalTargetPath)
        const parentDir = path.dirname(originalTargetPath)
        const ext = path.extname(fileName)
        const baseName = ext ? fileName.slice(0, -ext.length) : fileName

        let counter = 1
        let newTargetPath = path.join(parentDir, `${baseName} (${counter})${ext}`)
        while (fs.existsSync(newTargetPath)) {
          counter += 1
          newTargetPath = path.join(parentDir, `${baseName} (${counter})${ext}`)
        }

        return newTargetPath
      }

      try {
        const fileName = path.basename(sourcePath)
        const sourceDir = path.dirname(sourcePath)
        const targetPath = path.join(targetDir, fileName)

        let finalTargetPath = targetPath

        if (sourceDir === targetDir) {
          finalTargetPath = buildKeepBothTargetPath(targetPath)
          copyPathRecursive(sourcePath, finalTargetPath)
          return {
            success: true,
            conflictAction: 'keepBoth',
            newPath: finalTargetPath,
          }
        }

        if (fs.existsSync(targetPath)) {
          const { response } = await dialog.showMessageBox(focusedWindow, {
            type: 'warning',
            title: this.t('dialog.move.title', 'Copy'),
            message: this.tf(
              'dialog.move.message',
              'An older item named "{name}" already exists here. Replace it with the newer item being moved?',
              { name: fileName }
            ),
            buttons: [
              this.t('dialog.move.keepBoth', 'KeepBoth'),
              this.t('dialog.common.no', 'No'),
              this.t('dialog.move.replace', 'Replace'),
            ],
            defaultId: 0,
            cancelId: 1,
          })

          if (response === 0) {
            finalTargetPath = buildKeepBothTargetPath(targetPath)
          } else if (response === 2) {
            if (fs.statSync(targetPath).isDirectory()) {
              fs.rmSync(targetPath, { recursive: true, force: true })
            } else {
              fs.unlinkSync(targetPath)
            }
          } else {
            return {
              success: false,
              conflictAction: 'cancel',
              newPath: sourcePath,
            }
          }
        }

        copyPathRecursive(sourcePath, finalTargetPath)
        return {
          success: true,
          conflictAction: finalTargetPath === targetPath ? 'replace' : 'keepBoth',
          newPath: finalTargetPath,
        }
      } catch (error) {
        console.error('Error copying file:', error)
        throw error
      }
    })

    // 文件监听相关的 IPC 处理器
    ipcMain.handle('start-file-watching', async (event, folderPath: string, watchOptions: FileWatchingOptions = {}) => {
      try {
        // 停止已存在的监听器
        if (this.fileWatchers.has(folderPath)) {
          const existingWatcher = this.fileWatchers.get(folderPath);
          existingWatcher?.close();
          this.fileWatchers.delete(folderPath);
        }

        const ignored = createWorkspaceIgnoredPredicate(folderPath, watchOptions.ignoreRulesText)

        // 创建新的监听器
        const watcher = chokidar.watch(folderPath, {
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
          depth: watchOptions.depth ?? 10, // 限制监听深度
          ignored,
          ignorePermissionErrors: true,
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
    ipcMain.handle('show-context-menu', async (event, menuItems: ContextMenuItem[], position: { x: number; y: number }) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return null;
      }

      // 将菜单项转换为 Electron 菜单格式
      const convertMenuItems = (items: ContextMenuItem[]): MenuItemConstructorOptions[] => {
        return items.map(item => {
          if (item.type === 'separator') {
            return { type: 'separator' };
          }
          
          const menuItem: MenuItemConstructorOptions = {}
          if (item.id) {
            menuItem.id = item.id
          }
          if (item.label) {
            menuItem.label = item.label
          }
          if (item.type) {
            menuItem.type = item.type || 'normal'
          }
          if (typeof item.enabled === 'boolean') {
            menuItem.enabled = item.enabled !== false
          }
          if (typeof item.visible === 'boolean') {
            menuItem.visible = item.visible !== false
          }
          if (item.checked) {
            if ( menuItem.type !== 'radio' && menuItem.type !== 'checkbox' ) {
              menuItem.type = 'checkbox'
            }
            menuItem.checked = item.checked
          }
          if (item.role) {
            menuItem.role = item.role as MenuItemConstructorOptions['role']
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
    ipcMain.handle('search-in-files', async (_, options: SearchInFilesRequest) => {
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

        const ignoreMatcher = parseWorkspaceIgnoreRules(DEFAULT_WORKSPACE_IGNORE_RULES)

        // 二进制文件扩展名
        const binaryExtensions = new Set([
          '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
          '.mp3', '.mp4', '.avi', '.mov', '.wmv',
          '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
          '.zip', '.rar', '.7z', '.tar', '.gz',
          '.exe', '.dll', '.so', '.dylib'
        ])

        const results: SearchFileResult[] = []
        let totalMatches = 0

        // 递归搜索文件
        const searchInDirectory = (dir: string) => {
          if (totalMatches >= maxResults) return

          try {
            const items = fs.readdirSync(dir, { withFileTypes: true })

            for (const item of items) {
              if (totalMatches >= maxResults) break

              const fullPath = path.join(dir, item.name)
              const relativePath = path.relative(folderPath, fullPath).replace(/\\/g, '/')
              const shouldInclude = shouldIncludeWorkspaceEntry(
                { relativePath, isDirectory: item.isDirectory() },
                ignoreMatcher,
                item.isDirectory() ? undefined : includePattern,
                excludePattern
              )

              if (!shouldInclude) continue

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
                } catch {
                  continue
                }

                // 读取文件内容并搜索
                try {
                  const content = fs.readFileSync(fullPath, 'utf8')
                  const lines = content.split('\n')
                  const matches: SearchMatch[] = []

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

  private registerPandocHandlers() {
    ipcMain.handle('pandoc:check', async (_, req?: { pandocPath?: string }) => {
      return this.pandocService.checkAvailability(req?.pandocPath)
    })

    ipcMain.handle('pandoc:import-file', async (_, req) => {
      return this.pandocService.importFile(req)
    })

    ipcMain.handle('pandoc:export-file', async (_, req) => {
      return this.pandocService.exportFile(req)
    })
  }

  private registerAgentIpcHandlers() {
    ipcMain.handle('ai:send-message', async (_, req) => {
      return (await this._getAgentEngine()).sendMessage(req)
    })

    ipcMain.handle('ai:compact-input', async (_, req) => {
      return (await this._getAgentEngine()).compactInput(req)
    })

    ipcMain.handle('ai:get-session-context-stats', async (_, req) => {
      return (await this._getAgentEngine()).getSessionContextStats(req)
    })

    ipcMain.handle('ai:cancel', async (_, { threadId }: { threadId: string }) => {
      ;(await this._getAgentEngine()).cancel(threadId)
    })

    // HITL resume — batch decisions array (approve / edit / reject)
    ipcMain.handle('ai:resume', async (_, req: import('./ai/ipc/protocol').ResumeRunRequest) => {
      await (await this._getAgentEngine()).resumeRun(req.threadId, req.decisions)
    })

    ipcMain.handle('ai:get-config', async () => {
      return AiConfigStore.loadSettings()
    })

    ipcMain.handle('ai:update-config', async (_, settings: AiSettings) => {
      AiConfigStore.saveSettings(settings)
    })

    ipcMain.handle('ai:get-threads', async () => {
      return (await this._getAgentEngine()).getThreads()
    })

    ipcMain.handle('ai:delete-thread', async (_, { threadId }: { threadId: string }) => {
      ;(await this._getAgentEngine()).deleteThread(threadId)
    })

    ipcMain.handle('ai:clear-threads', async () => {
      ;(await this._getAgentEngine()).clearThreads()
    })

    ipcMain.handle('ai:get-thread-messages', async (_, { threadId }: { threadId: string }) => {
      return (await this._getAgentEngine()).getThreadMessages(threadId)
    })
  }

  private registerCustomThemeHandlers() {
    ipcMain.handle('custom-themes:load', () => {
      return this.customThemeLoader.load()
    })

    ipcMain.handle('custom-themes:open-folder', () => {
      this.customThemeLoader.openFolder()
    })

    ipcMain.handle('custom-themes:create-example', () => {
      this.customThemeLoader.createExampleTheme()
      return this.customThemeLoader.load()
    })

    // chokidar watcher 延迟到 app.whenReady 之后启动（见 startCustomThemeWatcher）
  }

  /** 在窗口创建后启动自定义主题文件监听（chokidar），避免阻塞冷启动路径 */
  private startCustomThemeWatcher(): void {
    this.customThemeLoader.watchThemes((themes) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('custom-themes:changed', themes)
        }
      }
    })
  }

  private removeAllHandler() {
    ipcMain.removeHandler('exec-shell')
    ipcMain.removeHandler('format-code')
    ipcMain.removeHandler('pandoc:check')
    ipcMain.removeHandler('pandoc:import-file')
    ipcMain.removeHandler('pandoc:export-file')
    ipcMain.removeHandler('hello')
    ipcMain.removeHandler('read-file')
    ipcMain.removeHandler('read-file-silent')
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

    if (wState) this.menuManager.setupMenu(wState);
  }

  run() {
    // Must be registered before app.whenReady() — macOS fires open-file for
    // "Open Recent" selections (and Finder double-clicks) before or after ready.
    app.on('open-file', (event, filePath) => {
      event.preventDefault()
      const send = (win: BrowserWindow) =>
        win.webContents.send('menu-action', `open-path:${filePath}`)
      const focused = BrowserWindow.getFocusedWindow()
      if (focused) {
        send(focused)
      } else {
        const [first] = BrowserWindow.getAllWindows()
        if (first) {
          send(first)
        } else {
          // No window yet — create one, then open the file once it's ready
          const win = this.windowManager.createWindow()
          win.webContents.once('did-finish-load', () => send(win))
        }
      }
    })

    app.on('window-all-closed', () => {
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

    app.on('will-quit', async (_event) => {
      // 清理应用强制退出定时器
      this.appQuitTimer?.end()

      if (this.updaterManager) {
        this.updaterManager.destroy()
        this.updaterManager = null
      }
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
      perfLog('app.whenReady fired')
      this.menuManager.setSendMenuAction((action: string) => {
        this.handleMenuAction(action)
      })
      this.windowManager.createWindow()
      this.windowManager.setUpdateMenu(() => {
        this.handleUpdateMenu()
      })

      // 窗口创建后再启动主题文件监听（chokidar + ensureThemesDir）
      this.startCustomThemeWatcher()

      // 只在生产环境启用更新器（排在 createWindow 之后，不阻塞窗口创建）
      if (!isDev) {
        try {
          this.updaterManager = new UpdaterManager()
          this.updaterManager.setSendAppUpdateInfo((channel: string, data?: unknown)=>{
            this.windowManager.handleAppUpdateInfo(channel, data)
          })
          this.updaterManager.checkOnStartup()
        } catch (error) {
          console.error('Failed to initialize UpdaterManager:', error)
        }
      } else {
        console.debug('UpdaterManager disabled in development mode')
        // dev 模式下渲染端仍会调用这两个 IPC，注册 stub 避免 "No handler" 错误
        ipcMain.handle('updater:get-state', () => ({ status: { type: 'idle', message: '' }, updateInfo: null }))
        ipcMain.handle('updater:get-config', () => ({ autoCheck: false, autoDownload: false, skipVersion: null }))
      }

    })
  }
}
