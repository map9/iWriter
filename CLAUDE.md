# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start Vite dev server (renderer + Electron main via vite-plugin-electron)

# Type check & build
npm run type-check       # vue-tsc --noEmit only (no emit)
npm run build            # type-check + vite build (full)
npm run build:quick      # vite build only (skip type-check, faster iteration)

# Package
npm run dist:quick       # build:quick + electron-builder (default platform)
npm run dist:mac         # macOS DMG
npm run dist:win         # Windows installer
npm run dist:linux       # Linux AppImage/deb

# Lint
npm run lint             # ESLint with auto-fix (.vue, .ts, .tsx)

# Native rebuild (needed after npm install if better-sqlite3 breaks)
npm run rebuild-native

# Docs site (VitePress, separate from app)
npm run docs:dev
npm run docs:build
```

There is no test script. Verification is done via `type-check` + manual run.

After `npm install`, `postinstall` automatically runs `patch-package` and `electron-rebuild -f -w better-sqlite3`. If SQLite errors appear after a Node/Electron upgrade, run `npm run rebuild-native`.

## Response language

- Reply in Chinese when the user's request is written in Chinese.
- Reply in English when the user's request is written in English.
- If the user explicitly asks for a different language, follow that explicit request.
- Do not reply in Japanese, Korean, or other languages unless the user explicitly requests that language, quotes source material in that language, or asks to translate/analyze that language.
- For mixed Chinese/English requests, use the primary language of the instruction. If unclear, prefer Chinese.

## Working principles

### 1. Think first

- If the requirement is uncertain and cannot be resolved from the codebase or existing docs, stop and ask before acting. Do not guess.
- When there are multiple materially different approaches with meaningful tradeoffs, list them in order instead of silently choosing for the user.
- If a simpler solution exists, proactively point it out.
- Push back when the requested approach is unnecessary, risky, or misaligned with the project.

### 2. Prefer simplicity

- Do not implement features that were not requested.
- Do not abstract code that is only used once.
- Do not add premature flexibility, configuration, or extension points for hypothetical needs.
- Do not add defensive error handling for hypothetical scenarios unless the surrounding code already handles similar cases.

### 3. Make precise changes

- Modify only the parts required by the request.
- Match the existing code style and local patterns, even if they are not ideal.
- If unrelated problems are discovered, mention them instead of fixing them without permission.
- Clean up redundancy introduced by the current change, but do not touch unrelated code.

### 4. Stay goal-driven

- When proposing how to do something, also state the verifiable endpoint.
- Define what must be true for the work to be considered complete.
- Prefer implementation steps that can be checked by build, type-check, lint, manual workflow, or explicit document acceptance criteria.

## Architecture

### Process split

```
Electron main process  (electron/)   — Node.js, full fs/SQLite access
  └── AI Runtime (AgentEngine)
  └── App, WindowManager, MenuManager
  └── preload.ts  →  exposes window.electronAPI (contextBridge)

Renderer process  (src/)             — Vite + Vue 3, no Node APIs
  └── accesses Electron via window.electronAPI (IPC only)
```

The boundary is strict: renderer never calls Node.js or LangChain directly. All AI, file I/O, and native capabilities go through `ipcRenderer`/`ipcMain` channels declared in `electron/preload.ts` and typed in `src/types/electron-api.ts`.

### AI Runtime (main process)

`electron/ai/AgentEngine.ts` is the central orchestrator. Key concepts:

- **Agent** — created per `(providerConfigId, domain, mode, modelId)` tuple and cached. Built with `createDeepAgent` from `deepagents` (LangGraph wrapper).
- **Thread** — a persistent conversation. `threadId` IS the LangGraph `checkpointId`. History stored in SQLite via `@langchain/langgraph-checkpoint-sqlite`.
- **Domain / Mode** — two domains: `editing` (modes: `edit`, `minimal`) and `creative` (mode: `creative`). Each domain has its own capability set built by `buildEditCapabilities` / `buildCreativeCapabilities`.
- **HITL (interruptOn)** — edit domain tools that modify documents (`edit_block`, `insert_block`, `delete_block`, `replace_range`, `create_document`) are declared with `interruptOn` in `buildEditCapabilities.ts`. Each invocation pauses the LangGraph run and emits `ai:run-interrupted` to the renderer. The renderer collects user decisions (`approve`/`edit`/`reject`) and calls `resumeRun()` with a decisions array.
- **SnapshotBroker** — bridge between main process and the live TipTap editor state. The renderer serializes the editor to `SerializedSnapshot` (block map + outline + Markdown view) and sends it to main via IPC before each AI turn.
- **Builtin skills** — `electron/ai/builtin-skills/*/SKILL.md` files. Each has YAML frontmatter (`name`, `description`) and a workflow body. Loaded via `LocalShellBackend` in the creative domain.

### AI state in renderer

`src/ai/store/ai.ts` (Pinia) is the single source of truth for the renderer side:
- Provider configs, active provider, default mode
- Thread list and message cache (authoritative copy lives in main-process SQLite)
- Runtime state: streaming status, current turn, interrupt payload, proposal review batch

The store is split into submodules: `editReview`, `runtimeDisplay`, `runtimeEvents`, `runtimeState` (in `src/ai/store/modules/`).

### Document ↔ AI pipeline

```
TipTap editor (renderer)
  → DocumentViewBuilder.build()        # ProseMirror doc → viewMarkdown (with {b:N} block markers) + blockMap + outline
  → SnapshotSerializer                 # serializes to IPC-safe JSON
  → SnapshotBroker (main)              # caches latest snapshot per filePath
  → DocumentTools (main)               # LLM calls get_document_outline / get_section / get_blocks etc.
  → EditProposalTools (main)           # LLM emits edit_block / insert_block / ... → interruptOn fires
  → renderer receives interrupt event
  → BlockEditApplier (renderer)        # applies approved proposals back to TipTap
```

Block IDs in `viewMarkdown` use the format `{b:N}`. They map to TipTap node UniqueIDs via `blockMap`. `BlockEditApplier` verifies `expectedCurrentContent` before applying to detect stale proposals.

### Editor extensions

All TipTap extensions are registered in `src/utils/editorExtensions.ts`. Custom extensions live in `src/components/common/tiptap/`:
- `iw-search-replace/` — file-scoped and document-scoped search/replace
- `iw-proofread/` — spell/grammar check with worker pool
- `iw-range-highlight/` — range highlight overlay (used by AI proposal preview)
- `iw-popup-tools/` — link and math inline edit popups

### Pinia stores

- `src/stores/app.ts` — workspace state, tabs, theme, edit settings, sidebar visibility. Syncs state to Electron window via `windowContentChange` IPC.
- `src/ai/store/ai.ts` — all AI-related state (see above).

### IPC conventions

- All IPC channel names are defined in `electron/ai/ipc/protocol.ts` (AI channels) and `electron/preload.ts` (file/window channels).
- Types for the AI IPC payloads live in `src/types/ai.ts` and `electron/ai/ipc/protocol.ts`.
- The renderer imports `window.electronAPI` whose shape is typed in `src/types/electron-api.ts`.

### File format notes

- `.iwt` — iWriter native format: JSON `{ content: string (TipTap HTML), meta: {...} }`. Preserves all editor state.
- `.md` / `.txt` — converted to/from TipTap HTML via `src/import-export/formatConverter.ts` (uses Turndown + marked).
- Story assets (Creative mode) — stored under `{workspace}/.iwriter/story/{section}/{slug}.md`.

### Adding a new builtin skill (Creative domain)

1. Create `electron/ai/builtin-skills/{skill-name}/SKILL.md` with frontmatter `name` and `description` fields.
2. No code change needed — `LocalShellBackend` auto-loads all SKILL.md files from the skills directory.

### Adding a new AI provider

1. Add a preset entry in `src/ai/providers/provider-presets.ts`.
2. If the provider needs a custom chat model class, add it under `electron/ai/providers/` and register it in `ModelFactory.ts`.
3. Providers following the OpenAI wire format can reuse `OpenAICompatProvider` with a custom `baseUrl`.
