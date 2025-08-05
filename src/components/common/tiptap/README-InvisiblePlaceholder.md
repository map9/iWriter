# InvisiblePlaceholder扩展集成指南

## 概述

InvisiblePlaceholder是一个统一的TipTap扩展，解决了InvisibleCharacters和Placeholder同时使用时的冲突问题。它通过统一的装饰器架构，避免了DOM操作冲突导致的逆向滚动问题。

## 核心特性

- ✅ **统一装饰器系统**：避免多个扩展的DOM冲突
- ✅ **智能优先级管理**：支持三种显示模式
- ✅ **无滚动异常**：解决换行时的逆向滚动问题
- ✅ **完整功能整合**：包含原有两个扩展的所有功能
- ✅ **高性能**：单次DOM操作，减少重排重绘

## 快速集成

### 1. 替换现有扩展

在`MarkdownEditorPage.vue`中替换原有配置：

```typescript
// 原有配置 (有冲突)
// InvisibleCharacters,
// Placeholder.configure({
//   placeholder: onPlaceholder,
// }),

// 新的统一扩展
import { InvisiblePlaceholder } from '@/components/common/tiptap/InvisiblePlaceholder'
import '@/components/common/tiptap/InvisiblePlaceholder.scss'

const extensions = [
  // ... 其他扩展
  InvisiblePlaceholder.configure({
    // 占位符配置
    placeholder: (node, pos) => {
      if (node?.type.name === 'paragraph') {
        return '输入内容...'
      }
      return '继续写作...'
    },
    showOnlyWhenEditable: true,
    showOnlyCurrent: true,
    
    // 不可见字符配置
    showInvisibleCharacters: true,
    showSpace: true,
    showTab: true,
    showHardBreak: true,
    showParagraph: true,
    
    // 显示模式 ('placeholder' | 'invisible' | 'both')
    priorityMode: 'both',
  }),
  // ... 其他扩展
]
```

### 2. 更新菜单操作

在`menuAction.ts`中更新命令：

```typescript
// 原有命令
// case 'toggle-invisible-characters':
//   editor.commands.toggleInvisibleCharacters()
//   return true

// 新的命令
case 'toggle-invisible-characters':
  editor.commands.toggleInvisibleCharacters()
  return true

case 'toggle-placeholder':
  editor.commands.togglePlaceholder()
  return true

case 'set-priority-mode':
  editor.commands.setPriorityMode('both') // 或 'placeholder', 'invisible'
  return true
```

## 配置选项详解

### 占位符配置

```typescript
interface PlaceholderConfig {
  // 占位符文本 - 支持字符串或函数
  placeholder: string | ((node?: ProseMirrorNode, pos?: number) => string)
  
  // 仅在可编辑时显示
  showOnlyWhenEditable: boolean // 默认: true
  
  // 仅显示当前焦点节点的占位符
  showOnlyCurrent: boolean // 默认: true
  
  // 是否包含子节点
  includeChildren: boolean // 默认: false
}
```

### 不可见字符配置

```typescript
interface InvisibleConfig {
  // 启用不可见字符显示
  showInvisibleCharacters: boolean // 默认: true
  
  // 显示空格字符 (·)
  showSpace: boolean // 默认: true
  
  // 显示制表符 (→)
  showTab: boolean // 默认: true
  
  // 显示硬换行符 (↵)
  showHardBreak: boolean // 默认: true
  
  // 显示段落分隔符 (¶)
  showParagraph: boolean // 默认: true
}
```

### 优先级模式

```typescript
type PriorityMode = 'placeholder' | 'invisible' | 'both'

// 'placeholder': 优先显示占位符，隐藏不可见字符
// 'invisible': 优先显示不可见字符，空节点才显示占位符  
// 'both': 同时显示（推荐）
```

## 使用场景

### 场景1：写作模式（占位符优先）
```typescript
InvisiblePlaceholder.configure({
  priorityMode: 'placeholder',
  placeholder: '开始你的写作...',
  showOnlyCurrent: true,
})
```

### 场景2：编程模式（不可见字符优先）
```typescript
InvisiblePlaceholder.configure({
  priorityMode: 'invisible',
  showSpace: true,
  showTab: true,
  showHardBreak: true,
})
```

### 场景3：全功能模式（推荐）
```typescript
InvisiblePlaceholder.configure({
  priorityMode: 'both',
  placeholder: (node) => {
    switch (node?.type.name) {
      case 'heading': return '输入标题...'
      case 'paragraph': return '输入段落内容...'
      case 'blockquote': return '输入引用内容...'
      default: return '继续写作...'
    }
  },
  showInvisibleCharacters: true,
})
```

## 自定义样式

### CSS变量定制

```scss
.ProseMirror {
  // 自定义颜色
  --invisible-char-color: rgba(100, 100, 100, 0.3);
  --placeholder-color: rgba(150, 150, 150, 0.5);
  
  // 自定义字体
  .has-placeholder.is-empty::before {
    font-family: 'Custom Font', sans-serif;
    font-size: 14px;
  }
  
  // 自定义不可见字符符号
  .has-invisible[data-invisible*="space"]::after {
    content: "•"; // 使用实心圆点替代默认的·
  }
}
```

### 主题集成

```scss
// Light主题
.theme-light .ProseMirror {
  --invisible-char-color: rgba(0, 0, 0, 0.2);
  --placeholder-color: rgba(0, 0, 0, 0.4);
}

// Dark主题
.theme-dark .ProseMirror {
  --invisible-char-color: rgba(255, 255, 255, 0.3);
  --placeholder-color: rgba(255, 255, 255, 0.5);
}
```

## 动态控制

### 通过命令控制

```typescript
// 切换不可见字符显示
editor.commands.toggleInvisibleCharacters()

// 切换占位符模式
editor.commands.togglePlaceholder()

// 设置优先级模式
editor.commands.setPriorityMode('both')
```

### 通过选项更新

```typescript
// 动态更新配置
const extension = editor.extensionManager.extensions.find(
  ext => ext.name === 'invisiblePlaceholder'
)

if (extension) {
  extension.options.showInvisibleCharacters = false
  extension.options.priorityMode = 'placeholder'
  
  // 触发重新渲染
  editor.view.dispatch(editor.state.tr)
}
```

## 性能优化建议

1. **合理设置遍历范围**：
```typescript
InvisiblePlaceholder.configure({
  includeChildren: false, // 避免深度遍历
  showOnlyCurrent: true,  // 减少装饰器数量
})
```

2. **按需启用功能**：
```typescript
// 只在需要时启用不可见字符
showInvisibleCharacters: process.env.NODE_ENV === 'development'
```

3. **优化占位符函数**：
```typescript
// 避免复杂计算
const placeholderCache = new Map()
placeholder: (node) => {
  const key = node?.type.name || 'default'
  if (!placeholderCache.has(key)) {
    placeholderCache.set(key, computePlaceholder(key))
  }
  return placeholderCache.get(key)
}
```

## 迁移指南

### 从InvisibleCharacters迁移

```typescript
// 旧配置
InvisibleCharacters

// 新配置
InvisiblePlaceholder.configure({
  priorityMode: 'invisible',
  showInvisibleCharacters: true,
  // 其他默认配置保持不变
})
```

### 从Placeholder迁移

```typescript
// 旧配置
Placeholder.configure({
  placeholder: 'Write something...',
  showOnlyWhenEditable: true,
})

// 新配置
InvisiblePlaceholder.configure({
  priorityMode: 'placeholder',
  placeholder: 'Write something...',
  showOnlyWhenEditable: true,
  showInvisibleCharacters: false,
})
```

### 同时使用两者的迁移

```typescript
// 旧配置（有冲突）
InvisibleCharacters,
Placeholder.configure({
  placeholder: onPlaceholder,
})

// 新配置（无冲突）
InvisiblePlaceholder.configure({
  priorityMode: 'both',
  placeholder: onPlaceholder,
  showInvisibleCharacters: true,
})
```

## 故障排除

### 问题1：占位符不显示
**解决方案**：检查CSS是否正确导入，确认节点确实为空

### 问题2：不可见字符不显示  
**解决方案**：确认`showInvisibleCharacters: true`和对应字符类型已启用

### 问题3：样式冲突
**解决方案**：检查CSS加载顺序，确保扩展样式在最后加载

### 问题4：性能问题
**解决方案**：减少装饰器数量，优化占位符函数，避免复杂计算

## 总结

InvisiblePlaceholder扩展通过统一的架构设计，彻底解决了原有两个扩展的冲突问题，同时提供了更灵活的配置选项和更好的性能表现。建议在新项目中直接使用此扩展，在现有项目中按照迁移指南逐步替换。