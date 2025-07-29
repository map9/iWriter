<template>
  <div class="default-toolbar">
    <!-- 复制按钮 -->
    <button
      @click="handleCopy"
      class="toolbar-button"
      title="Copy Content"
    >
      <IconCopy class="toolbar-button-icon" />
    </button>
    
    <!-- 删除按钮 -->
    <button
      @click="handleDelete"
      class="toolbar-button delete-button"
      title="Delete Block"
    >
      <IconTrash class="toolbar-button-icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { IconCopy, IconTrash } from '@tabler/icons-vue'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { notify } from '@/utils/notifications'

interface Props {
  editor: Editor
  node: ProseMirrorNode | null
  pos: number | null | undefined
  deleteNode: () => void
  copyNode: () => void
  hideToolbar?: () => void
}

const props = defineProps<Props>()

const handleCopy = async () => {
  try {
    await props.copyNode()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '内容拷贝错误')
  }
}

const handleDelete = () => {
  try {
    props.deleteNode()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '内容删除错误')
  }
}
</script>

<style lang="scss" scoped>
.default-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>