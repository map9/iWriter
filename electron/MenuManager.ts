import { BrowserWindow, Menu, shell } from 'electron'
import type {
  ContentStateListData,
  ContentStateTaskListData,
  ContentStateTableData
} from '../src/types/windowContentState'
import { isMac } from './utils'
import type { WindowState, GlobalParameters } from './types'

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
    // Build base menu template
    const baseTemplate: Electron.MenuItemConstructorOptions[] = [
      // { role: 'appMenu' }
      ...(isMac
        ? [{
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
                label: 'Check for update...',
                click: () => {
                  this.sendMenuAction('check-update')
                }
              },
              {
                label: 'Preferences...',
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
          }]
        : []),
      {
        label: 'File',
        submenu: [
          {
            label: 'New Document',
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
            label: 'New Window',
            accelerator: 'CmdOrCtrl+Alt+N',
            click: () => {
              this.sendMenuAction('new-window')              
            }
          },
          { type: 'separator' },
          {
            label: 'Open File...',
            accelerator: 'CmdOrCtrl+O',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('open-file')
            }
          },
          {
            label: 'Open Folder...',
            accelerator: 'CmdOrCtrl+Shift+O',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('open-folder')
            }
          },
          {
            label: 'Open Recent',
            role: 'recentdocuments',
            submenu:[
              { type: 'separator' },
              {
                label: 'Clear Recent',
                role: 'clearrecentdocuments'
              }
            ]
          },
          { type: 'separator' },
          {
            id: 'save',
            label: 'Save',
            accelerator: 'CmdOrCtrl+S',
            enabled: wState?.contentInfo?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('save')
            }
          },
          {
            id: 'save-as',
            label: 'Save As...',
            accelerator: 'CmdOrCtrl+Shift+S',
            enabled: wState?.contentInfo?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('save-as')
            }
          },
          {
            id: 'auto-save',
            label: 'Auto Save',
            type: 'checkbox',
            checked: g?.autoSave,
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('toggle-auto-save')
            }
          },
          {
            id: 'save-all',
            label: 'Save All',
            accelerator: 'CmdOrCtrl+Alt+S',
            enabled: wState?.contentInfo?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('save-all')
            }
          },
          { type: 'separator' },
          {
            label: 'Import',
            enabled: wState != null,
            submenu: [
              {
                label: 'Evernote',
                click: () => {
                  this.sendMenuAction('import-evernote')
                }
              },
              {
                label: 'Drafts',
                click: () => {
                  this.sendMenuAction('import-drafts')
                }
              },
              {
                label: 'Obsidian',
                click: () => {
                  this.sendMenuAction('import-obsidian')
                }
              },
              {
                label: 'Day One',
                click: () => {
                  this.sendMenuAction('import-day-one')
                }
              },
              { type: 'separator' },
              {
                label: 'More Options...',
                click: () => {
                  this.sendMenuAction('import-more-options')
                }
              }
            ]
          },
          {
            id: 'export',
            label: 'Export',
            enabled: wState?.contentInfo?.hasActiveDocument,
            submenu: [
              {
                label: 'PDF',
                click: () => {
                  this.sendMenuAction('export-pdf')
                }
              },
              {
                label: 'Html',
                click: () => {
                  this.sendMenuAction('export-html')
                }
              },
              {
                label: 'Word(.docx)',
                click: () => {
                  this.sendMenuAction('export-word')
                }
              },
              { type: 'separator' },
              {
                label: 'More Options...',
                click: () => {
                  this.sendMenuAction('export-more-options')
                }
              }
            ]
          },
          { type: 'separator' },
          {
            label: 'Print...',
            accelerator: 'CmdOrCtrl+P',
            enabled: wState?.contentInfo?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('print')
            }
          },
          { type: 'separator' },
          {
            id: 'close-file',
            label: 'Close File',
            accelerator: 'CmdOrCtrl+W',
            enabled: wState?.contentInfo?.hasActiveDocument,
            click: () => {
              this.sendMenuAction('close-file')
            }
          },
          {
            id: 'close-folder',
            label: 'Close Folder',
            enabled: wState?.contentInfo?.hasFolderOpen,
            click: () => {
              this.sendMenuAction('close-folder')
            }
          },
          isMac ? { role: 'close' } : { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          {
            label: 'Undo',
            accelerator: 'CmdOrCtrl+Z',
            enabled: wState?.contentInfo?.undoRedo?.undo,
            click: () => {
              this.sendMenuAction('undo')
            }
          },
          {
            label: 'Redo',
            accelerator: 'CmdOrCtrl+Shift+Z',
            enabled: wState?.contentInfo?.undoRedo?.redo,
            click: () => {
              this.sendMenuAction('redo')
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
              },
              {
                label: 'Picture',
                click: () => {
                  this.sendMenuAction('copy-as-picture')
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
              this.sendMenuAction('paste-as-text')
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
                  this.sendMenuAction('line-ending-crlf')
                }
              },
              {
                label: 'Unix LF',
                type: 'radio',
                click: () => {
                  this.sendMenuAction('line-ending-lf')
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
                  this.sendMenuAction('first-line-indent')
                }
              },
              {
                label: 'Show <br/>',
                click: () => {
                  this.sendMenuAction('show-br')
                }
              },
              {
                label: 'Keep Line breaks',
                click: () => {
                  this.sendMenuAction('keep-line-breaks')
                }
              },
              { type: 'separator' },
              {
                label: 'More Options...',
                click: () => {
                  this.sendMenuAction('space-line-break-options')
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
                  this.sendMenuAction('convert-on-input')
                }
              },
              {
                label: 'Convert on Render',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('convert-on-render')
                }
              },
              {
                label: 'Smart Quotes',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('smart-quotes')
                }
              },
              {
                label: 'Smart Dashes',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('smart-dashes')
                }
              },
              {
                label: 'Text Replace',
                click: () => {
                  this.sendMenuAction('text-replace')
                }
              },
              {
                label: 'Auto Convert Unicode Punctuation',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('auto-convert-unicode')
                }
              },
              { type: 'separator' },
              {
                label: 'More Options...',
                click: () => {
                  this.sendMenuAction('auto-replace-options')
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
                  this.sendMenuAction('check-document')
                }
              },
              {
                label: 'Show Spelling and Grammar...',
                accelerator: 'CmdOrCtrl+Shift+;',
                click: () => {
                  this.sendMenuAction('show-spelling-grammar')
                }
              },
              { type: 'separator' },
              {
                label: 'Check Spelling On Input',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('check-spelling-on-input')
                }
              },
              {
                label: 'Check Spell and Grammar',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('check-spell-grammar')
                }
              },
              {
                label: 'Auto Correct Spell',
                type: 'checkbox',
                click: () => {
                  this.sendMenuAction('auto-correct-spell')
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
          { type: 'separator' },
          {
            label: 'Find in Files',
            accelerator: 'CmdOrCtrl+Shift+F',
            click: () => {
              this.sendMenuAction('find-in-files')
            }
          },
          {
            label: 'Replace in Files',
            accelerator: 'CmdOrCtrl+Shift+H',
            click: () => {
              this.sendMenuAction('replace-in-files')
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
            checked: wState?.contentInfo?.content?.type === 1,
            click: () => {
              this.sendMenuAction('heading-1')
            }
          },
          {
            label: 'Heading 2',
            accelerator: 'CmdOrCtrl+2',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 2,
            click: () => {
              this.sendMenuAction('heading-2')
            }
          },
          {
            label: 'Heading 3',
            accelerator: 'CmdOrCtrl+3',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 3,
            click: () => {
              this.sendMenuAction('heading-3')
            }
          },
          {
            label: 'Heading 4',
            accelerator: 'CmdOrCtrl+4',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 4,
            click: () => {
              this.sendMenuAction('heading-4')
            }
          },
          {
            label: 'Heading 5',
            accelerator: 'CmdOrCtrl+5',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 5,
            click: () => {
              this.sendMenuAction('heading-5')
            }
          },
          {
            label: 'Heading 6',
            accelerator: 'CmdOrCtrl+6',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 6,
            click: () => {
              this.sendMenuAction('heading-6')
            }
          },
          { type: 'separator' },
          {
            label: 'Paragraph',
            accelerator: 'CmdOrCtrl+0',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 'paragraph',
            click: () => {
              this.sendMenuAction('paragraph')
            }
          },
          { type: 'separator' },
          {
            label: 'Promote Heading',
            accelerator: 'CmdOrCtrl+=',
            enabled:
              wState?.contentInfo?.content?.type !== 1 &&
              ((typeof wState?.contentInfo?.content?.type === 'number' &&
                wState?.contentInfo?.content?.type >= 2 &&
                wState?.contentInfo?.content?.type <= 6) ||
                wState?.contentInfo?.content?.type === 'paragraph'),
            click: () => {
              this.sendMenuAction('promote-heading')
            }
          },
          {
            label: 'Demote Heading',
            accelerator: 'CmdOrCtrl+-',
            enabled: 
              wState?.contentInfo?.content?.type !== 'paragraph' &&
              (typeof wState?.contentInfo?.content?.type === 'number' &&
              wState?.contentInfo?.content?.type >= 1 &&
              wState?.contentInfo?.content?.type <= 6),
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
                enabled: wState?.contentInfo?.content?.type === 'table',
                checked: (wState?.contentInfo?.content?.data as ContentStateTableData)?.hasHeaderRow,
                click: (menuItem) => {
                  menuItem.checked = false
                  this.sendMenuAction('table-toggle-header-row')
                }
              },
              {
                label: 'Header Column',
                type: 'checkbox',
                enabled: wState?.contentInfo?.content?.type === 'table',
                checked: (wState?.contentInfo?.content?.data as ContentStateTableData)?.hasHeaderColumn,
                click: (menuItem) => {
                  menuItem.checked = false
                  this.sendMenuAction('table-toggle-header-column')
                }
              },
              { type: 'separator' },
              {
                label: 'Insert Row Above',
                enabled: wState?.contentInfo?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-insert-row-above')
                }
              },
              {
                label: 'Insert Row Below',
                enabled: wState?.contentInfo?.content?.type === 'table',
                accelerator: 'CmdOrCtrl+Enter',
                click: () => {
                  this.sendMenuAction('table-insert-row-below')
                }
              },
              { type: 'separator' },
              {
                label: 'Insert Column Left',
                enabled: wState?.contentInfo?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-insert-column-left')
                }
              },
              {
                label: 'Insert Column Right',
                enabled: wState?.contentInfo?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-insert-column-right')
                }
              },
              { type: 'separator' },
              {
                label: 'Move Row Up',
                enabled:
                  wState?.contentInfo?.content?.type === 'table' &&
                  (wState?.contentInfo?.content?.data as ContentStateTableData)?.canMoveAbove,
                accelerator: 'CmdOrCtrl+Shift+Up',
                click: () => {
                  this.sendMenuAction('table-move-row-above')
                }
              },
              {
                label: 'Move Row Down',
                enabled:
                  wState?.contentInfo?.content?.type === 'table' &&
                  (wState?.contentInfo?.content?.data as ContentStateTableData)?.canMoveBelow,
                accelerator: 'CmdOrCtrl+Shift+Down',
                click: () => {
                  this.sendMenuAction('table-move-row-below')
                }
              },
              {
                label: 'Move Column Left',
                enabled:
                  wState?.contentInfo?.content?.type === 'table' &&
                  (wState?.contentInfo?.content?.data as ContentStateTableData)?.canMoveLeft,
                accelerator: 'CmdOrCtrl+Shift+Left',
                click: () => {
                  this.sendMenuAction('table-move-column-left')
                }
              },
              {
                label: 'Move Column Right',
                enabled:
                  wState?.contentInfo?.content?.type === 'table' &&
                  (wState?.contentInfo?.content?.data as ContentStateTableData)?.canMoveRight,
                accelerator: 'CmdOrCtrl+Shift+Right',
                click: () => {
                  this.sendMenuAction('table-move-column-right')
                }
              },
              { type: 'separator' },
              {
                label: 'Delete Row',
                enabled: wState?.contentInfo?.content?.type === 'table',
                accelerator: 'CmdOrCtrl+Shift+Backspace',
                click: () => {
                  this.sendMenuAction('table-delete-row')
                }
              },
              {
                label: 'Delete Column',
                enabled: wState?.contentInfo?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-delete-column')
                }
              },
              { type: 'separator' },
              {
                label: 'Duplicate Table',
                enabled: wState?.contentInfo?.content?.type === 'table',
                click: () => {
                  this.sendMenuAction('table-duplicate')
                }
              },
              {
                label: 'Delete Table',
                enabled: wState?.contentInfo?.content?.type === 'table',
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
            checked: wState?.contentInfo?.content?.type === 'codeBlock',
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
                  wState?.contentInfo?.content?.type === 'codeBlock' &&
                  wState?.contentInfo?.hasSelection
                ),
                click: () => {
                  this.sendMenuAction('code-format-selection')
                }
              },
              {
                label: 'Format CodeBlock',
                enabled: wState?.contentInfo?.content?.type === 'codeBlock',
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
          {
            label: 'Quote Block',
            accelerator: 'CmdOrCtrl+Shift+Q',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 'blockquote',
            click: () => {
              this.sendMenuAction('insert-quote-block')
            }
          },
          {
            label: 'Caption',
            click: () => {
              this.sendMenuAction('toggle-caption')
            }
          },
          { type: 'separator' },
          {
            label: 'Ordered List',
            accelerator: 'CmdOrCtrl+Shift+O',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 'orderedList',
            click: () => {
              this.sendMenuAction('ordered-list')
            }
          },
          {
            label: 'Bullet List',
            accelerator: 'CmdOrCtrl+Shift+U',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 'bulletList',
            click: () => {
              this.sendMenuAction('bullet-list')
            }
          },
          {
            label: 'Task List',
            accelerator: 'CmdOrCtrl+Shift+X',
            type: 'checkbox',
            checked: wState?.contentInfo?.content?.type === 'taskList',
            click: () => {
              this.sendMenuAction('task-list')
            }
          },
          {
            label: 'Task Status',
            submenu: [
              {
                label: 'Toggle Task Status',
                enabled: wState?.contentInfo?.content?.type === 'taskList',
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
                  wState?.contentInfo?.content?.type === 'taskList' &&
                  !(wState?.contentInfo?.content?.data as ContentStateTaskListData)?.checked
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
                  wState?.contentInfo?.content?.type === 'taskList' &&
                  (wState?.contentInfo?.content?.data as ContentStateTaskListData)?.checked
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
                  ['bulletList', 'orderedList', 'taskList'].includes(wState?.contentInfo?.content?.type as string) &&
                  (wState?.contentInfo?.content?.data as ContentStateListData)?.canSink
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
                  ['bulletList', 'orderedList', 'taskList'].includes(wState?.contentInfo?.content?.type as string) &&
                  (wState?.contentInfo?.content?.data as ContentStateListData)?.canLift
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
        id: 'format-menu',
        label: 'Format',
        submenu: [
          {
            id: 'format-bold',
            label: 'Bold',
            type: 'checkbox',
            checked: wState?.contentInfo?.formatting?.bold,
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
            checked: wState?.contentInfo?.formatting?.italic,
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
            checked: wState?.contentInfo?.formatting?.underline,
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
            checked: wState?.contentInfo?.formatting?.strikethrough,
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
                  !wState?.contentInfo?.formatting?.textAlign || 
                  wState?.contentInfo?.formatting?.textAlign === 'left'
                ),
                click: () => {
                  this.sendMenuAction('align-left')
                }
              },
              {
                label: 'Center Aligned',
                type: 'radio',
                checked: wState?.contentInfo?.formatting?.textAlign === 'center',
                click: () => {
                  this.sendMenuAction('align-center')
                }
              },
              {
                label: 'Right Aligned',
                type: 'radio',
                checked: wState?.contentInfo?.formatting?.textAlign === 'right',
                click: () => {
                  this.sendMenuAction('align-right')
                }
              },
              {
                label: 'Justified',
                type: 'radio',
                checked: wState?.contentInfo?.formatting?.textAlign === 'justify',
                click: () => {
                  this.sendMenuAction('align-justify')
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
            checked: wState?.contentInfo?.formatting?.inlineCode,
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
          {
            label: 'Comment',
            accelerator: 'CmdOrCtrl+/',
            click: () => {
              this.sendMenuAction('comment')
            }
          },
          { type: 'separator' },
          {
            label: 'Superscript',
            type: 'checkbox',
            checked: wState?.contentInfo?.formatting?.script === 'superscript',
            click: () => {
              this.sendMenuAction('superscript')
            }
          },
          {
            label: 'Subscript',
            type: 'checkbox',
            checked: wState?.contentInfo?.formatting?.script === 'subscript',
            click: () => {
              this.sendMenuAction('subscript')
            }
          },
          {
            label: 'Highlight',
            accelerator: 'CmdOrCtrl+Shift+H',
            type: 'checkbox',
            checked: wState?.contentInfo?.formatting?.highlight,
            click: () => {
              this.sendMenuAction('highlight')
            }
          },
          { type: 'separator' },
          {
            label: 'Inline Link',
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
              this.sendMenuAction('clear-formatting')
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
      {
        label: 'View',
        id: 'view',
        submenu: [
          {
            label: 'Focus Mode',
            accelerator: 'CmdOrCtrl+Shift+F',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-focus-mode')
            }
          },
          {
            label: 'Typewrite Mode',
            accelerator: 'CmdOrCtrl+Shift+T',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-typewrite-mode')
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
          {
            label: 'Tag',
            accelerator: 'CmdOrCtrl+Shift+3',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-tag')
            }
          },
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
            label: 'Chat',
            accelerator: 'CmdOrCtrl+Shift+5',
            click: () => {
              this.sendMenuAction('view-chat')
            }
          },
          {
            label: 'Clean Mode',
            accelerator: 'CmdOrCtrl+Shift+L',
            enabled: wState != null,
            click: () => {
              this.sendMenuAction('view-toggle-clean-mode')
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
                checked: wState?.contentInfo?.view?.leftSidebar? true : false,
                click: () => {
                  this.sendMenuAction('view-toggle-left-sidebar')
                }
              },
              {
                label: 'Right Side Bar',
                accelerator: 'CmdOrCtrl+Shift+R',
                type: 'checkbox',
                checked: wState?.contentInfo?.view?.rightSidebar? true : false,
                click: () => {
                  this.sendMenuAction('view-toggle-right-sidebar')
                }
              },
              {
                label: 'Status Bar',
                accelerator: 'CmdOrCtrl+Shift+S',
                type: 'checkbox',
                checked: wState?.contentInfo?.view?.statusbar? true : false,
                click: () => {
                  this.sendMenuAction('view-toggle-statusbar')
                }
              },
              { type: 'separator' },
              {
                label: 'Follow System',
                type: 'radio',
                checked: wState?.contentInfo?.view?.theme === 'system',
                click: () => {
                  this.sendMenuAction('view-theme-follow-system')
                }
              },
              { type: 'separator' },
              {
                label: 'Light',
                type: 'radio',
                checked: wState?.contentInfo?.view?.theme === 'light',
                click: () => {
                  this.sendMenuAction('view-theme-light')
                }
              },
              {
                id: 'dark',
                label: 'Dark',
                type: 'radio',
                checked: wState?.contentInfo?.view?.theme === 'dark',
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
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ]
      },
      { role: 'windowMenu' },
      {
        label: 'Help',
        submenu: [
          {
            label: "What's New...",
            click: () => {
              this.sendMenuAction('help-whats-new')
            }
          },
          { type: 'separator' },
          {
            label: 'Quick Start',
            click: () => {
              this.sendMenuAction('help-quick-start')
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
              this.sendMenuAction('help-markdown-reference')
            }
          },
          {
            label: 'Keyboard Shortcuts',
            click: () => {
              this.sendMenuAction('help-keyboard-shortcuts')
            }
          },
          { type: 'separator' },
          {
            label: 'Acknowledgement',
            click: () => {
              this.sendMenuAction('help-acknowledgement')
            }
          },
          {
            label: 'Changelog',
            click: () => {
              this.sendMenuAction('help-changelog')
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
      if (item.id === 'paragraph-menu' && !wState?.contentInfo?.hasActiveDocument) {
        return false
      }
      if (item.id === 'format-menu' && !wState?.contentInfo?.hasActiveDocument) {
        return false
      }
      return true
    })

    // Insert Theme items dynamically
    if (wState?.contentInfo?.view?.theme && !['system', 'light', 'dark'].includes(wState?.contentInfo?.view?.theme)) {
      let theme = wState?.contentInfo?.view?.theme
      const insertThemeItems: Electron.MenuItemConstructorOptions[] = [
        { type: 'separator' },
        {
          label: theme.charAt(0).toUpperCase() + theme.slice(1),
          type: 'radio',
          checked: true,
          click: () => {
            this.sendMenuAction(`view-theme-${theme}`)
          }
        }
      ]

      const result = insertInTemplate(baseTemplate, undefined, 'dark', insertThemeItems);
      if (result === false) {
        console.warn(`Failed to insert theme: ${theme} items into the template`);
      }
    }

    const menu = Menu.buildFromTemplate(filteredTemplate)
    Menu.setApplicationMenu(menu)
  }

  destroy(): void {
  }
}