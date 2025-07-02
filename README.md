# iWriter

一个基于 Electron + Vue 3 + TypeScript 的现代多格式文档编辑器。

## 特性

- 🎨 基于设计稿的现代化 UI 界面
- 📝 强大的 Markdown 编辑器（基于 TipTap v3.x）
- 🖼️ 图片查看器（支持缩放、旋转）
- 📄 PDF 查看器（开发中）
- 🗂️ 文件资源管理器
- 🔍 全文搜索功能
- 🏷️ 标签管理
- 📑 文档大纲（Table of Contents）
- 🤖 AI 聊天助手界面
- ⌨️ 完整的快捷键支持
- 🌈 Tailwind CSS 样式
- 📁 多文档类型支持（文本、图片、PDF）

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **桌面应用**: Electron
- **编辑器**: TipTap v3.x https://tiptap.dev/tiptap-editor-v3
- **样式**: Tailwind CSS + SCSS
- **图标**: Tabler Icons
- **状态管理**: Pinia
- **路由**: Vue Router
- **数学公式**: KaTeX
- **Markdown 转换**: Marked + TurndownService

## 项目结构

```
iWriter/
├── design/               # 设计稿文件
├── electron/             # Electron 主进程
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本
│   └── tsconfig.json     # TypeScript 配置
├── src/                  # Vue 应用源码
│   ├── components/       # 组件
│   │   ├── pages/        # 文档页面组件
│   │   │   ├── WelcomePage.vue        # 欢迎页面
│   │   │   ├── MarkdownEditorPage.vue # Markdown 编辑器页面
│   │   │   ├── ImageViewerPage.vue    # 图片查看器页面
│   │   │   └── PDFViewerPage.vue      # PDF 查看器页面
│   │   ├── sidebar/      # 侧边栏相关组件
│   │   ├── TitleBar.vue  # 标题栏
│   │   ├── LeftSidebar.vue
│   │   ├── RightSidebar.vue
│   │   ├── EditorToolbar.vue
│   │   └── StatusBar.vue
│   ├── stores/           # Pinia 状态管理
│   ├── views/            # 页面组件
│   │   └── MainView.vue  # 主视图
│   ├── utils/            # 工具函数
│   │   ├── DocumentTypeDetector.ts    # 文档类型检测
│   │   ├── ErrorHandler.ts           # 错误处理
│   │   ├── FileWatcher.ts            # 文件监听
│   │   └── MarkDownEditorHelper.ts   # Markdown 编辑器助手
│   ├── types/            # TypeScript 类型定义
│   ├── router/           # 路由配置
│   └── style.css         # 全局样式
├── public/               # 静态资源
└── dist/                 # 构建输出
```

## 开发环境设置

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

这将同时启动：
- Vue 开发服务器 (http://localhost:5173)
- Electron 应用

### 构建应用

```bash
# 构建 Vue 应用
npm run build:vue

# 构建 Electron 主进程
npm run build:electron

# 完整构建
npm run build

# 打包应用
npm run dist
```

## 功能特性

### 界面布局

- **Title Bar**: 包含窗口控制、侧边栏切换
- **Left Sidebar**: 支持多种模式
  - Explorer: 文件资源管理器
  - Search: 全文搜索和替换
  - by TAG: 按标签组织文件
  - Table of Contents: 文档大纲
- **Editor Area**: 支持多种文档类型
  - **Document Tabs**: 文档标签页管理
  - **Welcome Page**: 无文档时的欢迎页面
  - **Markdown Editor**: TipTap 驱动的富文本编辑器
  - **Image Viewer**: 图片查看器（支持缩放、旋转）
  - **PDF Viewer**: PDF 查看器（开发中）
- **Right Sidebar**: AI 聊天界面
- **Status Bar**: 显示文档状态和统计信息

### 多文档类型支持

**Markdown 编辑器功能:**
- 标题格式 (H1-H6)
- 文本格式化 (粗体、斜体、下划线、删除线)
- 列表支持 (有序、无序、任务列表)
- 表格编辑和操作
- 图片、音频、视频、链接插入
- 代码块和引用块
- 数学公式支持 (行内和块级)
- YouTube 视频嵌入
- 语法高亮
- 全屏编辑模式

**图片查看器功能:**
- 图片缩放 (10%-1000%)
- 图片旋转 (90度增量)
- 适应窗口大小
- 鼠标滚轮缩放 (Ctrl+滚轮)
- 键盘快捷键支持

**PDF 查看器功能 (计划中):**
- PDF 文档渲染
- 页面导航
- 缩放控制
- 全文搜索

### 文件管理

- **多格式支持**: 自动检测文件类型 (.md, .txt, .jpg, .png, .pdf 等)
- **多标签页编辑**: 每个标签页对应独立的文档页面
- **文件树导航**: 层次化文件夹浏览
- **文件搜索过滤**: 快速定位文件
- **文件操作**: 新建、删除、重命名、移动文件/文件夹
- **实时文件监听**: 自动检测文件系统变化

### 快捷键

**全局快捷键:**
- `Cmd/Ctrl + N`: 新建文档
- `Cmd/Ctrl + O`: 打开文件
- `Cmd/Ctrl + S`: 保存文档
- `Cmd/Ctrl + W`: 关闭标签页

**Markdown 编辑器快捷键:**
- `Cmd/Ctrl + B`: 粗体
- `Cmd/Ctrl + I`: 斜体
- `Cmd/Ctrl + U`: 下划线
- `Cmd/Ctrl + 1-6`: 设置标题级别
- `Cmd/Ctrl + Z`: 撤销
- `Cmd/Ctrl + Shift + Z`: 重做

**图片查看器快捷键:**
- `Ctrl/Cmd + +`: 放大
- `Ctrl/Cmd + -`: 缩小
- `Ctrl/Cmd + 0`: 适应窗口
- `Ctrl/Cmd + 滚轮`: 缩放

**PDF 查看器快捷键:**
- `←/→`: 上一页/下一页
- `PageUp/PageDown`: 页面导航
- `Home/End`: 首页/末页

## 架构设计

### 组件架构

应用采用模块化组件设计，主要架构如下：

```
MainView (主视图)
├── TitleBar (标题栏)
├── Left Sidebar (左侧边栏)
├── Editor Area (编辑区域)
│   ├── Document Tabs (文档标签页)
│   └── Page Components (页面组件)
│       ├── WelcomePage (欢迎页面)
│       ├── MarkdownEditorPage (Markdown 编辑器页面)
│       ├── ImageViewerPage (图片查看器页面)
│       └── PDFViewerPage (PDF 查看器页面)
├── Right Sidebar (右侧边栏)
└── StatusBar (状态栏)
```

### 页面组件设计

**设计原则：** 一个 Tab 对应一个独立的 DocumentPage，每种文档类型都有专门的页面组件。

1. **WelcomePage**: 无文档打开时显示，提供快速操作入口
2. **MarkdownEditorPage**: 包含 TipTap 编辑器 + EditorToolbar，专注于文本编辑
3. **ImageViewerPage**: 包含图像查看器 + 图像工具栏，支持缩放旋转等操作
4. **PDFViewerPage**: 包含 PDF 查看器 + PDF 工具栏，支持页面导航和缩放

### 文档类型检测

- **自动检测**: 根据文件扩展名自动判断文档类型
- **类型支持**: 
  - TEXT_EDITOR: .md, .markdown, .txt, .iwt
  - IMAGE_VIEWER: .jpg, .jpeg, .png, .gif, .bmp, .svg, .webp
  - PDF_VIEWER: .pdf

### 状态管理

使用 Pinia 管理应用状态，主要包括：
- **界面状态**: 侧边栏显示/隐藏、主题设置
- **文件管理**: 当前文件夹、文件树、选中项目
- **标签页管理**: 打开的标签页、活动标签页、文档内容
- **搜索状态**: 搜索查询、搜索结果
- **错误处理**: 统一的错误处理和用户通知

### 组件通信

- **defineExpose**: 页面组件暴露方法给父组件调用
- **Props/Emit**: 标准的 Vue 组件通信
- **Pinia Store**: 跨组件状态共享
- **事件总线**: 复杂的跨层级通信

### Electron 集成

- **主进程**: 文件系统操作、菜单管理、窗口控制
- **渲染进程**: Vue 应用、用户界面
- **预加载脚本**: 安全的 API 桥接
- **IPC 通信**: 主进程与渲染进程通信
- **文件监听**: 基于 chokidar 的实时文件变化检测

## 最新更新

### 2024.07 - 多文档类型架构重构

- **🔄 架构重构**: 完全重新设计组件架构，实现真正的多文档类型支持
- **📄 页面组件化**: 每种文档类型都有独立的页面组件，不再共用编辑器
- **🎯 专业化工具**: 每种文档类型都有专门的工具栏和操作方式
- **🔧 组件解耦**: 移除了复杂的工厂模式，采用更直观的页面组件设计
- **🚀 性能优化**: 按需加载文档页面，优化内存使用

**重构亮点:**
- 一个 Tab = 一个 DocumentPage，架构清晰
- 独立的 MarkdownEditorPage、ImageViewerPage、PDFViewerPage
- 每个页面都有自己的工具栏和快捷键
- 支持通过 defineExpose 进行组件通信
- 完全移除了 Welcome 页面在编辑器中的耦合

## 开发计划

### 近期计划
- [ ] PDF.js 集成完成 PDF 查看器
- [ ] 增强图片查看器功能（EXIF 信息、批量查看）
- [ ] 添加更多文档类型支持（Word、Excel、PowerPoint）
- [ ] 优化文件监听性能

### 长期计划
- [ ] 插件系统设计
- [ ] 协作编辑功能
- [ ] 云端同步支持
- [ ] 移动端适配

## 许可证

Apache License