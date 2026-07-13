# DESIGN.md — 工作空间版本控制 · 技术设计

> 状态：v0.6（2026-07-13，随实现回填；M1–M6 主线完成；本轮 SCM 回归修复已落地，错误反馈与菜单信息架构已定稿、待接入运行时，见 §9/§11/§13）
> 配套需求：[SOURCE_CONTROL.md](./SOURCE_CONTROL.md) · 可编辑 diff/合并：[EDITABLE_DIFF_AND_MERGE.md](./EDITABLE_DIFF_AND_MERGE.md) · 视觉稿：[./ui/](./ui/)
> 已定决策：simple-git（系统 git）· 单仓库 · **新建独立 Diff 组件族**（`common/diff/DiffView`+`MergeView`，编辑区 tab 承载，不复用 agent 的 `DiffSplitView`）· 仅系统凭证 · Commit All · `.iwt` 格式化后 diff
>
> ⚠️ 演进说明：早期 v0.1 曾拟「复用 `DiffSplitView` + 浮层 `GitDiffModal`」，实现阶段已改为**编辑区 `DIFF_VIEWER` tab + 新建独立 Diff 组件**（§3.3/F7/Q3/Q7）；本文已按最终实现清理。

---

## 1. 分层架构

```
渲染进程 (Vue)                            主进程 (Electron)
┌─────────────────────────────┐         ┌──────────────────────────────┐
│ SourceControlPanel (容器)    │         │ GitService (simple-git 封装)  │
│  ├ ScmRepositoriesView       │  IPC    │  detect / status / stage /    │
│  ├ ScmChangesView (Tree)     │ ──────▶ │  commit / diff / log /        │
│  └ ScmGraphView              │ git:*   │  branch / fetch/pull/push …   │
│ ExplorerPanel › TimelineView │ ◀────── │                               │
│ DiffViewerPage (DiffView/Merge)│ result │  依赖：机器安装的 `git`        │
│ statusbar-items/git-status   │         │  simpleGit(root) 实例缓存      │
│ stores/git.ts (useGitStore)  │         └──────────────────────────────┘
└─────────────────────────────┘
      │ 复用：common/tree · showMessageBox · statusbar · workspace filtering
      │ 新建：common/diff（DiffView / MergeView / hunk-patch）
```

- **所有 git 命令在主进程执行**（`GitService`），渲染层只经 IPC 调用、持有状态。
- 渲染层单一状态源：`stores/git.ts`。组件只读 store + 派发 action。
- 单仓库：仓库根 = `appStore.currentFolder`（工作空间根）。
- **错误归属**：`GitService` 在主进程识别 Git 的可预期状态；IPC 传递结构化领域结果；`stores/git.ts` 按状态决定通知、确认或恢复对话框。组件不得解析 stderr 或直接把原始 Git 错误展示给用户。

---

## 2. 文件清单

### 2.1 新增
| 文件 | 职责 |
| --- | --- |
| `src/components/common/split-view/{SplitView.vue,types.ts,index.ts}` | ✅**已建**·通用上下分割容器：多 viewer，逐个 collapse/expand/close + 拖拽调高。Explorer/SCM 复用 |
| `electron/GitService.ts` | ✅**已建**·simple-git 封装：detect/isRepo/init/status/branches/diff/log/commitFiles/commitFileDiff |
| `src/types/git.ts` | ✅**已建**·共享类型：GitStatus / GitFileChange / GitBranchInfo / GitCommit / GitApi |
| `src/stores/git.ts` | ✅**已建**·Pinia setup store：env/status/branch/graph + onFolderChanged/refresh/loadGraph/toggleCommit/loadFileHistory |
| `src/components/sidebar/scm/GitChangeGroup.vue` | ✅**已建**·变更分组行（只读，M2 加 stage/discard 操作） |
| `src/components/sidebar/SourceControlPanel.vue` | ✅**已建骨架**·SCM 视图容器（SplitView 挂三个 viewer + ⋯ 菜单，内容占位待 store） |
| `src/components/sidebar/scm/ScmRepositoriesView.vue` | 存储库 viewer（待 store） |
| `src/components/sidebar/scm/ScmChangesView.vue` | 更改 viewer（提交框 + 变更 Tree，待 store） |
| `src/components/sidebar/scm/ScmGraphView.vue` | 图谱 viewer（提交列表 + 点击展开文件，待 store） |
| `src/components/sidebar/TimelineView.vue` | ✅**已建占位**·Explorer 内 Timeline viewer（待 store 接真实历史） |
| `src/components/pages/DiffViewerPage.vue` | ✅**已建**·编辑区 `DIFF_VIEWER` diff tab，内嵌 `common/diff/DiffView`（普通 diff）/ `MergeView`（冲突合并） |
| `src/components/common/diff/{DiffView,MergeView}.vue` + `hunk-patch.ts` | ✅**已建**·独立 Diff 组件族：split/inline 双模 + 可选行号/差异索引 + hunk stage/discard；不复用 `DiffSplitView` |
| `src/components/sidebar/scm/dialogs/*.vue` | clone / create-branch / checkout / commit-identity / publish / stash |
| `src/components/sidebar/scm/dialogs/GitErrorResolutionDialog.vue` | **待接入**·可恢复/未知 Git 问题的项目内对话框：默认显示可理解说明与下一步，原始输出收进「技术详情」折叠区 |
| `src/components/statusbar-items/git-status.ts` | 状态栏分支 / 同步 item 工厂 |

### 2.2 改动
| 文件 | 改动 |
| --- | --- |
| `src/types/window-content-state.ts` | ✅ `SidebarMode` 增 `SOURCE_CONTROL='sourceControl'` |
| `src/components/LeftSidebar.vue` | ✅ `mainSidebarModes` 增一档(IconGitBranch) + `v-show` 渲染 SourceControlPanel + 打开文件夹门控 |
| `src/components/sidebar/ExplorerPanel.vue` | ✅ 改用 SplitView（Workspace + Timeline）；`⋯` 菜单勾选 Workspace(必)/Timeline(可选) |
| `src/i18n/messages/{zh-CN,en-US}.ts` | ✅ 新增 `sourceControl.*` + `explorer.view/timeline.*` |
| `electron/App.ts` | `this.gitService = new GitService()`；`setupIpcHandlers()` 注册 `git:*` |
| `electron/preload.ts` | 暴露 `git` 命名空间 |
| `src/types/electron-api.ts` | `ElectronAPI.git: GitApi` |
| `electron/MenuManager.ts` | ~~注册 Git 命令菜单项~~ → **不做（2026-07-13 决策）**：面板内菜单全量承载，不进原生菜单栏（SOURCE_CONTROL §5.3/§5.5） |
| `src/components/StatusBar.vue` | onMounted 注册 `createGitStatusStatusBarGroup()` |
| `src/stores/app.ts` | 打开文件夹后触发 `gitStore.onFolderChanged(root)`；文件事件转发；`globalEditSetting.commitWhenEmpty` 默认 `all` |
| `package.json` | 依赖 `simple-git` |
| `src/types/edit-setting.ts` | ✅ 新增 `commitWhenEmpty?: 'all'\|'off'\|'prompt'`（Commit-All 偏好） |
| `src/utils/StateStorage.ts` | ✅ `DEFAULT_EDIT_SETTING.commitWhenEmpty`；新增 `PanelViewersState` + `{save,load}PanelViewers`（viewer 显隐持久化，key `iwriter-panel-viewers`） |
| `src/components/preferences/PreferencesDialog.vue` | ✅ 工作区 tab 新增「源代码管理 › 无暂存更改时提交」下拉 |
| `src/components/sidebar/scm/GitChangeGroup.vue` | ✅ 文件/目录行右键 `@contextmenu`→`emit('context')`；stage/unstage/discard/gitignore 改文件集合；目录行悬停操作 |
| `src/components/sidebar/scm/fileTree.ts` | ✅ 目录行携带 `path` + 递归 `files`（目录级操作数据源） |
| `src/components/sidebar/SourceControlPanel.vue` | ✅ `onContext` 右键菜单；`doPrimaryCommit` 走 `commitWhenEmpty`；viewer 显隐读取/回写；`#graph` 接入泳道 gutter + 加载更多。**待对齐**：容器 `⋯` 只承载跨 viewer 的 Remote/Stash/Tags/视图；Repositories `⋯` 承载分支操作与切换；Changes 标题栏只保留暂存全部与列表/树切换 |
| `src/components/sidebar/scm/gitGraphLayout.ts` | ✅**新建**·DAG 泳道布局纯函数 `computeGraphLayout`（lanes 状态机 + 8 色调色板） |
| `src/components/sidebar/scm/GitGraphGutter.vue` | ✅**新建**·每行提交的泳道 SVG（cubic 连线 + node 圆点） |
| `electron/GitService.ts` `src/types/git.ts` `src/stores/git.ts` | ✅ `log` 扩 `%P` → `GitCommit.parents`；store `loadMoreGraph`/`graphHasMore` 分页 |

---

## 3. 主进程 · GitService（simple-git 封装）

```ts
// electron/GitService.ts
import simpleGit, { SimpleGit } from 'simple-git'

export class GitService {
  private cache = new Map<string, SimpleGit>()   // root → 实例
  private git(root: string): SimpleGit { /* 缓存 simpleGit({baseDir:root}) */ }

  // 环境
  detect(force?: boolean): Promise<GitAvailability> // git --version；force 时绕过缓存
  isRepo(root: string): Promise<boolean>          // checkIsRepo
  init(root: string): Promise<void>
  clone(url: string, dir: string): Promise<void>

  // 状态 / 暂存 / 提交
  status(root: string): Promise<GitStatus>        // status() → 归一化分组
  stage(root, paths: string[]): Promise<void>
  unstage(root, paths: string[]): Promise<void>
  discard(root, paths: string[]): Promise<void>   // checkout -- / 对 untracked 用 clean
  commit(root, message, opts: {all?: boolean; amend?: boolean}): Promise<void>
  getUserIdentity(root): Promise<{name?:string; email?:string}>
  setUserIdentity(root, name, email, global: boolean): Promise<void>

  // Diff（供 common/diff/DiffView）
  diff(root, path, opts:{staged:boolean}): Promise<GitDiffPayload>
  // → {oldContent, newContent, isBinary}；工作区: new=磁盘, old=index/HEAD 内容

  // 历史
  log(root, opts:{path?:string; branch?:string; allBranches?:boolean; limit:number; skip:number}): Promise<GitCommit[]>
  commitFiles(root, hash): Promise<GitFileChange[]>            // show --name-status
  commitFileDiff(root, hash, path, oldPath?): Promise<GitDiffPayload> // 父提交 ↔ 本提交；rename 保留旧路径

  // 分支
  branches(root): Promise<GitBranchInfo>          // {current, ahead, behind, local[], remote[]}
  checkout(root, ref: string, opts?: {force?:boolean; merge?:boolean; track?:boolean}): Promise<void>
  createBranch(root, name, base?, checkout?): Promise<void>
  deleteBranch(root, name, force: boolean): Promise<void>

  // 远程
  fetch(root): Promise<void>
  pull(root, opts:{rebase:boolean}): Promise<void>
  push(root, opts:{setUpstream?:boolean}): Promise<void>
  sync(root, opts:{rebase:boolean}): Promise<void>   // pull 然后 push

  // 冲突 / 合并（M4）
  mergeAbort(root): Promise<void>
  markResolved(root, paths): Promise<void>           // add 标记已解决

  dispose(root?: string): void                        // 清缓存
}
```

**关键实现约束**
- `.iwt` diff（Q6）：`diff()` 对 `.iwt` 先把 JSON `JSON.parse → JSON.stringify(…, null, 2)` 格式化后再作为 old/new 文本，避免整行差异。归属工具函数 `formatForDiff(path, raw)`。
- `isBinary`：按扩展名 + git `--numstat` 的 `-` 判定，走二进制降级。
- 错误规整（F14，待接入）：捕获 simple-git 的 `GitError`，在主进程归类为 `GitActionResult`。已知状态（如分支未合并、工作区阻挡 checkout、合并冲突、认证/网络/非快进）不得作为未处理 IPC 异常抛到渲染层；未知错误保留 `stderr`，但只在项目内对话框的「技术详情」中按需展开。
- 凭证（Q4）：不设置任何 `GIT_ASKPASS`，让 git 走系统 credential helper / ssh-agent；失败即失败并回传 stderr。

```ts
type GitActionResult<T> = { ok: true; value: T } | { ok: false; issue: GitIssue }
type GitIssue =
  | { kind: 'branch-unmerged'; branch: string }
  | { kind: 'checkout-dirty'; ref: string }
  | { kind: 'merge-conflict' }
  | { kind: 'remote-auth' | 'remote-non-fast-forward' | 'network' | 'unknown'; detail: string }
```

> `GitActionResult` 是 F14 的目标契约：读操作保持直接返回；需要让用户选择恢复路径的写操作逐步改为该结果。`App.ts`/preload 只负责传输，错误分类不能下沉到 Vue 组件。

---

## 4. IPC 契约

命名空间 `git:`（对齐既有 `pandoc:*`）。全部 `ipcMain.handle` + `invoke`（请求/响应），无常驻流。

| Channel | 参数 | 返回 |
| --- | --- | --- |
| `git:detect` | force? | `GitAvailability` |
| `git:is-repo` | root | `boolean` |
| `git:init` / `git:clone` | root / (url,dir) | void |
| `git:status` | root | `GitStatus` |
| `git:stage` / `git:unstage` / `git:discard` | root, paths[] | void |
| `git:commit` | root, message, opts | void |
| `git:identity-get` / `git:identity-set` | root(, name,email,global) | … |
| `git:diff` | root, path, {staged} | `GitDiffPayload` |
| `git:log` | root, opts | `GitCommit[]` |
| `git:commit-files` | root, hash | `GitFileChange[]` |
| `git:commit-file-diff` | root, hash, path, oldPath? | `GitDiffPayload` |
| `git:branches` | root | `GitBranchInfo` |
| `git:checkout` / `git:create-branch` / `git:delete-branch` | checkout: root, ref, `{force?,merge?,track?}`；delete: root, name, force | void（F14 写操作将按需改为 `GitActionResult`） |
| `git:fetch` / `git:pull` / `git:push` / `git:sync` | root, opts | void |
| `git:merge-abort` / `git:mark-resolved` | root(, paths) | void |

> 长耗时（clone/pull/push）：先返回 `void` 完成态；渲染层显示「进行中」由 action 的 pending 标志驱动。进度事件（`git:progress`）**已实现（2026-07-12）**：GitService 接 simple-git progress 插件 → App.ts 广播 → preload `git.onProgress` → git store `progress` 状态 → SCM 面板进度条。

`preload.ts`：
```ts
git: {
  detect: () => ipcRenderer.invoke('git:detect'),
  status: (root) => ipcRenderer.invoke('git:status', root),
  stage: (root, paths) => ipcRenderer.invoke('git:stage', root, paths),
  // … 逐一对应
}
```
`electron-api.ts`：`interface ElectronAPI { … git: GitApi }`，`GitApi` 逐方法签名。

---

## 5. 共享类型（`src/types/git.ts`）

```ts
export interface GitAvailability { available: boolean; version?: string; path?: string }

export type GitFileStatus = 'M'|'A'|'D'|'R'|'U'|'C'|'?'   // ?=untracked, C=conflict
export interface GitFileChange {
  path: string; dir: string; name: string
  status: GitFileStatus
  staged: boolean
  isBinary?: boolean
  oldPath?: string        // rename
}
export interface GitStatus {
  staged: GitFileChange[]
  changes: GitFileChange[]      // 未暂存的 tracked 改动
  untracked: GitFileChange[]
  conflicts: GitFileChange[]    // merge changes
  isMerging: boolean
}
export interface GitBranchInfo {
  current: string; detached: boolean
  ahead: number; behind: number; upstream?: string
  local: string[]; remote: string[]
}
export interface GitCommit {
  hash: string; shortHash: string
  subject: string; author: string; date: string; relativeDate: string
}
export interface GitDiffPayload { oldContent: string; newContent: string; isBinary: boolean; path: string }
```

---

## 6. 渲染层 · `stores/git.ts`（Pinia setup store）

```ts
export const useGitStore = defineStore('git', () => {
  // 环境 / 仓库
  const availability = ref<GitAvailability>({ available:false })
  const root = ref<string | null>(null)
  const isRepo = ref(false)

  // 状态
  const status = ref<GitStatus | null>(null)
  const branch = ref<GitBranchInfo | null>(null)

  // 图谱
  const commits = ref<GitCommit[]>([])
  const expandedHash = ref<string | null>(null)
  const expandedFiles = ref<GitFileChange[]>([])

  // viewer 显隐（持久化）
  const showRepositories = ref(true)
  const showGraph = ref(false)
  const showTimeline = ref(true)   // Explorer 内

  // pending 标志（驱动「进行中」）
  const pending = ref<Set<string>>(new Set())  // 'sync' | 'push' | …

  // 派生
  const changeCount = computed(() => (status.value ? status.value.staged.length + status.value.changes.length + status.value.untracked.length + status.value.conflicts.length : 0))

  // 生命周期
  async function onFolderChanged(newRoot: string | null) { /* detect → isRepo → refresh */ }
  const refresh = debounce(async () => { status.value = await api.status(root); branch.value = await api.branches(root) }, 200)

  // action：调用 electronAPI.git.*，成功后 refresh()
  async function stage(paths) {…}  async function commit(msg,opts){…}
  async function checkout(ref){…}  async function sync(){…}  // pending 包裹
  // …
})
```

**刷新调度（NFR1/NFR2）**
- 复用现有 chokidar：`app.ts` 已有工作空间文件监听 → 转发变更事件给 `gitStore.refresh()`（去抖 200ms）。
- watcher 还会将 `.git/HEAD`、`.git/index`、`.git/MERGE_HEAD`、`.git/refs/**`、`.git/packed-refs` 的事件送给 SCM；`.git/index.lock` 必须过滤，避免 Git 自己写索引时形成刷新循环。
- 每个写 action 完成后主动 `refresh()`。
- 窗口 focus 时刷新一次。

---

## 7. 组件树与复用

```
LeftSidebar
├─ ExplorerPanel                       (改：追加 Timeline)
│   ├─ [Workspace viewer]  ← 现有文件树 (common/tree/Tree.vue)
│   └─ TimelineView         ← 新增，跟随 appStore.activeTab 文件
└─ SourceControlPanel                  (新增容器)
    ├─ ScmRepositoriesView   ← 单仓库行 + 分支 + ahead/behind
    ├─ ScmChangesView        ← 提交框(自扩展 textarea) + 变更 Tree(common/tree)
    └─ ScmGraphView          ← useGitStore.commits；点击 → 展开 commitFiles

编辑器区：DiffViewerPage      ← 内嵌 common/diff/DiffView（普通 diff）/ MergeView（冲突合并）
弹窗：SourceControlPanel 内联输入弹窗  ← PrintDialogShell 风格（分支/远程/贮藏信息）
      纯破坏性确认             ← window.electronAPI.showMessageBox
      GitErrorResolutionDialog ← 项目内恢复/未知错误对话框（技术详情可折叠，F14 待接入）
状态栏：statusbar-items/git-status ← createGitStatusStatusBarGroup()
```

**复用点（不重复造轮子）**
- 变更列表 / commit 文件列表：`common/tree` 行模型思路；SCM 自建 `scm/fileTree.ts`（目录树行 + 目录级操作数据源）。
- Diff：**新建** `common/diff/DiffView.vue`（split/inline 双模、可选行号、差异索引、hunk stage/discard）；冲突用 `MergeView.vue`。**不复用** agent 的 `DiffSplitView`（仅参考其 UI，见 §3.3/F7 决策）。
- 原生确认：`window.electronAPI.showMessageBox` 仅用于纯破坏性确认（放弃、删除、强制删除、终止合并）。可恢复和未知 Git 错误走项目内 `GitErrorResolutionDialog`，默认不显示 stderr，用户展开「技术详情」才可查看/复制。
- 右键上下文菜单：`window.electronAPI.showContextMenu`。容器 `⋯` 只放跨 viewer 的 Remote/Stash/Tags/视图；Repositories `⋯` 放分支操作与切换；Changes 文件/目录右键只放文件或目录操作；Graph 提交行右键只放提交操作。
- 输入弹窗外壳：`print/PrintDialogShell.vue` 同款（`bg-black/45 backdrop-blur` + `iw-input` + `iw-btn`）。
- 状态栏：`common/statusbar` 工厂（`useStatusBar` + `StatusBarAlignment` + rich content `$(git-branch)`）。
- 忽略规则：`getEffectiveWorkspaceIgnoreRules`（与 `.gitignore` 统一来源）。

**Diff tab 打开方式**：点击变更/提交文件 → `appStore.openDiffTab(spec, title)` 打开 `DocumentType.DIFF_VIEWER` tab（只读、永不 dirty、不进 workspace 快照），标题 `filename (工作区/暂存/hash/合并)`；同一对比去重复用（见 F7.1）。

---

## 8. 交互流程（关键路径）

**暂存并提交**
1. 用户点文件行 `＋` → `gitStore.stage([path])` → `git:stage` → 成功 `refresh()`。
2. 输入信息，点「提交」→ 若无暂存则 Commit All（Q5）→ 校验 identity（缺失弹 commit-identity dialog）→ `git:commit` → `refresh()` + 清空输入。

**打开 diff**
1. 点变更文件 → `gitStore.openDiff(path, {staged})` → `appStore.openDiffTab(spec, title)`（冲突文件走 `openMergeTab`）。
2. `DiffViewerPage` onMounted 按 `DiffSpec` 取内容（`git:diff` / `git:commit-file-diff` / 冲突三方）→ 传入 `DiffView` / `MergeView`。

**Graph 展开提交**
1. 点提交行 → `gitStore.expandedHash = hash` → `git:commit-files` → 渲染文件 list/tree。
2. 点文件 → 打开 diff tab（`git:commit-file-diff`，父↔本）。

**同步**
1. 点同步 → `pending.add('sync')` → `git:sync{rebase}` → 成功 `refresh()`；失败按 `GitIssue` 显示可理解的原因和下一步，原始输出仅在「技术详情」按需展开。

**删除未合并分支（F14）**
1. 用户确认普通删除 → `git:delete-branch(name, false)`。
2. 若返回 `branch-unmerged`，显示说明「该分支尚未合并」；不弹出原始 Git stderr，也不记为应用异常。
3. 用户明确选择「强制删除」后，再以 `force: true` 调用并显示原生破坏性确认；取消则保持当前状态。

---

## 9. 错误处理与降级

| 场景 | 处理 |
| --- | --- |
| git 未安装 | `detect().available=false` → 面板显示安装引导（OfficeViewerPage 范式），禁用 action |
| 非仓库 | 面板显示 init / clone |
| identity 缺失 | commit 前拦截 → commit-identity dialog |
| 字段/前置条件错误 | 表单内联提示；不打开错误对话框 |
| 分支未合并 / checkout 被本地改动阻挡 / 合并冲突 | 作为预期状态显示明确原因和可选恢复动作；不展示 raw stderr |
| 认证失败、无权限、网络、非快进 push | 项目内恢复对话框：默认解释原因和下一步，技术详情折叠；不自建密码 UI、不自动 force |
| 未分类 Git 错误 | 项目内错误对话框 + 可展开/复制的技术详情；完整输出留日志 |
| 大仓库 | status/log 分页（limit/skip）、主进程异步、UI 去抖 |

---

## 10. i18n

新增命名空间 `sourceControl.*`（对齐 `agentPanel.*` / `statusBar.*` 组织）：
`sourceControl.title` / `changes` / `staged` / `untracked` / `merge` / `commit` / `commitAll` / `sync` / `push` / `pull` / `discardConfirm` / `noChanges` / `noCommits` / `gitNotFound` / `installGit` …（中英双语）。F14 增 `sourceControl.error.*`、`sourceControl.branch.unmerged*`、`sourceControl.error.technicalDetails`、`sourceControl.error.copyDetails`。

---

## 11. 里程碑 → 任务分解

| 里程碑 | 任务（文件） |
| --- | --- |
| **M1 只读基础** | ✅**完成** · `simple-git` · `GitService`(detect/isRepo/init/status/branches/diff/log/commitFiles/commitFileDiff) · `git.ts` 类型 · IPC(`git:*`)+preload(`git`)+electron-api · `stores/git.ts` · `SidebarMode`+LeftSidebar · `SourceControlPanel` 三 viewer(Repositories/Changes 只读/Graph 提交+展开文件+点文件看 diff) · `TimelineView`(跟随活动文件) · **编辑区 `DIFF_VIEWER` tab（`DiffViewerPage`+新建 `common/diff/DiffView`）**(点变更/提交文件→diff tab) · `statusbar-items/git-status`(分支+↑↓，command 聚焦 SCM) · MainView 统一驱动 onFolderChanged |
| **M2 本地写** | ✅**完成** · GitService(stage/unstage/stageAll/unstageAll/discard/commit/identity/checkout/createBranch/deleteBranch/addToGitignore) · IPC+preload+api · store 写 action(run 包裹+notify 报错) · 提交框(自扩展 textarea+智能 Commit All+▾菜单) · 逐文件&分组 stage/unstage/discard/gitignore · 放弃走 `showMessageBox` 二次确认 · 提交身份 `GitIdentityDialog` · 分支切换/新建。**未 surface**：deleteBranch(已实现，菜单未挂) |
| **M3 远程** | ✅**完成** · GitService(fetch/pull/push/sync/publish/clone) · IPC+preload+api · store remoteRun(busy 态 + 失败 `showMessageBox` 弹 stderr) · ⋯ 菜单远程操作(有 upstream→sync/pull/push；无→publish；+fetch) · 标题栏同步按钮(busy spinner) · 克隆弹窗→选目录→`appStore.openFolderByPath` 打开 · 状态栏 sync item 直接触发同步 |
| **M4 进阶** | ✅**完成（gutter 已弃）** · 冲突分组 + 合并解决（`DIFF_VIEWER` kind=conflict + `MergeView`，见 EDITABLE_DIFF_AND_MERGE.md）· commit-file-diff · Timeline/Graph 历史 · 状态栏分支。~~编辑器 gutter 装饰~~ 已决策不做（F12 A） |
| **M5 增强** | ✅**大部完成** · stash（F10）· hunk 级 stage（F7.4）· 进度事件（`git:progress`）· 远程管理 add/remove/list · 目录级 stage（tree 视图）· 变更行/目录行右键菜单 · Commit-All 偏好 · viewer 显隐持久化 · **分支泳道图 DAG（侧栏 gutter，只读 v1）**：`log` 扩 `%P`→`GitCommit.parents`；`scm/gitGraphLayout.ts`(computeGraphLayout) + `scm/GitGraphGutter.vue`(每行 SVG)；`loadMoreGraph`/`graphHasMore` 分页 |
| **M6 菜单补全** | **P0 ✅已实现（2026-07-13，三绿 type-check/lint/build，运行时 smoke 待做）** · Tag 全链路（F13：`GitService.listTags/createTag/deleteTag`+IPC+preload+GitApi+store `tags/loadTags/createTag/deleteTag`；`⋯`→Tags 子菜单[创建/列表删除]+创建标签弹窗[名称+可选说明→附注标签]）· Graph 提交行右键（`onGraphCommitContext`：Copy Hash/Message、在此打标签、从此创建分支；提交行 `@contextmenu.prevent`）· Changes 右键补 Open File+Reveal（store `openWorkingFile/revealFile`，仅单个未删除文件；复用 `openFile`/`revealInFolder`）· create-branch 弹窗支持 `base` 提交 hash。**P1 ✅已实现（2026-07-13，三绿，运行时 smoke 待做）**：Undo Last Commit（`reset --soft HEAD~1`，commit ▾ 菜单 + 二次确认）· Rename Branch（`branch -m`，branch 菜单 + 重命名弹窗预填当前名）· Stash (Include Untracked)（`stash push -u`，贮藏弹窗复选框）· Push Tags（`push --tags`，Tags 子菜单，有 upstream 才启用）。技术落点见 §13。**明确不做**：MenuManager 原生菜单 · Rebase · Pull(Rebase) 菜单化 · Pull from…/Push to… · Fetch Prune/All Remotes · Delete Remote Branch/Tag · Rename Remote · Checkout 到裸提交 |
| **M7 反馈与信息架构** | **设计已定稿，待实施** · Git 主进程错误分类与 `GitActionResult`；预期状态不透传 raw stderr；项目内恢复/未知错误对话框（「技术详情」折叠）；删除未合并分支的安全删除→强制删除二次确认；容器/Repositories/Changes/Graph 菜单职责按 §7 分离。视觉稿见 `ui/panel.html`、`ui/dialogs.html`。 |

> **留后（非本轮）**：行级(任意选区) stage · 图片 diff 前后对照 · 多仓库（预留）· 全宽 Git Graph tab · 图上写操作（checkout/merge/cherry-pick/reset on graph）· Graph 泳道图打磨（列压缩/滚动自动加载/横向滚动）。

---

## 12. 开放技术点（实现时定）

- **Diff 承载（已定案）**：最终采用**编辑区 `DIFF_VIEWER` tab + 新建独立 `common/diff/DiffView`/`MergeView`**（依赖 tab view refactor 新增该 tab 类型，只读、不落盘、去重复用），非浮层、不复用 `DiffSplitView`。早期「浮层 `GitDiffModal`」方案已废弃。
- **status 解析**：simple-git `status()` 已给结构化结果，但 rename/conflict 细节需核对字段；必要时 `git status --porcelain=v2` 自解析。
- **`.git` 目录监听**：与现有 chokidar 的 ignore 规则可能冲突（`.git` 常被忽略）——需为 `.git/HEAD|index|MERGE_HEAD` 开单独 watch。
- **DiffView 大文件**：`DiffView` 变更行内做 `diffWords`/`diffChars` 子高亮，超大文件需截断/分块（观察）。
- **`.iwt` 格式化 diff 的稳定性**：确保 save 侧与 diff 侧格式化规则一致，否则误报差异。

---

## 13. M6 菜单能力 · M7 入口重整（2026-07-13）

> M6 的 Git 能力已实现；M7 负责将既有能力重新落入已确认的入口职责（§7/§11），并与 F14 错误反馈一起实施。容器 `⋯` 不再承载分支或提交动作。

**主进程 `electron/GitService.ts`（+ IPC `git:*` + preload + `src/types/git.ts` GitApi）**
| 方法 | 命令 | 用途 | 阶段 |
| --- | --- | --- | --- |
| `listTags(root)` | `tag --sort=-creatordate` | Tags 子菜单列表 | P0 ✅ |
| `createTag(root, name, {message?, hash?})` | `tag [-a -m <msg>] <name> [<hash>]` | 打标签（可指定提交） | P0 ✅ |
| `deleteTag(root, name)` | `tag -d <name>` | 删标签 | P0 ✅ |
| `pushTags(root)` | `push --tags` | tag 进远程备份 | P1 ✅ |
| `undoLastCommit(root)` | `reset --soft HEAD~1` | 撤销上次提交（保留改动） | P1 ✅ |
| `renameBranch(root, old, new)` | `branch -m <old> <new>` | 分支改名 | P1 ✅ |
| `createBranch(root, name, base, checkout)` | 已有，`base` 支持传 hash | Create Branch From… / from commit | P0 ✅ |
| `stashPush(root, message?, includeUntracked?)` | `stash push [-u] [-m]` | 扩展现有 stash 选项 | P1 ✅ |

**渲染层**
- `src/stores/git.ts`：对应 action（`createTag/deleteTag/listTags/pushTags/undoLastCommit/renameBranch`，`run()` 包裹 + notify 报错 + refresh）；`tags` 状态（供 Tags 子菜单）。
- `src/components/sidebar/SourceControlPanel.vue`：
  - 容器 `⋯` 放 **Remote / Stash / Tags / 视图显隐**；**Undo Last Commit** 留在 commit ▾，不放在容器菜单。
  - Repositories `⋯` 放分支新建、重命名、合并、删除和分支切换；stash push 保留 **Include Untracked** 选项。
  - **新增 Graph 提交行右键处理** `onGraphCommitContext(commit, ev)`：Copy Hash / Copy Message（`navigator.clipboard`）· Create Tag（在此提交）· Create Branch from here。需 Graph 行绑定 `@contextmenu`（当前 `#graph` 泳道行无右键，为本轮主要缺口）。
- `src/components/sidebar/scm/GitChangeGroup.vue` + `SourceControlPanel.onContext`：变更行右键增 **Open File**（`appStore.openFile(absPath)`，非 diff）+ **Reveal in Finder**（复用 `window.electronAPI.revealInFolder`）；可选 **Open File (HEAD)**（🔻 后置）。
- 弹窗：Create Tag / Rename Branch 复用现有 `PrintDialogShell` 风格输入弹窗（参照 `GitCloneDialog`/create-branch）。
- i18n：`sourceControl.tag.*`、`sourceControl.action.openFile/revealInFinder`、`sourceControl.undoLastCommit`、`sourceControl.branch.rename/createFrom` 中英双语。

**护栏**：Undo Last Commit（`--soft` 保留改动，仍二次确认）、Delete Tag（二次确认）。破坏性判断线同 NFR4。

**Push Tags**：走 `remoteRun('pushTags')`（busy 态 + 失败进入 F14 恢复对话框），i18n `remote.pushTags`；Tags 子菜单仅 `hasUpstream` 时启用。

---

*M1–M6 已落地（M6 P0+P1 代码三绿，运行时 smoke 待做）；M7 错误反馈与菜单入口重整待实施。SCM 留后项：行级 stage、图片 diff、多仓库、全宽 Git Graph tab、图上写操作、泳道图打磨。*
