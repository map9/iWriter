# iWriter

> 当前版本：`0.2.0`
> 最后更新：2026-07-27
> 官网与文档：<https://map9.github.io/iWriter/>

本 README 是项目概览与开发入口。完整用户指南、下载说明、更新日志和故障排查请查看上方文档站点。

## 快速入口

- 文档首页：<https://map9.github.io/iWriter/>
- 下载与安装：<https://map9.github.io/iWriter/download>
- 快速开始：<https://map9.github.io/iWriter/quick-start>
- Git 源代码管理：<https://map9.github.io/iWriter/docs/source-control>
- Creative 小说创作：<https://map9.github.io/iWriter/docs/ai-creative-mode>
- 更新日志：<https://map9.github.io/iWriter/changelog>
- GitHub Releases：<https://github.com/map9/iWriter/releases>

## 项目定位

iWriter 是一个本地文件优先的跨平台 AI 写作与文档工作台，基于 Electron + Vue 3 + TypeScript 构建。

当前版本聚焦六类能力：

- 本地工作区管理：文件树、标签页、跨文件搜索、外部变更监听、忽略规则。
- 富文本 / Markdown 写作：TipTap 编辑器、斜杠菜单、表格、图片、数学公式、mermaid 图和 TOC。
- Git 版本控制：Source Control、Diff、冲突合并、分支、远程、Graph、Timeline、Stash 与 Tags。
- 多格式查看与转换：图片、PDF、Office 预览，Pandoc 导入 / 导出。
- Markdown 主题、打印与 PDF 输出：屏幕 / 打印主题、自定义 CSS 主题、分页预览、N-up 打印。
- AI 辅助写作与编辑：Edit / Creative 两种模式，多 Provider，提案审批与整章写作会话。

## 当前定位

- 本地文件优先的 Markdown / 富文本写作与知识工作区
- 标准 Git 仓库的版本管理与源码 Diff
- AI Edit 的研究、块级编辑和提案审批
- AI Creative 的纯 Markdown 小说项目、三层提纲、正文写作、评审、重构与导入

## 当前能力总览

### 1) 工作区与文件管理

- 支持打开文件夹并构建树形工作区
- 支持文件 / 文件夹新建、重命名、移动、删除和拖拽调整目录
- 支持多标签页与状态恢复（重启后恢复工作区与已打开文件）
- 支持自动保存、另存为、全部保存和只读模式
- 支持外部文件变更监听并同步到文件树
- 支持跨文件全文搜索与替换，并可通过 include / exclude 模式过滤范围
- 支持 `.iwtignore` 工作区忽略规则，可分别选择 Explorer、搜索和文件监听是否复用 `.gitignore`
- 默认过滤 `.git/`、`.iwriter/`、`.DS_Store`、`._*`、`__MACOSX` 等工程态与系统元数据
- 资源管理器与标签页右键菜单支持复制路径、定位文件、关闭其他标签、关闭已保存标签等操作
- Windows / Linux 使用应用内标题栏窗口按钮和应用菜单，macOS 保留系统菜单栏与交通灯窗口按钮

### 2) Markdown / 富文本编辑

- 支持 Markdown 语法输入与所见即所得富文本编辑混用
- 支持标题、粗斜体、下划线、删除线、高亮、链接、行内代码、引用、任务列表、有序 / 无序列表
- 支持表格、数学公式、代码块、mermaid 图、GFM Alerts、分隔线、图片等结构内容
- 支持通过 `/` 打开斜杠菜单，快速插入标题、列表、引用、代码块、数学公式、mermaid 图、表格和图片
- 图片支持尺寸拖拽、路径 / URL 编辑、复制、外部打开，以及左 / 中 / 右 / 两端对齐
- 代码块语言列表可在常用语言与全部支持语言之间切换
- mermaid 图可在编辑器中预览，也会在打印预览与 PDF 导出时渲染为图形
- 支持富文本粘贴、图片粘贴和“粘贴为纯文本”
- 支持页面级右键菜单，Markdown、图片、PDF 页面和文件标签会显示对应文档类型的常用操作
- 支持文内搜索替换面板
- 拼写与语法检查（LanguageTool / Typo.js 引擎切换）
- TOC（目录）联动与定位
- 支持 Clean Mode、Focus Mode、Typewriter Mode

### 3) Git 源代码管理

- 标准 Git 仓库检测、初始化和克隆
- Changes / Staged / Untracked / Merge Changes 分组，list / tree 两种视图
- 文件、目录、整组和 hunk 级 stage / unstage / discard
- Commit、Commit All、Amend、撤销上次提交和提交身份引导
- 分支创建、重命名、切换、合并、删除、发布及操作前预检
- Remote 管理、Fetch / Pull / Push / Sync、Stash 与 autostash
- 可编辑 Diff 标签页、冲突合并视图、仓库 Graph、文件 Timeline 和 Tags
- Explorer 与状态栏 Git 装饰、分支、领先 / 落后和同步进度

### 4) Markdown 主题系统

- 内置五套主题：`system`（跟随应用）、`github`、`github-dark`、`prose`、`novel`
- 屏幕主题与打印主题可独立选择，打印主题可选"跟随屏幕主题"
- 每套内置主题包含屏幕 CSS、打印 CSS，以及页面设置/分页策略/页眉页脚的默认值
- 支持自定义 CSS 主题：将主题文件夹放入 `~/.iwriter/markdown/themes/`，App 自动发现并热更新
- 自定义主题需提供 `screen.css`（必须）、可选的 `theme.json`（元数据与打印默认值）和 `print.css`
- 提供 30+ CSS 变量控制排版、颜色、标题、列表、引用、表格、代码块等元素样式
- 支持 Create Example 一键生成示例主题，帮助快速上手

### 5) 打印、PDF 与导出

**打印与 PDF：**
- 基于 paged.js 分页渲染，打印对话框提供实时预览
- 支持 11 种纸张大小、纵向 / 横向、普通边距 / 对页边距模式
- 三种分页策略预设（Balanced / Compact / Strict Book）+ 自定义模式（7 种避免断页规则）
- 支持 16 个页眉页脚位置（margin box），6 个模板变量（documentTitle / chapterTitle / sectionTitle / printDate / pageNo / totalPages）
- 支持首页不同、奇偶页不同的页眉页脚，运行标题自动提取章节信息
- 支持 N-up 打印（每张纸 1/2/4/6/9 页）
- 支持真实打印机输出与 Save as PDF 两种模式

**导入/导出（Pandoc 驱动）：**
- 导出支持 10 种格式：HTML、Word (.docx)、OpenOffice (.odt)、RTF、EPUB、LaTeX、MediaWiki、reStructuredText、Textile、OPML
- 导入支持 Word、ODT、RTF、EPUB、HTML、LaTeX 等常见格式
- 每种导出格式可独立配置自定义参数、参考文档、CSS 样式等
- 导出目录、Pandoc 路径、导出后动作可在偏好设置中配置

### 6) 多类型文档查看

- 图片查看器：缩放、旋转、拖拽平移、适配窗口
- PDF 查看器：连续 / 单页 / 双页模式，缩放，跳页，懒加载渲染
- Office 查看：支持打开 `.doc`、`.docx`、`.xls`、`.xlsx`、`.ppt`、`.pptx`
- Office 文档通过 LibreOffice 转换为临时 PDF 后在内置 PDF 查看器中预览
- `.docx` 可从 Office 预览页或标签页右键菜单导入为 Markdown 草稿
- 不支持类型会进入 `Unknown` 页面兜底

### 7) AI 能力

- 会话线程持久化（SQLite Checkpointer）
- 两种模式：
  - `Edit`：面向文档和知识库的读取、搜索、研究与 block-aware 提案编辑
  - `Creative`：面向纯 Markdown 小说项目，支持创意与提纲、正文撰写、精修、跨章重构、小说导入和风格蒸馏
- Edit 模式支持 proposal/HITL 审批：
  - 模型先提出编辑提案（编辑、插入、删除、范围替换、新建文档、文件操作等）
  - 用户可逐项或整批接受 / 拒绝，也可在提案中直接编辑内容
  - 支持“定位原文”切换到目标文档并高亮对应位置
  - 审批后再落地到文档
- Creative 使用 Writer / Reviewer 子 Agent；正文先确认写作意图，在授权章节内累积修改，最后以整章差异接受、返工或回滚
- Creative 的项目对象、文件操作与 git commit / tag 等操作需要作者明确审批
- 支持上下文附件：文本文件、目录、图片、PDF
- 支持上下文 token 统计、自动摘要阈值进度与 DeepAgents 长会话自动压缩
- 支持显示真实 token 用量，包含主 Agent、子 Agent 和缓存命中统计

### 8) AI Provider 与模型配置

内置 Provider 预设（可在偏好设置中配置 API Key / Base URL / Model）：

- OpenAI-compatible
- DeepSeek
- Anthropic
- Gemini
- Ollama（通过 OpenAI-compatible 方式）
- GLM（通过 OpenAI-compatible 方式）

额外配置能力：

- 支持备用模型、模型能力 JSON 配置和部分 Provider 的模型列表读取
- Web Search 支持 Bocha、Exa、Serper、Tavily，可为 AI 工具调用提供搜索结果

### 9) 界面与体验

- 左侧栏：Explorer / Search / Source Control / Tag / TOC
- 右侧栏：AI Agent 面板（历史会话 + 当前会话）
- 状态栏：文件统计、Git 分支 / 同步 / 变更数、更新状态等
- 视图模式：Clean Mode / Focus Mode / Typewriter Mode
- 主题系统：内置 Markdown 主题 + 自定义 CSS 主题 + 应用 UI 主题 + 系统主题跟随
- 打印与导出：打印预览对话框 + 偏好设置中的打印/导出默认值配置
- 语言：`en-US` / `zh-CN`
- 更新机制：生产环境支持自动更新、手动检查、跳过版本、发布说明、stable / beta 通道和检查间隔配置

## 重要边界（基于当前代码）

- `TagPanel` 目前仍是示例标签数据，不是完整标签索引系统
- AI 编辑与 Creative 写入是“提案 / 操作审批后执行”，不是模型直接无确认写盘
- Source Control 使用系统安装的 Git，当前以工作区根目录作为单一仓库根
- 导入 / 导出功能依赖系统安装 Pandoc（[pandoc.org](https://pandoc.org/)），未安装时功能不可用
- Office 预览依赖系统安装 LibreOffice；未检测到时会显示安装指引，并保留“用系统应用打开”的备用入口
- 自动更新仅在生产环境启用（开发环境关闭）
- 自动更新依赖 GitHub Releases（`map9/iWriter`）与可用网络/权限
- 当前不提供 iPad、iPhone、Android 等移动设备安装包
- 打包签名与 notarize（macOS）依赖本机证书和 Apple 凭证

## 支持的文件类型

- 文本编辑：`md` `markdown` `txt` `iwt` + 常见代码文件（如 `ts` `js` `vue` `py` `go` `rs` `json` `yaml` 等）
- 图片查看：`jpg` `jpeg` `png` `gif` `bmp` `svg` `webp` `ico`
- PDF 查看：`pdf`
- Office 预览：`doc` `docx` `xls` `xlsx` `ppt` `pptx`

说明：

- `.iwt` 为 iWriter 自有格式，内容为 JSON（含 HTML 文档内容与元信息）
- 通过 Pandoc 可导入 / 导出更多格式：`docx` `odt` `rtf` `epub` `html` `tex` `mediawiki` `rst` `textile` `opml`
- Office 预览与 `.docx` 导入为 Markdown 是两条流程：预览依赖 LibreOffice，导入仍依赖 Pandoc

## 技术栈

- 桌面框架：Electron
- 前端框架：Vue 3 + TypeScript
- 状态管理：Pinia
- 路由：Vue Router
- 编辑器：TipTap 3 + ProseMirror
- 样式：Tailwind CSS 4 + Sass + daisyUI
- AI Runtime：LangChain + LangGraph + deepagents + better-sqlite3
- 打印引擎：paged.js（分页渲染与预览）
- PDF 渲染：pdfjs-dist
- 文档转换：Pandoc（导入/导出多格式转换）
- Office 预览：LibreOffice CLI 转 PDF + 内置 PDF 查看器
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
├─ docs/                      # VitePress 文档站点
├─ public/                    # 静态资源（含 pdf worker / cmaps）
├─ scripts/                   # 构建与发布辅助脚本
├─ tests/                     # Node 测试与回归用例
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
npm run check-deps
npm run lint
npm run type-check
npm run build:quick
```

## 文档站点

文档站点基于 `VitePress`，源码位于 `docs/`。

线上地址：<https://map9.github.io/iWriter/>

常用入口：

- 文档中心：<https://map9.github.io/iWriter/docs/>
- 下载与安装：<https://map9.github.io/iWriter/download>
- 快速开始：<https://map9.github.io/iWriter/quick-start>
- 功能总览：<https://map9.github.io/iWriter/features>
- 更新日志：<https://map9.github.io/iWriter/changelog>

本地预览与构建：

```bash
npm run docs:dev
npm run docs:build
```

GitHub Pages 发布：

- 工作流文件：`.github/workflows/docs-pages.yml`
- 触发条件：`main` 分支下 `docs/**`、工作流文件、`package*.json` 发生变更
- 构建产物：`docs/.vitepress/dist`
- 发布方式：GitHub Actions 构建后部署到 GitHub Pages

发布版本时，建议先在 `docs/changelog.md` 的 `## Unreleased` 下补充本次更新说明，再执行：

```bash
npm version patch
git push --follow-tags
```

`npm version patch` 会自动同步 `docs/` 中的版本号与日期，并把 `## Unreleased` 替换成新版本号标题。
打上 `v*` tag 后，`.github/workflows/release.yml` 会自动从 `docs/changelog.md` 提取对应版本内容，写入 GitHub Release body，供应用内更新对话框读取。

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

## 许可证

[LICENSE.txt](./LICENSE.txt)
