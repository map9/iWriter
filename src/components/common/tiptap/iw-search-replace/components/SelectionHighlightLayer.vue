<template>
  <div
    v-if="show && highlightStyle"
    class="selection-highlight-layer"
    :style="highlightStyle"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'
import type { Range } from '@tiptap/core'

interface Props {
  editor: Editor | null
  selectionRange: Range | null
  show: boolean
}

const props = defineProps<Props>()

const highlightStyle = ref<Record<string, string> | null>(null)
let resizeObserver: ResizeObserver | null = null
let editorDom: HTMLElement | null = null

/**
 * 计算选区高亮层的位置和尺寸
 * 使用 getClientRects 获取选区的所有矩形区域，计算包围盒
 */
function calculateHighlightStyle(
  editor: Editor,
  range: { from: number; to: number }
): Record<string, string> | null {
  try {
    // 检查编辑器是否已销毁
    if (!editor.view || editor.isDestroyed) {
      return null
    }

    const { view } = editor
    const { from, to } = range

    // 获取 wrapper 容器作为参考
    const wrapperElement = view.dom.closest('.editor-content-wrapper') as HTMLElement
    if (!wrapperElement) {
      console.warn('editor-content-wrapper not found')
      return null
    }

    const wrapperRect = wrapperElement.getBoundingClientRect()
    const scrollTop = wrapperElement.scrollTop
    const scrollLeft = wrapperElement.scrollLeft

    // 使用 domAtPos 获取 DOM 节点，然后创建 Range 来获取所有矩形
    const fromDOM = view.domAtPos(from)
    const toDOM = view.domAtPos(to)

    const domRange = document.createRange()
    domRange.setStart(fromDOM.node, fromDOM.offset)
    domRange.setEnd(toDOM.node, toDOM.offset)

    // 获取选区的所有矩形（在表格等复杂结构中会有多个）
    const rects = domRange.getClientRects()

    if (rects.length === 0) {
      return null
    }

    // 计算所有矩形的包围盒
    let minTop = Infinity
    let maxBottom = -Infinity

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i]
      if (!rect) continue
      minTop = Math.min(minTop, rect.top)
      maxBottom = Math.max(maxBottom, rect.bottom)
    }

    // 获取编辑器 DOM 的边界（用于 full line highlight）
    const editorRect = view.dom.getBoundingClientRect()

    // 计算相对于 wrapper 的坐标
    // Full line highlight: 左边界使用编辑器左边界，宽度使用编辑器完整宽度
    const margin = 0 // 可选的边距
    const left = editorRect.left - wrapperRect.left + scrollLeft
    const top = minTop - wrapperRect.top + scrollTop - margin
    const width = editorRect.width
    const height = maxBottom - minTop + margin * 2

    return {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: 'rgba(135, 206, 250, 0.12)',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      transition: 'all 0.15s ease'
    }
  } catch (error) {
    console.warn('Failed to calculate highlight style:', error)
    return null
  }
}

/**
 * 更新高亮样式
 */
function updateHighlight() {
  if (!props.show || !props.selectionRange || !props.editor) {
    highlightStyle.value = null
    return
  }

  highlightStyle.value = calculateHighlightStyle(props.editor, props.selectionRange)
}

/**
 * 处理滚动事件
 */
function handleScroll() {
  updateHighlight()
}

/**
 * 清理所有监听器和观察器
 */
function cleanup() {
  // 清理 editor 事件监听器
  if (props.editor && !props.editor.isDestroyed) {
    props.editor.off('update', updateHighlight)
    props.editor.off('selectionUpdate', updateHighlight)
  }

  // 清理滚动事件监听器（使用保存的 DOM 引用）
  if (editorDom) {
    editorDom.removeEventListener('scroll', handleScroll)
    editorDom = null
  }

  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

// 监听 props 变化
watch([() => props.selectionRange, () => props.show], updateHighlight, { immediate: true })

// 监听 editor 文档变化
watch(() => props.editor?.state.doc, updateHighlight, { deep: false })

// 生命周期钩子
onMounted(() => {
  if (props.editor && props.editor.view) {
    // 保存 DOM 引用，用于后续清理
    editorDom = props.editor.view.dom

    // 监听 editor 更新事件
    props.editor.on('update', updateHighlight)
    props.editor.on('selectionUpdate', updateHighlight)

    // 监听编辑器销毁事件，提前清理
    props.editor.on('destroy', cleanup)

    // 监听滚动事件
    editorDom.addEventListener('scroll', handleScroll)

    // 监听窗口大小变化
    resizeObserver = new ResizeObserver(() => {
      updateHighlight()
    })
    resizeObserver.observe(editorDom)
  }
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.selection-highlight-layer {
  z-index: 1;
  pointer-events: none;
}

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
  .selection-highlight-layer {
    background-color: rgba(100, 149, 237, 0.15) !important;
  }
}
</style>