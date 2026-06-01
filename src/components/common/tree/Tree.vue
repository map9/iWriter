<template>
  <div 
    ref="treeRoot" 
    class="tree-root" 
    :class="{
      'drag-over-root': isDragOverRoot && canDropToRoot,
    }"
    :data-has-focused-node="hasFocusedNode"
    tabindex="0"
    @keydown="handleKeyDown"
    @click="handleTreeRootClick"
    @focus="handleTreeFocus"
    @blur="handleTreeBlur"
    @dragover.prevent="handleRootDragOver"
    @dragleave="handleRootDragLeave"
    @drop="handleRootDrop"
  >
    <TreeNode
      v-for="node in visibleNodes"
      :key="node.id"
      :ref="(el: any) => setNodeRef(node.id, el)"
      :node="node"
      :callbacks="callbacks"
      :initialDepth="initialDepth"
      :drop-mode="dropMode"
      :item-click-mode="itemClickMode"
      @node-click="(data: any) => handleNodeClick(data.node, data.event)"
      @node-check="handleNodeCheck"
      @node-rename="handleNodeRename"
      @node-drag="handleNodeDrag"
      @node-drop="handleNodeDrop"
      @node-contextmenu="handleNodeContextMenu"
      @node-ref="setNodeRef"
      @first-level-fallback="handleFirstLevelFallback"
    />
  </div>
</template>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import type { TreeNode as TreeNodeType, TreeCallbacks, DropMode, TreeItemClickMode } from './index'
import TreeNode from './TreeNode.vue'
import { dragDropState } from './drag-drop.ts'

interface Props {
  nodes: TreeNodeType[]
  callbacks?: TreeCallbacks
  dropMode?: DropMode
  initialDepth?: number
  multiSelectable?: boolean
  itemClickMode?: TreeItemClickMode
}

interface Emits {
  // 基础交互事件
  (e: 'node-click', node: TreeNodeType): void
  (e: 'node-check', node: TreeNodeType): void
  (e: 'node-rename', data: { node: TreeNodeType; newName: string }): void
  (e: 'node-add-child', data: { parentNode: TreeNodeType; newChild: TreeNodeType }): void
  (e: 'node-delete', node: TreeNodeType): void
  (e: 'node-contextmenu', data: { node: TreeNodeType; event: MouseEvent }): void
  
  // 选择相关事件
  (e: 'node-select', node: TreeNodeType): void
  (e: 'node-deselect', node: TreeNodeType): void
  (e: 'selection-changed', nodes: TreeNodeType[]): void
  
  // 焦点相关事件
  (e: 'node-focus', node: TreeNodeType): void
  (e: 'node-blur', node: TreeNodeType): void
  (e: 'tree-focus'): void
  (e: 'tree-blur'): void
  
  // 拖拽事件
  (e: 'node-drag', node: TreeNodeType): void
  (e: 'node-drop', data: { dragNode: TreeNodeType; dropNode: TreeNodeType; position: 'before' | 'after' | 'inside' }): void
}

const props = withDefaults(defineProps<Props>(), {
  dropMode: 'all',
  initialDepth: 0,
  multiSelectable: false,
  itemClickMode: 'rename',
})
const emit = defineEmits<Emits>()

const draggedNode = ref<TreeNodeType | null>(null)
type TreeNodeComponent = typeof TreeNode;
const nodeRefs = ref(new Map<string, TreeNodeComponent>())
const treeRoot = ref<HTMLElement>()
const autoScrollTimer = ref<ReturnType<typeof setInterval> | null>(null)

// 新的状态管理系统
const focusedNodeId = ref<string | null>(null)         // 当前焦点节点ID
const selectedNodeIds = ref<Set<string>>(new Set())    // 选中节点ID集合
const multiSelectMode = ref(false)                     // 多选模式
const lastSelectedNodeId = ref<string | null>(null)    // 用于范围选择的最后选择节点

// 拖拽相关
const isDragOverRoot = ref(false)
const canDropToRoot = ref(false)
const rootDragTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const visibleNodes = computed(() => {
  return props.nodes.filter(node => node.isVisible !== false)
})

// 检查是否有节点获得焦点
const hasFocusedNode = computed(() => {
  return focusedNodeId.value !== null
})

// Get all currently visible nodes in a flat array for keyboard navigation
const flatVisibleNodes = computed(() => {
  const flatNodes: TreeNodeType[] = []
  
  const addNodeRecursive = (node: TreeNodeType) => {
    if (node.isVisible !== false) {
      flatNodes.push(node)
      if (node.isExpanded && node.children) {
        node.children.forEach(addNodeRecursive)
      }
    }
  }
  
  props.nodes.forEach(addNodeRecursive)
  return flatNodes
})

// Get root node by traversing up from any child node
const getRootNode = (): TreeNodeType | null => {
  if (props.nodes.length === 0) return null

  // Try to get root from any node's parent chain
  let current = props.nodes[0]!
  while (current.parent) {
    current = current.parent
  }

  // Verify this is actually a different node (not just a top-level node without parent)
  return current.parent === undefined ? current : null
}

const setNodeRef = (nodeId: string, el: unknown) => {
  if (el) {
    nodeRefs.value.set(nodeId, el as TreeNodeComponent)
  } else {
    nodeRefs.value.delete(nodeId)
  }
}

// 处理tree根节点点击（空白区域点击）
const handleTreeRootClick = (e: MouseEvent) => {
  // 只有点击的是tree-root本身（空白区域）才清除焦点和选择
  if (e.target === treeRoot.value) {
    // 清除焦点状态
    setFocusedNode(null)
    
    // 设置树组件获得焦点（支持键盘导航）
    treeRoot.value?.focus()
  }
}

// 处理Tree组件获得焦点
const handleTreeFocus = () => {
  emit('tree-focus')
}

// 处理Tree组件失去焦点
const handleTreeBlur = () => {
  // 当Tree失去焦点时，清除所有TreeNode的焦点状态
  setFocusedNode(null)
  emit('tree-blur')
}

// 新的鼠标点击处理逻辑
const handleNodeClick = (node: TreeNodeType, event?: MouseEvent) => {
  // 设置焦点到点击的节点
  setFocusedNode(node.id)
  
  if (event && props.multiSelectable) {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + 点击：切换选择状态，进入多选模式（仅当支持多选时）
      multiSelectMode.value = true
      toggleNodeSelection(node.id)
    } else if (event.shiftKey) {
      // Shift + 点击：范围选择（仅当支持多选时）
      if (lastSelectedNodeId.value && multiSelectMode.value) {
        selectRange(lastSelectedNodeId.value, node.id)
      } else {
        // 如果没有上次选择的节点，就单选
        clearAllSelections()
        selectNode(node.id)
        multiSelectMode.value = false
      }
    } else {
      // 普通点击：单选，退出多选模式
      clearAllSelections()
      selectNode(node.id)
      multiSelectMode.value = false
    }
  } else {
    // 不支持多选时或没有事件信息时的默认行为：单选
    clearAllSelections()
    selectNode(node.id)
    multiSelectMode.value = false
  }
  
  emit('node-click', node)
  
  // 发送选择变更事件
  const selectedNodes = getSelectedNodes()
  emit('selection-changed', selectedNodes)
}

const handleNodeCheck = (node: TreeNodeType) => {
  emit('node-check', node)
}

const handleNodeRename = (data: { node: TreeNodeType; newName: string }) => {
  emit('node-rename', data)
}

const handleNodeDrag = (node: TreeNodeType) => {
  draggedNode.value = node
  emit('node-drag', node)
}

const handleNodeDrop = (data: { dragNode: TreeNodeType; dropNode: TreeNodeType; position: 'before' | 'after' | 'inside' }) => {
  // Use the stored dragged node if available
  if (draggedNode.value) {
    const actualData = {
      ...data,
      dragNode: draggedNode.value
    }
    
    // Check if drop is allowed
    if (props.callbacks?.canDrop?.(actualData.dragNode, actualData.dropNode, actualData.position)) {
      props.callbacks?.onDrop?.(actualData.dragNode, actualData.dropNode, actualData.position)
      emit('node-drop', actualData)
    }
  }
  
  draggedNode.value = null
  props.callbacks?.onDragEnd?.(data.dragNode)
}

const handleNodeContextMenu = (data: { node: TreeNodeType; event: MouseEvent }) => {
  emit('node-contextmenu', data)
}

const handleFirstLevelFallback = (data: { enabled: boolean, nodeId: string }) => {
  // 清除之前的延迟重置
  if (rootDragTimeout.value) {
    clearTimeout(rootDragTimeout.value)
    rootDragTimeout.value = null
  }
  
  if (data.enabled) {
    // 立即启用根区域拖拽
    const globalDraggedNode = dragDropState.getDraggedNode()
    const rootNode = getRootNode()
    if (globalDraggedNode && rootNode && props.callbacks?.canDrop) {
      canDropToRoot.value = props.callbacks.canDrop(globalDraggedNode, rootNode, 'inside')
      isDragOverRoot.value = canDropToRoot.value
    }
  } else {
    // 延迟重置，避免快速切换时的闪动
    rootDragTimeout.value = setTimeout(() => {
      isDragOverRoot.value = false
      canDropToRoot.value = false
      rootDragTimeout.value = null
    }, 100)
  }
}

// Helper methods for external access
const expandAll = () => {
  const expandRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        node.isExpanded = true
        expandRecursive(node.children)
      }
    })
  }
  expandRecursive(props.nodes)
}

const collapseAll = () => {
  const collapseRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      node.isExpanded = false
      if (node.children && node.children.length > 0) {
        collapseRecursive(node.children)
      }
    })
  }
  collapseRecursive(props.nodes)
}

const checkAll = () => {
  const checkRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      if (props.callbacks?.canCheck?.(node)) {
        node.isChecked = true
      }
      if (node.children && node.children.length > 0) {
        checkRecursive(node.children)
      }
    })
  }
  checkRecursive(props.nodes)
}

const uncheckAll = () => {
  const uncheckRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      node.isChecked = false
      if (node.children && node.children.length > 0) {
        uncheckRecursive(node.children)
      }
    })
  }
  uncheckRecursive(props.nodes)
}

const findNode = (id: string): TreeNodeType | null => {
  const findRecursive = (nodes: TreeNodeType[]): TreeNodeType | null => {
    for (const node of nodes) {
      if (node.id === id) {
        return node
      }
      if (node.children && node.children.length > 0) {
        const found = findRecursive(node.children)
        if (found) return found
      }
    }
    return null
  }
  return findRecursive(props.nodes)
}

// selectNode方法已在上面重新定义，这里移除重复定义

const scrollNodeIntoView = (nodeId: string) => {
  const nodeRef = nodeRefs.value.get(nodeId)
  if (nodeRef && nodeRef.nodeContentRef && treeRoot.value) {
    // Use the nodeContentRef directly from TreeNode - much more efficient than querySelector
    const nodeContentElement = nodeRef.nodeContentRef
    
    const containerRect = treeRoot.value.getBoundingClientRect()
    const nodeContentRect = nodeContentElement.getBoundingClientRect()
    
    // Check if node content is outside the visible area
    const isAbove = nodeContentRect.top < containerRect.top
    const isBelow = nodeContentRect.bottom > containerRect.bottom
    
    if (isAbove || isBelow) {
      nodeContentElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      })
    }
  }
}

const getSelectedNode = (): TreeNodeType | null => {
  const findSelectedRecursive = (nodes: TreeNodeType[]): TreeNodeType | null => {
    for (const node of nodes) {
      if (node.isSelected) {
        return node
      }
      if (node.children && node.children.length > 0) {
        const found = findSelectedRecursive(node.children)
        if (found) return found
      }
    }
    return null
  }
  return findSelectedRecursive(props.nodes)
}

// Generate unique ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9)
}

// Generate unique label to avoid duplicates in the same parent
const generateUniqueLabel = (baseLabel: string, parentNode: TreeNodeType): string => {
  if (!parentNode.children || parentNode.children.length === 0) {
    return baseLabel
  }
  
  const existingLabels = new Set(parentNode.children.map(child => child.label))
  
  // If base label is unique, use it
  if (!existingLabels.has(baseLabel)) {
    return baseLabel
  }
  
  // Extract base name and extension if it's a file-like name
  let baseName = baseLabel
  let extension = ''
  
  const lastDotIndex = baseLabel.lastIndexOf('.')
  if (lastDotIndex > 0 && lastDotIndex < baseLabel.length - 1) {
    baseName = baseLabel.substring(0, lastDotIndex)
    extension = baseLabel.substring(lastDotIndex)
  }
  
  // Find available number
  let counter = 1
  let newLabel = `${baseName}-${counter.toString().padStart(2, '0')}${extension}`
  
  while (existingLabels.has(newLabel)) {
    counter++
    newLabel = `${baseName}-${counter.toString().padStart(2, '0')}${extension}`
  }
  
  return newLabel
}

const addChildToNode = (parentNode: TreeNodeType): TreeNodeType => {
  // Get default values from callbacks
  const defaultType = props.callbacks?.getDefaultChildType?.(parentNode) || 'item'
  const baseLabel = props.callbacks?.getDefaultChildLabel?.(parentNode) || 'New Item'
  
  // Generate unique label to avoid duplicates
  const uniqueLabel = generateUniqueLabel(baseLabel, parentNode)
  
  // Create new child node
  const newChild: TreeNodeType = {
    id: generateId(),
    label: uniqueLabel,
    type: defaultType,
    parent: parentNode,
    isSelected: false,
    isVisible: true,
    isEnabled: true,
    children: []
  }
  
  // Add to parent's children
  if (!parentNode.children) {
    parentNode.children = []
  }
  parentNode.children.push(newChild)
  
  // Expand parent to show new child
  parentNode.isExpanded = true
  
  // Call callback
  props.callbacks?.onAddChild?.(parentNode, newChild)
  
  // Emit event
  emit('node-add-child', { parentNode, newChild })
  
  // Trigger rename mode after a short delay to ensure DOM is updated
  nextTick(() => {
    startRenameNode(newChild.id)
  })
  
  return newChild
}

const startRenameNode = (nodeId: string) => {
  // Try multiple times to find the node ref, as it might take a moment for the DOM to update
  const attemptRename = (attempt = 0) => {
    const nodeRef = nodeRefs.value.get(nodeId)
    if (nodeRef && nodeRef.startRename) {
      nodeRef.startRename()
      return true
    }
    
    // Try again after a short delay (up to 5 attempts with increasing delay)
    if (attempt < 5) {
      setTimeout(() => attemptRename(attempt + 1), 50 * (attempt + 1))
    }
    return false
  }
  
  attemptRename()
}

const deleteNode = (nodeToDelete: TreeNodeType): boolean => {
  if (!nodeToDelete.parent) {
    // Delete root node
    const index = props.nodes.findIndex(node => node.id === nodeToDelete.id)
    if (index > -1) {
      props.nodes.splice(index, 1)
      props.callbacks?.onDelete?.(nodeToDelete)
      emit('node-delete', nodeToDelete)
      return true
    }
  } else {
    // Delete child node
    const parent = nodeToDelete.parent
    if (parent.children) {
      const index = parent.children.findIndex(child => child.id === nodeToDelete.id)
      if (index > -1) {
        parent.children.splice(index, 1)
        props.callbacks?.onDelete?.(nodeToDelete)
        emit('node-delete', nodeToDelete)
        return true
      }
    }
  }
  return false
}

// 重构的键盘导航 - 分离焦点移动和选择操作
const handleKeyDown = (e: KeyboardEvent) => {
  if (!treeRoot.value) return
  
  // Don't handle keyboard events if user is typing in an input or any input has focus
  const target = e.target as HTMLElement
  if (target?.tagName === 'INPUT' || target?.closest('input')) return
  
  const currentFocusedNode = getFocusedNode()
  const flatNodes = flatVisibleNodes.value
  
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      if (e.shiftKey && props.multiSelectable && multiSelectMode.value && lastSelectedNodeId.value) {
        // Shift + 上箭头：扩展选择到上一个节点（仅当支持多选时）
        const currentIndex = flatNodes.findIndex(node => node.id === (currentFocusedNode?.id || ''))
        if (currentIndex > 0) {
          const targetNode = flatNodes[currentIndex - 1]!
          setFocusedNode(targetNode.id)
          selectRange(lastSelectedNodeId.value, targetNode.id)
        }
      } else {
        // 普通上箭头：移动焦点
        navigateUp(flatNodes, currentFocusedNode)
      }
      break
    case 'ArrowDown':
      e.preventDefault()
      if (e.shiftKey && props.multiSelectable && multiSelectMode.value && lastSelectedNodeId.value) {
        // Shift + 下箭头：扩展选择到下一个节点（仅当支持多选时）
        const currentIndex = flatNodes.findIndex(node => node.id === (currentFocusedNode?.id || ''))
        if (currentIndex >= 0 && currentIndex < flatNodes.length - 1) {
          const targetNode = flatNodes[currentIndex + 1]!
          setFocusedNode(targetNode.id)
          selectRange(lastSelectedNodeId.value, targetNode.id)
        }
      } else {
        // 普通下箭头：移动焦点
        navigateDown(flatNodes, currentFocusedNode)
      }
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (currentFocusedNode && currentFocusedNode.isEnabled) {
        collapseNode(currentFocusedNode)
      }
      break
    case 'ArrowRight':
      e.preventDefault()
      if (currentFocusedNode && currentFocusedNode.isEnabled) {
        expandNode(currentFocusedNode)
      }
      break
    case 'Enter':
      e.preventDefault()
      if (currentFocusedNode && currentFocusedNode.isEnabled) {
        startRenameNode(currentFocusedNode.id)
      }
      break
    case ' ': // 空格键
      e.preventDefault()
      if (currentFocusedNode) {
        if ((e.ctrlKey || e.metaKey) && props.multiSelectable) {
          // Ctrl/Cmd + 空格：切换选择状态（仅当支持多选时）
          multiSelectMode.value = true
          toggleNodeSelection(currentFocusedNode.id)
        } else {
          // 普通空格：单选当前焦点节点
          clearAllSelections()
          selectNode(currentFocusedNode.id)
          multiSelectMode.value = false
        }
        
        // 发送选择变更事件
        const selectedNodes = getSelectedNodes()
        emit('selection-changed', selectedNodes)
      }
      break
    case 'Escape':
      e.preventDefault()
      // ESC：清除所有选择，退出多选模式
      clearAllSelections()
      multiSelectMode.value = false
      break
  }
}

const navigateUp = (flatNodes: TreeNodeType[], currentNode: TreeNodeType | null) => {
  if (flatNodes.length === 0) return
  
  if (!currentNode) {
    // No current focus, focus on last node
    setFocusedNode(flatNodes[flatNodes.length - 1]!.id)
    return
  }
  
  const currentIndex = flatNodes.findIndex(node => node.id === currentNode.id)
  if (currentIndex > 0) {
    setFocusedNode(flatNodes[currentIndex - 1]!.id)
  }
}

const navigateDown = (flatNodes: TreeNodeType[], currentNode: TreeNodeType | null) => {
  if (flatNodes.length === 0) return
  
  if (!currentNode) {
    // No current focus, focus on first node
    setFocusedNode(flatNodes[0]!.id)
    return
  }
  
  const currentIndex = flatNodes.findIndex(node => node.id === currentNode.id)
  if (currentIndex >= 0 && currentIndex < flatNodes.length - 1) {
    setFocusedNode(flatNodes[currentIndex + 1]!.id)
  }
}

const expandNode = (node: TreeNodeType) => {
  if (node.children && node.children.length > 0 && !node.isExpanded) {
    node.isExpanded = true
    props.callbacks?.onExpand?.(node)
  }
}

const collapseNode = (node: TreeNodeType) => {
  if (node.children && node.children.length > 0 && node.isExpanded) {
    node.isExpanded = false
    props.callbacks?.onCollapse?.(node)
  }
}

// 焦点管理方法
const setFocusedNode = (nodeId: string | null) => {
  const previousFocused = focusedNodeId.value ? findNode(focusedNodeId.value) : null
  if (previousFocused) {
    previousFocused.isFocused = false
    props.callbacks?.onBlur?.(previousFocused)
    emit('node-blur', previousFocused)
  }
  
  focusedNodeId.value = nodeId
  if (nodeId) {
    const node = findNode(nodeId)
    if (node) {
      node.isFocused = true
      props.callbacks?.onFocus?.(node)
      emit('node-focus', node)
      
      // Scroll into view
      nextTick(() => {
        scrollNodeIntoView(nodeId)
      })
    }
  }
}

const getFocusedNode = (): TreeNodeType | null => {
  return focusedNodeId.value ? findNode(focusedNodeId.value) : null
}

// 选择管理方法
const selectNode = (nodeId: string, clearOthers: boolean = true) => {
  if (clearOthers) {
    clearAllSelections()
  }
  
  const node = findNode(nodeId)
  if (node && !node.isSelected) {
    node.isSelected = true
    selectedNodeIds.value.add(nodeId)
    lastSelectedNodeId.value = nodeId
    
    props.callbacks?.onSelect?.(node)
    emit('node-select', node)
  }
}

const deselectNode = (nodeId: string) => {
  const node = findNode(nodeId)
  if (node && node.isSelected) {
    node.isSelected = false
    selectedNodeIds.value.delete(nodeId)
    
    if (lastSelectedNodeId.value === nodeId) {
      lastSelectedNodeId.value = null
    }
    
    props.callbacks?.onDeselect?.(node)
    emit('node-deselect', node)
  }
}

const toggleNodeSelection = (nodeId: string) => {
  const node = findNode(nodeId)
  if (node) {
    if (node.isSelected) {
      deselectNode(nodeId)
    } else {
      selectNode(nodeId, false) // Don't clear others when toggling
    }
  }
}

const clearAllSelections = () => {
  const selectedNodes: TreeNodeType[] = []
  
  // Clear all selected states
  const clearRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      if (node.isSelected) {
        node.isSelected = false
        selectedNodes.push(node)
      }
      if (node.children && node.children.length > 0) {
        clearRecursive(node.children)
      }
    })
  }
  
  clearRecursive(props.nodes)
  selectedNodeIds.value.clear()
  lastSelectedNodeId.value = null
  
  // Emit events for all deselected nodes
  selectedNodes.forEach(node => {
    props.callbacks?.onDeselect?.(node)
    emit('node-deselect', node)
  })
  
  if (selectedNodes.length > 0) {
    emit('selection-changed', [])
  }
}

const selectRange = (startNodeId: string, endNodeId: string) => {
  const flatNodes = flatVisibleNodes.value
  const startIndex = flatNodes.findIndex(node => node.id === startNodeId)
  const endIndex = flatNodes.findIndex(node => node.id === endNodeId)
  
  if (startIndex === -1 || endIndex === -1) return
  
  const minIndex = Math.min(startIndex, endIndex)
  const maxIndex = Math.max(startIndex, endIndex)
  
  // Clear existing selections
  clearAllSelections()
  
  // Select range
  for (let i = minIndex; i <= maxIndex; i++) {
    selectNode(flatNodes[i]!.id, false)
  }
  
  // Emit selection changed event
  const selectedNodes = flatNodes.slice(minIndex, maxIndex + 1)
  emit('selection-changed', selectedNodes)
}

const getSelectedNodes = (): TreeNodeType[] => {
  const selectedNodes: TreeNodeType[] = []
  
  const findSelectedRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      if (node.isSelected) {
        selectedNodes.push(node)
      }
      if (node.children && node.children.length > 0) {
        findSelectedRecursive(node.children)
      }
    })
  }
  
  findSelectedRecursive(props.nodes)
  return selectedNodes
}

// 重构的focusNode方法 - 现在只处理焦点，不自动选择
const focusNode = (node: TreeNodeType) => {
  setFocusedNode(node.id)
}

// Handle drag over root area (empty space in tree)
const handleRootDragOver = (e: DragEvent) => {
  // Only handle direct tree root events (empty space)
  if (e.target !== treeRoot.value) return

  // Get the dragged node from global state
  const globalDraggedNode = dragDropState.getDraggedNode()
  if (!globalDraggedNode) return
  
  // Get root node to check if drop is allowed
  const rootNode = getRootNode()

  if (!rootNode) {
    canDropToRoot.value = false
    return
  }

  // 清除延迟重置，因为我们现在在空白区域
  if (rootDragTimeout.value) {
    clearTimeout(rootDragTimeout.value)
    rootDragTimeout.value = null
  }
  
  // Check if drop is allowed using the callbacks
  if (props.callbacks?.canDrop) {
    canDropToRoot.value = props.callbacks.canDrop(globalDraggedNode, rootNode, 'inside')
  } else {
    canDropToRoot.value = false
  }
  
  isDragOverRoot.value = canDropToRoot.value
  
  if (canDropToRoot.value) {
    e.dataTransfer!.dropEffect = 'copy'
  } else {
    e.dataTransfer!.dropEffect = 'none'
  }
}

const handleRootDragLeave = (e: DragEvent) => {
  // Check if we're really leaving the tree root
  const target = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement
  
  // If we're moving to a child element, don't reset the state
  if (relatedTarget && target.contains(relatedTarget)) {
    return
  }
  
  // 使用延迟重置，避免快速切换时的闪动
  if (rootDragTimeout.value) {
    clearTimeout(rootDragTimeout.value)
  }
  
  rootDragTimeout.value = setTimeout(() => {
    isDragOverRoot.value = false
    canDropToRoot.value = false
    rootDragTimeout.value = null
  }, 100)
}

const handleRootDrop = (_e: DragEvent) => {
  // Only handle if drop is allowed
  if (!canDropToRoot.value) return
  
  const globalDraggedNode = dragDropState.getDraggedNode()
  const rootNode = getRootNode()
  
  if (!globalDraggedNode || !rootNode) return
  
  // 清除延迟重置定时器
  if (rootDragTimeout.value) {
    clearTimeout(rootDragTimeout.value)
    rootDragTimeout.value = null
  }
  
  // Reset states
  isDragOverRoot.value = false
  canDropToRoot.value = false
  
  // Emit the drop event
  emit('node-drop', {
    dragNode: globalDraggedNode,
    dropNode: rootNode,
    position: 'inside'
  })
  
  // Call callback if available
  if (props.callbacks?.onDrop) {
    props.callbacks.onDrop(globalDraggedNode, rootNode, 'inside')
  }
  
  // End the drag operation
  dragDropState.endDrag()
}

// Global drag auto-scroll functionality
const handleGlobalDragOver = (e: DragEvent) => {
  // Only handle if there's an active drag state
  if (!dragDropState.isDragging.value || !treeRoot.value) return
  
  e.preventDefault() // Prevent default to allow drop
  
  const containerRect = treeRoot.value.getBoundingClientRect()
  const mouseY = e.clientY
  
  // Clear existing timer
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
    autoScrollTimer.value = null
  }
  
  let scrollDirection = 0 // -1 for up, 1 for down, 0 for no scroll
  let scrollSpeed = 0
  
  // Check if mouse is above the tree container
  if (mouseY < containerRect.top && treeRoot.value.scrollTop > 0) {
    scrollDirection = -1
    const distanceAbove = containerRect.top - mouseY
    // Base speed 5px, increase by distance (max 50px per interval)
    scrollSpeed = Math.min(50, 5 + Math.floor(distanceAbove / 10))
  }
  // Check if mouse is below the tree container
  else if (mouseY > containerRect.bottom && 
           treeRoot.value.scrollTop < treeRoot.value.scrollHeight - treeRoot.value.clientHeight) {
    scrollDirection = 1
    const distanceBelow = mouseY - containerRect.bottom
    // Base speed 5px, increase by distance (max 50px per interval)
    scrollSpeed = Math.min(50, 5 + Math.floor(distanceBelow / 10))
  }
  
  // Start auto-scroll if needed
  if (scrollDirection !== 0 && scrollSpeed > 0) {
    autoScrollTimer.value = setInterval(() => {
      if (!treeRoot.value) return
      
      if (scrollDirection === -1) {
        // Scroll up
        treeRoot.value.scrollTop = Math.max(0, treeRoot.value.scrollTop - scrollSpeed)
        if (treeRoot.value.scrollTop === 0) {
          clearInterval(autoScrollTimer.value!)
          autoScrollTimer.value = null
        }
      } else {
        // Scroll down
        const maxScroll = treeRoot.value.scrollHeight - treeRoot.value.clientHeight
        treeRoot.value.scrollTop = Math.min(maxScroll, treeRoot.value.scrollTop + scrollSpeed)
        if (treeRoot.value.scrollTop === maxScroll) {
          clearInterval(autoScrollTimer.value!)
          autoScrollTimer.value = null
        }
      }
    }, 50) // 50ms interval for smooth scrolling
  }
}

const handleGlobalDragEnd = () => {
  // Clear auto-scroll timer when drag ends
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
    autoScrollTimer.value = null
  }
  
  // Clear root drag timeout
  if (rootDragTimeout.value) {
    clearTimeout(rootDragTimeout.value)
    rootDragTimeout.value = null
  }
  
  // Clear all root drag states
  isDragOverRoot.value = false
  canDropToRoot.value = false
  
  // Clear global drag state
  dragDropState.endDrag()
}

// Add global event listeners
onMounted(() => {
  document.addEventListener('dragover', handleGlobalDragOver)
  document.addEventListener('dragend', handleGlobalDragEnd)
  document.addEventListener('drop', handleGlobalDragEnd)
  
  // Initialize focus on first visible node if no node is selected
  nextTick(() => {
    const selectedNode = getSelectedNode()
    if (!selectedNode && flatVisibleNodes.value.length > 0) {
      focusedNodeId.value = flatVisibleNodes.value[0]!.id
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('dragover', handleGlobalDragOver)
  document.removeEventListener('dragend', handleGlobalDragEnd)
  document.removeEventListener('drop', handleGlobalDragEnd)
  
  // Clean up timer
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
    autoScrollTimer.value = null
  }
})

defineExpose({
  // 展开/折叠
  expandAll,
  collapseAll,
  
  // 复选框
  checkAll,
  uncheckAll,
  
  // 节点查找
  findNode,
  
  // 选择管理
  clearAllSelections,
  selectNode,
  deselectNode,
  toggleNodeSelection,
  selectRange,
  getSelectedNode,
  getSelectedNodes,
  
  // 焦点管理
  setFocusedNode,
  getFocusedNode,
  focusNode, // 兼容性
  
  // 节点操作
  addChildToNode,
  deleteNode,
  startRenameNode,
  scrollNodeIntoView
})
</script>

<style scoped>
.tree-root {
  height: 100%;
  overflow-y: auto;
  background: var(--tree-container-background, transparent);
  border: var(--tree-container-border, none);
  border-radius: var(--tree-container-border-radius, 0px);
  padding: var(--tree-container-padding, 0px);
  outline: var(--tree-container-outline, none);
}

.tree-root:focus {
  outline: none;
}

.tree-root:focus:not([data-has-focused-node="true"]) {
  outline: var(--tree-focus-outline, 2px solid color-mix(in oklab, var(--color-primary) 45%, transparent));
  outline-offset: var(--tree-focus-outline-offset, -2px);
}

.tree-root.drag-over-root {
  background-color: var(--tree-drop-background, color-mix(in oklab, var(--color-success) 18%, transparent));
  border-color: var(--tree-drop-border-color, color-mix(in oklab, var(--color-success) 60%, transparent));
  outline: var(--tree-focus-outline, 2px solid color-mix(in oklab, var(--color-primary) 45%, transparent));
  outline-offset: var(--tree-focus-outline-offset, -2px);
}

</style>
