<template>
  <node-view-wrapper 
    class="toolbar-warpper"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 内部控制按钮：在代码块内部 -->
    <div 
      class="toolbar-controls"
      v-show="shouldShowToolbar"
    >
      <!-- 语言选择器 -->
      <select 
        contenteditable="false" 
        v-model="selectedLanguage"
        class="control-selector"
        @click.stop
      >
        <option :value="null">auto</option>
        <option disabled>—</option>
        <option v-for="(language, index) in languages" :value="language" :key="index">
          {{ language }}
        </option>
      </select>
      
      <!-- 按钮组 -->
      <div class="control-group">
        <!-- 格式化按钮 -->
        <button 
          @click.stop="formatCodeHandler"
          class="control-button"
          :class="{ disabled: !canFormat }"
          :disabled="!canFormat"
          :title="canFormat ? 'Format Code' : `Language '${selectedLanguage}' not supported for formatting`"
          contenteditable="false"
        >
          <IconCode class="control-button-icon" />
        </button>

        <!-- 复制按钮 -->
        <button 
          @click.stop="copyCode"
          class="control-button"
          title="Copy Code"
          contenteditable="false"
        >
          <IconCopy class="control-button-icon" />
        </button>
      </div>
        
      <!-- 删除按钮 -->
      <button 
        @click.stop="deleteCodeBlock"
        class="control-button delete-button"
        title="Delete Code Block"
        contenteditable="false"
      >
        <IconTrash class="control-button-icon" />
      </button>
    </div>
    
    <!-- 代码内容区域 -->
    <pre><node-view-content as="code"/></pre>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NodeViewContent, nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { IconTrash, IconCode, IconCopy } from '@tabler/icons-vue'
import { formatCode, isLanguageSupported, type FormatResult } from "@/components/common/utils/CodeFormatter"
import { notify } from '@/utils/notifications'

interface NodeAttributes {
  language: string
}

const props = defineProps(nodeViewProps)

const isHovered = ref(false)
const languages = computed<string[]>(() => {
  try {
    const languages = props.extension.options.lowlight.listLanguages()
    const language = (props.node.attrs as NodeAttributes).language

    // 如果languages不包含language，将它增加进去，如果有，不管
    let allLanguages = [...languages]
    if (language && !languages.includes(language)) {
      allLanguages.push(language)
    }

    return allLanguages
      .filter((lang: string) => {
      // 过滤掉一些不常用或重复的语言
      const excluded = ['1c', 'abnf', 'accesslog', 'actionscript', 'ada']
      return !excluded.includes(lang)
      })
      .sort()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码块扩展错误')
    return []
  }
})

// Computed properties
const selectedLanguage = computed({
  get(): string | null {
    return (props.node.attrs as NodeAttributes).language || null
  },
  set(language: string) {
    props.updateAttributes({ language })
  },
})

const shouldShowToolbar = computed((): boolean => {
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
    return
  }
  
  try {
    // 使用 Clipboard API 复制到剪贴板
    await navigator.clipboard.writeText(codeContent)
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码拷贝错误')
  }
}

const formatCodeHandler = async (): Promise<void> => {
    if (!canFormat.value) return

    const currentContent: string = props.node.textContent || ''
    if (!currentContent.trim()) return

    try {
      const result: FormatResult = await formatCode(currentContent, selectedLanguage.value)

      if (result.success && result.formattedCode) {
        // 保存当前选区
        const currentSelection = props.editor.state.selection

        // 使用编辑器命令更新内容，让lowlight有机会重新处理
        props.editor
          .chain()
          .focus()
          .setNodeSelection(props.getPos()!) // 选中当前代码块
          .insertContent({
            type: 'codeBlock',
            attrs: {
              language: selectedLanguage.value
            },
            content: [{
              type: 'text',
              text: result.formattedCode
            }]
          })
          .run()

        // 恢复选区到代码块内部合适位置
        const pos = props.getPos()!
        props.editor
          .chain()
          .setTextSelection(pos + 1) // 代码块内容开始位置
          .run()
      }
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码格式化错误')
    }
  }

const deleteCodeBlock = (): void => {
  // 删除当前code block节点
  if (props.deleteNode) {
    props.deleteNode()
  }
}
</script>

<style lang="scss" scoped>
@use './iwComponent.scss' as *;
</style>