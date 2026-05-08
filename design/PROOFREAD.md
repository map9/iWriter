# IW Proofread Extension for TipTap

一个专为 TipTap 编辑器设计的高性能拼写检查和语法检查扩展，支持多种检查引擎和自定义配置。

## 特性

- ✅ **高性能架构**: 基于 Web Worker 池的多线程处理，支持增量更新和智能缓存
- ✅ **多引擎支持**: 内置 Typo.js 支持，可扩展 LanguageTool 等其他检查服务
- ✅ **实时交互**: 点击错误显示建议框，支持替换和忽略操作
- ✅ **智能缓存**: 基于内容哈希的节点级缓存，避免重复检查
- ✅ **防抖优化**: 可配置的防抖延迟，减少不必要的检查请求
- ✅ **TypeScript 支持**: 完整的类型定义和类型安全
- ✅ **可定制UI**: 支持自定义错误样式和建议框界面

## 快速开始

### 基础配置

```typescript
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { iwProofreadExtension } from './iw-proofread'

const editor = new Editor({
  element: document.getElementById('editor'),
  extensions: [
    StarterKit,
    iwProofreadExtension.configure({
      engineType: 'typo',
      language: 'en',
      dictionaryPath: '/dictionaries',
      enabled: true,
      debounceTime: 1000
    })
  ]
})
```

### 使用 LanguageTool

```typescript
import { createLanguageToolAdapter } from './iw-proofread'

// 创建 LanguageTool 适配器
const languageToolAdapter = createLanguageToolAdapter({
  language: 'en-US',
  timeout: 5000,
  debug: true
})

const editor = new Editor({
  extensions: [
    StarterKit,
    iwProofreadExtension.configure({
      engineType: 'languagetool',
      enabled: true,
      debounceTime: 1500 // LanguageTool 建议更长的防抖时间
    })
  ]
})
```

## 配置选项

```typescript
iwProofreadExtension.configure({
  // 拼写检查引擎类型
  engineType: 'typo' | 'languagetool' | 'custom',

  // 检查语言
  language: 'en',

  // 字典文件路径（Typo.js 引擎使用）
  dictionaryPath: '/dictionaries',

  // 最大 Worker 线程数
  maxWorkers: 4,

  // 是否默认启用
  enabled: true,

  // 是否显示错误标记
  showErrors: true,

  // 防抖延迟时间（毫秒）
  debounceTime: 1000,

  // 缓存大小限制
  cacheSize: 1000,

  // 缓存过期时间（毫秒）
  cacheExpiry: 300000 // 5分钟
})
```

## 可用命令

```typescript
// 启用/禁用拼写检查
editor.commands.enableSpellCheck()
editor.commands.disableSpellCheck()
editor.commands.toggleSpellCheck()

// 手动触发检查
editor.commands.checkSpelling()
editor.commands.checkChangedOnly()

// 检查指定范围
editor.commands.checkRange(from, to)

// 显示/隐藏错误标记
editor.commands.showErrors(true)
editor.commands.toggleErrorDisplay()
```

## LanguageTool 高级配置

### 基础适配器

```typescript
import { createLanguageToolAdapter } from './iw-proofread'

const adapter = createLanguageToolAdapter({
  apiUrl: 'https://api.languagetool.org/v2/check',
  language: 'en-US',
  apiKey: 'your-api-key', // 可选，付费用户
  timeout: 10000,
  debug: false,
  disabledRules: ['WHITESPACE_RULE'],
  enabledRules: []
})
```

### 高级适配器类

```typescript
import { LanguageToolAdvancedAdapter } from './iw-proofread'

const advancedAdapter = new LanguageToolAdvancedAdapter({
  language: 'en-US',
  apiKey: 'your-api-key',
  timeout: 8000,
  disabledRules: ['WHITESPACE_RULE', 'EN_QUOTES']
})

// 动态管理规则
advancedAdapter.addDisabledRule('COMMA_PARENTHESIS_WHITESPACE')
advancedAdapter.removeDisabledRule('WHITESPACE_RULE')
advancedAdapter.clearCache()
```

### 预设配置

```typescript
import { LanguageToolPresets } from './iw-proofread'

// 使用预设配置
const relaxedConfig = LanguageToolPresets.Relaxed() // 宽松模式
const strictConfig = LanguageToolPresets.Strict()   // 严格模式
const spellingOnlyConfig = LanguageToolPresets.SpellingOnly() // 仅拼写检查
```

### 本地服务器

```typescript
import { createLocalLanguageToolAdapter } from './iw-proofread'

const localAdapter = createLocalLanguageToolAdapter(
  'http://localhost:8081',
  {
    language: 'en-US',
    timeout: 3000
  }
)
```

## 自定义样式

```css
/* 拼写错误样式 */
.spelling-error {
  border-bottom: 2px wavy #ff4444;
  cursor: pointer;
}

/* 语法错误样式 */
.grammar-error {
  border-bottom: 2px wavy #ff8800;
  cursor: pointer;
}

/* 通用错误样式 */
.spell-error {
  border-bottom: 2px wavy #ff6666;
  cursor: pointer;
}

/* 建议框样式 */
.iw-spell-check-suggestions {
  font-family: system-ui, sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  background: white;
  border: 1px solid #ddd;
  z-index: 1000;
}

.iw-spell-check-suggestions .suggestion-item:hover {
  background-color: #e6f3ff;
}

.iw-spell-check-suggestions .ignore-button:hover {
  background-color: #f5f5f5;
  border-color: #bbb;
}
```

## 架构设计

### 整体架构

```
iwProofreadExtension
├── iwProofreadExtension.ts     # 主扩展文件
├── core/                       # 核心逻辑模块
│   ├── SpellCheckService.ts    # 拼写检查服务主类
│   ├── SpellWorkerPool.ts      # Web Worker 池管理
│   ├── nodeTypes.ts            # 类型定义
│   ├── utils.ts                # 工具函数
│   └── workers/
│       └── spellCheckWorker.ts # Web Worker 实现
├── adapters/                   # 适配器模块
│   ├── suggestionBoxAdapter.ts # 建议框UI适配器
│   └── languageToolAdapter.ts  # LanguageTool API适配器
└── index.ts                    # 主导出文件
```

### 核心组件

#### 1. iwProofreadExtension
- **功能**: TipTap 扩展主文件，负责集成到编辑器
- **特性**:
  - 插件状态管理
  - 文档变更检测
  - 装饰器（decoration）管理
  - 用户交互处理

#### 2. SpellCheckService
- **功能**: 拼写检查服务的核心协调器
- **特性**:
  - 节点级智能缓存
  - 批量处理优化
  - 缓存过期管理
  - 性能统计

#### 3. SpellWorkerPool
- **功能**: Web Worker 池管理，实现多线程处理
- **特性**:
  - 动态 Worker 管理
  - 任务队列处理
  - 引擎初始化
  - 错误处理和恢复

#### 4. spellCheckWorker
- **功能**: 在独立线程中执行拼写检查
- **特性**:
  - Typo.js 集成
  - 批量文本处理
  - 序列化数据处理

#### 5. 适配器系统
- **suggestionBoxAdapter**: 提供统一的建议框UI组件
- **languageToolAdapter**: LanguageTool API 集成和配置管理

### 性能优化

1. **增量更新**: 只检查文档中发生变更的节点
2. **智能缓存**: 基于内容哈希的节点级缓存机制
3. **多线程处理**: 使用 Web Worker 池避免阻塞主线程
4. **防抖机制**: 可配置的防抖延迟，减少频繁检查
5. **批量处理**: 将多个节点打包处理，提高效率
6. **内存管理**: 自动清理过期缓存，控制内存使用

### 工作流程

1. **初始化**: 创建 Worker 池，加载字典或初始化检查引擎
2. **变更检测**: 监听文档变更，标识需要检查的节点
3. **节点收集**: 收集变更的节点，生成检查请求
4. **缓存查询**: 检查节点是否已缓存结果
5. **多线程检查**: 将未缓存节点分发到 Worker 池处理
6. **结果合并**: 合并缓存和新检查的结果
7. **UI更新**: 更新装饰器，显示错误标记
8. **用户交互**: 处理点击事件，显示建议框

## 类型定义

### 核心接口

```typescript
interface SpellError {
  offset: number        // 相对于节点的偏移位置
  length: number        // 错误文本长度
  word: string         // 错误的单词
  suggestions: string[] // 建议替换词
  message?: string     // 错误描述
  type?: 'spelling' | 'grammar' // 错误类型
}

interface NodeSpellResult {
  nodeId: string       // 节点ID
  nodeKey: string      // 节点缓存键
  errors: SpellError[] // 检查结果
  checkedAt: number    // 检查时间戳
}
```

### 配置接口

```typescript
interface iwProofreadOptions {
  engineType?: 'typo' | 'languagetool' | 'custom'
  language?: string
  dictionaryPath?: string
  maxWorkers?: number
  enabled?: boolean
  showErrors?: boolean
  debounceTime?: number
  cacheSize?: number
  cacheExpiry?: number
}
```

## 开发和扩展

### 自定义检查引擎

1. 实现 Worker 检查逻辑
2. 返回标准的 `SpellError` 格式
3. 在 `SpellWorkerPool` 中注册新引擎类型

### 自定义建议框

```typescript
import { createTipTapSuggestionBox } from './iw-proofread'

const customSuggestionBox = createTipTapSuggestionBox({
  noSuggestions: '暂无建议'
})
```

### 性能监控

```typescript
const service = editor.extensionManager.extensions
  .find(ext => ext.name === 'iwProofread')
  ?.storage.spellService

const stats = service.getStats()
console.log('缓存大小:', stats.cacheSize)
console.log('活跃Worker数:', stats.activeWorkers)
```

## 注意事项

1. **字典文件**: Typo.js 需要 `.aff` 和 `.dic` 字典文件，确保路径正确
2. **CORS 配置**: LanguageTool API 需要正确的 CORS 配置
3. **性能调优**: 根据文档大小调整 `debounceTime` 和 `maxWorkers`
4. **内存管理**: 大文档建议调整 `cacheSize` 和 `cacheExpiry`
5. **网络超时**: LanguageTool 建议设置合适的 `timeout` 值