<template>
  <node-view-wrapper 
    class="toolbar-warpper" 
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 工具栏：仅包含按钮 -->
    <div
      class="toolbar-controls"
      :class="{
        'inside-top-right': !isEditing,
        'outside-top-right': isEditing
      }"
      v-show="shouldShowToolbar">
      <div class="control-group">
        <button  v-show="isEditing" @click="confirmEdit" class="control-button confirm-button" title="Confirm" contenteditable="false">
          <IconCheck class="control-button-icon" />
        </button>
        <button  v-show="!isEditing" @click="toggleEditMode" class="control-button" title="Edit LaTeX" contenteditable="false">
          <IconEdit class="control-button-icon" />
        </button>
        <button @click="copyLatex" class="control-button" title="Copy LaTeX" contenteditable="false">
          <IconCopy class="control-button-icon" />
        </button>
        <button @click="deleteMathBlock" class="control-button delete-button" title="Delete" contenteditable="false">
          <IconTrash class="control-button-icon" />
        </button>
      </div>
    </div>

    <!-- LaTeX输入区：独立区域 -->
    <div class="latex-input-area" v-show="isEditing">
      <input 
        ref="latexInput"
        type="text" 
        class="latex-input" 
        v-model="editableLatex"
        @input="handleInput"
        @keydown="handleKeydown"
        placeholder="Enter LaTeX expression..."
        contenteditable="false"
      />
    </div>

    <!-- 数学内容区：保持原有样式 -->
    <div 
      class="tiptap-mathematics-render"
      :class="{
        'tiptap-mathematics-render--editable': props.editor.isEditable,
        }"
      data-type="block-math"
      contenteditable="false"
      >
      <div class="block-math-inner" ref="mathContent">
      <!-- KaTeX渲染结果会在这里 -->
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { IconEdit, IconCopy, IconTrash, IconCheck } from '@tabler/icons-vue'
import katex from 'katex'
import { notify } from '@/utils/notifications'

interface MathBlockAttributes {
  latex: string
}

const props = defineProps(nodeViewProps)

// Reactive data
const isHovered = ref(false)
const isEditing = ref(false)
const editableLatex = ref('')
const latexInput = ref<HTMLInputElement>()
const mathContent = ref<HTMLDivElement>()

// Computed properties
const mathAttrs = computed(() => props.node.attrs as MathBlockAttributes)

const shouldShowToolbar = computed((): boolean => {
  return (props.selected || isHovered.value) && props.editor.isEditable
})

const currentLatex = computed((): string => {
  return isEditing.value ? editableLatex.value : mathAttrs.value.latex
})

// Methods
const handleMouseEnter = (): void => {
  isHovered.value = true
}

const handleMouseLeave = (): void => {
  isHovered.value = false
}

const renderMath = (latex: string): void => {
  if (!mathContent.value) return
  
  const { katexOptions } = props.extension.options

  try {
    katex.render(latex || '', mathContent.value, katexOptions)
    mathContent.value.classList.remove('block-math-error')
  } catch {
    mathContent.value.textContent = latex
    mathContent.value.classList.add('block-math-error')
  }
}

// Watch for latex changes to re-render
watch(currentLatex, (newLatex) => {
  renderMath(newLatex)
}, { immediate: true })

const toggleEditMode = (): void => {
  isEditing.value = true
  editableLatex.value = mathAttrs.value.latex
  nextTick(() => {
    latexInput.value?.focus()
    latexInput.value?.select()
  })
}

const confirmEdit = (): void => {
  props.updateAttributes({ latex: editableLatex.value })
  isEditing.value = false
}

const copyLatex = async (): Promise<void> => {
  try {
    const latex = mathAttrs.value.latex
    if (!latex.trim()) {
      notify.warning('No LaTeX code to copy')
      return
    }
    
    await navigator.clipboard.writeText(latex)
    notify.success('LaTeX code copied to clipboard')
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'Copy Error')
  }
}

const deleteMathBlock = (): void => {
  if (props.deleteNode) {
    props.deleteNode()
  }
}

const handleInput = (): void => {
  // editableLatex.value已通过v-model自动更新
  // math-content会通过currentLatex计算属性和watch自动重渲染
}

const handleKeydown = (event: KeyboardEvent): void => {
  switch (event.key) {
    case 'Enter':
      event.preventDefault()
      event.stopPropagation()
      confirmEdit()
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      isEditing.value = false
      editableLatex.value = mathAttrs.value.latex
      break
    case 'Delete':
    case 'Backspace':
      event.stopPropagation()
      break
  }
}

// Initialize math rendering on mount
onMounted(() => {
  renderMath(mathAttrs.value.latex)
})
</script>

<style lang="scss" scoped>
@use './style.scss' as *;

.tiptap {
  .toolbar-warpper {
    .latex-input-area {
      width: 100%;
      padding: 8px;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      border-radius: 8px;
      margin-bottom: 8px;
      
      .latex-input {
        width: 100%;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: white;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 14px;
        outline: none;
        transition: all 0.2s ease;

        &::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }
        
        &:focus {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(59, 130, 246, 0.8);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
      }
    }
  }
}
</style>