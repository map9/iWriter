export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  type?: string
  data?: any
  isExpanded?: boolean
  isChecked?: boolean
  isSelected?: boolean
  isVisible?: boolean
  isEnabled?: boolean
  parent?: TreeNode
  path?: string
}

export type DropPosition = 'before' | 'after' | 'inside'
export type DropMode = 'all' | 'inside-only'

export interface TreeCallbacks {
  canCheck?: (node: TreeNode) => boolean
  canRename?: (node: TreeNode) => boolean
  canDrag?: (node: TreeNode) => boolean
  canDrop?: (dragNode: TreeNode, dropNode: TreeNode, position: DropPosition) => boolean
  canAddChild?: (node: TreeNode) => boolean
  canDelete?: (node: TreeNode) => boolean
  getExpandIcon?: (node: TreeNode) => any
  getCollapseIcon?: (node: TreeNode) => any
  getCheckIcon?: (node: TreeNode) => any
  getUnCheckIcon?: (node: TreeNode) => any
  getTypeIcon?: (node: TreeNode) => any
  getRightContent?: (node: TreeNode) => string | null
  getDefaultChildType?: (parentNode: TreeNode) => string
  getDefaultChildLabel?: (parentNode: TreeNode) => string
  onExpand?: (node: TreeNode) => void
  onCollapse?: (node: TreeNode) => void
  onCheck?: (node: TreeNode) => void
  onUnCheck?: (node: TreeNode) => void
  onSelect?: (node: TreeNode) => void
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

export interface TreeItemStyle {
  itemClass?: string
  itemStyle?: Record<string, any>
  textClass?: string
  textStyle?: Record<string, any>
}

export interface DragState {
  isDragging: boolean
  dragItem: TreeNode | null
  dragOverItem: TreeNode | null
}

export type FileTreeSortType = 'none' | 'name-asc' | 'name-desc' | 'type-asc' | 'type-desc' | 'created-asc' | 'created-desc' | 'modified-asc' | 'modified-desc'

export interface ContextMenuItem {
  label: string
  icon?: any
  action: () => void
  disabled?: boolean
  separator?: boolean
}