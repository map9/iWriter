import { app, BrowserWindow, Menu, ipcMain, dialog, shell, systemPreferences, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import chokidar, { FSWatcher } from 'chokidar'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 文档类型枚举
export enum DocumentType {
  TEXT_EDITOR = 'text-editor',
  PDF_VIEWER = 'pdf-viewer',
  IMAGE_VIEWER = 'image-viewer',
  UNKNOWN = 'unknown'
}

// 窗口内容信息接口
interface WindowContentInfo {
  type: DocumentType
  hasActiveDocument?: false
  hasFolderOpen?: false
  hasSelection?: boolean
  view?: {
    leftSidebar?: boolean
    rightSidebar?: boolean
    statusbar?: boolean
    isFullscreen?: boolean
    theme?: 'system' | 'light' | 'dark' | 'ocean' | 'forest' | 'sunset'
  }
  undoRedo?: {
    undo: boolean
    redo: boolean
  }
  contentState?: {
    type: string | number
    canSink?: boolean
    canLift?: boolean
  }
  formatting?: {
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
    textAlign: string
    script: 'superscript' | 'subscript' | 'none',
    highlight: boolean,
    inlineCode: boolean
  }
}

// 窗口状态接口
interface WindowState {
  id: number
  window: BrowserWindow
  contentInfo?: WindowContentInfo
}

interface GlobalParameters {
  autoSave: boolean
}

interface ThemeListener{
  type: string
  handler: any 
}

let windows: WindowState[] = [];
let currentFocusedWindowId: number | null = null;
let g: GlobalParameters = {
  autoSave: true,
}

// 文件监听器管理
const fileWatchers: Map<string, FSWatcher> = new Map();
const themeListeners: ThemeListener[] = []

// Send menu action to the focused window
function sendMenuAction(focusedWindow: WindowState | undefined, action: string) {
  if (focusedWindow?.window) {
    focusedWindow.window.webContents.send('menu-action', action);
  }
}

function createWindow(): BrowserWindow {
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
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../vue/index.html')}`
  window.loadURL(startUrl)

  const windowState: WindowState = {
    id: windowId,
    window: window,
  };
  
  windows.push(windowState);

  // Handle window close
  window.on('closed', () => {
    windows = windows.filter(w => w.id !== windowId);

    window.removeListener('enter-full-screen', handleEnterFullScreen)
    window.removeListener('leave-full-screen', handleLeaveFullScreen)
    window.removeListener('focus', handleFocus)
    
    if (currentFocusedWindowId === windowId) {
      currentFocusedWindowId = getFirstWindowId();
    }
    updateMenu();
  })

  function handleEnterFullScreen() {
    console.log('enter-full-screen')
    window.webContents.send('window-state-changed', { maximized: true })
  }

  function handleLeaveFullScreen() {
    console.log('leave-full-screen')
    window.webContents.send('window-state-changed', { maximized: false })
  }

  function handleFocus() {
    currentFocusedWindowId = windowId;
    updateMenu();
  }

  window.once('ready-to-show', () => {
    window.show()

    //console.log(getSystemColors())

    // Handle window state changes after window is ready
    window.on('enter-full-screen', handleEnterFullScreen)
    window.on('leave-full-screen', handleLeaveFullScreen)
  })

  // Handle window focus - request current state for menu updates
  window.on('focus', handleFocus)

  window.webContents.on('did-finish-load', () => {
    window.webContents.send('window-id', windowId);
  });

  if (isDev) {
    window.webContents.openDevTools()
  }
  
  return window
}

function getFirstWindowId(): number | null {
  return windows.length > 0 ? windows[0].id : null;
}

function createNewWindow(): BrowserWindow {
  return createWindow()
}

function updateMenu(): void {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  // Build base menu template
  const baseTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'iWriter',
      submenu: [
        {
          label: 'About iWriter',
          click: () => {
            sendMenuAction(focusedWindow, 'about')
          }
        },
        { type: 'separator' },
        {
          label: 'License...',
          click: () => {
            sendMenuAction(focusedWindow, 'license')
          }
        },
        { type: 'separator' },
        {
          label: 'Check for update...',
          click: () => {
            sendMenuAction(focusedWindow, 'check-update')
          }
        },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            sendMenuAction(focusedWindow, 'preferences')
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        {
          label: 'Hide iWriter',
          accelerator: 'CmdOrCtrl+H',
          role: 'hide'
        },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit iWriter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Document',
          accelerator: 'CmdOrCtrl+N',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'new-file')
          }
        },
        {
          label: 'New from Template...',
          accelerator: 'CmdOrCtrl+Shift+N',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'new-from-template')
          }
        },
        {
          id: 'new-window',
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => {
            createNewWindow()
          }
        },
        { type: 'separator' },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'open-file')
          }
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'open-folder')
          }
        },
        {
          label: 'Open Recent',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          submenu: [
            // Will be populated dynamically
          ]
        },
        { type: 'separator' },
        {
          id: 'save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction(focusedWindow, 'save')
          }
        },
        {
          id: 'save-as',
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction(focusedWindow, 'save-as')
          }
        },
        {
          id: 'auto-save',
          label: 'Auto Save',
          type: 'checkbox',
          checked: g.autoSave,
          enabled: currentFocusedWindowId !== null && currentFocusedWindowId !== null,
          click: () => {
            g.autoSave = !g.autoSave
            sendMenuAction(focusedWindow, 'toggle-auto-save')
            updateMenu()
          }
        },
        {
          id: 'save-all',
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Alt+S',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction(focusedWindow, 'save-all')
          }
        },
        { type: 'separator' },
        {
          label: 'Import',
          enabled: currentFocusedWindowId !== null,
          submenu: [
            {
              label: 'Evernote',
              click: () => {
                sendMenuAction(focusedWindow, 'import-evernote')
              }
            },
            {
              label: 'Drafts',
              click: () => {
                sendMenuAction(focusedWindow, 'import-drafts')
              }
            },
            {
              label: 'Obsidian',
              click: () => {
                sendMenuAction(focusedWindow, 'import-obsidian')
              }
            },
            {
              label: 'Day One',
              click: () => {
                sendMenuAction(focusedWindow, 'import-day-one')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction(focusedWindow, 'import-more-options')
              }
            }
          ]
        },
        {
          id: 'export',
          label: 'Export',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          submenu: [
            {
              label: 'PDF',
              click: () => {
                sendMenuAction(focusedWindow, 'export-pdf')
              }
            },
            {
              label: 'Html',
              click: () => {
                sendMenuAction(focusedWindow, 'export-html')
              }
            },
            {
              label: 'Word(.docx)',
              click: () => {
                sendMenuAction(focusedWindow, 'export-word')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction(focusedWindow, 'export-more-options')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Page Setting...',
          accelerator: 'CmdOrCtrl+Shift+P',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction(focusedWindow, 'page-setting')
          }
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction(focusedWindow, 'print')
          }
        },
        { type: 'separator' },
        {
          id: 'close-file',
          label: 'Close File',
          accelerator: 'CmdOrCtrl+W',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction(focusedWindow, 'close-file')
          }
        },
        {
          id: 'close-folder',
          label: 'Close Folder',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.hasFolderOpen,
          click: () => {
            sendMenuAction(focusedWindow, 'close-folder')
          }
        },
        {
          id: 'close-window',
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            if (focusedWindow?.window) {
              focusedWindow.window.close()
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.undoRedo?.undo,
          click: () => {
            sendMenuAction(focusedWindow, 'undo')
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          enabled: currentFocusedWindowId !== null && focusedWindow?.contentInfo?.undoRedo?.redo,
          click: () => {
            sendMenuAction(focusedWindow, 'redo')
          }
        },
        { type: 'separator' },
        {
          role: 'cut'
        },
        {
          role: 'copy'
        },
        {
          label: 'Copy as',
          submenu: [
            {
              label: 'Plain Text',
              click: () => {
                sendMenuAction(focusedWindow, 'copy-as-plain-text')
              }
            },
            {
              label: 'Markdown',
              click: () => {
                sendMenuAction(focusedWindow, 'copy-as-markdown')
              }
            },
            {
              label: 'Html',
              click: () => {
                sendMenuAction(focusedWindow, 'copy-as-html')
              }
            },
            {
              label: 'Picture',
              click: () => {
                sendMenuAction(focusedWindow, 'copy-as-picture')
              }
            }
          ]
        },
        {
          role: 'paste'
        },
        {
          label: 'Paste as Text',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => {
            sendMenuAction(focusedWindow, 'paste-as-text')
          }
        },
        {
          role: 'delete'
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll'
        },
        { type: 'separator' },
        {
          label: 'Line Ending',
          submenu: [
            {
              label: 'Windows CRLF',
              type: 'radio',
              checked: true,
              click: () => {
                sendMenuAction(focusedWindow, 'line-ending-crlf')
              }
            },
            {
              label: 'Unix LF',
              type: 'radio',
              click: () => {
                sendMenuAction(focusedWindow, 'line-ending-lf')
              }
            }
          ]
        },
        {
          label: 'Space and Line break',
          submenu: [
            {
              label: 'First line indent',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'first-line-indent')
              }
            },
            {
              label: 'Show <br/>',
              click: () => {
                sendMenuAction(focusedWindow, 'show-br')
              }
            },
            {
              label: 'Keep Line breaks',
              click: () => {
                sendMenuAction(focusedWindow, 'keep-line-breaks')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction(focusedWindow, 'space-line-break-options')
              }
            }
          ]
        },
        {
          label: 'Auto replace',
          submenu: [
            {
              label: 'Convert on Input',
              type: 'checkbox',
              checked: true,
              click: () => {
                sendMenuAction(focusedWindow, 'convert-on-input')
              }
            },
            {
              label: 'Convert on Render',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'convert-on-render')
              }
            },
            {
              label: 'Smart Quotes',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'smart-quotes')
              }
            },
            {
              label: 'Smart Dashes',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'smart-dashes')
              }
            },
            {
              label: 'Text Replace',
              click: () => {
                sendMenuAction(focusedWindow, 'text-replace')
              }
            },
            {
              label: 'Auto Convert Unicode Punctuation',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'auto-convert-unicode')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction(focusedWindow, 'auto-replace-options')
              }
            }
          ]
        },
        {
          label: 'Spell and Grammar check',
          submenu: [
            {
              label: 'Check Document',
              accelerator: 'CmdOrCtrl+;',
              click: () => {
                sendMenuAction(focusedWindow, 'check-document')
              }
            },
            {
              label: 'Show Spelling and Grammar...',
              accelerator: 'CmdOrCtrl+Shift+;',
              click: () => {
                sendMenuAction(focusedWindow, 'show-spelling-grammar')
              }
            },
            { type: 'separator' },
            {
              label: 'Check Spelling On Input',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'check-spelling-on-input')
              }
            },
            {
              label: 'Check Spell and Grammar',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'check-spell-grammar')
              }
            },
            {
              label: 'Auto Correct Spell',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'auto-correct-spell')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            sendMenuAction(focusedWindow, 'find')
          }
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+Alt+F',
          click: () => {
            sendMenuAction(focusedWindow, 'replace')
          }
        },
        { type: 'separator' },
        {
          label: 'Find in Files',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            sendMenuAction(focusedWindow, 'find-in-files')
          }
        },
        {
          label: 'Replace in Files',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => {
            sendMenuAction(focusedWindow, 'replace-in-files')
          }
        }
      ]
    },
    {
      id: 'paragraph-menu',
      label: 'Paragraph',
      submenu: [
        {
          label: 'Heading 1',
          accelerator: 'CmdOrCtrl+1',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 1,
          click: () => {
            sendMenuAction(focusedWindow, 'heading-1')
          }
        },
        {
          label: 'Heading 2',
          accelerator: 'CmdOrCtrl+2',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 2,
          click: () => {
            sendMenuAction(focusedWindow, 'heading-2')
          }
        },
        {
          label: 'Heading 3',
          accelerator: 'CmdOrCtrl+3',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 3,
          click: () => {
            sendMenuAction(focusedWindow, 'heading-3')
          }
        },
        {
          label: 'Heading 4',
          accelerator: 'CmdOrCtrl+4',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 4,
          click: () => {
            sendMenuAction(focusedWindow, 'heading-4')
          }
        },
        {
          label: 'Heading 5',
          accelerator: 'CmdOrCtrl+5',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 5,
          click: () => {
            sendMenuAction(focusedWindow, 'heading-5')
          }
        },
        {
          label: 'Heading 6',
          accelerator: 'CmdOrCtrl+6',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 6,
          click: () => {
            sendMenuAction(focusedWindow, 'heading-6')
          }
        },
        { type: 'separator' },
        {
          label: 'Paragraph',
          accelerator: 'CmdOrCtrl+0',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'paragraph',
          click: () => {
            sendMenuAction(focusedWindow, 'paragraph')
            }
          },
          { type: 'separator' },
          {
            label: 'Promote Heading',
            accelerator: 'CmdOrCtrl+=',
            enabled:
            focusedWindow?.contentInfo?.contentState?.type !== 1 &&
            (
              (typeof focusedWindow?.contentInfo?.contentState?.type === 'number' &&
              focusedWindow?.contentInfo?.contentState?.type >= 2 &&
              focusedWindow?.contentInfo?.contentState?.type <= 6
              ) ||
              focusedWindow?.contentInfo?.contentState?.type === 'paragraph'
            ),
            click: () => {
            sendMenuAction(focusedWindow, 'promote-heading')
          }
        },
        {
          label: 'Demote Heading',
          accelerator: 'CmdOrCtrl+-',
          enabled: 
          focusedWindow?.contentInfo?.contentState?.type !== 'paragraph' &&
          (typeof focusedWindow?.contentInfo?.contentState?.type === 'number' &&
          focusedWindow?.contentInfo?.contentState?.type >= 1 &&
          focusedWindow?.contentInfo?.contentState?.type <= 6
          ),
          click: () => {
            sendMenuAction(focusedWindow, 'demote-heading')
          }
        },
        { type: 'separator' },
        {
          label: 'Table',
          submenu: [
            {
              label: 'Insert Table',
              accelerator: 'CmdOrCtrl+Shift+T',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-table')
              }
            },
            { type: 'separator' },
            {
              label: 'Insert Line Above',
              click: () => {
                sendMenuAction(focusedWindow, 'table-insert-line-above')
              }
            },
            {
              label: 'Insert Line Below',
              accelerator: 'CmdOrCtrl+Enter',
              click: () => {
                sendMenuAction(focusedWindow, 'table-insert-line-below')
              }
            },
            { type: 'separator' },
            {
              label: 'Insert Row Left',
              click: () => {
                sendMenuAction(focusedWindow, 'table-insert-row-left')
              }
            },
            {
              label: 'Insert Row Right',
              click: () => {
                sendMenuAction(focusedWindow, 'table-insert-row-right')
              }
            },
            { type: 'separator' },
            {
              label: 'Move Line Up',
              accelerator: 'CmdOrCtrl+Shift+Up',
              click: () => {
                sendMenuAction(focusedWindow, 'table-move-line-up')
              }
            },
            {
              label: 'Move Line Up',
              accelerator: 'CmdOrCtrl+Shift+Down',
              click: () => {
                sendMenuAction(focusedWindow, 'table-move-line-down')
              }
            },
            {
              label: 'Move Line Left',
              accelerator: 'CmdOrCtrl+Shift+Left',
              click: () => {
                sendMenuAction(focusedWindow, 'table-move-line-left')
              }
            },
            {
              label: 'Move Line Right',
              accelerator: 'CmdOrCtrl+Shift+Right',
              click: () => {
                sendMenuAction(focusedWindow, 'table-move-line-right')
              }
            },
            { type: 'separator' },
            {
              label: 'Delete Line',
              accelerator: 'CmdOrCtrl+Shift+Backspace',
              click: () => {
                sendMenuAction(focusedWindow, 'table-delete-line')
              }
            },
            {
              label: 'Delete Row',
              click: () => {
                sendMenuAction(focusedWindow, 'table-delete-row')
              }
            },
            { type: 'separator' },
            {
              label: 'Duplicate Table',
              click: () => {
                sendMenuAction(focusedWindow, 'table-duplicate')
              }
            },
            {
              label: 'Format Table Source',
              click: () => {
                sendMenuAction(focusedWindow, 'table-format-source')
              }
            },
            { type: 'separator' },
            {
              label: 'Delete Table',
              click: () => {
                sendMenuAction(focusedWindow, 'table-delete')
              }
            }
          ]
        },
        {
          label: 'Code Block',
          accelerator: 'CmdOrCtrl+Shift+C',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'codeBlock',
          click: () => {
            sendMenuAction(focusedWindow, 'insert-code-block')
          }
        },
        {
          label: 'Code Tools',
          submenu: [
            {
              label: 'Duplicate Code Content',
              click: () => {
                sendMenuAction(focusedWindow, 'code-duplicate-content')
              }
            },
            {
              label: 'Adjust Selected Indent',
              click: () => {
                sendMenuAction(focusedWindow, 'code-adjust-selected-indent')
              }
            },
            {
              label: 'Adjust Indent',
              click: () => {
                sendMenuAction(focusedWindow, 'code-adjust-indent')
              }
            }
          ]
        },
        {
          label: 'Math Block',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            sendMenuAction(focusedWindow, 'insert-math-block')
          }
        },
        {
          label: 'Alert',
          submenu: [
            {
              label: 'Information',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-alert-information')
              }
            },
            {
              label: 'Suggestion',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-alert-suggestion')
              }
            },
            {
              label: 'Important',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-alert-important')
              }
            },
            {
              label: 'Warning',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-alert-warning')
              }
            },
            {
              label: 'Notification',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-alert-notification')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Quote Block',
          accelerator: 'CmdOrCtrl+Shift+Q',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'blockquote',
          click: () => {
            sendMenuAction(focusedWindow, 'insert-quote-block')
          }
        },
        { type: 'separator' },
        {
          label: 'Ordered List',
          accelerator: 'CmdOrCtrl+Shift+O',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'orderedList',
          click: () => {
            sendMenuAction(focusedWindow, 'ordered-list')
          }
        },
        {
          label: 'Bullet List',
          accelerator: 'CmdOrCtrl+Shift+U',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'bulletList',
          click: () => {
            sendMenuAction(focusedWindow, 'bullet-list')
          }
        },
        {
          label: 'Task List',
          accelerator: 'CmdOrCtrl+Shift+X',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'taskList',
          click: () => {
            sendMenuAction(focusedWindow, 'task-list')
          }
        },
        {
          label: 'Task Status',
          submenu: [
            {
              label: 'Toggle Task Status',
              click: () => {
                sendMenuAction(focusedWindow, 'toggle-task-status')
              }
            },
            { type: 'separator' },
            {
              label: 'Complete Task',
              type: 'radio',
              click: () => {
                sendMenuAction(focusedWindow, 'complete-task')
              }
            },
            {
              label: 'Uncomplete Task',
              type: 'radio',
              click: () => {
                sendMenuAction(focusedWindow, 'uncomplete-task')
              }
            }
          ]
        },
        {
          label: 'List Indent',
          submenu: [
            {
              label: 'Increase Indent',
              accelerator: 'CmdOrCtrl+]',
              enabled: 
              (
                ['bulletList', 'orderedList', 'taskList'].includes(focusedWindow?.contentInfo?.contentState?.type as string) &&
                focusedWindow?.contentInfo?.contentState?.canSink
              ),
              click: () => {
                sendMenuAction(focusedWindow, 'increase-indent')
              }
            },
            {
              label: 'Decrease Indent',
              accelerator: 'CmdOrCtrl+[',
              enabled: 
              (
                ['bulletList', 'orderedList', 'taskList'].includes(focusedWindow?.contentInfo?.contentState?.type as string) &&
                focusedWindow?.contentInfo?.contentState?.canLift
              ),
              click: () => {
                sendMenuAction(focusedWindow, 'decrease-indent')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Insert Paragraph Above',
          click: () => {
            sendMenuAction(focusedWindow, 'insert-paragraph-above')
          }
        },
        {
          label: 'Insert Paragraph Below',
          click: () => {
            sendMenuAction(focusedWindow, 'insert-paragraph-below')
          }
        },
        { type: 'separator' },
        {
          label: 'Reference Link',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            sendMenuAction(focusedWindow, 'reference-link')
          }
        },
        {
          label: 'Footprint',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            sendMenuAction(focusedWindow, 'footprint')
          }
        },
        { type: 'separator' },
        {
          label: 'Horizontal Rule',
          accelerator: 'CmdOrCtrl+Shift+-',
          click: () => {
            sendMenuAction(focusedWindow, 'horizontal-rule')
          }
        }
      ]
    },
    {
      id: 'format-menu',
      label: 'Format',
      submenu: [
        {
          id: 'format-bold',
          label: 'Bold',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.bold,
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            sendMenuAction(focusedWindow, 'bold')
          }
        },
        {
          id: 'format-italic',
          label: 'Italic',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.italic,
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            sendMenuAction(focusedWindow, 'italic')
          }
        },
        {
          id: 'format-underline',
          label: 'Underline',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.underline,
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            sendMenuAction(focusedWindow, 'underline')
          }
        },
        {
          id: 'format-strikethrough',
          label: 'Strike Through',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.strikethrough,
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => {
            sendMenuAction(focusedWindow, 'strikethrough')
          }
        },
        { type: 'separator' },
        {
          label: 'Text Alignment',
          submenu: [
            {
              label: 'Left Aligned',
              type: 'radio',
              checked: 
              (
                !focusedWindow?.contentInfo?.formatting?.textAlign || 
                focusedWindow?.contentInfo?.formatting?.textAlign === 'left'
              ),
              click: () => {
                sendMenuAction(focusedWindow, 'align-left')
              }
            },
            {
              label: 'Center Aligned',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.formatting?.textAlign === 'center',
              click: () => {
                sendMenuAction(focusedWindow, 'align-center')
              }
            },
            {
              label: 'Right Aligned',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.formatting?.textAlign === 'right',
              click: () => {
                sendMenuAction(focusedWindow, 'align-right')
              }
            },
            {
              label: 'Justified',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.formatting?.textAlign === 'justify',
              click: () => {
                sendMenuAction(focusedWindow, 'align-justify')
              }
            }
          ]
        },
        {
          label: 'Text Style',
          submenu: [
            // Text style options will be populated dynamically
          ]
        },
        { type: 'separator' },
        {
          id: 'format-code',
          label: 'Inline Code',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.inlineCode,
          accelerator: 'CmdOrCtrl+`',
          click: () => {
            sendMenuAction(focusedWindow, 'inline-code')
          }
        },
        {
          label: 'Inline Math',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            sendMenuAction(focusedWindow, 'inline-math')
          }
        },
        {
          label: 'Comment',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            sendMenuAction(focusedWindow, 'comment')
          }
        },
        { type: 'separator' },
        {
          label: 'Superscript',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.script === 'superscript',
          click: () => {
            sendMenuAction(focusedWindow, 'superscript')
          }
        },
        {
          label: 'Subscript',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.script === 'subscript',
          click: () => {
            sendMenuAction(focusedWindow, 'subscript')
          }
        },
        {
          label: 'Highlight',
          accelerator: 'CmdOrCtrl+Shift+H',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.highlight,
          click: () => {
            sendMenuAction(focusedWindow, 'highlight')
          }
        },
        { type: 'separator' },
        {
          label: 'Inline Link',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            sendMenuAction(focusedWindow, 'inline-link')
          }
        },
        {
          label: 'Image / Video / Audio',
          submenu: [
            {
              label: 'Insert Media',
              accelerator: 'CmdOrCtrl+Shift+I',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-media')
              }
            },
            {
              label: 'Insert Local Media...',
              click: () => {
                sendMenuAction(focusedWindow, 'insert-local-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Open Media Location...',
              click: () => {
                sendMenuAction(focusedWindow, 'open-media-location')
              }
            },
            {
              label: 'Resize Media',
              submenu: [
                {
                  label: '1 / 4',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-quarter')
                  }
                },
                {
                  label: '1 / 3',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-third')
                  }
                },
                {
                  label: '1 / 2',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-half')
                  }
                },
                {
                  label: '2 / 3',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-two-thirds')
                  }
                },
                {
                  label: '3 / 4',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-three-quarters')
                  }
                },
                { type: 'separator' },
                {
                  label: '100%',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-100')
                  }
                },
                {
                  label: '150%',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-150')
                  }
                },
                {
                  label: '200%',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-200')
                  }
                },
                { type: 'separator' },
                {
                  label: 'Custom Size...',
                  click: () => {
                    sendMenuAction(focusedWindow, 'resize-media-custom')
                  }
                }
              ]
            },
            {
              label: 'Delete Media',
              click: () => {
                sendMenuAction(focusedWindow, 'delete-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Copy Media To...',
              click: () => {
                sendMenuAction(focusedWindow, 'copy-media-to')
              }
            },
            {
              label: 'Rename / Move Media To...',
              click: () => {
                sendMenuAction(focusedWindow, 'rename-move-media')
              }
            },
            {
              label: 'Upload Media',
              click: () => {
                sendMenuAction(focusedWindow, 'upload-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Copy All Media To...',
              click: () => {
                sendMenuAction(focusedWindow, 'copy-all-media')
              }
            },
            {
              label: 'Rename / Move All Media To...',
              click: () => {
                sendMenuAction(focusedWindow, 'rename-move-all-media')
              }
            },
            {
              label: 'Upload All Media',
              click: () => {
                sendMenuAction(focusedWindow, 'upload-all-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Reload All Media',
              click: () => {
                sendMenuAction(focusedWindow, 'reload-all-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Media Setting...',
              click: () => {
                sendMenuAction(focusedWindow, 'media-setting')
              }
            }
          ]
        },
        {
          label: 'Insert from iPhone or iPad',
          submenu: [
            // Will be populated dynamically based on available devices
          ]
        },
        { type: 'separator' },
        {
          label: 'Clear Formatting',
          accelerator: 'CmdOrCtrl+\\',
          click: () => {
            sendMenuAction(focusedWindow, 'clear-formatting')
          }
        }
      ]
    },
    {
      label: 'AI',
      submenu: [
        {
          label: 'Chat',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-chat')
          }
        },
        {
          label: 'Brain Storming...',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-brain-storming')
          }
        },
        { type: 'separator' },
        {
          label: 'Write Style',
          submenu: [
            {
              label: 'Formal',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-formal')
              }
            },
            {
              label: 'Narrative',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-narrative')
              }
            },
            {
              label: 'Humorous',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-humorous')
              }
            },
            {
              label: 'Marketing',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-marketing')
              }
            },
            {
              label: 'Storytelling',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-storytelling')
              }
            },
            { type: 'separator' },
            {
              label: 'Famous Writers...',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-famous-writers')
              }
            },
            {
              label: 'Charles Dickens',
              type: 'checkbox',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-write-style-charles-dickens')
              }
            }
          ]
        },
        {
          label: 'Adjust Length',
          submenu: [
            {
              label: 'Abbreviate',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-adjust-length-abbreviate')
              }
            },
            {
              label: 'Expand',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-adjust-length-expand')
              }
            },
            {
              label: 'Continue',
              click: () => {
                sendMenuAction(focusedWindow, 'ai-adjust-length-continue')
              }
            }
          ]
        },
        {
          label: 'Extract Outline',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-extract-outline')
          }
        },
        {
          label: 'Summarize',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-summarize')
          }
        },
        {
          label: 'Spell and Grammar check',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-spell-grammar-check')
          }
        },
        {
          label: 'Review',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-review')
          }
        },
        { type: 'separator' },
        {
          label: 'Keep',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-keep')
          }
        },
        {
          label: 'Discard',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-discard')
          }
        },
        {
          label: 'Modify...',
          click: () => {
            sendMenuAction(focusedWindow, 'ai-modify')
          }
        }
      ]
    },
    {
      label: 'View',
      id: 'view',
      submenu: [
        {
          label: 'Source Mode',
          accelerator: 'CmdOrCtrl+/',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-source-mode')
          }
        },
        { type: 'separator' },
        {
          label: 'Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-focus-mode')
          }
        },
        {
          label: 'Typewrite Mode',
          accelerator: 'CmdOrCtrl+Shift+T',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-typewrite-mode')
          }
        },
        { type: 'separator' },
        {
          label: 'Explorer',
          accelerator: 'CmdOrCtrl+Shift+1',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-explorer')
          }
        },
        {
          label: 'Search',
          accelerator: 'CmdOrCtrl+Shift+2',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-search')
          }
        },
        {
          label: 'Tag',
          accelerator: 'CmdOrCtrl+Shift+3',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-tag')
          }
        },
        {
          label: 'Table of Contents',
          accelerator: 'CmdOrCtrl+Shift+4',
          click: () => {
            sendMenuAction(focusedWindow, 'view-toc')
          }
        },
        { type: 'separator' },
        {
          label: 'Chat',
          accelerator: 'CmdOrCtrl+Shift+5',
          click: () => {
            sendMenuAction(focusedWindow, 'view-chat')
          }
        },
        {
          label: 'Clean Mode',
          accelerator: 'CmdOrCtrl+Shift+L',
          enabled: currentFocusedWindowId !== null,
          click: () => {
            sendMenuAction(focusedWindow, 'view-toggle-clean-mode')
          }
        },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'Left Side Bar',
              accelerator: 'CmdOrCtrl+Shift+L',
              type: 'checkbox',
              checked: focusedWindow?.contentInfo?.view?.leftSidebar? true : false,
              click: () => {
                sendMenuAction(focusedWindow, 'view-toggle-left-sidebar')
              }
            },
            {
              label: 'Right Side Bar',
              accelerator: 'CmdOrCtrl+Shift+R',
              type: 'checkbox',
              checked: focusedWindow?.contentInfo?.view?.rightSidebar? true : false,
              click: () => {
                sendMenuAction(focusedWindow, 'view-toggle-right-sidebar')
              }
            },
            {
              label: 'Status Bar',
              accelerator: 'CmdOrCtrl+Shift+S',
              type: 'checkbox',
              checked: focusedWindow?.contentInfo?.view?.statusbar? true : false,
              click: () => {
                sendMenuAction(focusedWindow, 'view-toggle-statusbar')
              }
            },
            { type: 'separator' },
            {
              label: 'Follow System',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'system',
              click: () => {
                sendMenuAction(focusedWindow, 'view-theme-follow-system')
              }
            },
            { type: 'separator' },
            {
              label: 'Light',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'light',
              click: () => {
                sendMenuAction(focusedWindow, 'view-theme-light')
              }
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'dark',
              click: () => {
                sendMenuAction(focusedWindow, 'view-theme-dark')
              }
            },
            { type: 'separator' },
            {
              label: 'Ocean',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'ocean',
              click: () => {
                sendMenuAction(focusedWindow, 'view-theme-ocean')
              }
            },
            {
              label: 'Forest',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'forest',
              click: () => {
                sendMenuAction(focusedWindow, 'view-theme-forest')
              }
            },
            {
              label: 'Sunset',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'sunset',
              click: () => {
                sendMenuAction(focusedWindow, 'view-theme-sunset')
              }
            }
          ]
        },
        {
          label: 'Theme...',
          click: () => {
            sendMenuAction(focusedWindow, 'view-theme-settings')
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            sendMenuAction(focusedWindow, 'view-actual-size')
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          role: 'zoomIn'
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut'
        },
        { type: 'separator' },
        {
          label: 'Full Screen',
          accelerator: 'Ctrl+Cmd+F',
          role: 'togglefullscreen'
        }
      ]
    },
    {
      label: 'Window',
      id: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: "What's New...",
          click: () => {
            sendMenuAction(focusedWindow, 'help-whats-new')
          }
        },
        { type: 'separator' },
        {
          label: 'Quick Start',
          click: () => {
            sendMenuAction(focusedWindow, 'help-quick-start')
          }
        },
        {
          label: 'Online Guide and Course',
          click: async () => {
            await shell.openExternal('https://iwriter.com/guide')
          }
        },
        {
          label: 'Markdown Reference',
          click: () => {
            sendMenuAction(focusedWindow, 'help-markdown-reference')
          }
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            sendMenuAction(focusedWindow, 'help-keyboard-shortcuts')
          }
        },
        { type: 'separator' },
        {
          label: 'Acknowledgement',
          click: () => {
            sendMenuAction(focusedWindow, 'help-acknowledgement')
          }
        },
        {
          label: 'Changelog',
          click: () => {
            sendMenuAction(focusedWindow, 'help-changelog')
          }
        },
        {
          label: 'Visit iWriter.com',
          click: async () => {
            await shell.openExternal('https://iwriter.com')
          }
        },
        {
          label: 'Feedback',
          click: async () => {
            await shell.openExternal('https://iwriter.com/feedback')
          }
        }
      ]
    }
  ]

  // Filter out Paragraph and Format menus based on document state
  const filteredTemplate = baseTemplate.filter(item => {
    if (item.id === 'paragraph-menu' && !focusedWindow?.contentInfo?.hasActiveDocument) {
      return false
    }
    if (item.id === 'format-menu' && !focusedWindow?.contentInfo?.hasActiveDocument) {
      return false
    }
    return true
  })

  // 添加窗口列表
  const windowList = filteredTemplate.find(item => item.id === 'window') as Electron.MenuItemConstructorOptions | undefined;
  
  windows?.forEach((windowState: WindowState) => {
    const isActive = windowState.id === currentFocusedWindowId;

    const menuItem: Electron.MenuItemConstructorOptions = {
      label: windowState.window.getTitle(),
      type: 'radio',
      checked: isActive,
      click: () => {
        if (windowState.window.isMinimized()) windowState.window.restore();
        windowState.window.focus();
      }
    };

    // 处理 submenu 可能是 Menu 实例或数组的情况
    if (windowList?.submenu) {
      if (Array.isArray(windowList.submenu)) {
        // 情况 1: submenu 是数组
        windowList.submenu.push(menuItem);
      } else {
        // 情况 2: submenu 是 Menu 实例
        windowList.submenu.append(new Electron.MenuItem(menuItem));
      }
    }
  });

  const menu = Menu.buildFromTemplate(filteredTemplate)
  Menu.setApplicationMenu(menu)
}

// IPC handlers
ipcMain.handle('open-folder', async () => {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow === undefined) return null
  
  try {
    const result = await dialog.showOpenDialog(focusedWindow.window, {
      properties: ['openDirectory']
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  } catch(error) {
    console.error('Error Open file:', error)
    throw error
  }
})

ipcMain.handle('open-file', async () => {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow === undefined) return null
  
  const result = await dialog.showOpenDialog(focusedWindow.window, {
    properties: ['openFile'],
    filters: [
      { name: 'Text and Markdown Files', extensions: ['txt', 'iwt', 'md', 'markdown'] },
      { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'] },
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['txt', 'iwt', 'md', 'markdown', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'] }
    ]
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('save-file', async (_, content: string, filePath?: string) => {
  if (filePath) {
    try {
      fs.writeFileSync(filePath, content, 'utf8')
      return filePath
    } catch (error) {
      console.error('Error saving file:', error)
      throw(error)
    }
  } else {
    const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
    if (focusedWindow === undefined) return null
    
    const result = await dialog.showSaveDialog(focusedWindow.window, {
      filters: [
        { name: 'iWriter Files', extensions: ['iwt'] },
        { name: 'Markdown Files', extensions: ['md', 'markdown'] },
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['iwt', 'md', 'markdown', 'txt'] }
      ]
    })
    
    if (!result.canceled && result.filePath) {
      try {
        fs.writeFileSync(result.filePath, content, 'utf8')
        return result.filePath
      } catch (error) {
        console.error('Error saving file:', error)
        throw error
      }
    }

    return null
  }
})

ipcMain.handle('read-file', async (_, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content
  } catch (error) {
    console.error('Error reading file:', error)
    return null
  }
})

ipcMain.handle('read-file-binary', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath)
    // Convert Buffer to base64 string for transfer
    return buffer.toString('base64')
  } catch (error) {
    console.error('Error reading binary file:', error)
    return null
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

// Show save dialog
ipcMain.handle('show-save-dialog', async (_, fileName: string) => {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow === undefined) return 'cancel'

  const { response } = await dialog.showMessageBox(focusedWindow.window, {
    type: 'question',
    title: 'Save Changes',
    message: `Do you want to save the changes you made to "${fileName}"?`,
    detail: 'Your changes will be lost if you don\'t save them.',
    buttons: ['Save', 'Don\'t Save', 'Cancel'],
    defaultId: 0,
    cancelId: 2
  })
  
  switch (response) {
    case 0: return 'save'
    case 1: return 'dontSave'
    case 2: return 'cancel'
    default: return 'cancel'
  }
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
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow === undefined) return false

  try {
    const stats = fs.statSync(filePath)
    const { response } = await dialog.showMessageBox(focusedWindow.window, {
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
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow === undefined) return null

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
      const { response } = await dialog.showMessageBox(focusedWindow.window, {
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

ipcMain.on('close', () => {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (!focusedWindow) return
  focusedWindow.window.close()
})

ipcMain.handle('set-auto-save', async (event, autoSave: boolean) => {
  g.autoSave = autoSave;

  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    if (currentFocusedWindowId === window.id) {
      updateMenu();
    }
  }
})

ipcMain.handle('window-content-changed', async (event, contentInfo: WindowContentInfo) => {
  // 通过webContents查找对应的窗口
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    const windowId = window.id;
    console.log(`收到窗口 ${windowId} 的内容更新:`, contentInfo);
    
    // 更新窗口状态...
    const windowIndex = windows.findIndex(w => w.id === windowId);
    if (windowIndex !== -1) {
      windows[windowIndex].contentInfo = {
        ...windows[windowIndex].contentInfo,
        ...contentInfo
      };
      //console.log(`=>窗口 ${windowId} 的内容:`, windows[windowIndex].contentInfo);
      if (currentFocusedWindowId === windowId) {
        updateMenu();
      }
    }
  }
})

// 文件监听相关的 IPC 处理器
ipcMain.handle('start-file-watching', async (event, folderPath: string) => {
  try {
    // 停止已存在的监听器
    if (fileWatchers.has(folderPath)) {
      const existingWatcher = fileWatchers.get(folderPath);
      existingWatcher?.close();
      fileWatchers.delete(folderPath);
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

    fileWatchers.set(folderPath, watcher);
    return { success: true, path: folderPath };
  } catch (error) {
    console.error('Error starting file watcher:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
})

ipcMain.handle('stop-file-watching', async (event, folderPath: string) => {
  try {
    if (fileWatchers.has(folderPath)) {
      const watcher = fileWatchers.get(folderPath);
      await watcher?.close();
      fileWatchers.delete(folderPath);
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
    const promises = Array.from(fileWatchers.values()).map(watcher => watcher.close());
    await Promise.all(promises);
    fileWatchers.clear();
    console.log('All file watchers stopped');
    return { success: true };
  } catch (error) {
    console.error('Error stopping all file watchers:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
})

ipcMain.handle('get-file-watching-status', async () => {
  return {
    watchedPaths: Array.from(fileWatchers.keys()),
    totalWatchers: fileWatchers.size
  };
})

// Window title update IPC handler
ipcMain.handle('update-window-title', async (event, title: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.setTitle(title);
    return { success: true };
  }
  return { success: false, error: 'Window not found' };
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

      console.log(menuItem)
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

// Reveal in folder handler
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
    const result = await shell.openPath(filePath);
    
    // shell.openPath 返回空字符串表示成功，返回错误信息表示失败
    if (result) {
      throw new Error(result);
    }
  } catch (error) {
    console.error('Error opening file with shell:', error);
    throw error;
  }
})

// 获取系统颜色
// 需要做跨平台的适配
function getSystemColors() {  
  let colors = null
  
  try {
    if (process.platform === 'darwin') {
      colors = {
        // 风格色
        accent: {
          primary: systemPreferences.getAccentColor(),
        },
        // 背景色
        background: {
          primary: systemPreferences.getColor('window-background'),
          secondary: systemPreferences.getColor('control-background'),
          tertiary: systemPreferences.getColor('under-page-background'),
          elevated: systemPreferences.getColor('selected-text-background')
        },
        // 文本色
        text: {
          primary: systemPreferences.getColor('label'),
          secondary: systemPreferences.getColor('secondary-label'),
          tertiary: systemPreferences.getColor('tertiary-label'),
          disabled: systemPreferences.getColor('quaternary-label')
        },
        // 边框和分隔线
        border: {
          primary: systemPreferences.getColor('separator'),
          secondary: systemPreferences.getColor('grid'),
          focus: systemPreferences.getColor('keyboard-focus-indicator')
        },
        interactive: {
        // 交互色
          active: systemPreferences.getColor('selected-text'),
          selected: systemPreferences.getColor('selected-content-background')
        },
        other: {
          link: systemPreferences.getColor('link'),
          highlight: systemPreferences.getColor('find-highlight'),
          shadow: systemPreferences.getColor('shadow'),
        }
      }
    } else if (process.platform === 'win32') {
      console.warn('need to fixed')

    } else {
      console.warn('need to fixed')
    }
  } catch (error) {
    console.warn('获取系统颜色失败:', error)
  }

  return colors
}

function setupThemeListeners() {
  if (process.platform === 'darwin') {
    const themeHandler = () => {
      const theme = systemPreferences.getEffectiveAppearance()
      // 系统主题改变时的回调
      const newColors = getSystemColors()
      windows.forEach((w)=>{
        if (w.window) {
          w.window.webContents.send('system-colors-changed', theme, newColors);
        }
      })
    }
    // macOS: 使用 systemPreferences.subscribeNotification
    const themeId = systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', themeHandler)
    const colorId = systemPreferences.subscribeNotification('AppleColorPreferencesChangedNotification', themeHandler)
    
    themeListeners.push({ type: 'notification', handler: themeId })
    themeListeners.push({ type: 'notification', handler: colorId })
    
  } else if (process.platform === 'win32') {
    // Windows: 使用 nativeTheme 事件
    const themeHandler = () => {
      const newColors = getSystemColors()
      const theme = nativeTheme.shouldUseDarkColors
      windows.forEach((w)=>{
        if (w.window) {
          w.window.webContents.send('system-colors-changed', {theme, newColors});
        }
      })
    }
    
    nativeTheme.on('updated', themeHandler)
    themeListeners.push({ type: 'event', handler: themeHandler })
    
  } else if (process.platform === 'linux') {
    // Linux: 可以使用 nativeTheme 或者监听 GTK 主题变化
    const themeHandler = () => {
      const theme = nativeTheme.shouldUseDarkColors
      // Linux 下的系统颜色获取比较有限
      windows.forEach((w)=>{
        if (w.window) {
          w.window.webContents.send('system-colors-changed', theme, null);
        }
      })
    }
    
    nativeTheme.on('updated', themeHandler)
    themeListeners.push({ type: 'event', handler: themeHandler })
  }
}

function removeThemeListeners() {
  themeListeners.forEach(listener => {
    if (listener.type === 'notification') {
      // macOS 通知取消
      systemPreferences.unsubscribeNotification(listener.handler)
    } else if (listener.type === 'event') {
      // Windows/Linux 事件取消
      nativeTheme.removeListener('updated', listener.handler)
    }
  })
  themeListeners.length = 0
}

// 向渲染进程提供系统颜色
ipcMain.handle('get-system-colors', () => {
  return getSystemColors()
})

app.whenReady().then(() => {
  createWindow()
  setupThemeListeners()
})

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin'){
    app.quit()
    removeThemeListeners()
  }
});

app.on('before-quit', async () => {
  // 清理所有文件监听器
  const promises = Array.from(fileWatchers.values()).map(watcher => watcher.close());
  await Promise.all(promises)
  fileWatchers.clear()
  removeThemeListeners()
});