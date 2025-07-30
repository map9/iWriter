<template>
  <teleport to="body">
    <div
      v-if="visible && nodeType"
      ref="toolbarRef"
      class="hover-toolbar"
      :style="toolbarStyle"
      @mouseenter="handleToolbarEnter"
      @mouseleave="handleToolbarLeave"
    >
      <!-- 插槽：外部定义工具栏内容 -->
      <slot 
        :editor="editor"
        :node="currentNode"
        :nodeType="nodeType"
        :pos="nodePos"
        :updateNode="updateNode"
        :deleteNode="deleteNode"
        :copyNode="copyNode"
        :hideToolbar="hideToolbar"
      />
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { HoverToolbarPluginKey, setHoverToolbarVisibility, getHoverToolbarState, type HoverToolbarPluginState } from './HoverToolbarPlugin'

interface Props {
  editor: Editor
}

const props = defineProps<Props>()
const toolbarRef = ref<HTMLElement>()
const isToolbarHovered = ref(false)
const toolbarPosition = ref({ top: 0, left: 0 })

// 响应式的插件状态
const pluginState = ref<HoverToolbarPluginState | null>(null)

// 更新插件状态的函数
const updatePluginState = () => {
  if (!props.editor?.view) return
  const newState = getHoverToolbarState(props.editor.view)
  pluginState.value = newState
}

const visible = computed(() => {
  return (pluginState.value?.toolbarVisible || isToolbarHovered.value) && 
         pluginState.value?.hoveredNodePos !== null
})

const nodeType = computed(() => {
  return pluginState.value?.hoveredNodeType
})

const nodePos = computed(() => {
  return pluginState.value?.hoveredNodePos
})

const currentNode = computed((): ProseMirrorNode | null => {
  return pluginState.value?.hoveredNode || null
})

// 计算工具栏位置
const toolbarStyle = computed(() => {
  if (!visible.value || !nodePos.value) {
    return { display: 'none' }
  }
  
  return {
    position: 'fixed' as const,
    top: `${toolbarPosition.value.top}px`,
    left: `${toolbarPosition.value.left}px`,
    zIndex: 1000
  }
})

// 更新工具栏位置
function updateToolbarPosition() {
  if (!nodePos.value || !props.editor?.view?.dom) return
  
  try {
    const domNode = pluginState.value?.hoveredDomNode
    let targetRect: DOMRect
    
    if (domNode) {
      // 优先使用DOM节点的实际位置
      targetRect = domNode.getBoundingClientRect()
    } else {
      // 降级到ProseMirror的位置计算
      const domPos = props.editor.view.coordsAtPos(nodePos.value)
      const editorRect = props.editor.view.dom.getBoundingClientRect()
      
      targetRect = new DOMRect(
        Math.max(domPos.left, editorRect.left),
        domPos.top,
        Math.min(editorRect.width, 200), // 假设一个默认宽度
        20 // 假设一个默认高度
      )
    }
    
    // 计算工具栏位置
    const toolbarHeight = 4*9 // 预估工具栏高度
    const toolbarWidth = 200 // 预估工具栏宽度
    
    let top = targetRect.top - toolbarHeight - 6 // 在节点上方10px
    let left = targetRect.left
    
    // 如果上方空间不够，放到下方
    if (top < 10) {
      top = targetRect.bottom + 2
    }
    
    // 确保不超出右边界
    if (left + toolbarWidth > window.innerWidth - 10) {
      left = window.innerWidth - toolbarWidth - 10
    }
    
    // 确保不超出左边界
    left = Math.max(10, left)
    
    // 确保不超出下边界
    if (top + toolbarHeight > window.innerHeight - 10) {
      top = window.innerHeight - toolbarHeight - 10
    }
    
    toolbarPosition.value = { top, left }
  } catch (error) {
    console.warn('Failed to update toolbar position:', error)
  }
}

// 监听状态变化，更新位置
watch([visible, nodePos], () => {
  if (visible.value && nodePos.value) {
    nextTick(() => {
      updateToolbarPosition()
    })
  }
}, { immediate: true })

// 移除编辑器销毁状态监听，由父组件控制生命周期

// 监听编辑器更新
let updateHandler: (() => void) | null = null
let stateUpdateHandler: (() => void) | null = null

onMounted(() => {
  // 初始化插件状态
  updatePluginState()
  
  updateHandler = () => {
    if (visible.value) {
      updateToolbarPosition()
    }
  }
  
  stateUpdateHandler = () => {
    updatePluginState()
    if (visible.value) {
      updateToolbarPosition()
    }
  }
  
  if (props.editor) {
    props.editor.on('update', stateUpdateHandler)
    props.editor.on('selectionUpdate', stateUpdateHandler)
    props.editor.on('transaction', stateUpdateHandler)
  }
  
  // 监听滚动事件
  if (props.editor?.view?.dom) {
    const editorElement = props.editor.view.dom.closest('.overflow-y-auto')
    if (editorElement) {
      editorElement.addEventListener('scroll', updateHandler)
    }
  }
})

onUnmounted(() => {
  // 简化清理逻辑，父组件已确保正确的卸载顺序
  if (stateUpdateHandler && props.editor) {
    props.editor.off('update', stateUpdateHandler)
    props.editor.off('selectionUpdate', stateUpdateHandler)
    props.editor.off('transaction', stateUpdateHandler)
  }
  
  if (updateHandler && props.editor?.view?.dom) {
    const editorElement = props.editor.view.dom.closest('.overflow-y-auto')
    if (editorElement) {
      editorElement.removeEventListener('scroll', updateHandler)
    }
  }
})

// 工具栏操作方法
const updateNode = (attrs: Record<string, any>) => {
  const pos = nodePos.value
  const type = nodeType.value
  if (pos !== null && pos !== undefined && type) {
    props.editor.chain()
      .focus()
      .setNodeSelection(pos)
      .updateAttributes(type, attrs)
      .run()
  }
}

const deleteNode = () => {
  const pos = nodePos.value
  const node = currentNode.value
  if (pos !== null && pos !== undefined && node) {
    const nodeStart = pos
    const nodeEnd = nodeStart + node.nodeSize
    
    props.editor.chain()
      .focus()
      .deleteRange({ from: nodeStart, to: nodeEnd })
      .run()
    
    // 删除后隐藏工具栏
    hideToolbar()
  }
}

const copyNode = async () => {
  if (currentNode.value) {
    try {
      const content = currentNode.value.textContent
      await navigator.clipboard.writeText(content)
      
      // 可以添加成功提示
      console.log('Node content copied to clipboard')
    } catch (error) {
      console.error('Failed to copy node content:', error)
    }
  }
}

const hideToolbar = () => {
  if (!props.editor?.view) return
  setHoverToolbarVisibility(props.editor.view, false)
  isToolbarHovered.value = false
}

const handleToolbarEnter = () => {
  isToolbarHovered.value = true
}

const handleToolbarLeave = () => {
  isToolbarHovered.value = false
  // 延迟隐藏工具栏
  setTimeout(() => {
    if (!isToolbarHovered.value) {
      hideToolbar()
    }
  }, 200)
}
</script>

<style lang="scss">
.hover-toolbar {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 0.75rem;
  padding: .188rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  gap: 8px;
  align-items: center;
  pointer-events: auto;
  outline: none;
  overflow: hidden;
  font-size: 14px;

  // 确保工具栏在最前面
  z-index: 9999;
  
  // 淡入动画
  animation: fadeInUp 0.2s ease-out;
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: .125rem;
  }

  .toolbar-separator {
    height: 1.5rem;
    width: 1px;
    flex-shrink: 0;
    background-color: rgba(37,39,45,0.1);
  }

  .toolbar-button {
    background-color: rgba(255,255,255,0);
    color: rgba(36,39,46,0.78);
    font-size: .875rem;
    font-weight: 500;
    line-height: 1.15;
    height: 2rem;
    min-width: 2rem;
    border: none;
    padding: .5rem;
    gap: .25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
    transition: all 0.2s ease;

    &:has(>svg):not(:has(>:not(svg)))
    {
      gap: .125rem;
    }

    &:hover {
      transform: scale(1.05);
    }
    
    &:active {
      transform: scale(0.95);
    }
    
    &.copy-button {
      background: rgba(34, 197, 94, 0.8);
      color: white;
      
      &:hover {
        background: rgba(34, 197, 94, 1);
      }
    }
    
    &.delete-button {
      background: rgba(239, 68, 68, 0.8);
      color: white;
      
      &:hover {
        background: rgba(239, 68, 68, 1);
      }
    }
    
    &.edit-button {
      background: rgba(59, 130, 246, 0.8);
      color: white;
      
      &:hover {
        background: rgba(59, 130, 246, 1);
      }
    }

    .toolbar-button-text {
      padding: 0 .125rem;
      flex-grow: 1;
      text-align: left;
      line-height: 1.5rem;
    }

    .toolbar-button-dropdown-arrows {
      color: rgba(36,39,46,0.78);
      width: .625rem;
      height: .625rem;
      flex-shrink: 0;
    }

    .toolbar-button-icon {
      color: rgba(36,39,46,0.78);
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
    }
  }
  
  .toolbar-select {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(0, 0, 0, 0.2);
    padding: 4px 8px;
    font-size: 12px;
    min-width: 80px;
    max-width: 120px;
    border-radius: 0.75rem;
    cursor: pointer;
    
    &:hover {
      background: rgba(255, 255, 255, 1);
      border-color: rgba(0, 0, 0, 0.3);
    }
    
    &:focus {
      outline: none;
      border-color: rgba(59, 130, 246, 0.8);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
  }
}
</style>