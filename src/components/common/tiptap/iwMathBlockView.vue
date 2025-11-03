<template>
  <node-view-wrapper 
    ref="mathBlockRef"
    class="toolbar-warpper"
    :class="{ editing: isEditing }"
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
        <button  v-show="isEditing" @click="closeEdit" class="control-button confirm-button" title="Close" contenteditable="false">
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
      <textarea 
        ref="latexInput"
        class="latex-input" 
        v-model="editableLatex"
        @input="handleInput"
        @keydown="handleKeydown"
        placeholder="Enter LaTeX expression... (Ctrl+Enter to close, Escape to close)"
        contenteditable="false"
        rows="3"
      ></textarea>
    </div>

    <!-- 数学内容区：保持原有样式 -->
    <div 
      class="tiptap-mathematics-render"
      :class="{
        'tiptap-mathematics-render--editable': props.editor.isEditable && !isEditing,
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
const latexInput = ref<HTMLTextAreaElement>()
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

const handleInput = (): void => {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  
  const newLatex = editableLatex.value
  console.log('Updating LaTeX to:', newLatex)
  props.editor.chain()
    .setNodeSelection(pos)
    .updateBlockMath({ latex: newLatex })
    .run()
}

const closeEdit = (): void => {
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

const handleKeydown = (event: KeyboardEvent): void => {
  switch (event.key) {
    case 'Enter':
      if (event.ctrlKey || event.metaKey) {
        // Ctrl+Enter or Cmd+Enter to close edit
        event.preventDefault()
        event.stopPropagation()
        closeEdit()
      }
      // Allow normal Enter for line breaks
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      closeEdit()
      break
    case 'Delete':
    case 'Backspace':
      event.stopPropagation()
      break
  }
}


// Handle click outside to cancel editing
const mathBlockRef = ref()

const handleClickOutside = (event: MouseEvent): void => {
  if (!isEditing.value || !mathBlockRef.value) return
  
  const target = event.target as Element
  const domElement = mathBlockRef.value.$el || mathBlockRef.value
  
  // Check if click is outside the math block component
  if (!domElement?.contains(target)) {
    closeEdit()
  }
}

// Initialize math rendering on mount
onMounted(() => {
  renderMath(mathAttrs.value.latex)
  // Add global click listener
  document.addEventListener('click', handleClickOutside, true)
})

// Cleanup on unmount
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style lang="scss" scoped>

//.tiptap {
  .toolbar-warpper {
    &.editing {
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 0.5rem;
    }

    .latex-input-area {
      width: 100%;
      cursor: default;
      
      .latex-input {
        width: 100%;
        min-height: 30px;
        padding: 0.75rem 1rem;
        border: none;
        border-radius: 0.5rem 0.5rem 0 0;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        font-size: 14px;
        line-height: 1.5;
        outline: none;
        transition: all 0.2s ease;
        cursor: text;
        resize: none;
        vertical-align: middle;

        &::placeholder {
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.6);
        }
      }
    }
  }
//}
</style>