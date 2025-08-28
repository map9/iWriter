<template>
  <node-view-wrapper 
    class="toolbar-warpper"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 内部控制按钮：在表格内部 -->
    <div 
      class="toolbar-controls inside-top-right"
      :class="{'outside-top': isInside}"
      v-show="shouldShowToolbar"
    >
      <!-- 表格头部切换组 -->
      <div class="control-group">
        <!-- 切换头部行 -->
        <button 
          @click.stop="toggleHeaderRow"
          class="control-button"
          :class="{ active: hasHeaderRow }"
          title="Toggle Header Row"
          contenteditable="false"
        >
          <IconTableRow class="control-button-icon" />
        </button>

        <!-- 切换头部列 -->
        <button 
          @click.stop="toggleHeaderColumn"
          class="control-button"
          :class="{ active: hasHeaderColumn }"
          title="Toggle Header Column"
          contenteditable="false"
        >
          <IconTableColumn class="control-button-icon" />
        </button>
      </div>
      
      <!-- 列操作组 1: 左侧操作 -->
      <div class="control-group" v-show="isInside">
        <button 
          @click.stop="moveColumnLeft"
          class="control-button"
          :class="{ disabled: !canMoveLeft }"
          :disabled="!canMoveLeft"
          title="Move Column Left"
          contenteditable="false"
        >
          <IconArrowLeft class="control-button-icon" />
        </button>
        <button 
          @click.stop="addColumnLeft"
          class="control-button"
          title="Add Column Left"
          contenteditable="false"
        >
          <IconColumnInsertLeft class="control-button-icon" />
        </button>
        <button 
          @click.stop="addColumnRight"
          class="control-button"
          title="Add Column Right"
          contenteditable="false"
        >
          <IconColumnInsertRight class="control-button-icon" />
        </button>
        <button 
          @click.stop="moveColumnRight"
          class="control-button"
          :class="{ disabled: !canMoveRight }"
          :disabled="!canMoveRight"
          title="Move Column Right"
          contenteditable="false"
        >
          <IconArrowRight class="control-button-icon" />
        </button>
      </div>

      <!-- 删除列按钮 -->
      <button 
        @click.stop="deleteColumn"
        class="control-button delete-button"
        title="Delete Column"
        contenteditable="false"
        v-show="isInside"
      >
        <IconColumnRemove class="control-button-icon" />
      </button>
      
      <!-- 主要按钮组 -->
      <div class="control-group">
        <!-- 复制表格按钮 -->
        <button 
          @click.stop="copyTable"
          class="control-button"
          title="Copy Table"
          contenteditable="false"
        >
          <IconCopy class="control-button-icon" />
        </button>
      </div>
        
      <!-- 删除表格按钮 -->
      <button 
        @click.stop="deleteTable"
        class="control-button delete-button"
        title="Delete Table"
        contenteditable="false"
      >
        <IconTrash class="control-button-icon" />
      </button>
    </div>

    <div 
      class="toolbar-controls"
      :class="{'outside-left': isInside}"
      v-show="isInside"
    >
      <!-- 行操作组 1: 上方操作 -->
      <div class="control-group">
        <button 
          @click.stop="moveRowAbove"
          class="control-button"
          :class="{ disabled: !canMoveUp }"
          :disabled="!canMoveUp"
          title="Move Row Above"
          contenteditable="false"
        >
          <IconArrowUp class="control-button-icon" />
        </button>
        <button 
          @click.stop="addRowAbove"
          class="control-button"
          title="Add Row Above"
          contenteditable="false"
        >
          <IconRowInsertTop class="control-button-icon" />
        </button>
        <button 
          @click.stop="addRowBelow"
          class="control-button"
          title="Add Row Below"
          contenteditable="false"
        >
          <IconRowInsertBottom class="control-button-icon" />
        </button>
        <button 
          @click.stop="moveRowBelow"
          class="control-button"
          :class="{ disabled: !canMoveDown }"
          :disabled="!canMoveDown"
          title="Move Row Below"
          contenteditable="false"
        >
          <IconArrowDown class="control-button-icon" />
        </button>
      </div>

      <!-- 删除行按钮 -->
      <button 
        @click.stop="deleteRow"
        class="control-button delete-button"
        title="Delete Row"
        contenteditable="false"
      >
        <IconRowRemove class="control-button-icon" />
      </button>
    </div>
    
    <div class="tableWrapper">
      <table ref="tableRef">
        <colgroup ref="colgroupRef">
        </colgroup>
        <node-view-content as="tbody" />
      </table>
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, watchEffect } from 'vue'
import { nodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables'
import { 
  IconTrash, 
  IconCopy, 
  IconTableRow, 
  IconTableColumn,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconArrowLeft,
  IconArrowRight,
  IconRowInsertTop,
  IconRowInsertBottom,
  IconArrowUp,
  IconArrowDown,
  IconColumnRemove,
  IconRowRemove
} from '@tabler/icons-vue'
import { isSelectionInsideNode } from '../utils/isSelectionInsideNode'
import { notify } from '@/utils/notifications'
import { 
  moveColumnLeft as moveColumnLeftUtil, 
  moveColumnRight as moveColumnRightUtil,
  moveRowAbove as moveRowAboveUtil,
  moveRowBelow as moveRowBelowUtil,
  canMoveColumnLeft,
  canMoveColumnRight,
  canMoveRowAbove,
  canMoveRowBelow
} from '../utils/TableOperations'

const props = defineProps(nodeViewProps)

const isHovered = ref(false)
const isInside = ref(false)

const cellMinWidth = computed(() => {
  return props.extension?.options?.cellMinWidth || 25
})

const shouldShowToolbar = computed((): boolean => {
  return isHovered.value || isInside.value
})

const hasHeaderRow = computed((): boolean => {
  try {
    if (props.node && props.node.firstChild) {
      const firstRow = props.node.firstChild
      if (firstRow.childCount > 0) {
        // 检查第一行的所有单元格是否都是 tableHeader
        let allHeaderCells = true
        for (let i = 0; i < firstRow.childCount; i++) {
          const cell = firstRow.child(i)
          if (cell.type.name !== 'tableHeader') {
            allHeaderCells = false
            break
          }
        }
        return allHeaderCells && firstRow.childCount > 0
      }
    }
    return false
  } catch (error) {
    console.error('Check header row failed:', error)
    return false
  }
})

const hasHeaderColumn = computed((): boolean => {
  try {
    if (props.node && props.node.childCount > 0) {
      // 检查每一行的第一个单元格是否都是 tableHeader
      let allFirstCellsAreHeaders = true
      for (let i = 0; i < props.node.childCount; i++) {
        const row = props.node.child(i)
        if (row.childCount > 0) {
          const firstCell = row.firstChild
          if (firstCell && firstCell.type.name !== 'tableHeader') {
            allFirstCellsAreHeaders = false
            break
          }
        }
      }
      return allFirstCellsAreHeaders && props.node.childCount > 0
    }
    return false
  } catch (error) {
    console.error('Check header column failed:', error)
    return false
  }
})

// 移动状态检查的计算属性
const canMoveLeft = computed((): boolean => {
  try {
    return props.editor ? canMoveColumnLeft(props.editor) : false
  } catch (error) {
    return false
  }
})

const canMoveRight = computed((): boolean => {
  try {
    return props.editor ? canMoveColumnRight(props.editor) : false
  } catch (error) {
    return false
  }
})

const canMoveUp = computed((): boolean => {
  try {
    return props.editor ? canMoveRowAbove(props.editor) : false
  } catch (error) {
    return false
  }
})

const canMoveDown = computed((): boolean => {
  try {
    return props.editor ? canMoveRowBelow(props.editor) : false
  } catch (error) {
    return false
  }
})

watch(() => props.node, () => {
  nextTick(() => {
    updateColumns()
  })
}, { deep: true })

watchEffect(() => {
  if (props.selected) {
    isInside.value = true
    return
  }

  const { state } = props.editor
  const selection = state.selection
  const pos = props.getPos?.()

  if (pos == null) {
    isInside.value = false
    return
  }

  const end = pos + props.node.nodeSize
  isInside.value = selection.from >= pos && selection.to <= end
})

// DOM引用
const tableRef = ref<HTMLTableElement>()
const colgroupRef = ref<HTMLElement>()

// 手动更新列（模拟TableView的updateColumns函数）
const updateColumns = () => {
  if (!tableRef.value || !colgroupRef.value || !props.node) {
    return
  }

  try {
    let totalWidth = 0
    let fixedWidth = true
    let nextDOM = colgroupRef.value.firstChild
    const row = props.node.firstChild

    if (row !== null) {
      for (let i = 0, col = 0; i < row.childCount; i += 1) {
        const { colspan, colwidth } = row.child(i).attrs
        for (let j = 0; j < colspan; j += 1, col += 1) {
          const hasWidth = colwidth && colwidth[j]
          totalWidth += hasWidth || cellMinWidth.value
          if (!hasWidth) {
            fixedWidth = false
          }
          // 小心，不要在<colgroup ref="colgroupRef"></colgroup>插入任何东西，注释也不行，否则nextDOM就会出现错误。
          if (!nextDOM) {
            const colElement = document.createElement('col')
            if (hasWidth) {
              colElement.style.width = `${Math.max(hasWidth, cellMinWidth.value)}px`
            } else {
              colElement.style.minWidth = `${cellMinWidth.value}px`
            }
            colgroupRef.value.appendChild(colElement)
          } else {
            const colElement = nextDOM as HTMLElement
            if (hasWidth) {
              colElement.style.width = `${Math.max(hasWidth, cellMinWidth.value)}px`
              colElement.style.minWidth = ''
            } else {
              colElement.style.width = ''
              colElement.style.minWidth = `${cellMinWidth.value}px`
            }
            nextDOM = nextDOM.nextSibling
          }
        }
      }
    }

    // 清理多余的col元素
    while (nextDOM) {
      const after = nextDOM.nextSibling
      nextDOM.parentNode?.removeChild(nextDOM)
      nextDOM = after
    }

    // 设置表格宽度
    if (fixedWidth) {
      tableRef.value.style.width = `${totalWidth}px`
      tableRef.value.style.minWidth = ''
    } else {
      tableRef.value.style.width = ''
      tableRef.value.style.minWidth = `${totalWidth}px`
    }
  } catch (error) {
    console.error('更新列失败:', error)
  }
}

// 生命周期管理
onMounted(() => {
  nextTick(() => {
    updateColumns()
  })
})

// Methods
const handleMouseEnter = (): void => {
  isHovered.value = true
}

const handleMouseLeave = (): void => {
  isHovered.value = false
}


function focusCell(rowIndex: number, columnIndex: number): boolean {
  const { state, view } = props.editor
  const tablePos = props.getPos()
  if (tablePos == null) return false

  const map = TableMap.get(props.node)
  const cellIndex = rowIndex * map.width + columnIndex
  const cellOffset = map.map[cellIndex]

  const pos = tablePos + cellOffset
  const $pos = state.doc.resolve(pos + 1)

  const tr = state.tr.setSelection(new TextSelection($pos))
  view.dispatch(tr)
  view.focus()
  return true
}

const toggleHeaderRow = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)

  try {
    props.editor.chain().focus().toggleHeaderRow().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '切换表格头部行错误')
  }
}

const toggleHeaderColumn = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)

  try {
    props.editor.chain().focus().toggleHeaderColumn().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '切换表格头部列错误')
  }
}

const copyTable = async (): Promise<void> => {
  try {
    // 获取表格的HTML内容
    const tableElement = props.editor.view.dom.querySelector('table')
    if (tableElement) {
      // 创建一个临时的div来包含表格
      const tempDiv = document.createElement('div')
      tempDiv.appendChild(tableElement.cloneNode(true))
      
      // 同时复制HTML和纯文本格式
      const htmlContent = tempDiv.innerHTML
      const textContent = tableElement.innerText || tableElement.textContent || ''
      
      // 使用 Clipboard API 复制多种格式
      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([textContent], { type: 'text/plain' })
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        // 降级方案：只复制纯文本
        await navigator.clipboard.writeText(textContent)
      }
      
      notify.success('表格已复制到剪贴板')
    } else {
      notify.warning('未找到表格内容')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '表格复制错误')
  }
}

const deleteTable = (): void => {
  try {
    // 删除当前表格节点
    if (props.deleteNode) {
      props.deleteNode()
      notify.success('表格已删除')
    } else {
      // 备用方案：使用编辑器命令删除表格
      props.editor.chain().focus().deleteTable().run()
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '删除表格错误')
  }
}

// 列操作函数
const addColumnLeft = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  try {
    props.editor.chain().focus().addColumnBefore().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '添加左侧列错误')
  }
}

const addColumnRight = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  try {
    props.editor.chain().focus().addColumnAfter().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '添加右侧列错误')
  }
}

const moveColumnLeft = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  
  try {
    const success = moveColumnLeftUtil(props.editor)
    if (success) {
      notify.success('列已向左移动')
    } else {
      notify.warning('无法向左移动列（可能已是最左列）')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '移动列错误')
  }
}

const moveColumnRight = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  
  try {
    const success = moveColumnRightUtil(props.editor)
    if (success) {
      notify.success('列已向右移动')
    } else {
      notify.warning('无法向右移动列（可能已是最右列）')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '移动列错误')
  }
}

const deleteColumn = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  try {
    props.editor.chain().focus().deleteColumn().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '删除列错误')
  }
}

// 行操作函数
const addRowAbove = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  try {
    props.editor.chain().focus().addRowBefore().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '添加上方行错误')
  }
}

const addRowBelow = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  try {
    props.editor.chain().focus().addRowAfter().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '添加下方行错误')
  }
}

const moveRowAbove = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  
  try {
    const success = moveRowAboveUtil(props.editor)
    if (success) {
      notify.success('行已向上移动')
    } else {
      notify.warning('无法向上移动行（可能已是最上行）')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '移动行错误')
  }
}

const moveRowBelow = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  
  try {
    const success = moveRowBelowUtil(props.editor)
    if (success) {
      notify.success('行已向下移动')
    } else {
      notify.warning('无法向下移动行（可能已是最下行）')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '移动行错误')
  }
}

const deleteRow = (): void => {
  if (!isSelectionInsideNode(props)) focusCell(0, 0)
  try {
    props.editor.chain().focus().deleteRow().run()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '删除行错误')
  }
}
</script>

<style lang="scss" scoped>
@use './iwComponent.scss' as *;
</style>