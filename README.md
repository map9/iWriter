# iWriter

一个基于 Electron + Vue 3 + TypeScript 的现代多格式文档编辑器。

## 特性

- 🎨 现代化界面设计
- 📝 强大的 Markdown 编辑器（TipTap v3.x）
- 🖼️ 图片查看器
- 📄 PDF 查看器（开发中）
- 🗂️ 文件资源管理器
- 🔍 全文搜索功能
- 🏷️ 标签管理
- 📑 文档大纲
- 🤖 AI 聊天助手
- ⌨️ 完整的快捷键支持

## 技术栈

- **前端**: Vue 3 + TypeScript + Tailwind CSS
- **桌面**: Electron
- **编辑器**: TipTap v3.x
- **状态管理**: Pinia
- **数学公式**: KaTeX
- **图标**: Tabler Icons

## 开发环境

### 安装依赖
```bash
npm install
```

### 启动开发环境
```bash
npm run dev
```

### 构建应用
```bash
# 构建应用
npm run build

# 打包分发
npm run dist
```

## 架构设计

### 组件架构
```
MainView
├── TitleBar          # 标题栏和窗口控制
├── LeftSidebar        # 文件浏览器、搜索、标签、目录
├── 编辑区域
│   ├── DocumentTabs   # 多标签页
│   └── PageComponents # 文档页面
│       ├── WelcomePage         # 欢迎页面
│       ├── MarkdownEditorPage  # Markdown 编辑器
│       ├── ImageViewerPage     # 图片查看器
│       └── PDFViewerPage       # PDF 查看器
├── RightSidebar       # AI 聊天界面
└── StatusBar          # 状态信息
```

### 核心设计理念
- **多文档类型**: 每种文档类型都有专门的页面组件
- **一个Tab一个页面**: 简洁的标签页管理
- **模块化设计**: 组件间清晰解耦
- **响应式界面**: 支持动态布局调整

## 文档类型支持

### Markdown 编辑器
- 完整的 Markdown 语法支持
- 数学公式（KaTeX）
- 表格编辑
- 代码高亮
- 图片、视频、链接插入
- 实时预览

### 图片查看器
- 缩放和旋转
- 适应窗口
- 键盘快捷键
- 鼠标滚轮缩放

### PDF 查看器（开发中）
- PDF 渲染
- 页面导航
- 缩放控制

## 快捷键

### 全局快捷键
- `Cmd/Ctrl + N`: 新建文档
- `Cmd/Ctrl + O`: 打开文件  
- `Cmd/Ctrl + S`: 保存文档
- `Cmd/Ctrl + W`: 关闭标签页

### Markdown 编辑器
- `Cmd/Ctrl + B`: 粗体
- `Cmd/Ctrl + I`: 斜体
- `Cmd/Ctrl + 1-6`: 标题级别
- `Cmd/Ctrl + Z/Shift+Z`: 撤销/重做

### 图片查看器
- `Cmd/Ctrl + +/-`: 放大/缩小
- `Cmd/Ctrl + 0`: 适应窗口

## Todo List
### Markdown 编辑器完善
1. 实现对块数据的in Editor编辑，类似Notion。
-[] code block: 切换代码语言，格式化代码
-[] table: 增加、删除和插入行、列，改变列的宽度，设置与取消行、列的表头，移动行、列，删除整个table
-[] image: 改变图片容器大小，修改图片来源（本地、link），增加、删除图片标题
-[] voice: 
  - 播放器：paly/pause、stop、track、mute，voice wave，position。
  - 修改voice来源
  - 转录功能：转录，终止转录，转录文字编辑，继续转录

### AI 助手完善

## 许可证
Apache License