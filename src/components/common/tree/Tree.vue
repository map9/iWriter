<template>
  <div 
    ref="treeRoot" 
    class="tree-root" 
    :class="{ 'drag-over-root': isDragOverRoot && canDropToRoot }"
    tabindex="0"
    @keydown="handleKeyDown"
    @click="() => treeRoot?.focus()"
    @dragover.prevent="handleRootDragOver"
    @dragleave="handleRootDragLeave"
    @drop="handleRootDrop"
  >
    <TreeNode
      v-for="node in visibleNodes"
      :key="node.id"
      :ref="el => setNodeRef(node.id, el)"
      :node="node"
      :callbacks="callbacks"
      :initialDepth="initialDepth"
      :drop-mode="dropMode"
      @node-click="handleNodeClick"
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
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import TreeNode from './TreeNode.vue'
import type { TreeNode as TreeNodeType, TreeCallbacks, DropMode } from './tree'
import { dragDropState } from './dragDrop'

interface Props {
  nodes: TreeNodeType[]
  callbacks?: TreeCallbacks
  dropMode?: DropMode
  initialDepth?: number
}

interface Emits {
  (e: 'node-click', node: TreeNodeType): void
  (e: 'node-check', node: TreeNodeType): void
  (e: 'node-select', node: TreeNodeType): void
  (e: 'node-rename', data: { node: TreeNodeType; newName: string }): void
  (e: 'node-add-child', data: { parentNode: TreeNodeType; newChild: TreeNodeType }): void
  (e: 'node-delete', node: TreeNodeType): void
  (e: 'node-drag', node: TreeNodeType): void
  (e: 'node-drop', data: { dragNode: TreeNodeType; dropNode: TreeNodeType; position: 'before' | 'after' | 'inside' }): void
  (e: 'node-contextmenu', data: { node: TreeNodeType; event: MouseEvent }): void
}

const props = withDefaults(defineProps<Props>(), {
  dropMode: 'all',
  initialDepth: 0,
})
const emit = defineEmits<Emits>()

const draggedNode = ref<TreeNodeType | null>(null)
const nodeRefs = ref(new Map<string, any>())
const treeRoot = ref<HTMLElement>()
const autoScrollTimer = ref<number | null>(null)
const focusedNodeId = ref<string | null>(null)
const isDragOverRoot = ref(false)
const canDropToRoot = ref(false)
const rootDragTimeout = ref<number | null>(null)

const visibleNodes = computed(() => {
  return props.nodes.filter(node => node.isVisible !== false)
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
  let current = props.nodes[0]
  while (current.parent) {
    current = current.parent
  }

  // Verify this is actually a different node (not just a top-level node without parent)
  return current.parent === undefined ? current : null
}

const setNodeRef = (nodeId: string, el: any) => {
  if (el) {
    nodeRefs.value.set(nodeId, el)
  } else {
    nodeRefs.value.delete(nodeId)
  }
}

const handleNodeClick = (node: TreeNodeType) => {
  // Clear previous selection
  clearSelection()
  
  // Set current node as selected and focused
  node.isSelected = true
  focusedNodeId.value = node.id
  
  // Call callback
  props.callbacks?.onSelect?.(node)
  
  emit('node-click', node)
  emit('node-select', node)
  
  // Scroll selected node into view
  nextTick(() => {
    scrollNodeIntoView(node.id)
  })
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

const clearSelection = () => {
  const clearRecursive = (nodes: TreeNodeType[]) => {
    nodes.forEach(node => {
      node.isSelected = false
      if (node.children && node.children.length > 0) {
        clearRecursive(node.children)
      }
    })
  }
  clearRecursive(props.nodes)
}

const selectNode = (id: string) => {
  clearSelection()
  const node = findNode(id)
  if (node) {
    node.isSelected = true
    props.callbacks?.onSelect?.(node)
    emit('node-select', node)
    
    // Scroll selected node into view
    nextTick(() => {
      scrollNodeIntoView(id)
    })
  }
}

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
  return Math.random().toString(36).substr(2, 9)
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

// Keyboard navigation functions
const handleKeyDown = (e: KeyboardEvent) => {
  if (!treeRoot.value) return
  
  // Don't handle keyboard events if user is typing in an input or any input has focus
  const target = e.target as HTMLElement
  if (target?.tagName === 'INPUT' || target?.closest('input')) return
  
  const currentFocusedNode = focusedNodeId.value ? findNode(focusedNodeId.value) : null
  const flatNodes = flatVisibleNodes.value
  
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      navigateUp(flatNodes, currentFocusedNode)
      break
    case 'ArrowDown':
      e.preventDefault()
      navigateDown(flatNodes, currentFocusedNode)
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (currentFocusedNode) {
        collapseNode(currentFocusedNode)
      }
      break
    case 'ArrowRight':
      e.preventDefault()
      if (currentFocusedNode) {
        expandNode(currentFocusedNode)
      }
      break
    case 'Enter':
      e.preventDefault()
      if (currentFocusedNode) {
        startRenameNode(currentFocusedNode.id)
      }
      break
  }
}

const navigateUp = (flatNodes: TreeNodeType[], currentNode: TreeNodeType | null) => {
  if (flatNodes.length === 0) return
  
  if (!currentNode) {
    // No current focus, focus on last node
    focusNode(flatNodes[flatNodes.length - 1])
    return
  }
  
  const currentIndex = flatNodes.findIndex(node => node.id === currentNode.id)
  if (currentIndex > 0) {
    focusNode(flatNodes[currentIndex - 1])
  }
}

const navigateDown = (flatNodes: TreeNodeType[], currentNode: TreeNodeType | null) => {
  if (flatNodes.length === 0) return
  
  if (!currentNode) {
    // No current focus, focus on first node
    focusNode(flatNodes[0])
    return
  }
  
  const currentIndex = flatNodes.findIndex(node => node.id === currentNode.id)
  if (currentIndex >= 0 && currentIndex < flatNodes.length - 1) {
    focusNode(flatNodes[currentIndex + 1])
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

const focusNode = (node: TreeNodeType) => {
  focusedNodeId.value = node.id
  
  // Also select the node
  clearSelection()
  node.isSelected = true
  props.callbacks?.onSelect?.(node)
  emit('node-select', node)
  
  // Scroll into view
  nextTick(() => {
    scrollNodeIntoView(node.id)
  })
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

const handleRootDrop = (e: DragEvent) => {
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
      focusedNodeId.value = flatVisibleNodes.value[0].id
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
  expandAll,
  collapseAll,
  checkAll,
  uncheckAll,
  findNode,
  clearSelection,
  selectNode,
  getSelectedNode,
  addChildToNode,
  deleteNode,
  startRenameNode,
  scrollNodeIntoView
})
</script>

<style scoped>

.tree-root {
  overflow-y: auto;
  height: 100%;
  outline: none; /* Remove default focus outline */
}

.tree-root:focus {
  @apply ring-2 ring-blue-300 ring-opacity-50;
}

/* Root drag over styles */
.tree-root.drag-over-root {
  @apply bg-green-100;
  transition: all 0.2s ease;
}
</style>