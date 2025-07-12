<template>
  <div 
    v-if="node.isVisible !== false"
    class="tree-node"
    :class="{ 
      'opacity-50': node.isEnabled === false,
      'being-dragged': isDraggedNode,
      'drag-over': isDragOver && canDropHere,
    }"
  >
    <div
      ref="nodeContentRef"
      class="tree-node-content flex items-center py-1 border hover:bg-gray-100 cursor-pointer select-none transition-all duration-200 text-sm"
      :class="[dropTargetClasses, selectedClasses]"
      :style="{ paddingLeft: `${(depth + initialDepth) * 12 + 8}px` }"
      @click="handleClick"
      @contextmenu="handleContextMenu"
      @dragstart="handleDragStart"
      @dragend="handleDragEnd"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      :draggable="canDrag"
    >
      <!-- Expand/Collapse Icon -->
      <button
        v-if="hasChildren"
        class="expand-btn w-4 h-4 flex items-center justify-center mr-1"
        @click.stop="toggleExpanded"
      >
        <component 
          v-if="expandIcon" 
          :is="expandIcon" 
          class="w-3 h-3"
        />
        <span v-else class="text-xs">{{ node.isExpanded ? '−' : '+' }}</span>
      </button>
      <div v-else class="w-4 h-4 mr-1"></div>

      <!-- Check Icon -->
      <button
        v-if="canCheck"
        class="check-btn w-4 h-4 flex items-center justify-center mr-2"
        @click.stop="toggleChecked"
      >
        <component 
          v-if="checkIcon" 
          :is="checkIcon" 
          class="w-3 h-3"
        />
        <span v-else class="text-xs">{{ node.isChecked ? '☑' : '☐' }}</span>
      </button>

      <!-- Type Icon -->
      <div v-if="typeIcon" class="type-icon w-4 h-4 mr-2 flex items-center justify-center">
        <component :is="typeIcon" class="w-4 h-4" />
      </div>

      <!-- Label -->
      <div
        v-if="!isRenaming"
        class="node-label flex-1 truncate px-1 py-0.5 border border-transparent transition-colors text-sm"
        @click="handleLabelClick"
        @dblclick="handleDoubleClick"
      >
        {{ node.label }}
      </div>
      
      <!-- Rename Input -->
      <input
        v-else
        ref="renameInput"
        v-model="renameValue"
        class="node-rename-input flex-1 px-1 bg-white border border-blue-300 text-sm"
        @blur="finishRename"
        @keydown.enter.stop="finishRename"
        @keydown.escape="cancelRename"
        @click.stop
      />

      <!-- Right Content -->
      <div
        v-if="rightContent"
        class="node-right-content mr-2 px-2 text-xs text-gray-500 bg-gray-100 rounded-md whitespace-nowrap"
      >
        {{ rightContent }}
      </div>
    </div>

    <!-- Children -->
    <div 
      v-if="node.isExpanded && hasChildren" 
      class="tree-children"
      :class="{ 'pointer-events-none': isDraggedNode }"
    >
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :ref="el => $emit('node-ref', child.id, el)"
        :node="child"
        :callbacks="callbacks"
        :depth="depth + 1"
        :initialDepth="initialDepth"
        :drop-mode="dropMode"
        @node-click="$emit('node-click', $event)"
        @node-check="$emit('node-check', $event)"
        @node-rename="$emit('node-rename', $event)"
        @node-drag="$emit('node-drag', $event)"
        @node-drop="$emit('node-drop', $event)"
        @node-contextmenu="$emit('node-contextmenu', $event)"
        @node-ref="(nodeId, ref) => $emit('node-ref', nodeId, ref)"
        @first-level-fallback="$emit('first-level-fallback', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import type { TreeNode, TreeCallbacks, DropMode } from './tree'
import { dragDropState } from './dragDrop'

interface Props {
  node: TreeNode
  callbacks?: TreeCallbacks
  depth?: number
  initialDepth?: number
  dropMode?: DropMode
}

interface Emits {
  (e: 'node-click', node: TreeNode): void
  (e: 'node-check', node: TreeNode): void
  (e: 'node-rename', data: { node: TreeNode; newName: string }): void
  (e: 'node-drag', node: TreeNode): void
  (e: 'node-drop', data: { dragNode: TreeNode; dropNode: TreeNode; position: 'before' | 'after' | 'inside' }): void
  (e: 'node-contextmenu', data: { node: TreeNode; event: MouseEvent }): void
  (e: 'node-ref', nodeId: string, ref: any): void
  (e: 'first-level-fallback', data: { enabled: boolean; nodeId: string }): void
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  initialDepth: 0,
  dropMode: 'all'
})

const emit = defineEmits<Emits>()

const nodeContentRef = ref<HTMLElement>()
const isRenaming = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement>()
const isDragOver = ref(false)
const dropPosition = ref<'before' | 'after' | 'inside' | null>(null)
const canDropHere = ref(false)
const draggedNode = ref<TreeNode | null>(null)
const expandTimer = ref<number | null>(null)

const hasChildren = computed(() => {
  return props.node.children && props.node.children.length > 0
})

const canCheck = computed(() => {
  return props.callbacks?.canCheck ? props.callbacks.canCheck(props.node) : false
})

const canRename = computed(() => {
  return props.callbacks?.canRename ? props.callbacks.canRename(props.node) : false
})

const canDrag = computed(() => {
  return props.callbacks?.canDrag ? props.callbacks.canDrag(props.node) : false
})

const expandIcon = computed(() => {
  if (!hasChildren.value) return undefined
  return props.node.isExpanded
    ? props.callbacks?.getCollapseIcon?.(props.node)
    : props.callbacks?.getExpandIcon?.(props.node)
})

const checkIcon = computed(() => {
  if (!canCheck.value) return undefined
  return props.node.isChecked 
    ? props.callbacks?.getCheckIcon?.(props.node)
    : props.callbacks?.getUnCheckIcon?.(props.node)
})

const typeIcon = computed(() => {
  return props.callbacks?.getTypeIcon?.(props.node)
})

const rightContent = computed(() => {
  return props.callbacks?.getRightContent?.(props.node) || null
})

// Check if this is a first-level node (depth === 0) and has a parent (root node)
const isFirstLevelNode = computed(() => {
  return props.depth === 0 && props.node.parent
})

const isDraggedNode = computed(() => {
  const currentDraggedNode = dragDropState.getDraggedNode()
  return currentDraggedNode && currentDraggedNode.id === props.node.id
})

const dropTargetClasses = computed(() => {
  if (!isDragOver.value) return {}
  
  const classes = {
    'drop-target': true,
    'transition-all': true,
    'duration-200': true
  }
  
  if (canDropHere.value) {
    // Valid drop target
    switch (dropPosition.value) {
      case 'before':
        return {
          ...classes,
          'border-t-2': true,
          'border-t-green-400': true
        }
      case 'after':
        return {
          ...classes,
          'border-b-2': true,
          'border-b-green-400': true
        }
      case 'inside':
        return {
          ...classes,
          'bg-green-100': true,
          'border-green-400': true
        }
    }
  } else {
    // Invalid drop target
    return {
      ...classes,
      //'bg-red-50': true
    }
  }
  
  return classes
})

const selectedClasses = computed(() => {
  if (!props.node.isSelected)
    return {
      'border-transparent': true,
    }

  if (isRenaming.value) {
    return {
      'border-transparent': true,
      'bg-blue-100': true,
      'text-blue-900': true
    }
  }
  else {
    return {
      'bg-blue-100': true,
      'border-blue-500': true,
      'text-blue-900': true
    }
  }
})

const handleClick = () => {
  if (props.node.isEnabled === false) return
  emit('node-click', props.node)
}

const handleLabelClick = (event: MouseEvent) => {
  if (props.node.isEnabled === false) return
  
  // Stop propagation to prevent the node click event
  event.stopPropagation()
  
  // If node is already selected, start rename
  if (props.node.isSelected) {
    startRename()
  } else {
    // If not selected, emit click to select it first
    emit('node-click', props.node)
  }
}

const handleDoubleClick = () => {
  if (props.node.isEnabled === false) return
  // Always start rename on double-click if allowed
  startRename()
}

const handleContextMenu = (event: MouseEvent) => {
  if (props.node.isEnabled === false) return
  emit('node-contextmenu', { node: props.node, event })
}

const toggleExpanded = () => {
  if (props.node.isEnabled === false) return
  props.node.isExpanded = !props.node.isExpanded

  if (props.node.isExpanded) {
    props.callbacks?.onExpand?.(props.node)
  } else {
    props.callbacks?.onCollapse?.(props.node)
  }
}

const toggleChecked = () => {
  if (props.node.isEnabled === false) return
  props.node.isChecked = !props.node.isChecked
  
  if (props.node.isChecked) {
    props.callbacks?.onCheck?.(props.node)
  } else {
    props.callbacks?.onUnCheck?.(props.node)
  }
  
  emit('node-check', props.node)
}

const startRename = () => {
  if (!canRename.value || props.node.isEnabled === false) return
  isRenaming.value = true
  renameValue.value = props.node.label
  nextTick(() => {
    setTimeout(() => {
      renameInput.value?.focus()
      renameInput.value?.select()
    }, 50) // Small delay to ensure input is ready and Tree event handling is complete
  })
}

// Restore focus to the tree container after rename or cancel
const restoreFocusToRoot = () => {
  // Find the tree root element by traversing up the DOM
  let element = nodeContentRef.value?.closest('.tree-root') as HTMLElement
  if (element) {
    element.focus()
  }
}

const finishRename = async () => {
  // Prevent multiple calls while processing
  // blur and enter can both trigger this
  if (!isRenaming.value) return

  if (renameValue.value.trim() && renameValue.value !== props.node.label) {
    const newName = renameValue.value.trim()
    
    // If there's an onRename callback, let it handle the validation and update
    if (props.callbacks?.onRename) {
      try {
        // Call the callback and wait for it (it might be async)
        await props.callbacks.onRename(props.node, newName)
        // If no error thrown, update the label
        props.node.label = newName
        emit('node-rename', { node: props.node, newName })
      } catch (error) {
        // If rename failed, keep the old name - error is already handled by the callback
        // Don't update the label, keep the old one
      }
    } else {
      // No callback, just update directly
      props.node.label = newName
      emit('node-rename', { node: props.node, newName })
    }
  }
  isRenaming.value = false
  
  restoreFocusToRoot()
}

const cancelRename = () => {
  isRenaming.value = false
  renameValue.value = props.node.label
  
  restoreFocusToRoot()
}

const handleDragStart = (e: DragEvent) => {
  if (!canDrag.value || props.node.isEnabled === false) return
  
  // Create custom drag image showing only the label
  createCustomDragImage(e)
  
  // Set drag data (avoid circular reference by only including essential data)
  e.dataTransfer?.setData('text/plain', props.node.id)
  const dragData = {
    id: props.node.id,
    label: props.node.label,
    type: props.node.type,
    path: props.node.path
  }
  e.dataTransfer?.setData('application/json', JSON.stringify(dragData))
  e.dataTransfer!.effectAllowed = 'copyMove'

  // Store in global state for reliable access
  dragDropState.startDrag(props.node)
  
  props.callbacks?.onDragStart?.(props.node)
  emit('node-drag', props.node)
}

const createCustomDragImage = (e: DragEvent) => {
  // Create a temporary element to use as drag image
  const dragImage = document.createElement('div')
  dragImage.style.position = 'absolute'
  dragImage.style.top = '-1000px' // Move off-screen
  dragImage.style.left = '-1000px'
  
  // Use the same styles as selected item
  dragImage.style.background = 'rgb(219, 234, 254)' // bg-blue-100
  dragImage.style.color = 'rgb(30, 58, 138)' // text-blue-900
  dragImage.style.border = '1px solid rgb(59, 130, 246)' // border-blue-500
  dragImage.style.padding = '2px 4px'
  dragImage.style.fontSize = '12px'
  dragImage.style.fontFamily = 'inherit'
  dragImage.style.whiteSpace = 'nowrap'
  dragImage.style.zIndex = '9999'
  dragImage.style.pointerEvents = 'none'
  dragImage.style.borderRadius = '4px'
  
  // Add only the label text
  dragImage.textContent = props.node.label
  
  // Add to document temporarily
  document.body.appendChild(dragImage)
  
  // Set as drag image
  if (e.dataTransfer) {
    e.dataTransfer.setDragImage(dragImage, 0, 0)
  }
  
  // Remove after a short delay
  setTimeout(() => {
    if (document.body.contains(dragImage)) {
      document.body.removeChild(dragImage)
    }
  }, 0)
}

const handleDragOver = (e: DragEvent) => {
  if (props.node.isEnabled === false) return
  
  // Get dragged node from global state
  const globalDraggedNode = dragDropState.getDraggedNode()
  if (!globalDraggedNode) return
  
  draggedNode.value = globalDraggedNode
  isDragOver.value = true
  
  if (props.dropMode === 'inside-only') {
    // Only allow inside drops when in inside-only mode
    dropPosition.value = 'inside'
  } else {
    // Determine drop position based on mouse position and drop mode
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height

    // Allow all three positions when in 'all' mode
    const topThird = height / 3
    const bottomThird = height * 2 / 3
    
    if (y < topThird) {
      dropPosition.value = 'before'
    } else if (y > bottomThird) {
      dropPosition.value = 'after'
    } else {
      dropPosition.value = 'inside'
    }
  }
  
  // Check if drop is allowed on this node
  if (props.callbacks?.canDrop) {
    canDropHere.value = props.callbacks.canDrop(
      globalDraggedNode,
      props.node,
      dropPosition.value
    )
  } else {
    canDropHere.value = false
  }

  if (canDropHere.value) {
    e.dataTransfer!.dropEffect = 'copy'
    // Prevent bubbling for normal node drops
    e.stopPropagation()
    // Auto-expand collapsed nodes with children when hovering during drag
    handleAutoExpand()
    return
  }

  // Check if this is a first-level node that can't accept drop but root can
  if (!canDropHere.value && isFirstLevelNode.value) {
    const rootNode = props.node.parent
    if (rootNode && props.callbacks?.canDrop) {
      const canDropToRoot = props.callbacks.canDrop(globalDraggedNode, rootNode, 'inside')
      if (canDropToRoot) {
        // Notify Tree component to enable first-level fallback
        emit('first-level-fallback', { 
          enabled: true, 
          nodeId: props.node.id 
        })
        e.dataTransfer!.dropEffect = 'copy'
        // Don't stop propagation, allow bubbling to Tree
        return
      }
    }
  }

  // Invalid drop
  e.dataTransfer!.dropEffect = 'none'
  e.stopPropagation()
}

const handleAutoExpand = () => {
  // Check if this node should auto-expand
  const shouldAutoExpand = 
    hasChildren.value && // Has children
    !props.node.isExpanded && // Is currently collapsed
    dropPosition.value === 'inside' && // Drop position is inside (not before/after)
    canDropHere.value // Drop is allowed here
  
  if (shouldAutoExpand) {
    // Only start a new timer if one isn't already running
    if (!expandTimer.value) {
      expandTimer.value = setTimeout(() => {
        // Double-check conditions are still valid when timer fires
        if (isDragOver.value && dropPosition.value === 'inside' && canDropHere.value) {
          // Expand the node
          props.node.isExpanded = true
          
          // Call the expand callback if available
          props.callbacks?.onExpand?.(props.node)
        }
        expandTimer.value = null
      }, 800) // 800ms delay for auto-expand
    }
  } else {
    // Clear timer if conditions are no longer met
    if (expandTimer.value) {
      clearTimeout(expandTimer.value)
      expandTimer.value = null
    }
  }
}

const handleDragLeave = (e: DragEvent) => {
  // More reliable drag leave detection
  const target = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement
  
  // If we're moving to a child element, don't reset the state
  if (relatedTarget && target.contains(relatedTarget)) {
    return
  }
  
  // Notify Tree component to disable first-level fallback for this node
  if (isFirstLevelNode.value) {
    emit('first-level-fallback', { 
      enabled: false, 
      nodeId: props.node.id 
    })
  }
  
  // Reset drag states when truly leaving this node
  isDragOver.value = false
  dropPosition.value = null
  canDropHere.value = false
  draggedNode.value = null
  
  // Clear expand timer
  if (expandTimer.value) {
    clearTimeout(expandTimer.value)
    expandTimer.value = null
  }
}

const handleDrop = (e: DragEvent) => {
  if (props.node.isEnabled === false) return
  
  const success = canDropHere.value
  const globalDraggedNode = dragDropState.getDraggedNode()
  
  // Reset states
  isDragOver.value = false
  const finalPosition = dropPosition.value
  dropPosition.value = null
  canDropHere.value = false
  
  // Only handle drop if this node can accept it
  if (!success || !globalDraggedNode || !finalPosition) {
    // If this node can't handle the drop, let it bubble to Tree component
    return
  }
  
  // Prevent bubbling for successful node drops
  e.stopPropagation()
  
  // Emit the drop event
  emit('node-drop', { 
    dragNode: globalDraggedNode, 
    dropNode: props.node, 
    position: finalPosition
  })
  
  // End the drag operation
  dragDropState.endDrag()
  draggedNode.value = null
}

const handleDragEnd = () => {
  // Only clean up local state, let global handlers manage global state
  draggedNode.value = null
  
  // Clear expand timer
  if (expandTimer.value) {
    clearTimeout(expandTimer.value)
    expandTimer.value = null
  }
}

// Clean up timers on unmount to prevent memory leaks
onUnmounted(() => {
  if (expandTimer.value) {
    clearTimeout(expandTimer.value)
    expandTimer.value = null
  }
})

defineExpose({
  startRename,
  isRenaming: computed(() => isRenaming.value),
  nodeContentRef
})
</script>

<style scoped>
.tree-node-content {
  transition: all 0.2s ease;
  position: relative;
}

/* Valid drop target effects */
.drop-target.bg-green-50 {
  background-color: rgba(34, 197, 94, 0.1) !important;
}

.drop-target.bg-green-100 {
  background-color: rgba(34, 197, 94, 0.2) !important;
}

.drop-target.border-green-400 {
  border-color: rgb(74, 222, 128) !important;
}

.drop-target.border-t-green-400 {
  border-top-color: rgb(74, 222, 128) !important;
}

.drop-target.border-b-green-400 {
  border-bottom-color: rgb(74, 222, 128) !important;
}

/* Invalid drop target effects */
.drop-target.bg-red-50 {
  background-color: rgba(239, 68, 68, 0.1) !important;
}

.drop-target.border-red-300 {
  border-color: rgb(252, 165, 165) !important;
}

/* Position indicators */
.tree-node-content.border-t-2::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, rgb(74, 222, 128), rgba(74, 222, 128, 0.3));
  border-radius: 2px;
}

.tree-node-content.border-b-2::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, rgb(74, 222, 128), rgba(74, 222, 128, 0.3));
  border-radius: 2px;
}

.node-rename-input {
  outline: none;
}

/* Being dragged styles */
.being-dragged {
  opacity: 0.6;
  background-color: rgba(59, 130, 246, 0.1) !important;
}

.drag-over {
  @apply bg-green-100;
  @apply border-green-400;
}

/* Disable pointer events on children when parent is being dragged */
.pointer-events-none {
  pointer-events: none;
}
</style>