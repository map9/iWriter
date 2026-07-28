import type { Editor } from '@tiptap/core'
import { findParentNodeClosestToPos } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, TextSelection } from '@tiptap/pm/state'
import { cellAround, moveTableColumn, moveTableRow, TableMap } from '@tiptap/pm/tables'
import { htmlToMarkdown } from '@/import-export/markdownSerializer'

/**
 * 表格操作工具函数
 */

interface HeaderNormalizationOptions {
  cancelHeaderRow?: boolean
  cancelHeaderColumn?: boolean
}

function isHeaderCell(cell: PMNode | null | undefined): boolean {
  return cell?.type.name === 'tableHeader'
}

function hasHeaderRowInNode(tableNode: PMNode): boolean {
  const map = TableMap.get(tableNode)
  if (map.height === 0 || map.width === 0) {
    return false
  }

  for (let columnIndex = 0; columnIndex < map.width; columnIndex++) {
    if (!isHeaderCell(tableNode.nodeAt(map.map[columnIndex]!))) {
      return false
    }
  }

  return true
}

function hasHeaderColumnInNode(tableNode: PMNode): boolean {
  const map = TableMap.get(tableNode)
  if (map.height === 0 || map.width === 0) {
    return false
  }

  for (let rowIndex = 0; rowIndex < map.height; rowIndex++) {
    if (!isHeaderCell(tableNode.nodeAt(map.map[rowIndex * map.width]!))) {
      return false
    }
  }

  return true
}

function getCompleteHeaderColumns(tableNode: PMNode): Set<number> {
  const headerColumns = new Set<number>()
  const map = TableMap.get(tableNode)

  for (let columnIndex = 0; columnIndex < map.width; columnIndex++) {
    let allRowsHaveHeaderCell = true
    for (let rowIndex = 0; rowIndex < map.height; rowIndex++) {
      if (!isHeaderCell(tableNode.nodeAt(map.map[rowIndex * map.width + columnIndex]!))) {
        allRowsHaveHeaderCell = false
        break
      }
    }

    if (allRowsHaveHeaderCell) {
      headerColumns.add(columnIndex)
    }
  }

  return headerColumns
}

function getCompleteHeaderRows(tableNode: PMNode): Set<number> {
  const headerRows = new Set<number>()
  const map = TableMap.get(tableNode)

  for (let rowIndex = 0; rowIndex < map.height; rowIndex++) {
    let allCellsAreHeaders = true
    for (let columnIndex = 0; columnIndex < map.width; columnIndex++) {
      if (!isHeaderCell(tableNode.nodeAt(map.map[rowIndex * map.width + columnIndex]!))) {
        allCellsAreHeaders = false
        break
      }
    }
    if (allCellsAreHeaders) {
      headerRows.add(rowIndex)
    }
  }

  return headerRows
}

export function normalizeDisplacedTableHeaders(tableNode: PMNode, options: HeaderNormalizationOptions): PMNode {
  if (!options.cancelHeaderRow && !options.cancelHeaderColumn) {
    return tableNode
  }

  const tableCellType = tableNode.type.schema.nodes.tableCell
  if (!tableCellType) {
    return tableNode
  }

  const map = TableMap.get(tableNode)
  const headerRows = options.cancelHeaderRow ? getCompleteHeaderRows(tableNode) : new Set<number>()
  const headerColumns = options.cancelHeaderColumn ? getCompleteHeaderColumns(tableNode) : new Set<number>()

  if (headerRows.size === 0 && headerColumns.size === 0) {
    return tableNode
  }

  const displacedHeaderCells = new Set<number>()
  for (let rowIndex = 0; rowIndex < map.height; rowIndex++) {
    for (let columnIndex = 0; columnIndex < map.width; columnIndex++) {
      if (headerRows.has(rowIndex) || headerColumns.has(columnIndex)) {
        displacedHeaderCells.add(map.map[rowIndex * map.width + columnIndex]!)
      }
    }
  }

  let changed = false
  const newRows: PMNode[] = []
  let rowOffset = 0

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
    const row = tableNode.child(rowIndex)
    const newCells: PMNode[] = []
    let cellOffset = rowOffset + 1

    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex++) {
      const cell = row.child(cellIndex)
      if (isHeaderCell(cell) && displacedHeaderCells.has(cellOffset)) {
        newCells.push(tableCellType.create(cell.attrs, cell.content, cell.marks))
        changed = true
      } else {
        newCells.push(cell)
      }
      cellOffset += cell.nodeSize
    }

    newRows.push(row.type.create(row.attrs, newCells, row.marks))
    rowOffset += row.nodeSize
  }

  return changed ? tableNode.type.create(tableNode.attrs, newRows, tableNode.marks) : tableNode
}

function normalizeCurrentTableHeaders(editor: Editor, options: HeaderNormalizationOptions): boolean {
  if (!options.cancelHeaderRow && !options.cancelHeaderColumn) {
    return true
  }

  const { state } = editor
  const table = findParentNodeClosestToPos(state.selection.$from, node => node.type.name === 'table')
  if (!table) {
    return true
  }

  const normalizedTable = normalizeDisplacedTableHeaders(table.node, options)
  if (normalizedTable === table.node) {
    return true
  }

  const tr = state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, normalizedTable)
  const safeSelectionPos = Math.min(
    Math.max(state.selection.from, table.pos + 1),
    table.pos + normalizedTable.nodeSize - 1,
    tr.doc.content.size
  )
  tr.setSelection(TextSelection.near(tr.doc.resolve(safeSelectionPos)))
  editor.view.dispatch(tr)
  return true
}

/**
 * 获取当前选择位置的表格和列信息
 */
function getTableInfo(state: EditorState) {
  const selection = state.selection

  // 查找父级表格节点
  const table = findParentNodeClosestToPos(selection.$from, node => node.type.name === 'table')
  if (!table) {
    return null
  }

  const tableNode = table.node
  const tablePos = table.pos
  const map = TableMap.get(tableNode)
  const $cell = cellAround(selection.$from)
  if (!$cell) {
    return null
  }

  const cellRect = map.findCell($cell.pos - $cell.start(-1))

  return {
    tableNode,
    tablePos,
    map,
    columnIndex: cellRect.left,
    rowIndex: cellRect.top,
    totalColumns: map.width,
    totalRows: map.height,
  }
}

function moveColumn(editor: Editor, direction: -1 | 1): boolean {
  const tableInfo = getTableInfo(editor.state)
  if (!tableInfo) {
    return false
  }

  const targetIndex = tableInfo.columnIndex + direction
  if (targetIndex < 0 || targetIndex >= tableInfo.totalColumns) {
    return false
  }

  const cancelHeaderColumn = hasHeaderColumnInNode(tableInfo.tableNode)
    && (tableInfo.columnIndex === 0 || targetIndex === 0)
  const success = moveTableColumn({
    from: tableInfo.columnIndex,
    to: targetIndex,
    pos: editor.state.selection.from,
  })(editor.state, transaction => editor.view.dispatch(transaction))

  if (success) {
    normalizeCurrentTableHeaders(editor, { cancelHeaderColumn })
  }

  return success
}

/**
 * 向左移动列 - Editor 接口
 */
export function moveColumnLeft(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }
    return moveColumn(editor, -1)
  } catch (error) {
    console.error('Move column left failed:', error)
    return false
  }
}

/**
 * 向右移动列 - Editor 接口
 */
export function moveColumnRight(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }
    return moveColumn(editor, 1)
  } catch (error) {
    console.error('Move column right failed:', error)
    return false
  }
}

function moveRow(editor: Editor, direction: -1 | 1): boolean {
  const tableInfo = getTableInfo(editor.state)
  if (!tableInfo) {
    return false
  }

  const targetIndex = tableInfo.rowIndex + direction
  if (targetIndex < 0 || targetIndex >= tableInfo.totalRows) {
    return false
  }

  const cancelHeaderRow = hasHeaderRowInNode(tableInfo.tableNode)
    && (tableInfo.rowIndex === 0 || targetIndex === 0)
  const success = moveTableRow({
    from: tableInfo.rowIndex,
    to: targetIndex,
    pos: editor.state.selection.from,
  })(editor.state, transaction => editor.view.dispatch(transaction))

  if (success) {
    normalizeCurrentTableHeaders(editor, { cancelHeaderRow })
  }

  return success
}

/**
 * 向上移动行 - Editor 接口
 */
export function moveRowAbove(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }
    return moveRow(editor, -1)
  } catch (error) {
    console.error('Move row above failed:', error)
    return false
  }
}

/**
 * 向下移动行 - Editor 接口
 */
export function moveRowBelow(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }
    return moveRow(editor, 1)
  } catch (error) {
    console.error('Move row below failed:', error)
    return false
  }
}

/**
 * 检查是否可以向左移动列
 */
export function canMoveColumnLeft(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    
    if (!tableInfo) {
      return false
    }

    const { columnIndex } = tableInfo
    return columnIndex > 0 // 不是最左列
  } catch {
    return false
  }
}

/**
 * 检查是否可以向右移动列
 */
export function canMoveColumnRight(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    
    if (!tableInfo) {
      return false
    }

    const { columnIndex, totalColumns } = tableInfo
    return columnIndex < totalColumns - 1 // 不是最右列
  } catch {
    return false
  }
}

/**
 * 检查是否可以向上移动行
 */
export function canMoveRowAbove(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    if (!tableInfo) {
      return false
    }

    const { rowIndex } = tableInfo
    return rowIndex > 0 // 不是最上行
  } catch {
    return false
  }
}

/**
 * 检查是否可以向下移动行
 */
export function canMoveRowBelow(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    if (!tableInfo) {
      return false
    }

    const { rowIndex, totalRows } = tableInfo
    return rowIndex < totalRows - 1 // 不是最下行
  } catch {
    return false
  }
}

export function addRowBefore(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    const cancelHeaderRow = !!tableInfo && tableInfo.rowIndex === 0 && hasHeaderRowInNode(tableInfo.tableNode)
    const success = editor.chain().focus().addRowBefore().run()
    if (success) {
      normalizeCurrentTableHeaders(editor, { cancelHeaderRow })
    }

    return success
  } catch (error) {
    console.error('Add row before failed:', error)
    return false
  }
}

export function addRowAfter(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    return editor.chain().focus().addRowAfter().run()
  } catch (error) {
    console.error('Add row after failed:', error)
    return false
  }
}

export function addColumnBefore(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    const cancelHeaderColumn = !!tableInfo && tableInfo.columnIndex === 0 && hasHeaderColumnInNode(tableInfo.tableNode)
    const success = editor.chain().focus().addColumnBefore().run()
    if (success) {
      normalizeCurrentTableHeaders(editor, { cancelHeaderColumn })
    }

    return success
  } catch (error) {
    console.error('Add column before failed:', error)
    return false
  }
}

export function addColumnAfter(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    return editor.chain().focus().addColumnAfter().run()
  } catch (error) {
    console.error('Add column after failed:', error)
    return false
  }
}

export function deleteRow(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    const cancelHeaderRow = !!tableInfo && tableInfo.rowIndex === 0 && hasHeaderRowInNode(tableInfo.tableNode)
    const success = editor.chain().focus().deleteRow().run()
    if (success) {
      normalizeCurrentTableHeaders(editor, { cancelHeaderRow })
    }

    return success
  } catch (error) {
    console.error('Delete row failed:', error)
    return false
  }
}

export function deleteColumn(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const tableInfo = getTableInfo(editor.state)
    const cancelHeaderColumn = !!tableInfo && tableInfo.columnIndex === 0 && hasHeaderColumnInNode(tableInfo.tableNode)
    const success = editor.chain().focus().deleteColumn().run()
    if (success) {
      normalizeCurrentTableHeaders(editor, { cancelHeaderColumn })
    }

    return success
  } catch (error) {
    console.error('Delete column failed:', error)
    return false
  }
}

/**
 * 复制整个表格到剪贴板
 * @param editor TipTap编辑器实例
 * @returns 操作是否成功
 */
export async function copyTable(editor: Editor): Promise<boolean> {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    // 获取当前表格的DOM元素
    const table = findParentNodeClosestToPos(editor.state.selection.$from, node => node.type.name === 'table')
    const tableNodeView = table ? editor.view.nodeDOM(table.pos) : null
    const tableElement = tableNodeView instanceof HTMLTableElement
      ? tableNodeView
      : tableNodeView instanceof HTMLElement
        ? tableNodeView.querySelector('table')
        : null
    if (!tableElement) {
      return false
    }

    // 创建临时容器
    const tempDiv = document.createElement('div')
    const clonedTable = tableElement.cloneNode(true) as HTMLTableElement
    tempDiv.appendChild(clonedTable)

    // 准备多种格式的内容
    const htmlContent = tempDiv.innerHTML
    const textContent = tableElement.textContent || ''
    
    // 生成Markdown格式的表格
    const markdownContent = htmlToMarkdown(htmlContent)

    // 复制到剪贴板
    if (navigator.clipboard && navigator.clipboard.write) {
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([markdownContent || textContent], { type: 'text/plain' })
      })
      await navigator.clipboard.write([clipboardItem])
    } else {
      // 降级方案
      await navigator.clipboard.writeText(markdownContent || textContent)
    }

    return true
  } catch (error) {
    console.error('Copy table failed:', error)
    return false
  }
}

/**
 * 删除整个表格
 * @param editor TipTap编辑器实例
 * @returns 操作是否成功
 */
export function deleteTable(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    // 使用TableKit提供的deleteTable命令
    return editor.chain().focus().deleteTable().run()
  } catch (error) {
    console.error('Delete table failed:', error)
    return false
  }
}

/**
 * 检查表格是否有头部行
 * @param editor TipTap编辑器实例
 * @returns 是否有头部行
 */
export function hasTableHeaderRow(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    // 使用 findParentNodeClosestToPos 查找表格节点
    const { state } = editor
    const selection = state.selection
    const table = findParentNodeClosestToPos(selection.$from, node => node.type.name === 'table')
    
    if (!table) {
      return false
    }

    const tableNode = table.node
    if (tableNode && tableNode.firstChild) {
      const firstRow = tableNode.firstChild
      if (firstRow.childCount > 0) {
        // 检查第一行的所有单元格是否都是 tableHeader
        let allHeaderCells = true
        for (let i = 0; i < firstRow.childCount; i++) {
          const cell = firstRow.child(i)
          if (cell.type.name !== 'tableHeader') {
            allHeaderCells = false
            break
          }
        }
        return allHeaderCells && firstRow.childCount > 0
      }
    }
    return false
  } catch (error) {
    console.error('Check header row failed:', error)
    return false
  }
}

/**
 * 检查表格是否有头部列
 * @param editor TipTap编辑器实例
 * @returns 是否有头部列
 */
export function hasTableHeaderColumn(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    // 使用 findParentNodeClosestToPos 查找表格节点
    const { state } = editor
    const selection = state.selection
    const table = findParentNodeClosestToPos(selection.$from, node => node.type.name === 'table')
    
    if (!table) {
      return false
    }

    const tableNode = table.node
    if (tableNode && tableNode.childCount > 0) {
      // 检查每一行的第一个单元格是否都是 tableHeader
      let allFirstCellsAreHeaders = true
      for (let i = 0; i < tableNode.childCount; i++) {
        const row = tableNode.child(i)
        if (row.childCount > 0) {
          const firstCell = row.firstChild
          if (firstCell && firstCell.type.name !== 'tableHeader') {
            allFirstCellsAreHeaders = false
            break
          }
        }
      }
      return allFirstCellsAreHeaders && tableNode.childCount > 0
    }
    return false
  } catch (error) {
    console.error('Check header column failed:', error)
    return false
  }
}

/**
 * 获取表格状态信息
 * @param editor TipTap编辑器实例
 * @returns 表格状态信息
 */
export function getTableState(editor: Editor) {
  return {
    hasHeaderRow: hasTableHeaderRow(editor),
    hasHeaderColumn: hasTableHeaderColumn(editor),
    canMoveAbove: canMoveRowAbove(editor),
    canMoveBelow: canMoveRowBelow(editor),
    canMoveLeft: canMoveColumnLeft(editor),
    canMoveRight: canMoveColumnRight(editor),
  }
}
