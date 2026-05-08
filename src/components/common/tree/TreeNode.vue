<template>
  <div 
    v-if="node.isVisible !== false"
    class="tree-node"
    :class="{ 
      'disabled': node.isEnabled === false,
      'dragged': isDraggedNode,
      'drag-over': isDragOver && canDropHere,
    }"
  >
    <div
      ref="nodeContentRef"
      class="tree-node-content"
      :class="[dropTargetClasses, selectedClasses, customRowClass]"
      :style="customRowStyle"
      :title = "node.path"
      @click="handleClick($event)"
      @contextmenu.stop="handleContextMenu"
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
        class="button-wrapper"
        @click.stop="toggleExpanded"
      >
        <component 
          v-if="expandIcon" 
          :is="expandIcon" 
          class="expand-icon"
        />
        <span v-else class="text">{{ node.isExpanded ? '−' : '+' }}</span>
      </button>
      <div v-else class="icon-wrapper"></div>

      <!-- Check Icon -->
      <button
        v-if="canCheck"
        class="button-wrapper"
        @click.stop="toggleChecked"
      >
        <component 
          v-if="checkIcon" 
          :is="checkIcon" 
          class="check-icon"
        />
        <span v-else class="text">{{ node.isChecked ? '☑' : '☐' }}</span>
      </button>

      <!-- Type Icon -->
      <div v-if="typeIcon" class="icon-wrapper">
        <component :is="typeIcon" class="type-icon" :class="customIconClass" :style="customIconStyle" />
      </div>

      <!-- Label -->
      <div
        v-if="!isRenaming"
        class="label"
        :class="customLabelClass"
        :style="customLabelStyle"
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
        class="input"
        @blur="finishRename"
        @keydown.enter.stop="finishRename"
        @keydown.escape="cancelRename"
        @click.stop
      />

      <!-- Right Content -->
      <div
        v-if="rightContent"
        class="badge"
      >
        {{ rightContent }}
      </div>
    </div>

    <!-- Children -->
    <div 
      v-if="node.isExpanded && hasChildren" 
      class="tree-children"
      :class="{ 'dragged': isDraggedNode }"
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
/* eslint-disable vue/no-mutating-props */
import { ref, computed, nextTick, onUnmounted } from 'vue'
import type { TreeNode, TreeCallbacks, DropMode } from './index'
import { dragDropState } from './drag-drop.ts'

interface Props {
  node: TreeNode
  callbacks?: TreeCallbacks
  depth?: number
  initialDepth?: number
  dropMode?: DropMode
}

interface Emits {
  (e: 'node-click', data: { node: TreeNode; event?: MouseEvent }): void
  (e: 'node-check', node: TreeNode): void
  (e: 'node-rename', data: { node: TreeNode; newName: string }): void
  (e: 'node-drag', node: TreeNode): void
  (e: 'node-drop', data: { dragNode: TreeNode; dropNode: TreeNode; position: 'before' | 'after' | 'inside' }): void
  (e: 'node-contextmenu', data: { node: TreeNode; event: MouseEvent }): void
  (e: 'node-ref', nodeId: string, ref: unknown): void
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
const expandTimer = ref<ReturnType<typeof setTimeout> | null>(null)

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

const customTreeData = computed(() => {
  if (props.node.data && typeof props.node.data === 'object') {
    return props.node.data as Record<string, unknown>
  }
  return {}
})

const customRowClass = computed(() => customTreeData.value.treeRowClass as string | string[] | Record<string, boolean> | undefined)
const customRowStyle = computed(() => ({
  paddingLeft: `${(props.depth + props.initialDepth) * 12 + 8}px`,
  ...(customTreeData.value.treeRowStyle as Record<string, string> | undefined),
}))
const customIconClass = computed(() => customTreeData.value.treeIconClass as string | string[] | Record<string, boolean> | undefined)
const customIconStyle = computed(() => customTreeData.value.treeIconStyle as Record<string, string> | undefined)
const customLabelClass = computed(() => customTreeData.value.treeLabelClass as string | string[] | Record<string, boolean> | undefined)
const customLabelStyle = computed(() => customTreeData.value.treeLabelStyle as Record<string, string> | undefined)

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
    'drop-target': true
  }
  
  if (canDropHere.value) {
    // Valid drop target
    switch (dropPosition.value) {
      case 'before':
        return {
          ...classes,
          'drop-border-top': true,
          'drop-border': true
        }
      case 'after':
        return {
          ...classes,
          'drop-border-bottom': true,
          'drop-border': true
        }
      case 'inside':
        return {
          ...classes,
          'drop-background': true,
          'drop-border': true
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
  const classes: Record<string, boolean> = {}
  
  if (props.node.isSelected) {
    classes['selected-status'] = true
  }
  
  if (props.node.isFocused) {
    classes['focused-status'] = true
  }
  
  return classes
})

const handleClick = (event: MouseEvent) => {
  if (props.node.isEnabled === false) return
  emit('node-click', { node: props.node, event })
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
    emit('node-click', { node: props.node, event })
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
  const element = nodeContentRef.value?.closest('.tree-root') as HTMLElement
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
      } catch {
        // If rename failed, keep the old name - error is already handled by the callback
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
.tree-node {
  border: 1px solid transparent;
  cursor: pointer;
}

.tree-node.disabled {
  opacity: var(--tree-disabled-opacity, 0.5);
  cursor: not-allowed;
}

.tree-node-content {
  display: flex;
  align-items: center;
  user-select: none;
  position: relative;
  height: var(--tree-node-content-height, 28px);
  padding: var(--tree-node-content-padding, 0px 8px);
  border: 1px solid transparent;
  border-radius: var(--tree-border-radius, 0px);
  font-size: var(--tree-font-size, 12px);
  font-weight: var(--tree-font-weight, 500);
  transition: all 0.2s ease;
}

.tree-node:not(.disabled) .tree-node-content:not(.selected-status).tree-node-content:hover {
  background-color: var(--tree-hover-color, #eee);
}

.tree-node-content .button-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tree-icon-size, 16px);
  height: var(--tree-icon-size, 16px);
  margin-right: var(--tree-icon-spacing, 4px);
  cursor: inherit;
  border: none;
  background: none;
}

.tree-node-content .icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tree-icon-size, 16px);
  height: var(--tree-icon-size, 16px);
  margin-right: var(--tree-icon-spacing, 4px);
}

.tree-node-content .button-wrapper .expand-icon {
  width: var(--tree-icon-size-small, 12px);
  height: var(--tree-icon-size-small, 12px);
}

.tree-node-content .button-wrapper .check-icon {
  width: var(--tree-icon-size, 16px);
  height: var(--tree-icon-size, 16px);
}

.tree-node-content .button-wrapper .text {
  font-size: var(--tree-icon-size-small, 12px);
  line-height: 1;
}

.tree-node-content .icon-wrapper .type-icon {
  width: var(--tree-icon-size, 16px);
  height: var(--tree-icon-size, 16px);
}

.tree-node-content .label {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border: 1px solid transparent;
  transition-property: color, background-color, border-color;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
  font-size: inherit;
  color: inherit;
}

.tree-node-content .input {
  flex: 1;
  outline: none;
  height: auto;
  background: var(--tree-input-background, transparent);
  border: var(--tree-input-border, 1px solid #ccc);
  border-radius: var(--tree-border-radius, 0px);
  padding: var(--tree-input-padding, 2px 4px);
  font-size: inherit;
  color: var(--tree-input-color, inherit);
}

.tree-node-content .badge {
  white-space: nowrap;
  height: var(--tree-badge-height, auto);
  background: var(--tree-badge-background, #f0f0f0);
  color: var(--tree-badge-color, #666);
  font-size: var(--tree-badge-font-size, inherit);
  padding: var(--tree-badge-padding, 4px 8px);
  border-radius: var(--tree-badge-border-radius, 12px);
  margin-left: var(--tree-badge-spacing, 4px);
  margin-right: var(--tree-badge-spacing, 4px);
}

.tree-node.dragged {
  opacity: var(--tree-drag-opacity, 0.6);
  background-color: var(--tree-drag-background, rgba(59, 130, 246, 0.1));
}

.tree-node.drag-over {
  background-color: var(--tree-drop-background, rgba(34, 197, 94, 0.2));
  border-color: var(--tree-drop-border-color, rgb(74, 222, 128));
}

.tree-node-content.drop-target {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}

.tree-node-content.drop-target.drop-background {
  background-color: var(--tree-drop-background, rgba(34, 197, 94, 0.2));
}

.tree-node-content.drop-target.drop-border {
  border-color: var(--tree-drop-border-color, rgb(74, 222, 128));
}

.tree-node-content.drop-border-top::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--tree-drop-indicator, linear-gradient(90deg, rgb(74, 222, 128), rgba(74, 222, 128, 0.3)));
  border-radius: 2px;
}

.tree-node-content.drop-border-bottom::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--tree-drop-indicator, linear-gradient(90deg, rgb(74, 222, 128), rgba(74, 222, 128, 0.3)));
  border-radius: 2px;
}

.tree-node-content.selected-status {
  color: var(--tree-selected-color, #1976d2);
  background-color: var(--tree-selected-background, #e3f2fd);
}

.tree-node-content.focused-status {
  outline: var(--tree-focus-outline, 2px solid rgba(59, 130, 246, 0.5));
  outline-offset: var(--tree-focus-outline-offset, -2px);
}

.tree-node-content.focused-status.selected-status {
  color: var(--tree-selected-focused-color, #1976d2);
  background-color: var(--tree-selected-focused-background, #e3f2fd);
  outline: var(--tree-focus-outline, 2px solid rgba(59, 130, 246, 0.5));
  outline-offset: var(--tree-focus-outline-offset, -2px);
}

.tree-children.dragged {
  pointer-events: none;
}
</style>
