# AGENTS.md

## Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
Do not edit generated files, dependency packages, or packaged runtime output unless the user explicitly asks for that exact change.

## Architecture Overview

iWriter is a multi-format document editor built with **Electron + Vue 3 + TypeScript**.

**Tech Stack**: Electron, Vite, Vue 3 Composition API, TypeScript, Pinia, Vue Router, Tailwind CSS v4, daisyUI 5, TipTap v3.x, pdfjs-dist, pagedjs, Pandoc, chokidar, LangChain/LangGraph/deepagents, better-sqlite3.

**Document Type System**: file type is auto-detected from path/extension and routed to `MarkdownEditorPage`, `ImageViewerPage`, `PDFViewerPage`, or `UnknownPage`. `WelcomePage` is shown when there are no open tabs. Each tab owns its own page component state.

**Multi-Process**:
- `electron/App.ts` — main process: file ops, IPC handlers
- `electron/MenuManager.ts` — native menus
- `electron/WindowManager.ts` — BrowserWindow lifecycle, title updates, window IPC
- `src/stores/app.ts` — renderer state (Pinia)
- `electron/preload.ts` — IPC bridge
- `electron/ai/` — main-process AI runtime, domain strategies, tools, checkpointers

**Layout**: `MainView.vue` → TitleBar / LeftSidebar (Explorer, Search, Tag, Toc panels) / document page area / RightSidebar (AI chat) / StatusBar. Preferences, print dialogs, PDF print dialogs, and update dialogs are mounted from `MainView.vue`.

## Key File Locations

```
src/
├── stores/app.ts                         # Main renderer state: tabs, workspace, UI, settings, print/update state
├── ai/                                   # Renderer AI store, thread state, review/executor flows, snapshots
├── import-export/formatConverter.ts      # Markdown/text/code/IWT conversion
├── services/document/DocumentLoader.ts   # Live-tab-first document loading for AI and search/replace
├── services/pdf-render/                  # pdf.js page rendering, workers, PDF resource handling
├── services/workspace/filtering.ts       # Workspace ignore rules and tree/search filtering
├── utils/StateStorage.ts                 # Renderer persistence via localStorage
├── utils/notifications.ts                # notify.success/error/warning/info/critical
├── utils/themes.ts                       # Built-in and custom theme helpers
├── components/pages/                     # Welcome, Markdown, Image, PDF, Unknown pages
├── components/pages/markdown-editor/     # Markdown editor actions, state, insertion, clipboard, stats
├── components/common/tiptap/             # Custom TipTap extensions and node views
├── components/ai/agent-panel/            # Right-sidebar AI chat UI and review surfaces
├── components/preferences/               # Preferences dialog and settings panels
├── components/print/                     # Markdown/image/PDF print and preview dialogs
├── components/sidebar/                   # Explorer, Search, Tag, Toc panels
└── updater/                              # Renderer updater service
electron/
├── App.ts / MenuManager.ts / WindowManager.ts / preload.ts
├── CustomThemeLoader.ts                  # Custom Markdown theme loading
├── PandocService.ts                      # Import/export through Pandoc
├── ai/                                   # Agent engine, domains, providers, tools, IPC adapters, sqlite checkpointing
└── i18n.ts                               # Main-process menu/dialog localization
scripts/
├── verify-release-readiness.mjs          # Release/changelog structure check
├── sync-docs-version.mjs                 # Docs version sync/finalization
├── extract-release-notes.mjs             # Release note extraction
├── prepare-build.mjs / generate-icons.mjs
└── verify-langchain-patches.mjs
```

## Markdown Conversion Pipeline

HTML-intermediate approach:
- Markdown: `.md` / `.markdown` → `marked()` → HTML → TipTap JSON on load; TipTap → `editor.getHTML()` → Turndown + GFM → Markdown on save.
- Plain text and code files are represented as paragraph-per-line HTML in the editor and serialized back with block separators.
- IWT stores HTML directly as JSON `{ version, content, metadata }`.
- Math delimiters support `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` through marked extensions and custom Turndown rules.

**Known limitations**:
- Round-trip MD→HTML→MD may alter whitespace/style
- Image relative paths converted to absolute `file://` URLs on load
- Two separate Turndown instances: `formatConverter.ts` and `clipboard-operations.ts`
- Code files are edited through the same rich editor surface, not a dedicated code editor

## State Persistence

`src/utils/StateStorage.ts` persists renderer settings via `localStorage`, including UI state, workspace/tabs, theme, locale, auto-save, editor settings, search histories, export settings, and Markdown print preferences.

AI provider settings are persisted in the main process through `electron/ai/config/AiConfigStore.ts` using `electron-store`. AI thread/runtime state is split between renderer stores, main-process runtime state, and sqlite-backed checkpointing where applicable.

## Notifications

```typescript
import { notify } from '@/utils/notifications'
notify.success/info/warning/error/critical('message')
```

Use status-bar notifications for user-visible outcomes. Keep developer diagnostics in logs unless the user needs to act.

## TipTap Editor

Toolbar and page-level menu handling live in `MarkdownEditorPage.vue` plus helpers under `src/components/pages/markdown-editor/`. Page components expose `handleMenuAction` and `updateMenuFormattingState` for menu integration.

Custom node views: `iwCodeBlockView`, `iwTableView`, `iwImageView`, `iwMathBlockView`. DragHandle is NOT used.

Shared editor extensions are built from `src/utils/editorExtensions.ts`; check this before adding page-only extension wiring.

## AI Runtime

The right sidebar is `src/components/ai/AgentPanel.vue` and `src/components/ai/agent-panel/`. Renderer AI state lives in `src/ai/store/ai.ts` and module files under `src/ai/store/modules/`.

Main-process AI execution is under `electron/ai/`:
- `AgentEngine.ts` owns runs and streaming.
- `domain/edit` and `domain/creative` build domain-specific capabilities.
- `runtime/` handles thread runtime resolution, middleware, and filesystem access.
- `tools/` contains document, edit proposal, filesystem, web/PDF, creative, and writing-style tools.
- `ipc/` adapts renderer events, review surfaces, and message protocol.

For AI bugs, trace both renderer state and main-process runtime behavior before changing prompts or UI only.

## Printing, PDF, and Themes

- Markdown/image print and export previews use `src/components/print/PrintDialog.vue` and related HTML preview helpers.
- PDF printing uses `src/components/print/PdfPrintDialog.vue` and `PdfPrintPreview.vue`.
- PDF viewing/rendering uses `src/components/pages/PDFViewerPage.vue` plus `src/services/pdf-render/PdfJsPageRenderProvider.ts`.
- Markdown theme definitions and print preferences live under `src/components/print/markdownThemes` and `src/utils/themes.ts`; custom theme loading crosses renderer helpers and `electron/CustomThemeLoader.ts`.

## Window Title

`"filename - foldername"` / `"filename"` / `"foldername"` / `"iWriter"`. Updated via IPC `update-window-title` when folder/tab changes.

## Development Commands

```bash
npm run dev           # Vue dev server + Electron (hot reload)
npm run check-deps    # Dependency sanity check
npm run lint          # ESLint auto-fix
npm run type-check    # TypeScript check
npm run build         # Full build
npm run build:quick   # Skip TypeScript check
npm run dist          # Full build + electron-builder
npm run dist:quick    # Quick build + electron-builder
npm run dist:mac/win/linux  # Platform packages using quick build
npm run docs:dev     # VitePress docs dev server
npm run docs:build   # Build documentation site
npm run docs:preview # Preview documentation site
npm run docs:sync-version
npm run verify:langchain-patches
npm run publish       # GitHub release (requires GH_TOKEN)
```

Always run `npm run lint && npm run type-check` before committing.
For release-note readiness, use `node scripts/verify-release-readiness.mjs`; when staging unreleased notes, release tooling expects `docs/changelog.md` to use the exact `## Unreleased` heading before finalization.

## 专项文档索引

模块级说明存放在 `./design/`，用户文档存放在 `./docs/`。重大行为、架构或发布流程更新时，同步更新相关文档；不要为了普通代码改动新增文档文件。

| 文件 | 内容 |
| --- | --- |
| [design/LOGGING.md](design/LOGGING.md) | 日志系统 |
| [design/PROOFREAD.md](design/PROOFREAD.md) | 拼写/语法检查（LanguageTool + Typo.js） |
| [design/AGENTIC_EDITING.md](design/AGENTIC_EDITING.md) | AI Agentic Editing：右侧 AI 面板、ACP 协议、Provider/Model/Mode、工具系统 |
| [design/MARKDOWN_THEME_PRINT_PDF_PLAN.md](design/MARKDOWN_THEME_PRINT_PDF_PLAN.md) | Markdown 主题：内置主题、自定义 CSS、theme.json、热更新 |
| [design/PRINT_PREVIEW.md](design/PRINT_PREVIEW.md) | 打印预览架构与实现 |
| [design/print-theme-spec.md](design/print-theme-spec.md) | 打印主题规范 |
| [design/DAISYUI.md](design/DAISYUI.md) | daisyUI 5 使用规范 |
| [docs/changelog.md](docs/changelog.md) | 用户可见更新日志 |
| [docs/features.md](docs/features.md) | 用户功能概览 |
| [docs/quick-start.md](docs/quick-start.md) | 快速开始 |
