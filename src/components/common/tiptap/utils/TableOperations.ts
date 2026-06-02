import type { Editor } from '@tiptap/core'
import { Transaction } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import { findParentNodeClosestToPos } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

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

function isCompleteHeaderRow(row: PMNode): boolean {
  if (row.childCount === 0) {
    return false
  }

  for (let cellIndex = 0; cellIndex < row.childCount; cellIndex++) {
    if (!isHeaderCell(row.child(cellIndex))) {
      return false
    }
  }

  return true
}

function hasHeaderRowInNode(tableNode: PMNode): boolean {
  return !!tableNode.firstChild && isCompleteHeaderRow(tableNode.firstChild)
}

function hasHeaderColumnInNode(tableNode: PMNode): boolean {
  if (tableNode.childCount === 0) {
    return false
  }

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
    const firstCell = tableNode.child(rowIndex).firstChild
    if (!isHeaderCell(firstCell)) {
      return false
    }
  }

  return true
}

function getCompleteHeaderColumns(tableNode: PMNode): Set<number> {
  const headerColumns = new Set<number>()
  const firstRow = tableNode.firstChild
  if (!firstRow) {
    return headerColumns
  }

  for (let columnIndex = 0; columnIndex < firstRow.childCount; columnIndex++) {
    let allRowsHaveHeaderCell = true
    for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
      const row = tableNode.child(rowIndex)
      if (!isHeaderCell(row.maybeChild(columnIndex))) {
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

export function normalizeDisplacedTableHeaders(tableNode: PMNode, options: HeaderNormalizationOptions): PMNode {
  if (!options.cancelHeaderRow && !options.cancelHeaderColumn) {
    return tableNode
  }

  const tableCellType = tableNode.type.schema.nodes.tableCell
  if (!tableCellType) {
    return tableNode
  }

  const headerRows = new Set<number>()
  const headerColumns = options.cancelHeaderColumn ? getCompleteHeaderColumns(tableNode) : new Set<number>()

  if (options.cancelHeaderRow) {
    for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
      if (isCompleteHeaderRow(tableNode.child(rowIndex))) {
        headerRows.add(rowIndex)
      }
    }
  }

  if (headerRows.size === 0 && headerColumns.size === 0) {
    return tableNode
  }

  let changed = false
  const newRows: PMNode[] = []

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
    const row = tableNode.child(rowIndex)
    const newCells: PMNode[] = []

    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex++) {
      const cell = row.child(cellIndex)
      if (isHeaderCell(cell) && (headerRows.has(rowIndex) || headerColumns.has(cellIndex))) {
        newCells.push(tableCellType.create(cell.attrs, cell.content, cell.marks))
        changed = true
      } else {
        newCells.push(cell)
      }
    }

    newRows.push(row.type.create(row.attrs, newCells, row.marks))
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
function getTableInfo(tr: Transaction) {
  const selection = tr.selection
  const pos = selection.$from.pos

  // 查找父级表格节点
  const table = findParentNodeClosestToPos(selection.$from, node => node.type.name === 'table')
  if (!table) {
    return null
  }

  const tableNode = table.node
  const tablePos = table.pos
  const map = TableMap.get(tableNode)
  
  // 计算当前光标所在的列索引
  const cellPos = pos - tablePos - 1
  let columnIndex = -1
  
  // 遍历 map 找到对应的列
  for (let i = 0; i < map.map.length; i++) {
    if (map.map[i]! <= cellPos) {
      columnIndex = i % map.width
    } else {
      break
    }
  }

  return {
    tableNode,
    tablePos,
    map,
    columnIndex,
    totalColumns: map.width
  }
}

/**
 * 重新排列行中的单元格顺序
 */
function reorderRowCells(row: PMNode, fromIndex: number, toIndex: number): PMNode[] {
  const cells = []
  
  // 收集所有单元格
  for (let i = 0; i < row.childCount; i++) {
    cells.push(row.child(i))
  }

  // 确保索引有效
  if (fromIndex < 0 || fromIndex >= cells.length || toIndex < 0 || toIndex >= cells.length) {
    return cells
  }

  // 移动单元格
  const [movedCell] = cells.splice(fromIndex, 1)
  cells.splice(toIndex, 0, movedCell!)

  return cells
}

/**
 * 重新排列 colwidth 数组中的宽度值
 */
function reorderColWidths(colwidths: number[] | null, fromIndex: number, toIndex: number): number[] | null {
  if (!colwidths || colwidths.length === 0) {
    return colwidths
  }

  const newColwidths = [...colwidths]
  if (fromIndex < newColwidths.length && toIndex < newColwidths.length) {
    const [movedWidth] = newColwidths.splice(fromIndex, 1)
    newColwidths.splice(toIndex, 0, movedWidth!)
  }

  return newColwidths
}

/**
 * 向左移动列
 */
function moveColumnLeftImpl(tr: Transaction): boolean {
  const tableInfo = getTableInfo(tr)
  if (!tableInfo) {
    return false
  }

  const { tableNode, tablePos, map, columnIndex } = tableInfo

  // 检查是否可以向左移动
  if (columnIndex <= 0) {
    return false // 已经是最左列
  }

  const targetIndex = columnIndex - 1
  const cancelHeaderColumn = hasHeaderColumnInNode(tableNode) && targetIndex === 0

  try {
    // 创建新的行
    const newRows = []
    
    for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
      const row = tableNode.child(rowIndex)
      
      // 重新排列当前行的单元格
      const reorderedCells = reorderRowCells(row, columnIndex, targetIndex)
      
      // 处理 colwidth 属性
      const updatedCells = reorderedCells.map((cell) => {
        const colwidth = cell.attrs.colwidth
        if (colwidth && Array.isArray(colwidth)) {
          const newColwidth = reorderColWidths(colwidth, columnIndex, targetIndex)
          return cell.type.create({
            ...cell.attrs,
            colwidth: newColwidth
          }, cell.content)
        }
        return cell
      })
      
      // 创建新行
      const newRow = row.type.create(row.attrs, updatedCells)
      newRows.push(newRow)
    }

    // 创建新的表格节点
    const newTable = normalizeDisplacedTableHeaders(tableNode.type.create(tableNode.attrs, newRows), {
      cancelHeaderColumn
    })
    
    // 替换表格
    tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable)
    
    // 计算新的光标位置
    const newMap = TableMap.get(newTable)
    const newCellIndex = map.map.findIndex(cellPos => {
      const currentCol = map.map.indexOf(cellPos) % map.width
      return currentCol === columnIndex
    })
    
    if (newCellIndex !== -1) {
      // 计算新位置（移动后的列索引）
      const newColIndex = targetIndex
      const newCellPos = newCellIndex - (columnIndex - newColIndex)
      const newPos = tablePos + 1 + newMap.map[newCellPos]!
      
      if (newPos >= 0) {
        const $newPos = tr.doc.resolve(newPos + 1)
        tr.setSelection(new TextSelection($newPos))
      }
    }

    return true
  } catch (error) {
    console.error('移动列失败:', error)
    return false
  }
}

/**
 * 向右移动列
 */
function moveColumnRightImpl(tr: Transaction): boolean {
  const tableInfo = getTableInfo(tr)
  if (!tableInfo) {
    return false
  }

  const { tableNode, tablePos, map, columnIndex, totalColumns } = tableInfo

  // 检查是否可以向右移动
  if (columnIndex >= totalColumns - 1) {
    return false // 已经是最右列
  }

  const targetIndex = columnIndex + 1
  const cancelHeaderColumn = hasHeaderColumnInNode(tableNode) && columnIndex === 0

  try {
    // 创建新的行
    const newRows = []
    
    for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
      const row = tableNode.child(rowIndex)
      
      // 重新排列当前行的单元格
      const reorderedCells = reorderRowCells(row, columnIndex, targetIndex)
      
      // 处理 colwidth 属性
      const updatedCells = reorderedCells.map((cell) => {
        const colwidth = cell.attrs.colwidth
        if (colwidth && Array.isArray(colwidth)) {
          const newColwidth = reorderColWidths(colwidth, columnIndex, targetIndex)
          return cell.type.create({
            ...cell.attrs,
            colwidth: newColwidth
          }, cell.content)
        }
        return cell
      })
      
      // 创建新行
      const newRow = row.type.create(row.attrs, updatedCells)
      newRows.push(newRow)
    }

    // 创建新的表格节点
    const newTable = normalizeDisplacedTableHeaders(tableNode.type.create(tableNode.attrs, newRows), {
      cancelHeaderColumn
    })
    
    // 替换表格
    tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable)
    
    // 计算新的光标位置
    const newMap = TableMap.get(newTable)
    const newCellIndex = map.map.findIndex(cellPos => {
      const currentCol = map.map.indexOf(cellPos) % map.width
      return currentCol === columnIndex
    })
    
    if (newCellIndex !== -1) {
      // 计算新位置（移动后的列索引）
      const newColIndex = targetIndex
      const newCellPos = newCellIndex + (newColIndex - columnIndex)
      const newPos = tablePos + 1 + newMap.map[newCellPos]!
      
      if (newPos >= 0) {
        const $newPos = tr.doc.resolve(newPos + 1)
        tr.setSelection(new TextSelection($newPos))
      }
    }

    return true
  } catch (error) {
    console.error('移动列失败:', error)
    return false
  }
}

/**
 * 向左移动列 - Editor 接口
 */
export function moveColumnLeft(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const { state } = editor
    const tr = state.tr
    
    if (moveColumnLeftImpl(tr)) {
      editor.view.dispatch(tr)
      return true
    }
    
    return false
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

    const { state } = editor
    const tr = state.tr
    
    if (moveColumnRightImpl(tr)) {
      editor.view.dispatch(tr)
      return true
    }
    
    return false
  } catch (error) {
    console.error('Move column right failed:', error)
    return false
  }
}

/**
 * 获取当前选择位置的行信息
 */
function getRowInfo(tr: Transaction) {
  const selection = tr.selection
  const pos = selection.$from.pos

  // 查找父级表格节点
  const table = findParentNodeClosestToPos(selection.$from, node => node.type.name === 'table')
  if (!table) {
    return null
  }

  const tableNode = table.node
  const tablePos = table.pos
  const map = TableMap.get(tableNode)
  
  // 计算当前光标所在的行索引
  const cellPos = pos - tablePos - 1
  let rowIndex = -1
  
  // 遍历 map 找到对应的行
  for (let i = 0; i < map.map.length; i++) {
    if (map.map[i]! <= cellPos) {
      rowIndex = Math.floor(i / map.width)
    } else {
      break
    }
  }

  return {
    tableNode,
    tablePos,
    map,
    rowIndex,
    totalRows: map.height
  }
}

/**
 * 向上移动行
 */
function moveRowAboveImpl(tr: Transaction): boolean {
  const rowInfo = getRowInfo(tr)
  if (!rowInfo) {
    return false
  }

  const { tableNode, tablePos, rowIndex } = rowInfo

  // 检查是否可以向上移动
  if (rowIndex <= 0) {
    return false // 已经是最上面的行
  }

  const targetIndex = rowIndex - 1
  const cancelHeaderRow = hasHeaderRowInNode(tableNode) && targetIndex === 0

  try {
    // 获取所有行
    const allRows = []
    for (let i = 0; i < tableNode.childCount; i++) {
      allRows.push(tableNode.child(i))
    }

    // 移动行
    const [movedRow] = allRows.splice(rowIndex, 1)
    allRows.splice(targetIndex, 0, movedRow!)

    // 创建新的表格节点
    const newTable = normalizeDisplacedTableHeaders(tableNode.type.create(tableNode.attrs, allRows), {
      cancelHeaderRow
    })
    
    // 替换表格
    tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable)
    
    // 计算新的光标位置
    const newMap = TableMap.get(newTable)
    // 找到移动后行中第一个单元格的位置
    const newCellIndex = targetIndex * newMap.width
    const newPos = tablePos + 1 + newMap.map[newCellIndex]!
    
    if (newPos >= 0) {
      const $newPos = tr.doc.resolve(newPos + 1)
      tr.setSelection(new TextSelection($newPos))
    }

    return true
  } catch (error) {
    console.error('移动行失败:', error)
    return false
  }
}

/**
 * 向下移动行
 */
function moveRowBelowImpl(tr: Transaction): boolean {
  const rowInfo = getRowInfo(tr)
  if (!rowInfo) {
    return false
  }

  const { tableNode, tablePos, rowIndex, totalRows } = rowInfo

  // 检查是否可以向下移动
  if (rowIndex >= totalRows - 1) {
    return false // 已经是最下面的行
  }

  const targetIndex = rowIndex + 1
  const cancelHeaderRow = hasHeaderRowInNode(tableNode) && rowIndex === 0

  try {
    // 获取所有行
    const allRows = []
    for (let i = 0; i < tableNode.childCount; i++) {
      allRows.push(tableNode.child(i))
    }

    // 移动行
    const [movedRow] = allRows.splice(rowIndex, 1)
    allRows.splice(targetIndex, 0, movedRow!)

    // 创建新的表格节点
    const newTable = normalizeDisplacedTableHeaders(tableNode.type.create(tableNode.attrs, allRows), {
      cancelHeaderRow
    })
    
    // 替换表格
    tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable)
    
    // 计算新的光标位置
    const newMap = TableMap.get(newTable)
    // 找到移动后行中第一个单元格的位置
    const newCellIndex = targetIndex * newMap.width
    const newPos = tablePos + 1 + newMap.map[newCellIndex]!
    
    if (newPos >= 0) {
      const $newPos = tr.doc.resolve(newPos + 1)
      tr.setSelection(new TextSelection($newPos))
    }

    return true
  } catch (error) {
    console.error('移动行失败:', error)
    return false
  }
}

/**
 * 向上移动行 - Editor 接口
 */
export function moveRowAbove(editor: Editor): boolean {
  try {
    if (!editor.isActive('table')) {
      return false
    }

    const { state } = editor
    const tr = state.tr
    
    if (moveRowAboveImpl(tr)) {
      editor.view.dispatch(tr)
      return true
    }
    
    return false
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

    const { state } = editor
    const tr = state.tr
    
    if (moveRowBelowImpl(tr)) {
      editor.view.dispatch(tr)
      return true
    }
    
    return false
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

    const { state } = editor
    const tr = state.tr.setTime(Date.now()) // 创建临时 transaction
    const tableInfo = getTableInfo(tr)
    
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

    const { state } = editor
    const tr = state.tr.setTime(Date.now()) // 创建临时 transaction
    const tableInfo = getTableInfo(tr)
    
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

    const { state } = editor
    const tr = state.tr.setTime(Date.now()) // 创建临时 transaction
    const rowInfo = getRowInfo(tr)
    
    if (!rowInfo) {
      return false
    }

    const { rowIndex } = rowInfo
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

    const { state } = editor
    const tr = state.tr.setTime(Date.now()) // 创建临时 transaction
    const rowInfo = getRowInfo(tr)
    
    if (!rowInfo) {
      return false
    }

    const { rowIndex, totalRows } = rowInfo
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

    const rowInfo = getRowInfo(editor.state.tr)
    const cancelHeaderRow = !!rowInfo && rowInfo.rowIndex === 0 && hasHeaderRowInNode(rowInfo.tableNode)
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

    const tableInfo = getTableInfo(editor.state.tr)
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

    const rowInfo = getRowInfo(editor.state.tr)
    const cancelHeaderRow = !!rowInfo && rowInfo.rowIndex === 0 && hasHeaderRowInNode(rowInfo.tableNode)
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

    const tableInfo = getTableInfo(editor.state.tr)
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
    const tableElement = editor.view.dom.querySelector('table')
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
    const markdownContent = convertTableToMarkdown(tableElement)

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
 * 将HTML表格转换为Markdown格式
 * @param tableElement HTML表格元素
 * @returns Markdown格式的表格字符串
 */
function convertTableToMarkdown(tableElement: HTMLTableElement): string {
  try {
    const rows: string[] = []
    const tableRows = tableElement.querySelectorAll('tr')

    let hasHeader = false
    
    tableRows.forEach((row, rowIndex) => {
      const cells: string[] = []
      const rowCells = row.querySelectorAll('td, th')
      
      // 检查是否为头部行
      const isHeaderRow = Array.from(rowCells).some(cell => cell.tagName.toLowerCase() === 'th')
      if (isHeaderRow) {
        hasHeader = true
      }

      rowCells.forEach(cell => {
        // 清理单元格内容，移除多余的空白符
        const cellContent = (cell.textContent || '').trim().replace(/\s+/g, ' ')
        cells.push(cellContent || ' ') // 空单元格用空格填充
      })

      if (cells.length > 0) {
        // 构建Markdown行
        const markdownRow = `| ${cells.join(' | ')} |`
        rows.push(markdownRow)

        // 如果是头部行，添加分隔符
        if (isHeaderRow || (rowIndex === 0 && !hasHeader)) {
          const separator = `| ${cells.map(() => '---').join(' | ')} |`
          rows.push(separator)
        }
      }
    })

    return rows.join('\n')
  } catch (error) {
    console.error('Convert table to markdown failed:', error)
    return ''
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
