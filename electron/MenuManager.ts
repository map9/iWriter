import { BrowserWindow, Menu, shell } from 'electron'
import type {
  ParagraphStateListData,
  ParagraphStateTaskListData,
  ParagraphStateTableData
} from '../src/types/windowContentState'
import { DocumentType } from '../src/types'
import { getCustomThemes } from '../src/utils/themes'
import { isMac } from './utils'
import type { WindowState, GlobalParameters } from './types'
import { createMainTranslator, localizeMenuTemplate } from './i18n'

const REPOSITORY_URL = 'https://github.com/map9/iWriter'
const DOCS_SITE_URL = 'https://map9.github.io/iWriter'

function docsUrl(path = ''): string {
  return `${DOCS_SITE_URL}${path}`
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

export class MenuManager {
  private sendMenuAction: (action: string) => void

  constructor() {
    // 提升性能，先去除默认菜单
    Menu.setApplicationMenu(null)
    this.sendMenuAction = () => {}
  }

  setSendMenuAction(callback: (action: string) => void) {
    this.sendMenuAction = callback;
  }

  setupMenu(wState: WindowState, g: GlobalParameters): void {
    const t = createMainTranslator(wState?.wContentState?.view?.locale)

    // Build base menu template
    const baseTemplate: Electron.MenuItemConstructorOptions[] = [
      // { role: 'appMenu' }
      {
        id: 'appMenu',
        label: 'iWriter',
        submenu: [
          { role: 'about' },
          /*
          { type: 'separator' },
          {
            label: 'License...',
            click: () => {
              this.sendMenuAction('license')
            }
          },
          */
          { type: 'separator' },
          {
            label: t('menu.app.checkForUpdate', 'Check for update...'),
            click: () => {
              this.sendMenuAction('check-update')
            }
          },
          {
            label: t('menu.app.preferences', 'Preferences...'),
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.sendMenuAction('preferences')
            }
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ]
      },
      {
        id: 'fileMenu',
        label: t('menu.file.title', 'File'),
        submenu: [
          {
            label: t('menu.file.newDocument', 'New Document'),
            accelerator: 'CmdOrCtrl+N',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('new-file')
            }
          },
          /*
          {
            label: 'New from Template...',
            accelerator: 'CmdOrCtrl+Shift+N',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('new-from-template')
            }
          },
          */
          {
            id: 'new-window',
            label: t('menu.file.newWindow', 'New Window'),
            click: () => {
              this.sendMenuAction('new-window')              
            }
          },
          { type: 'separator' },
          {
            label: t('menu.file.openFile', 'Open File...'),
            accelerator: 'CmdOrCtrl+O',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('open-file')
            }
          },
          {
            label: t('menu.file.openFolder', 'Open Folder...'),
            accelerator: 'CmdOrCtrl+Shift+O',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('open-folder')
            }
          },
          {
            role: 'recentDocuments',
            submenu:[
              { type: 'separator' },
              {
                role: 'clearRecentDocuments'
              }
            ]
          },
          { type: 'separator' },
          {
            id: 'save',
            label: t('menu.file.save', 'Save'),
            accelerator: 'CmdOrCtrl+S',
            enabled: wState?.wContentState?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('save')
            }
          },
          {
            id: 'save-as',
            label: t('menu.file.saveAs', 'Save As...'),
            accelerator: 'CmdOrCtrl+Shift+S',
            enabled: wState?.wContentState?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('save-as')
            }
          },
          {
            id: 'auto-save',
            label: t('menu.file.autoSave', 'Auto Save'),
            type: 'checkbox',
            checked: (wState?.wContentState?.hasActiveDocument === true)? wState?.wContentState?.edit?.autoSave : wState?.wContentState?.autoSave,
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('toggle-auto-save')
            }
          },
          {
            id: 'save-all',
            label: t('menu.file.saveAll', 'Save All'),
            accelerator: 'CmdOrCtrl+Alt+S',
            enabled: wState?.wContentState?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('save-all')
            }
          },
          { type: 'separator' },
          {
            id: 'toggle-readonly',
            label: t('menu.file.readOnly', 'Read Only'),
            accelerator: 'CmdOrCtrl+Shift+L',
            type: 'checkbox',
            checked: wState?.wContentState?.edit?.readonly ? true : false,
            enabled:
              wState?.wContentState?.hasActiveDocument === true &&
              wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR &&
              wState?.wContentState?.edit?.fileReadonly !== true,
            click: () => {
              this.sendMenuAction('view-toggle-readonly')
            }
          },
          { type: 'separator' },
          {
            label: t('menu.file.importDocument', 'Import Document...'),
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('import-document')
            }
          },
          {
            id: 'export',
            label: t('menu.file.export', 'Export'),
            enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
            submenu: [
              {
                label: t('menu.file.exportPdf', 'PDF...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-pdf')
                }
              },
              { type: 'separator' },
              {
                label: t('menu.file.exportHtml', 'HTML...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-html')
                }
              },
              {
                label: t('menu.file.exportWord', 'Word (.docx)...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-word')
                }
              },
              {
                label: t('menu.file.exportOdt', 'OpenOffice (.odt)...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-odt')
                }
              },
              {
                label: t('menu.file.exportRtf', 'RTF...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-rtf')
                }
              },
              {
                label: t('menu.file.exportEpub', 'EPUB...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-epub')
                }
              },
              {
                label: t('menu.file.exportLatex', 'LaTeX...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-latex')
                }
              },
              {
                label: t('menu.file.exportMediawiki', 'MediaWiki...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-mediawiki')
                }
              },
              {
                label: t('menu.file.exportRst', 'reStructuredText...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-rst')
                }
              },
              {
                label: t('menu.file.exportTextile', 'Textile...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-textile')
                }
              },
              {
                label: t('menu.file.exportOpml', 'OPML...'),
                enabled: wState?.wContentState?.type === DocumentType.MARKDOWN_EDITOR,
                click: () => {
                  this.sendMenuAction('export-opml')
                }
              }
            ]
          },
          { type: 'separator' },
          {
            label: t('menu.file.print', 'Print...'),
            accelerator: 'CmdOrCtrl+P',
            enabled: wState?.wContentState?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('print')
            }
          },
          { type: 'separator' },
          {
            id: 'close-file',
            label: t('menu.file.closeFile', 'Close File'),
            accelerator: 'CmdOrCtrl+W',
            enabled: wState?.wContentState?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('close-file')
            }
          },
          {
            id: 'close-folder',
            label: t('menu.file.closeFolder', 'Close Folder'),
            enabled: wState?.wContentState?.hasFolderOpen,
            click: () => {
              this.sendMenuAction('close-folder')
            }
          },
          isMac ? { role: 'close' } : { role: 'quit' }
        ]
      },
      {
        id: 'editMenu-default',
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { type: 'separator' },
          { role: 'selectAll' },
        ]
      },
      {
        id: 'editMenu',
        label: 'Edit',
        submenu: [
          {
            label: 'Undo',
            accelerator: 'CmdOrCtrl+Z',
            enabled: wState?.wContentState?.undoRedo?.undo,
            click: () => {
              this.sendMenuAction('undo')
            }
          },
          {
            label: 'Redo',
            accelerator: 'CmdOrCtrl+Shift+Z',
            enabled: wState?.wContentState?.undoRedo?.redo,
            click: () => {
              this.sendMenuAction('redo')
            }
          },
          { type: 'separator' },
          {
            role: 'cut',
          },
          {
            role: 'copy',
          },
          {
            role: 'paste',
          },
          { type: 'separator' },
          {
            label: 'Copy as',
            enabled: wState?.wContentState?.hasSelection,
            submenu: [
              {
                label: 'Plain Text',
                click: () => {
                  this.sendMenuAction('copy-as-plain-text')
                }
              },
              {
                label: 'Markdown',
                click: () => {
                  this.sendMenuAction('copy-as-markdown')
                }
              },
              {
                label: 'Html',
                click: () => {
                  this.sendMenuAction('copy-as-html')
                }
              }
            ]
          },
          {
            label: 'Paste as Text',
            accelerator: 'CmdOrCtrl+Shift+V',
            enabled: wState?.wContentState?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('paste-as-text')
            }
          },
          { type: 'separator' },
          {
            role: 'delete',
            accelerator: isMac ? 'Backspace' : 'Delete',
          },
          {
            role: 'selectAll',
          },
          { type: 'separator' },
          {
            label: 'Line Ending',
            enabled: wState?.wContentState?.hasActiveDocument,
            submenu: [
              {
                label: 'Windows CRLF',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.lineEnding === 'CRLF',
                click: () => {
                  this.sendMenuAction('line-ending-crlf')
                }
              },
              {
                label: 'Unix LF',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.lineEnding === 'LF',
                click: () => {
                  this.sendMenuAction('line-ending-lf')
                }
              }
            ]
          },
          {
            label: 'Space and Line break',
            enabled: wState?.wContentState?.hasActiveDocument,
            submenu: [
              {
                label: 'First line indent',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.firstLineIndent === true,
                click: () => {
                  this.sendMenuAction('toggle-first-line-indent')
                }
              },
              {
                label: 'Space and Line break',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.invisibleCharacters === true,
                click: () => {
                  this.sendMenuAction('toggle-space-line-break')
                }
              }
            ]
          },
          {
            label: 'Text Replacement',
            submenu: [
              {
                label: 'Smart Punctuation',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.smartPunctuation === true,
                click: () => {
                  this.sendMenuAction('toggle-smart-punctuation')
                }
              },
              {
                label: 'Text Replace...',
                click: () => {
                  this.sendMenuAction('text-replace')
                }
              },
              { type: 'separator' },
              {
                label: 'More Options...',
                click: () => {
                  this.sendMenuAction('preferences-text-replacement')
                }
              }
            ]
          },
          {
            label: 'Spelling and Grammar',
            submenu: [
              {
                label: 'Show Spelling and Grammar Errors',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.showProofreadErrors === true,
                accelerator: 'CmdOrCtrl+Shift+;',
                click: () => {
                  this.sendMenuAction('toggle-spelling-grammar-errors')
                }
              },
              {
                label: 'Check Whole Document',
                accelerator: 'CmdOrCtrl+;',
                click: () => {
                  this.sendMenuAction('check-whole-document')
                }
              },
              {
                label: 'Check Spelling and Grammar while Typing',
                type: 'checkbox',
                checked: wState?.wContentState?.edit?.proofread === true,
                click: () => {
                  this.sendMenuAction('check-spelling-grammar-while-typing')
                }
              },
              { type: 'separator' },
              {
                label: 'More Options...',
                click: () => {
                  this.sendMenuAction('preferences-spelling-grammar')
                }
              }
            ]
          },
          { type: 'separator' },
          {
            label: 'Find',
            accelerator: 'CmdOrCtrl+F',
            click: () => {
              this.sendMenuAction('find')
            }
          },
          {
            label: 'Replace',
            accelerator: 'CmdOrCtrl+Alt+F',
            click: () => {
              this.sendMenuAction('replace')
            }
          },
        ]
      },
      {
        id: 'paragraphMenu',
        label: 'Paragraph',
        submenu: [
          {
            label: 'Heading 1',
            accelerator: 'CmdOrCtrl+1',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 1,
            click: () => {
              this.sendMenuAction('heading-1')
            }
          },
          {
            label: 'Heading 2',
            accelerator: 'CmdOrCtrl+2',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 2,
            click: () => {
              this.sendMenuAction('heading-2')
            }
          },
          {
            label: 'Heading 3',
            accelerator: 'CmdOrCtrl+3',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 3,
            click: () => {
              this.sendMenuAction('heading-3')
            }
          },
          {
            label: 'Heading 4',
            accelerator: 'CmdOrCtrl+4',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 4,
            click: () => {
              this.sendMenuAction('heading-4')
            }
          },
          {
            label: 'Heading 5',
            accelerator: 'CmdOrCtrl+5',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 5,
            click: () => {
              this.sendMenuAction('heading-5')
            }
          },
          {
            label: 'Heading 6',
            accelerator: 'CmdOrCtrl+6',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 6,
            click: () => {
              this.sendMenuAction('heading-6')
            }
          },
          { type: 'separator' },
          {
            label: 'Paragraph',
            accelerator: 'CmdOrCtrl+0',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 'paragraph',
            click: () => {
              this.sendMenuAction('paragraph')
            }
          },
          { type: 'separator' },
          {
            label: 'Promote Heading',
            accelerator: 'CmdOrCtrl+]',
            enabled:
              wState?.wContentState?.content?.type !== 1 &&
              ((typeof wState?.wContentState?.content?.type === 'number' &&
                wState?.wContentState?.content?.type >= 2 &&
                wState?.wContentState?.content?.type <= 6) ||
                wState?.wContentState?.content?.type === 'paragraph'),
            click: () => {
              this.sendMenuAction('promote-heading')
            }
          },
          {
            label: 'Demote Heading',
            accelerator: 'CmdOrCtrl+[',
            enabled: 
              wState?.wContentState?.content?.type !== 'paragraph' &&
              (typeof wState?.wContentState?.content?.type === 'number' &&
              wState?.wContentState?.content?.type >= 1 &&
              wState?.wContentState?.content?.type <= 6),
            click: () => {
              this.sendMenuAction('demote-heading')
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
                  this.sendMenuAction('insert-table')
                }
              },
              { type: 'separator' },
              {
                label: 'Header Row',
                type: 'checkbox',
                enabled: wState?.wContentState?.content?.type === 'table',
                checked: (wState?.wContentState?.content?.data as ParagraphStateTableData)?.hasHeaderRow,
                click: (menuItem) => {
                  menuItem.checked = false
                  this.sendMenuAction('table-toggle-header-row')
                }
              },
              {
                label: 'Header Column',
                type: 'checkbox',
                enabled: wState?.wContentState?.content?.type === 'table',
                checked: (wState?.wContentState?.content?.data as ParagraphStateTableData)?.hasHeaderColumn,
                click: (menuItem) => {
                  menuItem.checked = false
                  this.sendMenuAction('table-toggle-header-column')
                }
              },
              { type: 'separator' },
              {
                label: 'Insert Row Above',
                enabled: wState?.wContentState?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-insert-row-above')
                }
              },
              {
                label: 'Insert Row Below',
                enabled: wState?.wContentState?.content?.type === 'table',
                accelerator: 'CmdOrCtrl+Enter',
                click: () => {
                  this.sendMenuAction('table-insert-row-below')
                }
              },
              { type: 'separator' },
              {
                label: 'Insert Column Left',
                enabled: wState?.wContentState?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-insert-column-left')
                }
              },
              {
                label: 'Insert Column Right',
                enabled: wState?.wContentState?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-insert-column-right')
                }
              },
              { type: 'separator' },
              {
                label: 'Move Row Up',
                enabled:
                  wState?.wContentState?.content?.type === 'table' &&
                  (wState?.wContentState?.content?.data as ParagraphStateTableData)?.canMoveAbove,
                accelerator: 'CmdOrCtrl+Shift+Up',
                click: () => {
                  this.sendMenuAction('table-move-row-above')
                }
              },
              {
                label: 'Move Row Down',
                enabled:
                  wState?.wContentState?.content?.type === 'table' &&
                  (wState?.wContentState?.content?.data as ParagraphStateTableData)?.canMoveBelow,
                accelerator: 'CmdOrCtrl+Shift+Down',
                click: () => {
                  this.sendMenuAction('table-move-row-below')
                }
              },
              {
                label: 'Move Column Left',
                enabled:
                  wState?.wContentState?.content?.type === 'table' &&
                  (wState?.wContentState?.content?.data as ParagraphStateTableData)?.canMoveLeft,
                accelerator: 'CmdOrCtrl+Shift+Left',
                click: () => {
                  this.sendMenuAction('table-move-column-left')
                }
              },
              {
                label: 'Move Column Right',
                enabled:
                  wState?.wContentState?.content?.type === 'table' &&
                  (wState?.wContentState?.content?.data as ParagraphStateTableData)?.canMoveRight,
                accelerator: 'CmdOrCtrl+Shift+Right',
                click: () => {
                  this.sendMenuAction('table-move-column-right')
                }
              },
              { type: 'separator' },
              {
                label: 'Delete Row',
                enabled: wState?.wContentState?.content?.type === 'table',
                accelerator: 'CmdOrCtrl+Shift+Backspace',
                click: () => {
                  this.sendMenuAction('table-delete-row')
                }
              },
              {
                label: 'Delete Column',
                enabled: wState?.wContentState?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-delete-column')
                }
              },
              { type: 'separator' },
              {
                label: 'Duplicate Table',
                enabled: wState?.wContentState?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-duplicate')
                }
              },
              {
                label: 'Delete Table',
                enabled: wState?.wContentState?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-delete')
                }
              }
            ]
          },
          {
            label: 'Code Block',
            accelerator: 'CmdOrCtrl+Shift+C',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 'codeBlock',
            click: () => {
              this.sendMenuAction('insert-code-block')
            }
          },
          {
            label: 'Code Tools',
            submenu: [
              {
                label: 'Format Selection',
                enabled: 
                (
                  wState?.wContentState?.content?.type === 'codeBlock' &&
                  wState?.wContentState?.hasSelection
                ),
                click: () => {
                  this.sendMenuAction('code-format-selection')
                }
              },
              {
                label: 'Format CodeBlock',
                enabled: wState?.wContentState?.content?.type === 'codeBlock',
                click: () => {
                  this.sendMenuAction('code-format-codeblock')
                }
              }
            ]
          },
          {
            label: 'Math Block',
            accelerator: 'CmdOrCtrl+Shift+B',
            click: () => {
              this.sendMenuAction('insert-math-block')
            }
          },
          /*
          {
            label: 'Alert',
            submenu: [
              {
                label: 'Information',
                click: () => {
                  this.sendMenuAction('insert-alert-information')
                }
              },
              {
                label: 'Suggestion',
                click: () => {
                  this.sendMenuAction('insert-alert-suggestion')
                }
              },
              {
                label: 'Important',
                click: () => {
                  this.sendMenuAction('insert-alert-important')
                }
              },
              {
                label: 'Warning',
                click: () => {
                  this.sendMenuAction('insert-alert-warning')
                }
              },
              {
                label: 'Notification',
                click: () => {
                  this.sendMenuAction('insert-alert-notification')
                }
              }
            ]
          },
          { type: 'separator' },
          */
          {
            label: 'Quote Block',
            accelerator: 'CmdOrCtrl+Shift+Q',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 'blockquote',
            click: () => {
              this.sendMenuAction('insert-quote-block')
            }
          },
          /*
          {
            label: 'Caption',
            click: () => {
              this.sendMenuAction('toggle-caption')
            }
          },
          */
          { type: 'separator' },
          {
            label: 'Ordered List',
            accelerator: 'CmdOrCtrl+Shift+O',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 'orderedList',
            click: () => {
              this.sendMenuAction('ordered-list')
            }
          },
          {
            label: 'Bullet List',
            accelerator: 'CmdOrCtrl+Shift+U',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 'bulletList',
            click: () => {
              this.sendMenuAction('bullet-list')
            }
          },
          {
            label: 'Task List',
            accelerator: 'CmdOrCtrl+Shift+X',
            type: 'checkbox',
            checked: wState?.wContentState?.content?.type === 'taskList',
            click: () => {
              this.sendMenuAction('task-list')
            }
          },
          {
            label: 'Task Status',
            submenu: [
              {
                label: 'Toggle Task Status',
                enabled: wState?.wContentState?.content?.type === 'taskList',
                click: () => {
                  this.sendMenuAction('toggle-task-status')
                }
              },
              { type: 'separator' },
              {
                label: 'Complete Task',
                type: 'radio',
                enabled: 
                (
                  wState?.wContentState?.content?.type === 'taskList' &&
                  !(wState?.wContentState?.content?.data as ParagraphStateTaskListData)?.checked
                ),
                click: () => {
                  this.sendMenuAction('complete-task')
                }
              },
              {
                label: 'Uncomplete Task',
                type: 'radio',
                enabled: 
                (
                  wState?.wContentState?.content?.type === 'taskList' &&
                  (wState?.wContentState?.content?.data as ParagraphStateTaskListData)?.checked
                ),
                click: () => {
                  this.sendMenuAction('uncomplete-task')
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
                  ['bulletList', 'orderedList', 'taskList'].includes(wState?.wContentState?.content?.type as string) &&
                  (wState?.wContentState?.content?.data as ParagraphStateListData)?.canSink
                ),
                click: () => {
                  this.sendMenuAction('increase-indent')
                }
              },
              {
                label: 'Decrease Indent',
                accelerator: 'CmdOrCtrl+[',
                enabled: 
                (
                  ['bulletList', 'orderedList', 'taskList'].includes(wState?.wContentState?.content?.type as string) &&
                  (wState?.wContentState?.content?.data as ParagraphStateListData)?.canLift
                ),
                click: () => {
                  this.sendMenuAction('decrease-indent')
                }
              }
            ]
          },
          { type: 'separator' },
          {
            label: 'Insert Paragraph Above',
            click: () => {
              this.sendMenuAction('insert-paragraph-above')
            }
          },
          {
            label: 'Insert Paragraph Below',
            click: () => {
              this.sendMenuAction('insert-paragraph-below')
            }
          },
          /*
          { type: 'separator' },
          {
            label: 'Reference Link',
            accelerator: 'CmdOrCtrl+Shift+L',
            click: () => {
              this.sendMenuAction('reference-link')
            }
          },
          {
            label: 'Footprint',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: () => {
              this.sendMenuAction('footprint')
            }
          },
          */
          { type: 'separator' },
          {
            label: 'Horizontal Rule',
            accelerator: 'CmdOrCtrl+Shift+-',
            click: () => {
              this.sendMenuAction('horizontal-rule')
            }
          }
        ]
      },
      {
        id: 'formatMenu',
        label: 'Format',
        submenu: [
          {
            id: 'format-bold',
            label: 'Bold',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.bold,
            accelerator: 'CmdOrCtrl+B',
            click: (menuItem) => {
              // cancle toggled status
              menuItem.checked = false
              this.sendMenuAction('bold')
            }
          },
          {
            id: 'format-italic',
            label: 'Italic',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.italic,
            accelerator: 'CmdOrCtrl+I',
            click: (menuItem) => {
              // cancle toggled status
              menuItem.checked = false
              this.sendMenuAction('italic')
            }
          },
          {
            id: 'format-underline',
            label: 'Underline',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.underline,
            accelerator: 'CmdOrCtrl+U',
            click: (menuItem) => {
              // cancle toggled status
              menuItem.checked = false
              this.sendMenuAction('underline')
            }
          },
          {
            id: 'format-strikethrough',
            label: 'Strike Through',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.strikethrough,
            accelerator: 'CmdOrCtrl+Shift+X',
            click: (menuItem) => {
              // cancle toggled status
              menuItem.checked = false
              this.sendMenuAction('strikethrough')
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
                  !wState?.wContentState?.formatting?.textAlign || 
                  wState?.wContentState?.formatting?.textAlign === 'left'
                ),
                click: () => {
                  this.sendMenuAction('align-left')
                }
              },
              {
                label: 'Center Aligned',
                type: 'radio',
                checked: wState?.wContentState?.formatting?.textAlign === 'center',
                click: () => {
                  this.sendMenuAction('align-center')
                }
              },
              {
                label: 'Right Aligned',
                type: 'radio',
                checked: wState?.wContentState?.formatting?.textAlign === 'right',
                click: () => {
                  this.sendMenuAction('align-right')
                }
              },
              {
                label: 'Justified',
                type: 'radio',
                checked: wState?.wContentState?.formatting?.textAlign === 'justify',
                click: () => {
                  this.sendMenuAction('align-justify')
                }
              }
            ]
          },
          /*
          {
            label: 'Text Style',
            submenu: [
              // Text style options will be populated dynamically
            ]
          },
          */
          { type: 'separator' },
          {
            id: 'format-code',
            label: 'Inline Code',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.inlineCode,
            accelerator: 'CmdOrCtrl+`',
            click: () => {
              this.sendMenuAction('inline-code')
            }
          },
          {
            label: 'Inline Math',
            accelerator: 'CmdOrCtrl+Shift+M',
            click: () => {
              this.sendMenuAction('inline-math')
            }
          },
          /*
          {
            label: 'Comment',
            accelerator: 'CmdOrCtrl+/',
            click: () => {
              this.sendMenuAction('comment')
            }
          },
          */
          { type: 'separator' },
          {
            label: 'Superscript',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.script === 'superscript',
            click: () => {
              this.sendMenuAction('superscript')
            }
          },
          {
            label: 'Subscript',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.script === 'subscript',
            click: () => {
              this.sendMenuAction('subscript')
            }
          },
          {
            label: 'Highlight',
            accelerator: 'CmdOrCtrl+Shift+H',
            type: 'checkbox',
            checked: wState?.wContentState?.formatting?.highlight,
            click: () => {
              this.sendMenuAction('highlight')
            }
          },
          { type: 'separator' },
          {
            label: 'Link',
            accelerator: 'CmdOrCtrl+K',
            click: () => {
              this.sendMenuAction('inline-link')
            }
          },
          {
            label: 'Image / Video / Audio',
            submenu: [
              {
                label: 'Insert Media',
                accelerator: 'CmdOrCtrl+Shift+I',
                click: () => {
                  this.sendMenuAction('insert-media')
                }
              },
              {
                label: 'Insert Local Media...',
                click: () => {
                  this.sendMenuAction('insert-local-media')
                }
              },
              /*
              { type: 'separator' },
              {
                label: 'Open Media Location...',
                click: () => {
                  this.sendMenuAction('open-media-location')
                }
              },
              {
                label: 'Resize Media',
                submenu: [
                  {
                    label: '1 / 4',
                    click: () => {
                      this.sendMenuAction('resize-media-quarter')
                    }
                  },
                  {
                    label: '1 / 3',
                    click: () => {
                      this.sendMenuAction('resize-media-third')
                    }
                  },
                  {
                    label: '1 / 2',
                    click: () => {
                      this.sendMenuAction('resize-media-half')
                    }
                  },
                  {
                    label: '2 / 3',
                    click: () => {
                      this.sendMenuAction('resize-media-two-thirds')
                    }
                  },
                  {
                    label: '3 / 4',
                    click: () => {
                      this.sendMenuAction('resize-media-three-quarters')
                    }
                  },
                  { type: 'separator' },
                  {
                    label: '100%',
                    click: () => {
                      this.sendMenuAction('resize-media-100')
                    }
                  },
                  {
                    label: '150%',
                    click: () => {
                      this.sendMenuAction('resize-media-150')
                    }
                  },
                  {
                    label: '200%',
                    click: () => {
                      this.sendMenuAction('resize-media-200')
                    }
                  },
                  { type: 'separator' },
                  {
                    label: 'Custom Size...',
                    click: () => {
                      this.sendMenuAction('resize-media-custom')
                    }
                  }
                ]
              },
              {
                label: 'Delete Media',
                click: () => {
                  this.sendMenuAction('delete-media')
                }
              },
              { type: 'separator' },
              {
                label: 'Copy Media To...',
                click: () => {
                  this.sendMenuAction('copy-media-to')
                }
              },
              {
                label: 'Rename / Move Media To...',
                click: () => {
                  this.sendMenuAction('rename-move-media')
                }
              },
              {
                label: 'Upload Media',
                click: () => {
                  this.sendMenuAction('upload-media')
                }
              },
              { type: 'separator' },
              {
                label: 'Copy All Media To...',
                click: () => {
                  this.sendMenuAction('copy-all-media')
                }
              },
              {
                label: 'Rename / Move All Media To...',
                click: () => {
                  this.sendMenuAction('rename-move-all-media')
                }
              },
              {
                label: 'Upload All Media',
                click: () => {
                  this.sendMenuAction('upload-all-media')
                }
              },
              { type: 'separator' },
              {
                label: 'Reload All Media',
                click: () => {
                  this.sendMenuAction('reload-all-media')
                }
              },
              { type: 'separator' },
              {
                label: 'Media Setting...',
                click: () => {
                  this.sendMenuAction('media-setting')
                }
              }
              */
            ]
          },
          /*
          {
            label: 'Insert from iPhone or iPad',
            submenu: [
              // Will be populated dynamically based on available devices
            ]
          },
          */
          { type: 'separator' },
          {
            label: 'Clear Formatting',
            accelerator: 'CmdOrCtrl+\\',
            click: () => {
              this.sendMenuAction('clear-formatting')
            }
          }
        ]
      },
      /*
      {
        id: 'aiMenu',
        label: 'AI',
        submenu: [
          {
            label: 'Chat',
            click: () => {
              this.sendMenuAction('ai-chat')
            }
          },
          {
            label: 'Brain Storming...',
            click: () => {
              this.sendMenuAction('ai-brain-storming')
            }
          },
          { type: 'separator' },
          {
            label: 'Write Style',
            submenu: [
              {
                label: 'Formal',
                click: () => {
                  this.sendMenuAction('ai-write-style-formal')
                }
              },
              {
                label: 'Narrative',
                click: () => {
                  this.sendMenuAction('ai-write-style-narrative')
                }
              },
              {
                label: 'Humorous',
                click: () => {
                  this.sendMenuAction('ai-write-style-humorous')
                }
              },
              {
                label: 'Marketing',
                click: () => {
                  this.sendMenuAction('ai-write-style-marketing')
                }
              },
              {
                label: 'Storytelling',
                click: () => {
                  this.sendMenuAction('ai-write-style-storytelling')
                }
              },
              { type: 'separator' },
              {
                label: 'Famous Writers...',
                click: () => {
                  this.sendMenuAction('ai-write-style-famous-writers')
                }
              },
              {
                label: 'Charles Dickens',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('ai-write-style-charles-dickens')
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
                  this.sendMenuAction('ai-adjust-length-abbreviate')
                }
              },
              {
                label: 'Expand',
                click: () => {
                  this.sendMenuAction('ai-adjust-length-expand')
                }
              },
              {
                label: 'Continue',
                click: () => {
                  this.sendMenuAction('ai-adjust-length-continue')
                }
              }
            ]
          },
          {
            label: 'Extract Outline',
            click: () => {
              this.sendMenuAction('ai-extract-outline')
            }
          },
          {
            label: 'Summarize',
            click: () => {
              this.sendMenuAction('ai-summarize')
            }
          },
          {
            label: 'Spell and Grammar check',
            click: () => {
              this.sendMenuAction('ai-spell-grammar-check')
            }
          },
          {
            label: 'Review',
            click: () => {
              this.sendMenuAction('ai-review')
            }
          },
          { type: 'separator' },
          {
            label: 'Keep',
            click: () => {
              this.sendMenuAction('ai-keep')
            }
          },
          {
            label: 'Discard',
            click: () => {
              this.sendMenuAction('ai-discard')
            }
          },
          {
            label: 'Modify...',
            click: () => {
              this.sendMenuAction('ai-modify')
            }
          }
        ]
      },
      */
      {
        id: 'viewMenu',
        label: 'View',
        submenu: [
          {
            label: 'Focus Mode',
            accelerator: 'CmdOrCtrl+Shift+F',
            type: 'checkbox',
            checked: wState?.wContentState?.view?.focusMode ? true : false,
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-toggle-focus-mode')
            }
          },
          {
            label: 'Typewriter Mode',
            accelerator: 'CmdOrCtrl+Shift+T',
            type: 'checkbox',
            checked: wState?.wContentState?.view?.typewriterMode ? true : false,
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-toggle-typewriter-mode')
            }
          },
          { type: 'separator' },
          {
            label: 'Explorer',
            accelerator: 'CmdOrCtrl+Shift+1',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-explorer')
            }
          },
          {
            label: 'Search',
            accelerator: 'CmdOrCtrl+Shift+2',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-search')
            }
          },
/*
          {
            label: 'Tag',
            accelerator: 'CmdOrCtrl+Shift+3',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-tag')
            }
          },
*/
          {
            label: 'Table of Contents',
            accelerator: 'CmdOrCtrl+Shift+4',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-toc')
            }
          },
          { type: 'separator' },
          {
            label: 'Clean Mode',
            accelerator: 'CmdOrCtrl+Shift+5',
            type: 'checkbox',
            checked: wState?.wContentState?.view?.cleanMode ? true : false,
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-toggle-clean-mode')
            }
          },
          {
            label: 'AI StoryMate',
            accelerator: 'CmdOrCtrl+Shift+R',
            type: 'checkbox',
            checked: wState?.wContentState?.view?.rightSidebar? true : false,
            click: () => {
              this.sendMenuAction('view-toggle-right-sidebar')
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
                checked: wState?.wContentState?.view?.leftSidebar? true : false,
                click: () => {
                  this.sendMenuAction('view-toggle-left-sidebar')
                }
              },
              {
                label: 'Status Bar',
                accelerator: 'CmdOrCtrl+Shift+S',
                type: 'checkbox',
                checked: wState?.wContentState?.view?.statusbar? true : false,
                click: () => {
                  this.sendMenuAction('view-toggle-statusbar')
                }
              },
              { type: 'separator' },
              {
                label: 'Follow System',
                type: 'radio',
                checked: wState?.wContentState?.view?.theme === 'system',
                click: () => {
                  this.sendMenuAction('view-theme-follow-system')
                }
              },
              {
                label: 'Light',
                type: 'radio',
                checked: wState?.wContentState?.view?.theme === 'light',
                click: () => {
                  this.sendMenuAction('view-theme-light')
                }
              },
              {
                id: 'viewThemeDark',
                label: 'Dark',
                type: 'radio',
                checked: wState?.wContentState?.view?.theme === 'dark',
                click: () => {
                  this.sendMenuAction('view-theme-dark')
                }
              }
            ]
          },
          {
            label: 'More Theme...',
            click: () => {
              this.sendMenuAction('view-theme-settings')
            }
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
        ]
      },
      { role: 'windowMenu' },
      {
        id: 'helpMenu',
        label: 'Help',
        submenu: [
          {
            label: "What's New...",
            click: async () => {
              await shell.openExternal(docsUrl('/changelog'))
            }
          },
          { type: 'separator' },
          {
            label: 'Quick Start',
            click: async () => {
              await shell.openExternal(docsUrl('/quick-start'))
            }
          },
          /*
          {
            label: 'Online Guide and Course',
            click: async () => {
              await shell.openExternal(docsUrl('/docs/'))
            }
          },
          {
            label: 'Markdown Reference',
            click: async () => {
              await shell.openExternal(docsUrl('/docs/editor'))
            }
          },
          {
            label: 'Keyboard Shortcuts',
            click: async () => {
              await shell.openExternal(docsUrl('/faq'))
            }
          },
          */
          { type: 'separator' },
          {
            label: 'Licenses and Acknowledgements',
            click: async () => {
              await shell.openExternal(docsUrl('/docs/licenses'))
            }
          },
          {
            label: 'FAQ',
            click: async () => {
              await shell.openExternal(docsUrl('/faq'))
            }
          },
          {
            label: 'Security',
            click: async () => {
              await shell.openExternal(docsUrl('/security'))
            }
          },
          { type: 'separator' },
          {
            label: 'Auto Update Settings...',
            click: () => {
              this.sendMenuAction('auto-update-settings')
            }
          },
          {
            label: 'Visit Project Repository',
            click: async () => {
              await shell.openExternal(REPOSITORY_URL)
            }
          },
          {
            label: 'Feedback',
            click: async () => {
              await shell.openExternal(docsUrl('/community'))
            }
          }
        ]
      }
    ]

    const filteredTemplate = baseTemplate.filter(item => {
      // Filter out App menu based on runtime platform
      if (item.id === 'appMenu' && !isMac) return false
      
      // Filter out Edit, Paragraph and Format menus based on document state
      if (
        !wState?.wContentState?.hasActiveDocument &&
        (item.id === 'editMenu' || item.id === 'paragraphMenu' || item.id === 'formatMenu')
      ) {
        return false
      } else if (
        wState?.wContentState?.hasActiveDocument &&
        (item.id === 'editMenu-default')
      ) {
        return false
      }

      return true
    })

    // Insert additional daisyUI themes dynamically
    const customThemes = getCustomThemes()
    if (customThemes.length > 0) {
      const insertThemeItems: Electron.MenuItemConstructorOptions[] = [
        { type: 'separator' },
        ...customThemes.map((theme) => ({
          label: theme.name,
          type: 'radio' as const,
          checked: wState?.wContentState?.view?.theme === theme.id,
          click: () => {
            this.sendMenuAction(`view-theme-${theme.id}`)
          }
        }))
      ]

      const result = insertInTemplate(baseTemplate, undefined, 'viewThemeDark', insertThemeItems);
      if (result === false) {
        console.warn('Failed to insert custom theme items into the template');
      }
    }

    localizeMenuTemplate(
      baseTemplate as unknown as Array<Record<string, unknown>>,
      wState?.wContentState?.view?.locale,
    )

    const menu = Menu.buildFromTemplate(filteredTemplate)
    Menu.setApplicationMenu(menu)
  }

  destroy(): void {
  }
}
