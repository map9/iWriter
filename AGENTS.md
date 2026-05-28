# AGENTS.md

## important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

## Architecture Overview

iWriter is a multi-format document editor built with **Electron + Vue 3 + TypeScript**.

**Tech Stack**: Vue 3 Composition API, TipTap v3.x, Pinia, Tailwind CSS v4, daisyUI 5, chokidar, Pandoc (import/export), pagedjs (print), Langchain/Langgraph (deepagents)

**Document Type System**: File type auto-detected → routed to page component (`WelcomePage`, `MarkdownEditorPage`, `ImageViewerPage`, `PDFViewerPage`). Each tab is independent.

**Multi-Process**:
- `electron/App.ts` — main process: file ops, IPC handlers
- `electron/MenuManager.ts` — native menus
- `src/stores/app.ts` — renderer state (Pinia)
- `electron/preload.ts` — IPC bridge

**Layout**: `MainView.vue` → TitleBar / LeftSidebar (Explorer, Search, Tag, Toc panels) / Editor Area / RightSidebar (AI chat) / StatusBar

## Key File Locations

```
src/
├── stores/app.ts                          # Main state (tabs, file tree, settings, IPC)
├── import-export/formatConverter.ts       # MD↔HTML↔IWT conversion
├── utils/StateStorage.ts                  # Cross-session persistence (electron-store)
├── utils/notifications.ts                 # notify.success/error/warning/info/critical
├── utils/themes.ts                        # Theme definitions
├── components/pages/                      # WelcomePage, MarkdownEditorPage, ImageViewerPage, PDFViewerPage
├── components/common/tiptap/              # Custom TipTap extensions and node views
│   ├── iw-search-replace/                 # In-doc find & replace
│   ├── iw-proofread/                      # Spell/grammar check (LanguageTool + Typo.js + workerpool)
│   └── iw-popup-tools/                    # Inline popups for Link, Math
└── components/sidebar/                    # ExplorerPanel, SearchPanel, TagPanel, TocPanel
electron/
├── App.ts / MenuManager.ts / WindowManager.ts / ThemeManager.ts / preload.ts
src/components/pages/markdown-editor/     # insert.ts, menu-action.ts, state.ts, stats.ts, on.ts, clipboard-operations.ts
```

## Markdown Conversion Pipeline

HTML-intermediate approach: `.md` → `marked()` → HTML → TipTap JSON (load); TipTap → `editor.getHTML()` → `turndownService.turndown()` → `.md` (save). IWT format stores HTML directly as JSON `{ version, content, metadata }`.

**Known limitations**:
- Round-trip MD→HTML→MD may alter whitespace/style
- Image relative paths converted to absolute `file://` URLs on load
- Two separate Turndown instances: `formatConverter.ts` and `clipboard-operations.ts`

## State Persistence

`src/utils/StateStorage.ts` via `electron-store`. Persists: sidebar visibility/width, edit settings (autoSave, lineEnding, invisibleCharacters, firstLineIndent, smartPunctuation, proofread), theme ID, last folder, open tabs.

## Notifications

```typescript
import { notify } from '@/utils/notifications'
notify.success/info/warning/error/critical('message')
```

Priority: critical > error > warning > info > success. Errors = manual close + flash. Critical = force manual + bounce.

## TipTap Editor

Toolbar integrated into `MarkdownEditorPage.vue`. All page components use `defineExpose` to expose `handleMenuAction` and `updateMenuFormattingState` for menu integration.

Custom node views: `iwCodeBlockView`, `iwTableView`, `iwImageView`, `iwMathBlockView`. DragHandle is NOT used.

## Window Title

`"filename - foldername"` / `"filename"` / `"foldername"` / `"iWriter"`. Updated via IPC `update-window-title` when folder/tab changes.

## Development Commands

```bash
npm run dev           # Vue dev server + Electron (hot reload)
npm run lint          # ESLint auto-fix
npm run type-check    # TypeScript check
npm run build         # Full build
npm run build:quick   # Skip TypeScript check
npm run dist:mac/win/linux  # Platform packages
npm run publish       # GitHub release (requires GH_TOKEN)
```

Always run `npm run lint && npm run type-check` before committing.

## 专项文档索引

模块级说明存放在 `./design/`，重大更新时同步更新。

| 文件 | 内容 |
| --- | --- |
| [design/LOGGING.md](design/LOGGING.md) | 日志系统 |
| [design/PROOFREAD.md](design/PROOFREAD.md) | 拼写/语法检查（LanguageTool + Typo.js） |
| [design/AGENTIC_EDITING.md](design/AGENTIC_EDITING.md) | AI Agentic Editing：右侧 AI 面板、ACP 协议、Provider/Model/Mode、工具系统 |
| [design/MARKDOWN_THEME_PRINT_PDF_PLAN.md](design/MARKDOWN_THEME_PRINT_PDF_PLAN.md) | Markdown 主题：内置主题、自定义 CSS、theme.json、热更新 |
| [design/DAISYUI.md](design/DAISYUI.md) | daisyUI 5 使用规范 |
