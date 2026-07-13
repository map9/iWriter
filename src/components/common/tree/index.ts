import type { Component } from 'vue';

export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  type?: string
  data?: unknown
  
  // 视图状态
  isExpanded?: boolean
  isVisible?: boolean
  isEnabled?: boolean
  
  // 交互状态（重新设计）
  isSelected?: boolean    // 用户选择状态，可持久，支持多选
  isFocused?: boolean     // 键盘导航焦点状态，瞬时状态，同时只能有一个
  isChecked?: boolean     // 复选框状态
  
  parent?: TreeNode
  path?: string
}

export type DropPosition = 'before' | 'after' | 'inside'
export type DropMode = 'all' | 'inside-only'
export type TreeItemClickMode = 'expand' | 'rename'

export interface TreeNodeAppearance {
  treeIconClass?: string | string[] | Record<string, boolean>
  treeIconStyle?: Record<string, string>
  treeLabelClass?: string | string[] | Record<string, boolean>
  treeLabelStyle?: Record<string, string>
  treeRowClass?: string | string[] | Record<string, boolean>
  treeRowStyle?: Record<string, string>
}

export interface TreeCallbacks {
  canCheck?: (node: TreeNode) => boolean
  canRename?: (node: TreeNode) => boolean
  canDrag?: (node: TreeNode) => boolean
  canDrop?: (dragNode: TreeNode, dropNode: TreeNode, position: DropPosition) => boolean
  canAddChild?: (node: TreeNode) => boolean
  canDelete?: (node: TreeNode) => boolean
  getExpandIcon?: (node: TreeNode) => Component | undefined
  getCollapseIcon?: (node: TreeNode) => Component | undefined
  getCheckIcon?: (node: TreeNode) => Component | undefined
  getUnCheckIcon?: (node: TreeNode) => Component | undefined
  getTypeIcon?: (node: TreeNode) => Component | undefined
  getRightContent?: (node: TreeNode) => string | null
  getNodeAppearance?: (node: TreeNode) => TreeNodeAppearance | undefined
  getDefaultChildType?: (parentNode: TreeNode) => string
  getDefaultChildLabel?: (parentNode: TreeNode) => string
  onExpand?: (node: TreeNode) => void
  onCollapse?: (node: TreeNode) => void
  onCheck?: (node: TreeNode) => void
  onUnCheck?: (node: TreeNode) => void
  onSelect?: (node: TreeNode) => void
  onDeselect?: (node: TreeNode) => void
  onFocus?: (node: TreeNode) => void
  onBlur?: (node: TreeNode) => void
  onRename?: (node: TreeNode, newName: string) => void
  onAddChild?: (parentNode: TreeNode, newChild: TreeNode) => void
  onDelete?: (node: TreeNode) => void
  onDragStart?: (node: TreeNode) => void
  onDragEnd?: (node: TreeNode) => void
  onDrop?: (dragNode: TreeNode, dropNode: TreeNode, position: DropPosition) => void
}

export interface FileTreeNode extends TreeNode {
  type: 'file' | 'folder'
  path: string
  size?: number
  isOpen?: boolean
  isHidden?: boolean
  isWritable?: boolean
  isReadonly?: boolean
  created?: Date
  modified?: Date
}

export interface FileTreeCallbacks extends TreeCallbacks {
  onCreateFile?: (parentNode: FileTreeNode, fileName: string) => void
  onCreateFolder?: (parentNode: FileTreeNode, folderName: string) => void
  onDeleteFile?: (node: FileTreeNode) => void
  onDeleteFolder?: (node: FileTreeNode) => void
  onMoveFile?: (node: FileTreeNode, newParent: FileTreeNode) => void
  onMoveFolder?: (node: FileTreeNode, newParent: FileTreeNode) => void
}

// Legacy interfaces for backward compatibility
export interface TreeOptions {
  showCheckbox?: boolean
  draggable?: boolean
  indentSize?: number
  keyField?: string
  showExpandIcon?: boolean
  showTypeIcon?: boolean
  showRightText?: boolean
  allowRename?: boolean
  allowContextMenu?: boolean
}

export interface DragState {
  isDragging: boolean
  dragItem: TreeNode | null
  dragOverItem: TreeNode | null
}

export type FileTreeSortType = 'none' | 'name-asc' | 'name-desc' | 'type-asc' | 'type-desc' | 'created-asc' | 'created-desc' | 'modified-asc' | 'modified-desc'
