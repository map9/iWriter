# iWriter

一个本地文件优先的桌面写作工具，基于 Electron、Vue 3 和 TypeScript 构建，支持 Markdown / 纯文本 / 代码文件编辑，也集成了图片、PDF 浏览和 AI 辅助创作能力。

适合希望在本地工作区中统一处理写作、资料查看和 AI 辅助编辑的用户。

## 安装与下载

当前仓库已经具备打包配置，但 README 里还没有固定的公开下载入口。现阶段更推荐两种使用方式：

- 开发者：直接拉取仓库后本地运行 `npm install` 和 `npm run dev`
- 维护者：通过 `npm run dist:*` 在本机构建对应平台安装包

如果后续要对外发布，建议把下载地址统一放到 GitHub Releases：

- 仓库主页：`https://github.com/iwriter/iwriter`
- 更新源配置指向：`map9/iWriter`

在公开下载页补齐之前，可以把当前状态理解为“适合本地开发、内部分发或手动打包验证”的阶段。

## 适合做什么

iWriter 目前比较适合这几类场景：

- 写 Markdown 笔记、文章和项目文档
- 在一个工作区里管理 `.md`、`.txt`、`.iwt` 和常见代码文件
- 一边写作一边查看图片或 PDF 参考资料
- 用 AI 做润色、改写、脑暴和长篇创作辅助

如果你需要的是一个“本地文件优先”的桌面写作工具，而不是纯在线文档产品，这个工程现在已经有比较完整的基础能力。

## 快速开始

### 普通使用流程

1. 启动应用后先打开一个文件或文件夹
2. 左侧栏浏览目录、搜索文件、查看大纲
3. 在主编辑区编辑 Markdown / 文本 / 代码文件
4. 需要时打开右侧 AI 面板进行问答、提案式编辑或创作辅助

初次进入应用时，欢迎页会直接提供：

- `New Document`
- `Open Document`
- `Open Folder`

## 界面预览

当前仓库里已经包含设计截图，可直接作为 README 预览入口：

![iWriter main window](design/Window%20-%204.Folder%20Opened%20+%20Document%20Opened@2x.png)

更多界面参考：

- [主窗口](/Users/sunyafu/zebra/iWriter/design/Window%20-%204.Folder%20Opened%20+%20Document%20Opened@2x.png)
- [欢迎页](/Users/sunyafu/zebra/iWriter/design/Window%20-%201.Blank@2x.png)
- [左侧栏 Explorer](/Users/sunyafu/zebra/iWriter/design/Sidebar%20-%201.Explorer@2x.png)
- [AI 侧栏](/Users/sunyafu/zebra/iWriter/design/Sidebar%20-%202.AI%20Chat@2x.png)

## 当前构建状态

基于当前仓库内容，下面两条命令已验证通过：

```bash
npm run type-check
npm run build:quick
```

当前构建产物目录：

- `dist/`：渲染进程静态资源
- `dist-electron/`：Electron 主进程与 preload 构建产物
- `release/`：`electron-builder` 打包输出目录

说明：

- `npm run build` 会在正式构建前执行图标生成与打包预处理脚本。
- `npm run dist` / `npm run dist:*` 走 `electron-builder` 打包流程。
- macOS 打包配置里已经包含签名与 notarize 逻辑；如果本机没有对应证书或 Apple 凭证，打包分发阶段可能失败。

## 主要能力

- Markdown / `.iwt` / `.txt` / 常见代码文件编辑
- 文件树、标签页、多文档切换
- 全文搜索与文档大纲
- 图片查看
- PDF 查看
- AI 侧栏，支持编辑、创作和最小对话三种模式
- 自动更新集成（GitHub Releases）

## 平台支持

从 `electron-builder` 当前配置看，项目的打包目标包括：

- macOS：`dmg`、`zip`，支持 `arm64` 和 `x64`
- Windows：`nsis`、`portable`，支持 `x64` 和 `ia32`
- Linux：`AppImage`、`deb`、`rpm`，当前配置为 `x64`

更适合优先验证的平台：

- macOS

原因：

- 仓库里已经配置了 macOS 签名与 notarize
- 当前开发机和现有打包配置明显更偏 macOS 工作流

## 技术栈

- 前端：Vue 3 + TypeScript + Pinia + Vue Router
- 桌面端：Electron + vite-plugin-electron
- 编辑器：TipTap 3
- 样式：Tailwind CSS 4 + Sass
- AI Runtime：DeepAgents + LangGraph Checkpointer + 多 Provider 接入
- 打包：electron-builder

## 开发环境

### 1. 安装依赖

```bash
npm install
```

安装完成后会自动执行：

- `patch-package`
- `electron-rebuild -f -w better-sqlite3`

如果原生模块需要重新编译，可以手动执行：

```bash
npm run rebuild-native
```

### 2. 启动开发环境

```bash
npm run dev
```

当前 `vite.config.ts` 已接入 `vite-plugin-electron`，开发时会同时启动渲染进程和 Electron 主进程。

### 3. 类型检查与构建

```bash
npm run type-check
npm run build
```

补充命令：

```bash
npm run build:quick
npm run lint
```

## 打包发布

### 打包命令

```bash
npm run dist
npm run dist:quick
npm run dist:mac
npm run dist:win
npm run dist:linux
npm run dist:all
```

### 构建前检查

项目提供了一个依赖检查脚本：

```bash
npm run check-deps
```

它会检查图标生成相关依赖，例如：

- `sharp`：必需
- `ImageMagick`：可选，用于生成 Windows ICO
- `iconutil`：可选，用于生成 macOS ICNS

### 环境变量

仓库里提供了 `.env.simple`，可以按需复制为 `.env`：

```bash
cp .env.simple .env
```

当前打包/发布相关环境变量主要包括：

- `GH_TOKEN`：GitHub Releases 更新与发布
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `LANGSMITH_*`：LangSmith 调试/追踪

说明：

- 开发环境下主进程会自动加载 `.env`
- `scripts/notarize.js` 会在 macOS 签名后读取 Apple 凭证
- 自动更新默认使用 GitHub provider，未配置 `GH_TOKEN` 时会给出 warning

## AI 能力

当前 AI 架构已经切到主进程 runtime，核心说明见 [docs/AGENTIC_EDITING.md](/Users/sunyafu/zebra/iWriter/docs/AGENTIC_EDITING.md)。

目前保留 3 个模式：

- `Edit`：先读后改，文档修改统一走 proposal / HITL 审批
- `Creative`：小说脑暴、设定、故事线等创作资产生成
- `Minimal`：最小对话模式，不挂业务工具

当前内置 Provider 预设包括：

- OpenAI
- Anthropic
- Gemini
- DeepSeek
- GLM
- Ollama / OpenAI-compatible 接口

使用 AI 前需要在应用配置里填入对应 Provider 的 API Key 或服务地址；本仓库不会内置这些凭证。

## 已知限制

基于当前工程状态，比较值得提前说明的限制有：

- `npm run dev` 尚未在这次文档更新中重新实机验证；本次确认的是 `type-check` 和 `build:quick`
- 自动更新依赖 GitHub Releases 和 `GH_TOKEN` 配置，未配置时更新能力可能不可用
- macOS 分发打包依赖本机证书、Apple 账号和 notarize 凭证，不是开箱即用
- 审校能力已有独立实现，但具体引擎和语言覆盖仍取决于实际配置，见 [PROOFREAD.md](/Users/sunyafu/zebra/iWriter/docs/PROOFREAD.md)
- AI 文档修改采用 proposal / HITL 审批流，不是“模型直接落盘”式编辑

## 路线图

结合当前代码结构，后续比较明确的演进方向可以归纳为：

- 继续完善 Markdown 编辑体验，尤其是更强的块级编辑与富内容块能力
- 打磨 AI 编辑提案流，降低多处修改时的交互成本
- 完善自动更新设置与版本跳过等细节
- 提升打包发布稳定性，减少平台相关依赖和签名配置门槛
- 补齐更面向最终用户的安装、更新日志和下载说明

如果这个仓库要对外发布，建议优先把“下载入口 + 版本说明 + 平台安装提示”补齐到 README 或 Releases 页面。

## 目录概览

```text
electron/        Electron 主进程、菜单、窗口、AI runtime
src/             Vue 渲染进程、编辑器、侧栏、AI UI
public/          静态资源（含 PDF worker / cmaps）
scripts/         图标生成、构建预处理、notarize 等脚本
docs/            架构与功能文档
design/          设计稿与草图资源
```

## 相关文档

- [Agentic Editing](/Users/sunyafu/zebra/iWriter/docs/AGENTIC_EDITING.md)
- [Proofread](/Users/sunyafu/zebra/iWriter/docs/PROOFREAD.md)
- [Logging](/Users/sunyafu/zebra/iWriter/docs/LOGGING.md)

## 许可证

Apache License 2.0
