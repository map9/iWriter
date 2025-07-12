import { ref } from 'vue'
import type { TreeNode } from './tree'

// Global drag and drop state management
export const dragDropState = {
  draggedNode: ref<TreeNode | null>(null),
  isDragging: ref(false),
  
  startDrag(node: TreeNode) {
    this.draggedNode.value = node
    this.isDragging.value = true
  },
  
  endDrag() {
    this.draggedNode.value = null
    this.isDragging.value = false
  },
  
  getDraggedNode() {
    return this.draggedNode.value
  }
}