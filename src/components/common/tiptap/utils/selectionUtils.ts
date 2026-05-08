import type { Selection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * 选区范围接口
 */
export interface SelectionRange {
  from: number
  to: number
}

/**
 * 获取 Selection 的真实范围
 *
 * 在 ProseMirror 中，CellSelection（表格选区）的 from/to 只反映最后选中的 cell，
 * 但所有选中的 cells 信息存储在 selection.ranges 数组中。
 *
 * 这个函数会正确处理：
 * - 普通文本选区（TextSelection）
 * - 节点选区（NodeSelection）
 * - 表格选区（CellSelection）- 会遍历所有 ranges 获取完整范围
 *
 * @param selection - ProseMirror Selection 对象
 * @returns 选区的真实 from 和 to 位置
 *
 * @example
 * ```typescript
 * const { from, to } = getActualSelectionRange(editor.state.selection)
 * const text = editor.state.doc.textBetween(from, to)
 * ```
 */
export function getActualSelectionRange(selection: Selection): SelectionRange {
  // 如果选区为空，直接返回
  if (selection.empty) {
    return { from: selection.from, to: selection.to }
  }

  // 检查是否有多个 ranges（CellSelection 的标志）
  if (selection.ranges && selection.ranges.length > 1) {
    // 这是 CellSelection，需要遍历所有 ranges 获取真实范围
    let minFrom = Infinity
    let maxTo = -Infinity

    for (const range of selection.ranges) {
      minFrom = Math.min(minFrom, range.$from.pos)
      maxTo = Math.max(maxTo, range.$to.pos)
    }

    return { from: minFrom, to: maxTo }
  }

  // 普通选区或单个 cell，直接使用 from/to
  return { from: selection.from, to: selection.to }
}

/**
 * 获取选区内的文本内容
 *
 * 正确处理 CellSelection，获取所有选中 cells 的文本
 *
 * @param doc - ProseMirror Document
 * @param selection - ProseMirror Selection 对象
 * @param separator - 文本片段之间的分隔符，默认为空字符串
 * @returns 选区内的文本内容
 */
export function getSelectionText(
  doc: ProseMirrorNode,
  selection: Selection,
  separator: string = ''
): string {
  if (selection.empty) {
    return ''
  }

  const { from, to } = getActualSelectionRange(selection)
  return doc.textBetween(from, to, separator)
}

/**
 * 获取选区的字符数
 *
 * 正确处理 CellSelection，统计所有选中 cells 的字符数
 *
 * @param selection - ProseMirror Selection 对象
 * @returns 选区的字符数
 */
export function getSelectionCharCount(selection: Selection): number {
  if (selection.empty) {
    return 0
  }

  const { from, to } = getActualSelectionRange(selection)
  return to - from
}
