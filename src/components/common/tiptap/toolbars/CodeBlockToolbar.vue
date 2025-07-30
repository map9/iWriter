<template>
  <div class="codeblock-toolbar">

    <!-- 语言选择器 -->
    <select 
      contenteditable="false" 
      v-model="selectedLanguage"
      class="language-selector toolbar-select"
      title="Select Language"
      @click.stop
    >
      <option :value="null">auto</option>
      <option disabled>—</option>
      <option v-for="(language, index) in languages" :value="language" :key="index">
        {{ language }}
      </option>
    </select>

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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconCode } from '@tabler/icons-vue'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { notify } from '@/utils/notifications'
import { formatCode, isLanguageSupported, type FormatResult } from "@/components/common/utils/CodeFormatter"

interface Props {
  editor: Editor
  node: ProseMirrorNode | null
  pos: number | null | undefined
  updateNode: (attrs: Record<string, any>) => void
  hideToolbar?: () => void
}

interface NodeAttributes {
  language: string
}

const props = defineProps<Props>()
const languages = computed(() => {
  try {
    // 从编辑器的 CodeBlock 扩展获取语言列表
    const codeBlockExtension = props.editor.extensionManager.extensions.find(
      ext => ext.name === 'codeBlock'
    )
    
    if (codeBlockExtension?.options?.lowlight?.listLanguages) {
      const languages = codeBlockExtension.options.lowlight.listLanguages()
      // 对语言列表进行排序，并过滤掉一些不常用的
      return languages
        .filter((lang: string) => {
          // 过滤掉一些不常用或重复的语言
          const excluded = ['1c', 'abnf', 'accesslog', 'actionscript', 'ada']
          return !excluded.includes(lang)
        })
        .sort()
    }

    throw new Error('Unable to retrieve language list from CodeBlock extension')
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '编辑器扩展错误')
    return []
  }
})

// Computed properties
const selectedLanguage = computed({
  get(): string {
    return (props.node?.attrs as NodeAttributes).language
  },
  set(language: string) {
    props.updateNode({ language })
  },
})

const canFormat = computed((): boolean => {
  return isLanguageSupported(selectedLanguage.value)
})

const formatCodeHandler = async (): Promise<void> => {
  if (!canFormat.value) return
  
  // 获取当前代码内容
  const currentContent: string = props.node?.textContent || ''
  
  if (!currentContent.trim()) {
    return // 空内容不需要格式化
  }
  
  try {
    // 格式化代码
    const result: FormatResult = await formatCode(currentContent, selectedLanguage.value)
    
    if (result.success && result.formattedCode) {
      // 更新节点内容，而不是替换整个节点
      const pos: number = props.pos ?? 0
      const { state } = props.editor
      const { tr } = state
      
      // 计算节点内容的开始和结束位置
      const contentStart: number = pos + 1
      // @ts-ignore
      const contentEnd: number = pos + props.node.nodeSize - 1
      
      // 替换节点内的文本内容
      tr.replaceWith(contentStart, contentEnd, state.schema.text(result.formattedCode))
      
      props.editor.view.dispatch(tr)
    } else if (result.error) {
      throw new Error(result.error)
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码格式化错误')
  }
}
</script>

<style lang="scss" scoped>
.codeblock-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.language-selector {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  min-width: 80px;
  max-width: 120px;
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

.toolbar-button {
  border: none;
  border-radius: 4px;
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  
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
}
</style>