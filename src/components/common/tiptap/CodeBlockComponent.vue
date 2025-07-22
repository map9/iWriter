<template>
  <node-view-wrapper 
    class="code-block-wrapper"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 外部控制工具栏：完全在代码块之外 -->
    <div 
      class="code-block-toolbar"
      v-show="shouldShowControls"
      :class="{ 'visible': shouldShowControls }"
      @mouseenter="handleToolbarMouseEnter"
      @mouseleave="handleToolbarMouseLeave"
    >
      <!-- 右侧：语言选择器 -->
      <div class="toolbar-left">
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
      </div>

      <!-- 左侧按钮组：复制和格式化 -->
      <div class="toolbar-right">
        <div class="button-group">
          <!-- 复制按钮 -->
          <button 
            @click.stop="copyCode"
            class="copy-button toolbar-button"
            title="Copy Code"
            contenteditable="false"
          >
            <IconCopy class="w-4 h-4" />
          </button>
          
          <!-- 格式化按钮 -->
          <button 
            @click.stop="formatCode"
            class="format-button toolbar-button"
            :class="{ disabled: !canFormat }"
            :disabled="!canFormat"
            :title="canFormat ? 'Format Code' : `Language '${selectedLanguage}' not supported for formatting`"
            contenteditable="false"
          >
            <IconCode class="w-4 h-4" />
          </button>
        </div>
        
        <!-- 分隔符 -->
        <div class="toolbar-separator"></div>
        
        <!-- 删除按钮 -->
        <button 
          @click.stop="deleteCodeBlock"
          class="delete-button toolbar-button"
          title="Delete Code Block"
          contenteditable="false"
        >
          <IconTrash class="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <!-- 代码内容区域 -->
    <div class="code-block">
      <pre><code><node-view-content /></code></pre>
    </div>
  </node-view-wrapper>
</template>

<script>
import { NodeViewContent, nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { IconTrash, IconCode, IconCopy } from '@tabler/icons-vue'
import { formatCode, isLanguageSupported } from './codeFormatter'

export default {
  components: {
    NodeViewWrapper,
    NodeViewContent,
    IconTrash,
    IconCode,
    IconCopy,
  },

  props: nodeViewProps,

  data() {
    return {
      languages: this.extension.options.lowlight.listLanguages(),
      isHovered: false,
      isToolbarHovered: false,
    }
  },

  computed: {
    selectedLanguage: {
      get() {
        return this.node.attrs.language
      },
      set(language) {
        this.updateAttributes({ language })
      },
    },
    
    shouldShowControls() {
      // 显示控制器的条件：节点被选中、鼠标悬停、或工具栏被悬停
      return this.selected || this.isHovered || this.isToolbarHovered
    },
    
    canFormat() {
      return isLanguageSupported(this.selectedLanguage)
    },
  },

  methods: {
    handleMouseEnter() {
      this.isHovered = true
    },
    
    handleMouseLeave() {
      this.isHovered = false
    },
    
    handleToolbarMouseEnter() {
      this.isToolbarHovered = true
    },
    
    handleToolbarMouseLeave() {
      this.isToolbarHovered = false
    },
    
    async copyCode() {
      // 获取当前代码内容
      const codeContent = this.node.textContent || ''
      
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
        // 降级到传统方法
        this.copyCodeFallback(codeContent)
      }
    },
    
    copyCodeFallback(text) {
      // 降级的复制方法，适用于不支持 Clipboard API 的浏览器
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      try {
        document.execCommand('copy')
        console.log('Code copied to clipboard (fallback)')
      } catch (error) {
        console.error('Fallback copy failed:', error)
        alert('Copy failed. Please copy manually.')
      }
      
      document.body.removeChild(textArea)
    },
    
    async formatCode() {
      if (!this.canFormat) return
      
      // 获取当前代码内容
      const currentContent = this.node.textContent || ''
      
      if (!currentContent.trim()) {
        return // 空内容不需要格式化
      }
      
      try {
        // 格式化代码
        const result = await formatCode(currentContent, this.selectedLanguage)
        
        if (result.success && result.formattedCode) {
          // 更新节点内容，而不是替换整个节点
          const pos = this.getPos()
          const { state } = this.editor
          const { tr } = state
          
          // 计算节点内容的开始和结束位置
          const contentStart = pos + 1
          const contentEnd = pos + this.node.nodeSize - 1
          
          // 替换节点内的文本内容
          tr.replaceWith(contentStart, contentEnd, state.schema.text(result.formattedCode))
          
          this.editor.view.dispatch(tr)
        } else if (result.error) {
          console.error('Code formatting failed:', result.error)
          // 可以显示用户友好的错误消息
          alert(`Code formatting failed: ${result.error}`)
        }
      } catch (error) {
        console.error('Unexpected formatting error:', error)
        alert('An unexpected error occurred during formatting')
      }
    },
    
    deleteCodeBlock() {
      // 删除当前code block节点
      if (this.deleteNode) {
        this.deleteNode()
      }
    },
  },
}
</script>

<style lang="scss">
.tiptap {
  .code-block-wrapper {
    position: relative;
    margin: 8px 0;
    
    // 外部工具栏样式
    .code-block-toolbar {
      position: absolute;
      top: -36px; // 完全位于代码块上方
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      opacity: 0;
      transform: translateY(8px);
      transition: all 0.2s ease-in-out;
      z-index: 20;
      height: 36px;
      padding: 0 12px;
      background-color: rgba(255, 255, 255, 0.45);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px 8px 0 0; // 顶部圆角，与代码块连接
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(8px);
      
      // 创建一个不可见的桥接区域，连接工具栏和代码块
      &::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        right: 0;
        height: 2px;
        background: transparent;
      }
      
      &.visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      // 左侧按钮区域
      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
        
        .button-group {
          display: flex;
          align-items: center;
          gap: 2px;
          background-color: rgba(0, 0, 0, 0.05);
          border-radius: 6px;
          padding: 2px;
        }
        
        .toolbar-separator {
          width: 1px;
          height: 20px;
          background-color: rgba(0, 0, 0, 0.15);
          margin: 0 4px;
        }
      }
      
      // 右侧选择器区域
      .toolbar-left {
        display: flex;
        align-items: center;
      }
      
      // 通用按钮样式
      .toolbar-button {
        height: 24px;
        width: 24px;
        border: none;
        border-radius: 4px;
        color: #374151;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: transparent;
        
        &:hover:not(.disabled) {
          background-color: rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }
        
        &:active:not(.disabled) {
          transform: translateY(0);
        }
      }
      
      // 复制按钮样式
      .copy-button {
        // 继承通用按钮样式
      }
      
      // 格式化按钮样式  
      .format-button {
        &.disabled {
          color: #9ca3af;
          cursor: not-allowed;
          opacity: 0.5;
        }
      }
      
      // 删除按钮样式
      .delete-button {
        color: #ef4444;
        
        &:hover {
          background-color: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }
      }
      
      .language-selector {
        background-color: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 2px 10px;
        color: #374151;
        font-size: 12px;
        font-weight: 500;
        min-width: 100px;
        height: 24px;
        
        &:hover {
          border-color: #9ca3af;
        }
        
        &:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }
        
        option {
          background-color: #ffffff;
          color: #374151;
        }
      }
    }

    // 代码块内容样式
    .code-block {
      border-radius: 8px 8px; // 底部圆角，与工具栏连接
      background-color: #1a1a1a;
      position: relative;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-top: none; // 与toolbar连接
      
      pre {
        margin: 0;
        padding: 12px;
        background-color: transparent;
        color: #fff;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.6;
        overflow-x: auto;
        
        code {
          background: transparent;
          color: inherit;
          font-size: inherit;
          padding: 0;
        }
      }

      &:hover {
        border-radius: 0 0 8px 8px;
      }
    }
    
    // 选中状态样式
    &.ProseMirror-selectednode .code-block {
      outline: 2px solid rgba(59, 130, 246, 0.5);
      outline-offset: 2px;
    }
    
    // 悬停状态增强
    &:hover {
      .code-block {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    }
  }
}

// 暗色主题适配（如果需要）
@media (prefers-color-scheme: dark) {
  .tiptap {
    .code-block-wrapper {
      .code-block-toolbar {
        background-color: rgba(31, 41, 55, 0.95);
        border-color: rgba(75, 85, 99, 0.3);
        
        .toolbar-right {
          .button-group {
            background-color: rgba(255, 255, 255, 0.1);
          }
          
          .toolbar-separator {
            background-color: rgba(255, 255, 255, 0.2);
          }
        }
        
        .toolbar-button {
          color: #f9fafb;
          
          &:hover:not(.disabled) {
            background-color: rgba(255, 255, 255, 0.1);
          }
        }
        
        .delete-button {
          color: #f87171;
          
          &:hover {
            background-color: rgba(239, 68, 68, 0.2);
            color: #f87171;
          }
        }
        
        .language-selector {
          background-color: #374151;
          border-color: #4b5563;
          color: #f9fafb;
          
          &:hover {
            border-color: #6b7280;
          }
          
          &:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
          }
          
          option {
            background-color: #374151;
            color: #f9fafb;
          }
        }
      }
      
      .code-block {
        border-color: rgba(75, 85, 99, 0.3);
      }
    }
  }
}
</style>