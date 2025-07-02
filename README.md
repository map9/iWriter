# iWriter

一个基于 Electron + Vue 3 + TypeScript 的现代 Markdown 编辑器。

## 特性

- 🎨 基于设计稿的现代化 UI 界面
- 📝 强大的 Markdown 编辑器（基于 TipTap v2.x）
- 🗂️ 文件资源管理器
- 🔍 全文搜索功能
- 🏷️ 标签管理
- 📑 文档大纲（Table of Contents）
- 🤖 AI 聊天助手界面
- ⌨️ 完整的快捷键支持
- 🌈 Tailwind CSS 样式

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **桌面应用**: Electron
- **编辑器**: TipTap v3.x https://tiptap.dev/tiptap-editor-v3
- **样式**: Tailwind CSS
- **图标**: Tabler Icons
- **状态管理**: Pinia
- **路由**: Vue Router

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
│   │   ├── sidebar/      # 侧边栏相关组件
│   │   ├── TitleBar.vue  # 标题栏
│   │   ├── LeftSidebar.vue
│   │   ├── RightSidebar.vue
│   │   ├── MarkdownEditor.vue
│   │   ├── EditorToolbar.vue
│   │   └── StatusBar.vue
│   ├── stores/           # Pinia 状态管理
│   ├── views/            # 页面组件
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

- **Title Bar**: 包含窗口控制、侧边栏切换、文档标签页管理
- **Left Sidebar**: 支持多种模式
  - Explorer: 文件资源管理器
  - Search: 全文搜索和替换
  - by TAG: 按标签组织文件
  - Table of Contents: 文档大纲
- **Editor Area**: TipTap 驱动的 Markdown 编辑器
- **Right Sidebar**: AI 聊天界面
- **Status Bar**: 显示文档状态和统计信息

### 编辑器功能

- 标题格式 (H1-H6)
- 文本格式化 (粗体、斜体、下划线、删除线)
- 列表支持 (有序、无序、任务列表)
- 表格编辑
- 图片、链接插入
- 代码块和引用块
- 数学公式支持
- 全屏编辑模式

### 文件管理

- 打开文件夹
- 多标签页编辑
- 文件树导航
- 文件搜索过滤
- 新建文件/文件夹

### 快捷键

应用支持完整的快捷键操作，包括：
- `Cmd/Ctrl + N`: 新建文档
- `Cmd/Ctrl + O`: 打开文件
- `Cmd/Ctrl + S`: 保存文档
- `Cmd/Ctrl + W`: 关闭标签页
- `Cmd/Ctrl + B`: 粗体
- `Cmd/Ctrl + I`: 斜体
- `Cmd/Ctrl + 1-6`: 设置标题级别
- 等等...

## 开发说明

### 组件设计

所有组件都遵循设计稿要求，使用 Tailwind CSS 实现样式。主要组件包括：

1. **TitleBar**: 自定义标题栏，支持 macOS 原生窗口控制
2. **LeftSidebar**: 多模式侧边栏，支持文件管理、搜索等功能
3. **MarkdownEditor**: 基于 TipTap 的富文本编辑器
4. **RightSidebar**: AI 聊天界面
5. **StatusBar**: 底部状态栏

### 状态管理

使用 Pinia 管理应用状态，主要包括：
- 界面状态 (侧边栏显示/隐藏)
- 文件和文件夹管理
- 标签页管理
- 搜索状态

### Electron 集成

- 主进程处理文件系统操作
- 菜单栏功能集成
- 窗口管理
- 跨平台支持

## 许可证

MIT License