<template>
  <node-view-wrapper 
    class="code-block"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 内部控制按钮：在代码块内部 -->
    <div 
      class="code-block-controls"
      v-show="shouldShowControls"
      :class="{ 'visible': shouldShowControls }"
    >
      <!-- 语言选择器 -->
      <select 
        contenteditable="false" 
        v-model="selectedLanguage"
        class="language-selector"
        @click.stop
      >
        <option :value="null">auto</option>
        <option disabled>—</option>
        <option v-for="(language, index) in languages" :value="language" :key="index">
          {{ language }}
        </option>
      </select>
      
      <!-- 按钮组 -->
      <div class="button-group">
        <!-- 复制按钮 -->
        <button 
          @click.stop="copyCode"
          class="copy-button control-button"
          title="Copy Code"
          contenteditable="false"
        >
          <IconCopy class="w-4 h-4" />
        </button>
        
        <!-- 格式化按钮 -->
        <button 
          @click.stop="formatCodeHandler"
          class="format-button control-button"
          :class="{ disabled: !canFormat }"
          :disabled="!canFormat"
          :title="canFormat ? 'Format Code' : `Language '${selectedLanguage}' not supported for formatting`"
          contenteditable="false"
        >
          <IconCode class="w-4 h-4" />
        </button>
        
        <!-- 删除按钮 -->
        <button 
          @click.stop="deleteCodeBlock"
          class="delete-button control-button"
          title="Delete Code Block"
          contenteditable="false"
        >
          <IconTrash class="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <!-- 代码内容区域 -->
    <pre><code><node-view-content /></code></pre>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'
import { IconTrash, IconCode, IconCopy } from '@tabler/icons-vue'
import { formatCode, isLanguageSupported, type FormatResult } from './CodeFormatter'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'

interface NodeAttributes {
  language: string
}

// Props
interface Props {
  node: ProseMirrorNode
  updateAttributes: (attrs: Partial<NodeAttributes>) => void
  deleteNode: () => void
  editor: Editor
  selected: boolean
  getPos: () => number
  extension: any
}

const props = defineProps<Props>()

// Reactive data
const languages = ref<string[]>(props.extension.options.lowlight.listLanguages())
const isHovered = ref(false)

// Computed properties
const selectedLanguage = computed({
  get(): string {
    return (props.node.attrs as NodeAttributes).language
  },
  set(language: string) {
    props.updateAttributes({ language })
  },
})

const shouldShowControls = computed((): boolean => {
  // 显示控制器的条件：节点被选中或鼠标悬停
  return props.selected || isHovered.value
})

const canFormat = computed((): boolean => {
  return isLanguageSupported(selectedLanguage.value)
})

// Methods
const handleMouseEnter = (): void => {
  isHovered.value = true
}

const handleMouseLeave = (): void => {
  isHovered.value = false
}

const copyCode = async (): Promise<void> => {
  // 获取当前代码内容
  const codeContent: string = props.node.textContent || ''
  
  if (!codeContent.trim()) {
    alert('No code to copy')
    return
  }
  
  try {
    // 使用 Clipboard API 复制到剪贴板
    await navigator.clipboard.writeText(codeContent)
    // 可以添加一个简短的成功提示
    console.log('Code copied to clipboard')
    // TODO: 可以添加一个临时的成功提示图标或消息
  } catch (error) {
    console.error('Failed to copy code:', error)
  }
}

const formatCodeHandler = async (): Promise<void> => {
  if (!canFormat.value) return
  
  // 获取当前代码内容
  const currentContent: string = props.node.textContent || ''
  
  if (!currentContent.trim()) {
    return // 空内容不需要格式化
  }
  
  try {
    // 格式化代码
    const result: FormatResult = await formatCode(currentContent, selectedLanguage.value)
    
    if (result.success && result.formattedCode) {
      // 更新节点内容，而不是替换整个节点
      const pos: number = props.getPos()
      const { state } = props.editor
      const { tr } = state
      
      // 计算节点内容的开始和结束位置
      const contentStart: number = pos + 1
      const contentEnd: number = pos + props.node.nodeSize - 1
      
      // 替换节点内的文本内容
      tr.replaceWith(contentStart, contentEnd, state.schema.text(result.formattedCode))
      
      props.editor.view.dispatch(tr)
    } else if (result.error) {
      console.error('Code formatting failed:', result.error)
      // 可以显示用户友好的错误消息
      alert(`Code formatting failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Unexpected formatting error:', error)
    alert('An unexpected error occurred during formatting')
  }
}

const deleteCodeBlock = (): void => {
  // 删除当前code block节点
  if (props.deleteNode) {
    props.deleteNode()
  }
}
</script>

<style lang="scss">
.tiptap {
  .code-block {
    position: relative;
    border-radius: 8px;
    background-color: #1a1a1a;
    
    .code-block-controls {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 8px;
      align-items: center;
      opacity: 0;
      transform: translateY(-4px);
      transition: all 0.2s ease;
      z-index: 10;
      
      &.visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .language-selector {
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        padding: 4px 8px;
        color: #fff;
        font-size: 12px;
        backdrop-filter: blur(8px);
        
        &:hover {
          background-color: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
        }
        
        &:focus {
          outline: none;
          border-color: rgba(59, 130, 246, 0.8);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        
        option {
          background-color: #2a2a2a;
          color: #fff;
        }
      }
      
      .button-group {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      
      .control-button {
        border: none;
        border-radius: 4px;
        padding: 4px;
        color: white;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        
        &:hover:not(.disabled) {
          transform: scale(1.05);
        }
        
        &:active:not(.disabled) {
          transform: scale(0.95);
        }
      }
      
      .copy-button {
        background-color: rgba(34, 197, 94, 0.8);
        
        &:hover {
          background-color: rgba(34, 197, 94, 1);
        }
      }
      
      .format-button {
        background-color: rgba(59, 130, 246, 0.8);
        
        &:hover:not(.disabled) {
          background-color: rgba(59, 130, 246, 1);
        }
        
        &.disabled {
          background-color: rgba(107, 114, 128, 0.5);
          cursor: not-allowed;
          opacity: 0.6;
        }
      }
      
      .delete-button {
        background-color: rgba(239, 68, 68, 0.8);
        
        &:hover {
          background-color: rgba(239, 68, 68, 1);
        }
      }
    }

    pre {
      margin: 0;
      padding: 16px;
      border-radius: 8px;
      background-color: #1a1a1a;
      color: #fff;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.5;
      overflow-x: auto;
      
      code {
        background: transparent;
        color: inherit;
        font-size: inherit;
        padding: 0;
      }
    }
    
    // 选中状态样式
    &.ProseMirror-selectednode {
      outline: 2px solid rgba(59, 130, 246, 0.5);
      outline-offset: 2px;
    }
  }
}
</style>