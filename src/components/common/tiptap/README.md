# TipTap 通用媒体标题系统

## 概述

我们已经成功将原有的 `ImageWithCaption` 重构为通用的媒体标题系统，支持多种媒体类型（Image、Video、Audio、Table、YouTube）的标题功能。

## 核心架构

### 1. 基础组件 (`MediaWithCaption.ts`)
通用的媒体标题容器节点，提供核心功能：
- 标题位置控制（top/bottom/none）
- 标题文本编辑
- 文本对齐支持
- 统一的命令系统

### 2. 工厂函数 (`MediaCaptionFactory.ts`)
用于创建特定媒体类型的扩展：
```typescript
export function createMediaWithCaptionExtension(mediaType: string, options = {})
```

### 3. 通用视图组件 (`MediaWithCaptionView.vue`)
统一的渲染组件，根据媒体类型动态应用样式和布局。

## 支持的媒体类型

### 1. ImageWithCaption（图片 + 标题）
```typescript
// 使用示例
editor.commands.setImageWithCaption({
  src: 'image.jpg',
  alt: 'Alt text',
  title: 'Image title',
  showCaption: 'bottom',
  captionText: 'This is an image caption'
})
```

### 2. VideoWithCaption（视频 + 标题）
```typescript
// 支持的属性：src, poster, controls, autoplay, loop, muted
editor.commands.setVideoWithCaption({
  src: 'video.mp4',
  poster: 'thumbnail.jpg',
  controls: true,
  showCaption: 'bottom',
  captionText: 'Video caption'
})
```

### 3. AudioWithCaption（音频 + 标题）
```typescript
// 支持的属性：src, controls, autoplay, loop, muted, preload
editor.commands.setAudioWithCaption({
  src: 'audio.mp3',
  controls: true,
  showCaption: 'bottom',
  captionText: 'Audio caption'
})
```

### 4. TableWithCaption（表格 + 标题）
```typescript
// 支持的属性：bordered, striped, compact
editor.commands.setTableWithCaption({
  bordered: true,
  striped: false,
  showCaption: 'top',
  captionText: 'Table caption'
})
```

### 5. YoutubeWithCaption（YouTube + 标题）
```typescript
// 支持的属性：src, width, height, start, controls, nocookie
editor.commands.setYoutubeWithCaption({
  src: 'https://www.youtube.com/watch?v=VIDEO_ID',
  width: 640,
  height: 480,
  showCaption: 'bottom',
  captionText: 'YouTube video caption'
})
```

## 通用命令

所有媒体类型都支持以下通用命令：

### 标题位置控制
```typescript
// 切换标题位置（auto 模式会在 top/bottom 之间切换）
editor.commands.setCaptionPosition('auto')
editor.commands.setCaptionPosition('top')
editor.commands.setCaptionPosition('bottom')
editor.commands.setCaptionPosition('none')
```

### 标题文本编辑
```typescript
// 设置标题文本
editor.commands.setCaptionText('New caption text')

// 获取当前标题位置
const position = editor.commands.getCaptionPosition()
```

### 特定媒体类型命令
每种媒体类型都有专用命令：
```typescript
// 图片专用
editor.commands.toggleImageCaption()
editor.commands.setImageCaptionText('New text')
editor.commands.setImageCaptionPosition('top')

// 视频专用
editor.commands.toggleVideoCaption()
editor.commands.setVideoCaptionText('New text')

// 音频专用
editor.commands.toggleAudioCaption()
// ... 等等
```

## 快捷键

- `Cmd/Ctrl + Shift + C`: 切换当前媒体的标题显示

## 在 MarkdownEditorPage.vue 中的使用

```typescript
import Caption from '../common/tiptap/Caption'
import ImageWithCaption from '../common/tiptap/ImageWithCaption'
import VideoWithCaption from '../common/tiptap/VideoWithCaption'
import AudioWithCaption from '../common/tiptap/AudioWithCaption'
import TableWithCaption from '../common/tiptap/TableWithCaption'
import YoutubeWithCaption from '../common/tiptap/YoutubeWithCaption'

// 在 extensions 中添加
extensions: [
  Caption,
  ImageWithCaption,
  VideoWithCaption,
  AudioWithCaption,
  TableWithCaption,
  YoutubeWithCaption,
  
  // TextAlign 支持所有标题
  TextAlign.configure({
    types: ['heading', 'paragraph', 'caption'],
  }),
]
```

## 样式系统

### CSS 类名约定
- `.media-with-caption-wrapper`: 外层容器
- `.media-container`: 媒体容器
- `.media-{type}`: 特定媒体类型样式（如 `.media-image`）
- `.caption-{position}`: 标题位置样式（如 `.caption-top`）
- `.media-selected`: 选中状态样式

### 响应式设计
所有组件都支持响应式布局和深色主题。

## 扩展新媒体类型

要添加新的媒体类型，只需：

1. 使用工厂函数创建扩展：
```typescript
export const CustomMediaWithCaption = createMediaWithCaptionExtension('customMedia', {
  nodeViewComponent: MediaWithCaptionView,
  contentSchema: 'caption? customMedia caption?',
  defaultAttributes: {
    // 自定义属性
  }
})
```

2. 在 MarkdownEditorPage.vue 中添加到 extensions 列表

3. 在 MediaWithCaptionView.vue 中添加对应的样式类

## 向后兼容性

- 原有的 `ImageWithCaption` 功能完全保持兼容
- 所有现有的命令和API都继续工作
- HTML 解析和渲染保持向后兼容

## 优势

1. **统一架构**: 所有媒体类型使用相同的标题管理逻辑
2. **易于扩展**: 新媒体类型只需配置即可添加
3. **类型安全**: 完整的 TypeScript 支持
4. **代码复用**: 核心功能在所有媒体类型间共享
5. **用户体验**: 所有媒体的标题操作体验一致