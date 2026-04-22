# iWriter

> 代码校对日期：2026-04-22  
> 本 README 以当前工程实现为准（`src/` + `electron/` + `package.json`），不以 `docs/` 中历史方案文档为准。

## 项目定位

iWriter 是一个本地文件优先的桌面写作与编辑工作台，基于 Electron + Vue 3 + TypeScript 构建。

当前版本聚焦三类能力：

- 本地文件工作区管理（文件树、标签页、跨文件搜索、监听刷新）
- 富文本/Markdown 写作（TipTap 编辑器 + 大纲 + 拼写校对 + 搜索替换）
- AI 辅助写作与编辑（Edit / Creative / Minimal，多 Provider，编辑提案审批流）

## 设计定位（阶段）

### 第一阶段

- 对标 Joplin 等 Markdown 写作工具
- 目标人群与 Joplin 的核心用户群体相近（本地文件优先、长期写作/笔记管理需求）

### 第二阶段（已基本完成，可使用）

- 在第一阶段能力上，加入 AI 辅助写作与编辑
- 已具备可用的 AI 对话、提案式编辑与审批流

### 第三阶段（双分支）

- `3.1` AI 支持下的个人知识库管理：未启动
- `3.2` AI 支持下的小说创作与写作：正在开始

## 当前能力总览

### 1) 文档与文件能力

- 支持打开文件夹并构建树形工作区
- 支持文件新建、文件夹新建、重命名、移动、删除
- 支持多标签页与状态恢复（重启后恢复工作区与已打开文件）
- 支持自动保存、另存为、全部保存、只读模式
- 支持外部文件变更监听并同步到文件树
- 支持跨文件全文搜索与替换（含正则/大小写/整词）

### 2) 编辑器能力（MarkdownEditor）

- 标题、段落、粗斜体、下划线、删除线、高亮、链接、行内代码
- 引用、代码块、数学公式（行内/块）、任务列表、有序/无序列表
- 表格（插入、结构调整、移动、删除）
- 图片插入、媒体插入（音频/视频链接）
- 搜索替换面板（文内）
- 拼写与语法检查（LanguageTool / Typo.js 引擎切换）
- TOC（目录）联动与定位

### 3) 多类型文档查看

- 图片查看器：缩放、旋转、拖拽平移、适配窗口
- PDF 查看器：连续/单页/双页模式，缩放，跳页，懒加载渲染
- 不支持类型会进入 `Unknown` 页面兜底

### 4) AI 能力（主进程 Runtime）

- 会话线程持久化（SQLite Checkpointer）
- 三种模式：
  - `edit`：面向文档编辑，支持“先读后改”工具链
  - `creative`：面向创作素材生成与保存
  - `minimal`：最小对话模式（无业务工具）
- Edit 模式支持 proposal/HITL 审批：
  - 模型先提出编辑提案（编辑/插入/删除/范围替换/新建文档）
  - 用户可逐项 `approve / edit / reject`
  - 审批后再落地到文档
- 支持上下文附件：文本文件、二进制文件（图片/PDF）、目录
- 支持输入压缩（compact input）与上下文 token 统计

### 5) AI Provider 与模型配置

内置 Provider 预设（可在偏好设置中配置 API Key / Base URL / Model）：

- OpenAI-compatible
- DeepSeek
- Anthropic
- Gemini
- Ollama（通过 OpenAI-compatible 方式）
- GLM（通过 OpenAI-compatible 方式）

### 6) 界面与体验

- 左侧栏：Explorer / Search / Tag / TOC
- 右侧栏：AI Agent 面板（历史会话 + 当前会话）
- 状态栏：文件统计、更新状态等
- 视图模式：Clean Mode / Focus Mode / Typewriter Mode
- 主题系统：内置主题 + 系统主题跟随
- 语言：`en-US` / `zh-CN`

## 重要边界（基于当前代码）

- `TagPanel` 目前是示例数据实现（mock），不是完整标签索引系统
- AI 编辑是“提案审批后执行”，不是模型直接无确认写盘
- 自动更新仅在生产环境启用（开发环境关闭）
- 自动更新依赖 GitHub Releases（`map9/iWriter`）与可用网络/权限
- 打包签名与 notarize（macOS）依赖本机证书和 Apple 凭证

## 支持的文件类型

- 文本编辑：`md` `markdown` `txt` `iwt` + 常见代码文件（如 `ts` `js` `vue` `py` `go` `rs` `json` `yaml` 等）
- 图片查看：`jpg` `jpeg` `png` `gif` `bmp` `svg` `webp` `ico`
- PDF 查看：`pdf`

说明：

- `.iwt` 为 iWriter 自有格式，内容为 JSON（含 HTML 文档内容与元信息）

## 技术栈

- 桌面框架：Electron
- 前端框架：Vue 3 + TypeScript
- 状态管理：Pinia
- 路由：Vue Router
- 编辑器：TipTap 3 + ProseMirror
- 样式：Tailwind CSS 4 + Sass + daisyUI
- AI Runtime：deepagents + LangGraph + better-sqlite3
- 更新：electron-updater
- 构建：Vite + electron-builder

## 目录结构（核心）

```text
.
├─ electron/                  # 主进程、菜单、窗口、AI Runtime、preload
│  ├─ ai/
│  ├─ App.ts
│  ├─ MenuManager.ts
│  ├─ WindowManager.ts
│  └─ preload.ts
├─ src/                       # 渲染进程
│  ├─ components/
│  ├─ stores/
│  ├─ ai/
│  ├─ updater/
│  └─ main.ts
├─ public/                    # 静态资源（含 pdf worker / cmaps）
├─ scripts/                   # 构建与发布辅助脚本
├─ assets/                    # 应用图标等打包资源
└─ package.json
```

## 本地开发

### 1. 安装依赖

```bash
npm install
```

安装后会自动执行：

- `patch-package`
- `electron-rebuild -f -w better-sqlite3`

### 2. 启动开发环境

```bash
npm run dev
```

### 3. 类型检查与构建

```bash
npm run type-check
npm run build:quick
```

本次校对实测结果：

- `npm run type-check` 通过
- `npm run build:quick` 通过

## 打包与发布

### 常用命令

```bash
npm run dist
npm run dist:quick
npm run dist:mac
npm run dist:win
npm run dist:linux
npm run dist:all
```

### 产物目录

- `dist/`：渲染进程构建产物
- `dist-electron/`：主进程与 preload 构建产物
- `release/`：安装包输出目录

### 预检查

```bash
npm run check-deps
```

## 环境变量

可先复制模板：

```bash
cp .env.simple .env
```

常见变量：

- `GH_TOKEN`：GitHub 发布/更新相关
- `APPLE_ID` `APPLE_APP_SPECIFIC_PASSWORD` `APPLE_TEAM_ID`：macOS notarize
- `LANGSMITH_*`：LangSmith 观测相关

## 生产文档建议

如果要继续建设面对用户的帮助中心/官网文档，建议优先从这里拆分：

1. 快速上手（打开文件夹、创建文档、AI 对话）
2. 编辑器指南（格式、搜索替换、拼写检查、TOC）
3. 工作区指南（文件树、监听、跨文件搜索）
4. AI 指南（三模式、Provider 配置、审批流）
5. 下载与更新（安装、更新策略、常见问题）

`docs/WEBSITE_PLAN_VITEPRESS.md` 已按当前实现更新了提纲，可直接作为官网文档骨架。

## 许可证

[LICENSE.txt](./LICENSE.txt)
