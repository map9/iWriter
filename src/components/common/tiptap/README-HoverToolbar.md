# 悬停工具栏系统 (Hover Toolbar System)

## 概述

这是一个为TipTap编辑器提供的通用悬停工具栏系统，允许在鼠标悬停在不同节点类型上时显示定制化的工具栏。

## 系统架构

### 核心组件

1. **HoverToolbarPlugin.ts** - TipTap扩展插件
   - 监听鼠标悬停事件
   - 管理工具栏显示状态
   - 提供插件状态管理

2. **HoverToolbar.vue** - 通用工具栏容器组件
   - 处理工具栏位置计算
   - 提供插槽机制供外部定义内容
   - 管理工具栏显示/隐藏逻辑

3. **toolbars/** - 特定节点类型的工具栏组件
   - `CodeBlockToolbar.vue` - 代码块专用工具栏
   - `HeadingToolbar.vue` - 标题专用工具栏  
   - `DefaultToolbar.vue` - 默认工具栏

## 使用方法

### 1. 添加扩展到编辑器

```typescript
import { HoverToolbarExtension } from '@/components/common/tiptap/HoverToolbarPlugin'

const editor = new Editor({
  extensions: [
    // 其他扩展...
    HoverToolbarExtension.configure({
      supportedNodeTypes: ['paragraph', 'heading', 'codeBlock', 'blockquote', 'image'],
      hoverDelay: 100,
      hideDelay: 200
    }),
  ]
})
```

### 2. 在模板中使用工具栏

```vue
<template>
  <HoverToolbar v-if="editor" :editor="editor">
    <template #default="{ editor, node, nodeType, pos, updateNode, deleteNode, copyNode, hideToolbar }">
      
      <!-- CodeBlock 工具栏 -->
      <CodeBlockToolbar 
        v-if="nodeType === 'codeBlock'"
        :editor="editor"
        :node="node"
        :pos="pos"
        :updateNode="updateNode"
        :deleteNode="deleteNode"
        :copyNode="copyNode"
        :hideToolbar="hideToolbar"
      />
      
      <!-- 其他节点类型的工具栏... -->
      
    </template>
  </HoverToolbar>
</template>
```

### 3. 创建自定义工具栏组件

```vue
<!-- MyCustomToolbar.vue -->
<template>
  <div class="my-custom-toolbar">
    <button @click="handleAction" class="toolbar-button">
      Action
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  editor: Editor
  node: ProseMirrorNode
  pos: number
  updateNode: (attrs: Record<string, any>) => void
  deleteNode: () => void
  copyNode: () => void
  hideToolbar?: () => void
}

const props = defineProps<Props>()

const handleAction = () => {
  // 自定义逻辑
  props.updateNode({ someAttr: 'newValue' })
}
</script>
```

## 配置选项

### HoverToolbarExtension 配置

- `supportedNodeTypes: string[]` - 支持悬停工具栏的节点类型
- `hoverDelay: number` - 悬停延迟时间（毫秒）
- `hideDelay: number` - 隐藏延迟时间（毫秒）

### 工具栏Props接口

所有工具栏组件都接收以下props：

- `editor: Editor` - TipTap编辑器实例
- `node: ProseMirrorNode` - 当前悬停的节点
- `pos: number` - 节点在文档中的位置
- `updateNode: (attrs) => void` - 更新节点属性的方法
- `deleteNode: () => void` - 删除节点的方法
- `copyNode: () => void` - 复制节点内容的方法
- `hideToolbar?: () => void` - 隐藏工具栏的方法

## CodeBlock工具栏功能

CodeBlock工具栏包含以下功能：

1. **语言选择器** - 选择代码语言，支持syntax highlighting
2. **复制按钮** - 复制代码内容到剪贴板
3. **删除按钮** - 删除整个代码块

### 支持的语言

工具栏自动从lowlight配置中获取支持的语言列表，包括常用的编程语言如JavaScript、Python、Java等。

## 样式自定义

### 通用样式类

- `.hover-toolbar` - 工具栏容器
- `.toolbar-button` - 工具栏按钮
- `.toolbar-select` - 工具栏选择器
- `.copy-button` - 复制按钮
- `.delete-button` - 删除按钮
- `.edit-button` - 编辑按钮

### 自定义样式

可以通过覆盖CSS变量或类来自定义工具栏外观：

```scss
.hover-toolbar {
  background: rgba(0, 0, 0, 0.8);
  border-radius: 12px;
  
  .toolbar-button {
    border-radius: 6px;
    
    &.copy-button {
      background: #4ade80;
    }
  }
}
```

## 扩展新节点类型

要为新的节点类型添加工具栏支持：

1. 将节点类型添加到 `supportedNodeTypes` 配置中
2. 创建专用的工具栏组件
3. 在HoverToolbar模板中添加条件渲染

```vue
<!-- 添加新的节点类型支持 -->
<MyImageToolbar 
  v-else-if="nodeType === 'image'"
  :editor="editor"
  :node="node"
  :pos="pos"
  :updateNode="updateNode"
  :deleteNode="deleteNode"
  :copyNode="copyNode"
  :hideToolbar="hideToolbar"
/>
```

## 注意事项

1. 工具栏使用 `teleport` 渲染到 `body`，确保不被其他元素遮挡
2. 鼠标悬停检测有防抖机制，避免频繁触发
3. 工具栏位置会自动调整以避免超出视口
4. 工具栏在编辑器滚动时会自动更新位置

## 开发建议

1. 保持工具栏组件的简洁性，避免过多功能
2. 使用统一的样式类以保持视觉一致性
3. 为每个操作提供适当的用户反馈（如通知消息）
4. 考虑键盘无障碍性支持