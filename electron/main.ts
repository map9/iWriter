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
function sendMenuAction(action: string) {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow?.window) {
    focusedWindow.window.webContents.send('menu-action', action);
    return
  }

  console.warn(`No focused window found for action: ${action}`);
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

    console.log(getSystemColors())

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

/**
 * 在菜单模板中指定ID的菜单项下方插入新项
 * @param template 菜单模板数组
 * @param parentId 父菜单ID（可选）
 * @param targetId 目标菜单项ID
 * @param newItem 要插入的新菜单项
 * @returns 是否插入成功
 */
function insertInTemplate(
  template: Electron.MenuItemConstructorOptions[],
  parentId: string | undefined,
  targetId: string,
  newItems: Electron.MenuItemConstructorOptions | Electron.MenuItemConstructorOptions[]
): boolean {
  const itemsToInsert = Array.isArray(newItems) ? newItems : [newItems];

  function findAndInsert(items: Electron.MenuItemConstructorOptions[]): boolean {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.id === parentId) {
        if (item.submenu) {
          const submenu = Array.isArray(item.submenu) ? item.submenu : [];
          
          for (let j = 0; j < submenu.length; j++) {
            if (submenu[j].id === targetId) {
              submenu.splice(j + 1, 0, ...itemsToInsert);
              return true;
            }
          }
        }
      }
      
      // 如果当前项有子菜单，递归处理
      if (item.submenu && Array.isArray(item.submenu)) {
        if (findAndInsert(item.submenu)) {
          return true;
        }
      }
    }
    return false;
  }
  
  return findAndInsert(template);
}

/**
 * 在指定菜单项下方插入新菜单项
 * @param menu 目标菜单对象
 * @param parentId 父菜单ID（可选）
 * @param targetId 要在其下方插入的目标菜单项ID
 * @param newItem 要插入的新菜单项
 * @returns 是否插入成功
 */
function insertMenuItemUnder(
  menu: Electron.Menu,
  parentId: string | undefined,
  targetId: string,
  newItems: Electron.MenuItemConstructorOptions[]
): boolean {
  function findAndInsert(items: Electron.MenuItem[]): boolean {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.id === parentId) {
        if (item.submenu) {
          const submenuItems = item.submenu.items;
          for (let j = 0; j < submenuItems.length; j++) {
            if (submenuItems[j].id === targetId) {
              newItems.forEach(newItem => {
                const menuItem = new Electron.MenuItem(newItem);
                submenuItems.splice(j + 1, 0, menuItem);
              });
              return true;
            }
          }
        }
      }
      
      if (item.submenu) {
        if (findAndInsert(item.submenu.items)) {
          return true;
        }
      }
    }
    return false;
  }
  
  return findAndInsert(menu.items);
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
            sendMenuAction('about')
          }
        },
        { type: 'separator' },
        {
          label: 'License...',
          click: () => {
            sendMenuAction('license')
          }
        },
        { type: 'separator' },
        {
          label: 'Check for update...',
          click: () => {
            sendMenuAction('check-update')
          }
        },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            sendMenuAction('preferences')
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
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('new-file')
          }
        },
        {
          label: 'New from Template...',
          accelerator: 'CmdOrCtrl+Shift+N',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('new-from-template')
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
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('open-file')
          }
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('open-folder')
          }
        },
        {
          label: 'Open Recent',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          submenu: [
            // Will be populated dynamically
          ]
        },
        { type: 'separator' },
        {
          id: 'save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction('save')
          }
        },
        {
          id: 'save-as',
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction('save-as')
          }
        },
        {
          id: 'auto-save',
          label: 'Auto Save',
          type: 'checkbox',
          checked: g.autoSave,
          enabled: focusedWindow != null,
          click: () => {
            g.autoSave = !g.autoSave
            sendMenuAction('toggle-auto-save')
            updateMenu()
          }
        },
        {
          id: 'save-all',
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Alt+S',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction('save-all')
          }
        },
        { type: 'separator' },
        {
          label: 'Import',
          enabled: focusedWindow != null,
          submenu: [
            {
              label: 'Evernote',
              click: () => {
                sendMenuAction('import-evernote')
              }
            },
            {
              label: 'Drafts',
              click: () => {
                sendMenuAction('import-drafts')
              }
            },
            {
              label: 'Obsidian',
              click: () => {
                sendMenuAction('import-obsidian')
              }
            },
            {
              label: 'Day One',
              click: () => {
                sendMenuAction('import-day-one')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction('import-more-options')
              }
            }
          ]
        },
        {
          id: 'export',
          label: 'Export',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          submenu: [
            {
              label: 'PDF',
              click: () => {
                sendMenuAction('export-pdf')
              }
            },
            {
              label: 'Html',
              click: () => {
                sendMenuAction('export-html')
              }
            },
            {
              label: 'Word(.docx)',
              click: () => {
                sendMenuAction('export-word')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction('export-more-options')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Page Setting...',
          accelerator: 'CmdOrCtrl+Shift+P',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction('page-setting')
          }
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction('print')
          }
        },
        { type: 'separator' },
        {
          id: 'close-file',
          label: 'Close File',
          accelerator: 'CmdOrCtrl+W',
          enabled: focusedWindow?.contentInfo?.hasActiveDocument,
          click: () => {
            sendMenuAction('close-file')
          }
        },
        {
          id: 'close-folder',
          label: 'Close Folder',
          enabled: focusedWindow?.contentInfo?.hasFolderOpen,
          click: () => {
            sendMenuAction('close-folder')
          }
        },
        {
          id: 'close-window',
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          enabled: focusedWindow != null,
          click: () => {
            const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
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
          enabled: focusedWindow?.contentInfo?.undoRedo?.undo,
          click: () => {
            sendMenuAction('undo')
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          enabled: focusedWindow?.contentInfo?.undoRedo?.redo,
          click: () => {
            sendMenuAction('redo')
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
                sendMenuAction('copy-as-plain-text')
              }
            },
            {
              label: 'Markdown',
              click: () => {
                sendMenuAction('copy-as-markdown')
              }
            },
            {
              label: 'Html',
              click: () => {
                sendMenuAction('copy-as-html')
              }
            },
            {
              label: 'Picture',
              click: () => {
                sendMenuAction('copy-as-picture')
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
            sendMenuAction('paste-as-text')
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
                sendMenuAction('line-ending-crlf')
              }
            },
            {
              label: 'Unix LF',
              type: 'radio',
              click: () => {
                sendMenuAction('line-ending-lf')
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
                sendMenuAction('first-line-indent')
              }
            },
            {
              label: 'Show <br/>',
              click: () => {
                sendMenuAction('show-br')
              }
            },
            {
              label: 'Keep Line breaks',
              click: () => {
                sendMenuAction('keep-line-breaks')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction('space-line-break-options')
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
                sendMenuAction('convert-on-input')
              }
            },
            {
              label: 'Convert on Render',
              type: 'checkbox',
              click: () => {
                sendMenuAction('convert-on-render')
              }
            },
            {
              label: 'Smart Quotes',
              type: 'checkbox',
              click: () => {
                sendMenuAction('smart-quotes')
              }
            },
            {
              label: 'Smart Dashes',
              type: 'checkbox',
              click: () => {
                sendMenuAction('smart-dashes')
              }
            },
            {
              label: 'Text Replace',
              click: () => {
                sendMenuAction('text-replace')
              }
            },
            {
              label: 'Auto Convert Unicode Punctuation',
              type: 'checkbox',
              click: () => {
                sendMenuAction('auto-convert-unicode')
              }
            },
            { type: 'separator' },
            {
              label: 'More Options...',
              click: () => {
                sendMenuAction('auto-replace-options')
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
                sendMenuAction('check-document')
              }
            },
            {
              label: 'Show Spelling and Grammar...',
              accelerator: 'CmdOrCtrl+Shift+;',
              click: () => {
                sendMenuAction('show-spelling-grammar')
              }
            },
            { type: 'separator' },
            {
              label: 'Check Spelling On Input',
              type: 'checkbox',
              click: () => {
                sendMenuAction('check-spelling-on-input')
              }
            },
            {
              label: 'Check Spell and Grammar',
              type: 'checkbox',
              click: () => {
                sendMenuAction('check-spell-grammar')
              }
            },
            {
              label: 'Auto Correct Spell',
              type: 'checkbox',
              click: () => {
                sendMenuAction('auto-correct-spell')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            sendMenuAction('find')
          }
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+Alt+F',
          click: () => {
            sendMenuAction('replace')
          }
        },
        { type: 'separator' },
        {
          label: 'Find in Files',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            sendMenuAction('find-in-files')
          }
        },
        {
          label: 'Replace in Files',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => {
            sendMenuAction('replace-in-files')
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
            sendMenuAction('heading-1')
          }
        },
        {
          label: 'Heading 2',
          accelerator: 'CmdOrCtrl+2',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 2,
          click: () => {
            sendMenuAction('heading-2')
          }
        },
        {
          label: 'Heading 3',
          accelerator: 'CmdOrCtrl+3',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 3,
          click: () => {
            sendMenuAction('heading-3')
          }
        },
        {
          label: 'Heading 4',
          accelerator: 'CmdOrCtrl+4',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 4,
          click: () => {
            sendMenuAction('heading-4')
          }
        },
        {
          label: 'Heading 5',
          accelerator: 'CmdOrCtrl+5',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 5,
          click: () => {
            sendMenuAction('heading-5')
          }
        },
        {
          label: 'Heading 6',
          accelerator: 'CmdOrCtrl+6',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 6,
          click: () => {
            sendMenuAction('heading-6')
          }
        },
        { type: 'separator' },
        {
          label: 'Paragraph',
          accelerator: 'CmdOrCtrl+0',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'paragraph',
          click: () => {
            sendMenuAction('paragraph')
          }
        },
        { type: 'separator' },
        {
          label: 'Promote Heading',
          accelerator: 'CmdOrCtrl+=',
          enabled:
            focusedWindow?.contentInfo?.contentState?.type !== 1 &&
            ((typeof focusedWindow?.contentInfo?.contentState?.type === 'number' &&
              focusedWindow?.contentInfo?.contentState?.type >= 2 &&
              focusedWindow?.contentInfo?.contentState?.type <= 6) ||
              focusedWindow?.contentInfo?.contentState?.type === 'paragraph'),
          click: () => {
            sendMenuAction('promote-heading')
          }
        },
        {
          label: 'Demote Heading',
          accelerator: 'CmdOrCtrl+-',
          enabled: 
            focusedWindow?.contentInfo?.contentState?.type !== 'paragraph' &&
            (typeof focusedWindow?.contentInfo?.contentState?.type === 'number' &&
            focusedWindow?.contentInfo?.contentState?.type >= 1 &&
            focusedWindow?.contentInfo?.contentState?.type <= 6),
          click: () => {
            sendMenuAction('demote-heading')
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
                sendMenuAction('insert-table')
              }
            },
            { type: 'separator' },
            {
              label: 'Insert Line Above',
              click: () => {
                sendMenuAction('table-insert-line-above')
              }
            },
            {
              label: 'Insert Line Below',
              accelerator: 'CmdOrCtrl+Enter',
              click: () => {
                sendMenuAction('table-insert-line-below')
              }
            },
            { type: 'separator' },
            {
              label: 'Insert Row Left',
              click: () => {
                sendMenuAction('table-insert-row-left')
              }
            },
            {
              label: 'Insert Row Right',
              click: () => {
                sendMenuAction('table-insert-row-right')
              }
            },
            { type: 'separator' },
            {
              label: 'Move Line Up',
              accelerator: 'CmdOrCtrl+Shift+Up',
              click: () => {
                sendMenuAction('table-move-line-up')
              }
            },
            {
              label: 'Move Line Up',
              accelerator: 'CmdOrCtrl+Shift+Down',
              click: () => {
                sendMenuAction('table-move-line-down')
              }
            },
            {
              label: 'Move Line Left',
              accelerator: 'CmdOrCtrl+Shift+Left',
              click: () => {
                sendMenuAction('table-move-line-left')
              }
            },
            {
              label: 'Move Line Right',
              accelerator: 'CmdOrCtrl+Shift+Right',
              click: () => {
                sendMenuAction('table-move-line-right')
              }
            },
            { type: 'separator' },
            {
              label: 'Delete Line',
              accelerator: 'CmdOrCtrl+Shift+Backspace',
              click: () => {
                sendMenuAction('table-delete-line')
              }
            },
            {
              label: 'Delete Row',
              click: () => {
                sendMenuAction('table-delete-row')
              }
            },
            { type: 'separator' },
            {
              label: 'Duplicate Table',
              click: () => {
                sendMenuAction('table-duplicate')
              }
            },
            {
              label: 'Format Table Source',
              click: () => {
                sendMenuAction('table-format-source')
              }
            },
            { type: 'separator' },
            {
              label: 'Delete Table',
              click: () => {
                sendMenuAction('table-delete')
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
            sendMenuAction('insert-code-block')
          }
        },
        {
          label: 'Code Tools',
          submenu: [
            {
              label: 'Format Selection',
              click: () => {
                sendMenuAction('code-format-selection')
              }
            },
            {
              label: 'Format CodeBlock',
              click: () => {
                sendMenuAction('code-format-codeblock')
              }
            }
          ]
        },
        {
          label: 'Math Block',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            sendMenuAction('insert-math-block')
          }
        },
        {
          label: 'Alert',
          submenu: [
            {
              label: 'Information',
              click: () => {
                sendMenuAction('insert-alert-information')
              }
            },
            {
              label: 'Suggestion',
              click: () => {
                sendMenuAction('insert-alert-suggestion')
              }
            },
            {
              label: 'Important',
              click: () => {
                sendMenuAction('insert-alert-important')
              }
            },
            {
              label: 'Warning',
              click: () => {
                sendMenuAction('insert-alert-warning')
              }
            },
            {
              label: 'Notification',
              click: () => {
                sendMenuAction('insert-alert-notification')
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
            sendMenuAction('insert-quote-block')
          }
        },
        {
          label: 'Caption',
          click: () => {
            sendMenuAction('toggle-caption')
          }
        },
        { type: 'separator' },
        {
          label: 'Ordered List',
          accelerator: 'CmdOrCtrl+Shift+O',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'orderedList',
          click: () => {
            sendMenuAction('ordered-list')
          }
        },
        {
          label: 'Bullet List',
          accelerator: 'CmdOrCtrl+Shift+U',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'bulletList',
          click: () => {
            sendMenuAction('bullet-list')
          }
        },
        {
          label: 'Task List',
          accelerator: 'CmdOrCtrl+Shift+X',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.contentState?.type === 'taskList',
          click: () => {
            sendMenuAction('task-list')
          }
        },
        {
          label: 'Task Status',
          submenu: [
            {
              label: 'Toggle Task Status',
              click: () => {
                sendMenuAction('toggle-task-status')
              }
            },
            { type: 'separator' },
            {
              label: 'Complete Task',
              type: 'radio',
              click: () => {
                sendMenuAction('complete-task')
              }
            },
            {
              label: 'Uncomplete Task',
              type: 'radio',
              click: () => {
                sendMenuAction('uncomplete-task')
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
                sendMenuAction('increase-indent')
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
                sendMenuAction('decrease-indent')
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Insert Paragraph Above',
          click: () => {
            sendMenuAction('insert-paragraph-above')
          }
        },
        {
          label: 'Insert Paragraph Below',
          click: () => {
            sendMenuAction('insert-paragraph-below')
          }
        },
        { type: 'separator' },
        {
          label: 'Reference Link',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            sendMenuAction('reference-link')
          }
        },
        {
          label: 'Footprint',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            sendMenuAction('footprint')
          }
        },
        { type: 'separator' },
        {
          label: 'Horizontal Rule',
          accelerator: 'CmdOrCtrl+Shift+-',
          click: () => {
            sendMenuAction('horizontal-rule')
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
            sendMenuAction('bold')
          }
        },
        {
          id: 'format-italic',
          label: 'Italic',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.italic,
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            sendMenuAction('italic')
          }
        },
        {
          id: 'format-underline',
          label: 'Underline',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.underline,
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            sendMenuAction('underline')
          }
        },
        {
          id: 'format-strikethrough',
          label: 'Strike Through',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.strikethrough,
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => {
            sendMenuAction('strikethrough')
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
                sendMenuAction('align-left')
              }
            },
            {
              label: 'Center Aligned',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.formatting?.textAlign === 'center',
              click: () => {
                sendMenuAction('align-center')
              }
            },
            {
              label: 'Right Aligned',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.formatting?.textAlign === 'right',
              click: () => {
                sendMenuAction('align-right')
              }
            },
            {
              label: 'Justified',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.formatting?.textAlign === 'justify',
              click: () => {
                sendMenuAction('align-justify')
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
            sendMenuAction('inline-code')
          }
        },
        {
          label: 'Inline Math',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            sendMenuAction('inline-math')
          }
        },
        {
          label: 'Comment',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            sendMenuAction('comment')
          }
        },
        { type: 'separator' },
        {
          label: 'Superscript',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.script === 'superscript',
          click: () => {
            sendMenuAction('superscript')
          }
        },
        {
          label: 'Subscript',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.script === 'subscript',
          click: () => {
            sendMenuAction('subscript')
          }
        },
        {
          label: 'Highlight',
          accelerator: 'CmdOrCtrl+Shift+H',
          type: 'checkbox',
          checked: focusedWindow?.contentInfo?.formatting?.highlight,
          click: () => {
            sendMenuAction('highlight')
          }
        },
        { type: 'separator' },
        {
          label: 'Inline Link',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            sendMenuAction('inline-link')
          }
        },
        {
          label: 'Image / Video / Audio',
          submenu: [
            {
              label: 'Insert Media',
              accelerator: 'CmdOrCtrl+Shift+I',
              click: () => {
                sendMenuAction('insert-media')
              }
            },
            {
              label: 'Insert Local Media...',
              click: () => {
                sendMenuAction('insert-local-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Open Media Location...',
              click: () => {
                sendMenuAction('open-media-location')
              }
            },
            {
              label: 'Resize Media',
              submenu: [
                {
                  label: '1 / 4',
                  click: () => {
                    sendMenuAction('resize-media-quarter')
                  }
                },
                {
                  label: '1 / 3',
                  click: () => {
                    sendMenuAction('resize-media-third')
                  }
                },
                {
                  label: '1 / 2',
                  click: () => {
                    sendMenuAction('resize-media-half')
                  }
                },
                {
                  label: '2 / 3',
                  click: () => {
                    sendMenuAction('resize-media-two-thirds')
                  }
                },
                {
                  label: '3 / 4',
                  click: () => {
                    sendMenuAction('resize-media-three-quarters')
                  }
                },
                { type: 'separator' },
                {
                  label: '100%',
                  click: () => {
                    sendMenuAction('resize-media-100')
                  }
                },
                {
                  label: '150%',
                  click: () => {
                    sendMenuAction('resize-media-150')
                  }
                },
                {
                  label: '200%',
                  click: () => {
                    sendMenuAction('resize-media-200')
                  }
                },
                { type: 'separator' },
                {
                  label: 'Custom Size...',
                  click: () => {
                    sendMenuAction('resize-media-custom')
                  }
                }
              ]
            },
            {
              label: 'Delete Media',
              click: () => {
                sendMenuAction('delete-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Copy Media To...',
              click: () => {
                sendMenuAction('copy-media-to')
              }
            },
            {
              label: 'Rename / Move Media To...',
              click: () => {
                sendMenuAction('rename-move-media')
              }
            },
            {
              label: 'Upload Media',
              click: () => {
                sendMenuAction('upload-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Copy All Media To...',
              click: () => {
                sendMenuAction('copy-all-media')
              }
            },
            {
              label: 'Rename / Move All Media To...',
              click: () => {
                sendMenuAction('rename-move-all-media')
              }
            },
            {
              label: 'Upload All Media',
              click: () => {
                sendMenuAction('upload-all-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Reload All Media',
              click: () => {
                sendMenuAction('reload-all-media')
              }
            },
            { type: 'separator' },
            {
              label: 'Media Setting...',
              click: () => {
                sendMenuAction('media-setting')
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
            sendMenuAction('clear-formatting')
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
            sendMenuAction('ai-chat')
          }
        },
        {
          label: 'Brain Storming...',
          click: () => {
            sendMenuAction('ai-brain-storming')
          }
        },
        { type: 'separator' },
        {
          label: 'Write Style',
          submenu: [
            {
              label: 'Formal',
              click: () => {
                sendMenuAction('ai-write-style-formal')
              }
            },
            {
              label: 'Narrative',
              click: () => {
                sendMenuAction('ai-write-style-narrative')
              }
            },
            {
              label: 'Humorous',
              click: () => {
                sendMenuAction('ai-write-style-humorous')
              }
            },
            {
              label: 'Marketing',
              click: () => {
                sendMenuAction('ai-write-style-marketing')
              }
            },
            {
              label: 'Storytelling',
              click: () => {
                sendMenuAction('ai-write-style-storytelling')
              }
            },
            { type: 'separator' },
            {
              label: 'Famous Writers...',
              click: () => {
                sendMenuAction('ai-write-style-famous-writers')
              }
            },
            {
              label: 'Charles Dickens',
              type: 'checkbox',
              click: () => {
                sendMenuAction('ai-write-style-charles-dickens')
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
                sendMenuAction('ai-adjust-length-abbreviate')
              }
            },
            {
              label: 'Expand',
              click: () => {
                sendMenuAction('ai-adjust-length-expand')
              }
            },
            {
              label: 'Continue',
              click: () => {
                sendMenuAction('ai-adjust-length-continue')
              }
            }
          ]
        },
        {
          label: 'Extract Outline',
          click: () => {
            sendMenuAction('ai-extract-outline')
          }
        },
        {
          label: 'Summarize',
          click: () => {
            sendMenuAction('ai-summarize')
          }
        },
        {
          label: 'Spell and Grammar check',
          click: () => {
            sendMenuAction('ai-spell-grammar-check')
          }
        },
        {
          label: 'Review',
          click: () => {
            sendMenuAction('ai-review')
          }
        },
        { type: 'separator' },
        {
          label: 'Keep',
          click: () => {
            sendMenuAction('ai-keep')
          }
        },
        {
          label: 'Discard',
          click: () => {
            sendMenuAction('ai-discard')
          }
        },
        {
          label: 'Modify...',
          click: () => {
            sendMenuAction('ai-modify')
          }
        }
      ]
    },
    {
      label: 'View',
      id: 'view',
      submenu: [
        {
          label: 'Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-focus-mode')
          }
        },
        {
          label: 'Typewrite Mode',
          accelerator: 'CmdOrCtrl+Shift+T',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-typewrite-mode')
          }
        },
        { type: 'separator' },
        {
          label: 'Explorer',
          accelerator: 'CmdOrCtrl+Shift+1',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-explorer')
          }
        },
        {
          label: 'Search',
          accelerator: 'CmdOrCtrl+Shift+2',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-search')
          }
        },
        {
          label: 'Tag',
          accelerator: 'CmdOrCtrl+Shift+3',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-tag')
          }
        },
        {
          label: 'Table of Contents',
          accelerator: 'CmdOrCtrl+Shift+4',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-toc')
          }
        },
        { type: 'separator' },
        {
          label: 'Chat',
          accelerator: 'CmdOrCtrl+Shift+5',
          click: () => {
            sendMenuAction('view-chat')
          }
        },
        {
          label: 'Clean Mode',
          accelerator: 'CmdOrCtrl+Shift+L',
          enabled: focusedWindow != null,
          click: () => {
            sendMenuAction('view-toggle-clean-mode')
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
                sendMenuAction('view-toggle-left-sidebar')
              }
            },
            {
              label: 'Right Side Bar',
              accelerator: 'CmdOrCtrl+Shift+R',
              type: 'checkbox',
              checked: focusedWindow?.contentInfo?.view?.rightSidebar? true : false,
              click: () => {
                sendMenuAction('view-toggle-right-sidebar')
              }
            },
            {
              label: 'Status Bar',
              accelerator: 'CmdOrCtrl+Shift+S',
              type: 'checkbox',
              checked: focusedWindow?.contentInfo?.view?.statusbar? true : false,
              click: () => {
                sendMenuAction('view-toggle-statusbar')
              }
            },
            { type: 'separator' },
            {
              label: 'Follow System',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'system',
              click: () => {
                sendMenuAction('view-theme-follow-system')
              }
            },
            { type: 'separator' },
            {
              label: 'Light',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'light',
              click: () => {
                sendMenuAction('view-theme-light')
              }
            },
            {
              id: 'dark',
              label: 'Dark',
              type: 'radio',
              checked: focusedWindow?.contentInfo?.view?.theme === 'dark',
              click: () => {
                sendMenuAction('view-theme-dark')
              }
            }
          ]
        },
        {
          label: 'More Theme...',
          click: () => {
            sendMenuAction('view-theme-settings')
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            sendMenuAction('view-actual-size')
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
      id: 'window',
      label: 'Window',
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
            sendMenuAction('help-whats-new')
          }
        },
        { type: 'separator' },
        {
          label: 'Quick Start',
          click: () => {
            sendMenuAction('help-quick-start')
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
            sendMenuAction('help-markdown-reference')
          }
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            sendMenuAction('help-keyboard-shortcuts')
          }
        },
        { type: 'separator' },
        {
          label: 'Acknowledgement',
          click: () => {
            sendMenuAction('help-acknowledgement')
          }
        },
        {
          label: 'Changelog',
          click: () => {
            sendMenuAction('help-changelog')
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

  // Insert Theme items dynamically
  if (focusedWindow?.contentInfo?.view?.theme && !['system', 'light', 'dark'].includes(focusedWindow?.contentInfo?.view?.theme)) {
    let theme = focusedWindow?.contentInfo?.view?.theme
    const insertThemeItems: Electron.MenuItemConstructorOptions[] = [
      { type: 'separator' },
      {
        label: theme.charAt(0).toUpperCase() + theme.slice(1),
        type: 'radio',
        checked: true,
        click: () => {
          sendMenuAction(`view-theme-${theme}`)
        }
      }
    ]

    const result = insertInTemplate(baseTemplate, undefined, 'dark', insertThemeItems);
    if (result === false) {
      console.warn(`Failed to insert theme: ${theme} items into the template`);
    }
  }

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

// Show open dialog
ipcMain.handle('show-open-dialog', async (_, options: any) => {
  const focusedWindow = windows.find(w => w.id === currentFocusedWindowId);
  if (focusedWindow === undefined) return null
  
  try {
    const result = await dialog.showOpenDialog(focusedWindow.window, options)
    
    return result
  } catch(error) {
    console.error('Error Open file:', error)
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

function setupThemeListeners() {
  if (process.platform === 'darwin') {
    const themeHandler = () => {
      const theme = systemPreferences.getEffectiveAppearance()
      // 系统主题改变时的回调
      const newColors = getSystemColors()
      windows.forEach((w)=>{
        if (w.window) {
          w.window.webContents.send('system-colors-changed', {theme, newColors});
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
          w.window.webContents.send('system-colors-changed', {theme, newColors: null} );
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
  let theme = 'unknown'
  if (process.platform === 'darwin') {
    theme = systemPreferences.getEffectiveAppearance()
  }
  else if (process.platform === 'win32' || process.platform === 'linux') {
    theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  return {theme, newColors: getSystemColors()}
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