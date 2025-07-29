<template>
  <div class="heading-toolbar">
    <!-- 标题级别选择器 -->
    <select 
      :value="currentLevel"
      @change="handleLevelChange"
      class="level-selector toolbar-select"
      title="Heading Level"
    >
      <option value="1">H1</option>
      <option value="2">H2</option>
      <option value="3">H3</option>
      <option value="4">H4</option>
      <option value="5">H5</option>
      <option value="6">H6</option>
    </select>
    
    <!-- 复制按钮 -->
    <button
      @click="handleCopy"
      class="toolbar-button copy-button"
      title="Copy Heading"
    >
      <IconCopy class="w-4 h-4" />
    </button>
    
    <!-- 删除按钮 -->
    <button
      @click="handleDelete"
      class="toolbar-button delete-button"
      title="Delete Heading"
    >
      <IconTrash class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconCopy, IconTrash } from '@tabler/icons-vue'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { notify } from '@/utils/notifications'

interface Props {
  editor: Editor
  node: ProseMirrorNode | null
  pos: number | null | undefined
  updateNode: (attrs: Record<string, any>) => void
  deleteNode: () => void
  copyNode: () => void
  hideToolbar?: () => void
}

const props = defineProps<Props>()

const currentLevel = computed(() => {
  return props.node?.attrs.level?.toString() || '1'
})

const handleLevelChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  const newLevel = parseInt(target.value, 10)
  
  try {
    props.updateNode({ level: newLevel })
    notify.success(`Heading level changed to H${newLevel}`)
  } catch (error) {
    console.error('Failed to update heading level:', error)
    notify.error('Failed to update heading level')
  }
}

const handleCopy = async () => {
  try {
    await props.copyNode()
    notify.success('Heading copied to clipboard')
  } catch (error) {
    notify.error('Failed to copy heading')
  }
}

const handleDelete = () => {
  try {
    props.deleteNode()
    notify.success('Heading deleted')
  } catch (error) {
    notify.error('Failed to delete heading')
  }
}
</script>

<style lang="scss" scoped>
.heading-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.level-selector {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  min-width: 60px;
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
</style>