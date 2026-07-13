# SOURCE_CONTROL.md — 工作空间版本控制需求文档

> 状态：草案 v0.4（2026-07-13，M1–M4 主线 + M5 大部完成；本轮定稿 **SCM 菜单体系（做/不做）**：去除 MenuManager 系统菜单需求、面板内菜单全量承载，Tag 全链路 + Graph 提交行右键 + Changes「Open File/Reveal」+ Undo Last Commit 等列入待实施，详见 §5.5。剩：行级 stage、rename remote、图片 diff、多仓库[留后]）
> 定位：为 iWriter 工作空间（打开的文件夹）提供对标 VSCode Source Control 的 **真 Git 集成**。

---

## 1. 目标与范围

### 1.1 目标
在 iWriter 左侧栏新增一个「源代码管理 / Source Control」面板，让用户对当前工作空间文件夹执行标准 Git 版本控制操作，交互与心智模型**对标 VSCode**。

### 1.2 路线决策（已定）
| 维度 | 决策 | 含义 |
| --- | --- | --- |
| 底层引擎 | **真 Git 集成** | 仓库即标准 `.git`，可与 GitHub/GitLab/命令行 Git 互通，不自研快照格式 |
| 功能定位 | **对标 VSCode 全功能** | stage/commit/branch/merge/冲突解决/remote push-pull/多仓库 |
| Diff 呈现 | **源码行级对比** | 对 `.md`/`.iwt` 源文本做经典行级 diff（红绿行），不做渲染态语义 diff |

### 1.3 范围外（本期不做）
- 渲染态 / 富文本语义 diff（段落级高亮）——保留为未来增强项。
- 实时多人协同编辑（CRDT/OT）。
- 内置 Git 服务器 / 托管。
- GUI 化的交互式 rebase（`rebase -i`）、cherry-pick 图形编辑器（可后置）。

---

## 2. 术语与概念映射

严格采用 Git 原生术语（对标 VSCode，不做写作者化封装）：

| UI 术语 | Git 概念 |
| --- | --- |
| 更改 / Changes | working tree 变更（modified/added/deleted/untracked/renamed）|
| 暂存的更改 / Staged Changes | index (staged) |
| 提交 / Commit | `git commit` |
| 分支 / Branch | branch / HEAD |
| 同步 / Sync | `pull --rebase`(可配) + `push` |
| 拉取 / 推送 / 获取 | pull / push / fetch |
| 合并 / 冲突 | merge + conflict markers |
| 贮藏 / Stash | `git stash` |
| 放弃更改 / Discard | `git checkout -- <file>` / `git clean` |

---

## 3. 技术选型（需求前置：影响后续所有需求可达性）

### 3.1 Git 执行引擎（已定 · Q1）
**采用 `simple-git`，依赖系统安装的 `git`**，不内置便携 git。
- 理由：与「真 Git 集成 + 全功能 + 互通」最契合，凭证/SSH/hooks/LFS 全走原生，维护成本低。
- 对「未安装 git」场景提供检测与安装引导（见 F0，对齐 `OfficeViewerPage` 范式）。
- 所有 git 调用在**主进程**执行（`electron/App.ts`），渲染进程经 IPC 调用。
- （备选 `isomorphic-git` / `nodegit` 不采用。）

### 3.2 凭证与认证（已定 · Q4）
**仅依赖系统凭证，不自建密码输入 UI。**
- HTTPS：复用系统 credential helper（macOS Keychain / Windows Credential Manager / git-credential）。
- SSH：复用系统 ssh-agent / `~/.ssh`。
- push/pull 认证失败时，用原生 `showMessageBox` 给出清晰指引（检查凭证/远程权限），不托管密码。

### 3.3 Diff 计算（已定 · Q3 / Q6，2026-07-11 修订）
- **新建独立 Diff 组件，不复用 agent 的 `DiffSplitView.vue`**（仅参考其 UI）。理由：agent 版为聊天气泡设计（`max-h-88` 限高、仅 split、无行号、无导航），SCM 编辑区 tab 需要整页高度 + split/inline 双模 + 可选行号 + 差异索引。
- 呈现对标 VSCode：**line-level 对齐 + 变更行内 word/char 级高亮**，源码文本 diff（不做渲染态语义 diff）。
- 输入：`oldContent`(HEAD/index) + `newContent`(工作区/提交)。底层 `diff@9` 依赖已在。
- **`.iwt`/`.json` 文件：先格式化再 diff**（JSON `parse → stringify(_,null,2)` 美化后再送入 diff，避免无意义整行差异）。
- 详细组件设计见 **§F7 · Diff 查看器**。

---

## 4. 功能需求（Functional Requirements）

> 优先级：P0 必须 / P1 重要 / P2 增强。

### F0 · 仓库检测与初始化 (P0)
- 打开文件夹后自动探测工作空间根是否为 Git 仓库（存在 `.git`）。
- 三种状态：
  - **非仓库** → 面板显示「初始化仓库 (git init)」按钮 + 「克隆仓库」入口。
  - **是仓库** → 显示更改列表。
  - **git 不可用**（未安装/引擎缺失）→ 面板显示不可用提示与安装引导，禁用相关功能。
- **首期仅支持单根仓库**（Q2）：以工作空间根的 `.git` 为准；多仓库 / 子模块（submodule）/ 子目录仓库延后。Repositories viewer 仍保留（展示单仓库 + 分支），为将来多仓库预留结构。

### F1 · 变更状态视图 (P0)
- 列出 working tree 变更，分组：**Staged Changes** / **Changes** / **Merge Changes(冲突)** / **Untracked**。
- 每项展示：文件名、相对路径、状态字母（M/A/D/R/U/?）、颜色标识。
- 计数徽标：面板图标上显示变更文件总数（对标 VSCode activity bar badge）。
- 空状态：无变更时显示「没有更改」。

### F2 · 暂存 / 取消暂存 (P0)
- 单文件 stage / unstage（hover 行内 `+` / `−`）。
- 分组批量：Stage All / Unstage All。
- 支持**块级** stage/discard/unstage（stage hunk）——**已实现（2026-07-12）**：diff 视图逐块悬停操作，`structuredPatch` 生成单-hunk 补丁 → `git apply [--cached] [-R]`（详见 §F7.4）。行级（任意选区）仍留后。
- **目录级** stage/unstage/discard（tree 视图）——**已实现（2026-07-12）**：Changes 树视图下目录行悬停操作 + 右键菜单，作用于该目录（含子目录）下全部变更文件；`fileTree.ts` 目录行携带 `path` + 递归 `files`，与文件行统一走文件集合派发。

### F3 · 提交 (P0)
- 提交信息输入框：单行起、自动扩展多行（镜像 SearchPanel），支持标题/正文约定。
- 「提交」按钮：提交已暂存内容；**无暂存内容时默认「提交所有更改」（Commit All，对标 VSCode）**（Q5）。可在偏好设置改为「禁用/每次询问」——**已实现（2026-07-12）**：偏好项 `EditSetting.commitWhenEmpty`（`all`/`off`/`prompt`），偏好设置「工作区 › 源代码管理」下拉；`off` 无暂存时给 notify 提示、`prompt` 弹二次确认。
- 提交前校验：空信息拦截、用户 `user.name/user.email` 缺失时引导配置。
- 支持 Amend（修订上次提交）——P1。
- 提交后刷新状态并清空输入框。

### F4 · 放弃更改 / 清理 (P0)
- 单文件 / 批量放弃更改（还原到 HEAD），**二次确认**（不可逆，破坏性操作需醒目警告）。
- 删除未跟踪文件（clean）需独立确认。

### F5 · 分支管理 (P0)
- 状态栏 / 面板头显示当前分支名 + 领先/落后计数（ahead/behind ↑↓）。
- 创建分支、切换分支（checkout）、基于当前分支新建、删除分支。
- 分支列表（本地 + 远程），快速切换（对标 VSCode 分支 QuickPick）。

### F6 · 远程操作 (P0)
- Fetch / Pull / Push / **Sync**（pull+push 合一）。
- Publish Branch（首次推送本地分支到远程并设置 upstream）。
- Clone 仓库到本地并可选打开为工作空间。
- 远程管理（add/remove remote）——**已实现（2026-07-12）**：`GitService.listRemotes/addRemote/removeRemote`；SCM more-actions →「管理远程…」子菜单（添加远程 modal + 逐个删除二次确认）。rename remote **不做**（单人本地，§5.5）。
- 进度反馈：长耗时操作显示进行中状态，失败用原生 `showMessageBox` 给出 stderr 摘要与指引（不自建密码 UI，见 §3.2）。

### F7 · Diff 查看器 (P0)

点击变更文件 / 提交内文件 → 打开 **Diff 视图作为编辑区 tab**（对标 VSCode，不再用模态浮层）。依赖 [tab view refactor](../tab%20view%20refactor/TAB_VIEW_REFACTOR.md)（新增 `DIFF_VIEWER` tab 类型）。

#### F7.1 承载：Diff 作为 tab（依赖 tab 重构）
- 新 `DocumentType.DIFF_VIEWER` → `DiffViewerPage.vue`；tab 只读、永不 dirty、不进 workspace 快照（重启不恢复）。
- tab 自描述：`FileTab.params = { kind: 'diff', diff: DiffSpec }`，页面 mount 时按 spec 自取内容。
- 去重身份 = 合成路径 / `identityOf`：同一文件的同一对比只开一个 tab，再点即激活。
- tab 图标用 git-compare 图标；标题 `文件名 (基准)`，tooltip = 相对路径 + 对比基准。

#### F7.2 对比场景 × 可编辑性
| # | 场景 | 对比基准（左 ↔ 右） | 右侧写回目标 | 天然可编辑 | 本期 |
| --- | --- | --- | --- | --- | --- |
| 1 | 未暂存更改 | index ↔ 工作区文件 | 磁盘文件 | ✅ | **只读**(§Q3) |
| 2 | 已暂存更改 | HEAD ↔ index | index blob | ❌ | 只读 |
| 3 | 提交内文件差异 | 父提交 ↔ 本提交 | 历史 blob | ❌ | 只读 |
| 4 | 文件历史版本(F8) | 历史某版 ↔ 工作区/另一版 | 视右侧 | ⚠️ | 只读 |
| 5 | 合并冲突(F9) | ours ↔ 工作区(含标记) | 磁盘文件 | ✅ | 只读 |

- 规律：仅当**右侧=工作区磁盘文件**（场景 1/5）才有可编辑语义；双方都是 git 对象时一律只读。
- **修订（2026-07-11）**：可编辑不再延后。场景 1（未暂存）**放开为可编辑**、场景 5（冲突）为可编辑结果——因为 **diff 是源文本视图，在其中编辑=纯文本源编辑，无 WYSIWYG 错配**（不走 TipTap 编辑器，那会重蹈 F12 gutter 的语义 diff 坑）。**仅文本/markdown 源可编辑**，`.iwt`/`.json` 在 diff 里仍只读。详见 [EDITABLE_DIFF_AND_MERGE.md](EDITABLE_DIFF_AND_MERGE.md)。

```ts
export interface DiffSpec {
  root: string
  filePath: string                 // 仓库相对路径
  kind: 'working' | 'commit' | 'conflict'  // conflict 见 F9（已实现）
  staged?: boolean                 // working: false→场景1, true→场景2
  hash?: string                    // commit: 场景3
  editable?: boolean               // 场景1=true（文本源）；实际生效（不再恒 false）
}
```

#### F7.3 新 Diff 组件（不复用 `DiffSplitView`，参考其 UI）
组件落点 `src/components/common/diff/`：
- `DiffViewerPage.vue` — tab 页外壳：顶部工具栏 + 主体 + 四态（loading / 无更改 / 二进制占位 / 图片占位）。
- `DiffView.vue` — 核心渲染器，`mode: 'split' | 'inline'` 双模。
- 计算复用 `diff@9`：`diffLines` 做行对齐，变更行对内用 `diffWords`/`diffChars` 做**行内子高亮**（VSCode 观感）。

**呈现能力（本次确认）：**
- **并排 split + 内联 inline**：工具栏切换。split 左右两栏按行对齐（删=左 error 底色、增=右 success 底色）；inline 单栏统一视图（删行在前、增行在后）。
- **粒度对标 VSCode**：行级对齐 + 变更行内 word/char 级高亮。
- **源码文本 diff**：`.md` 直接按源文本；`.iwt`/`.json` 先格式化再 diff（§3.3/Q6）。
- **二进制显示占位**、**图片显示占位**（本期均为占位提示，不做图片前后对照）。
- **行号显示（可选）**：gutter 显示两侧行号 + 变更标记（+/−/~），工具栏可开关。
- **差异索引视图（可选）**：hunk 索引（`@@ -a,b +c,d @@` 列表）或右侧 overview 概览条，支持上/下一处变更跳转导航；工具栏可开关。

**工具栏项**：split/inline 切换 · 行号开关 · 差异索引开关 · 上/下一处变更 · 刷新 · （stage/discard hunk 留 P1）。

**状态**：加载中 spinner；无更改空态；`isBinary` 且为图片 → 图片占位；其余二进制 → 二进制占位。

#### F7.4 数据与刷新
- 后端：`git.diff(root, file, {staged})`（场景 1/2）、`git.commitFileDiff(root, hash, file)`（场景 3），返回 `{ path, oldContent, newContent, isBinary }`。
- 图片判定：按扩展名（`IMAGE_EXTENSIONS`）→ 图片占位。
- 刷新：working 类 diff 订阅 git status 刷新，stage/discard/commit 后重取；变更消失展示「没有更改」空态（不自动关）。commit diff 内容不变，无需刷新。
- 从 diff 视图 stage/discard/unstage 选中 hunk（与 F2 联动）——**已实现（2026-07-12）**：`GitService.applyPatch(root,patch,{cached,reverse})` 经临时文件 `git apply`；前端 `hunk-patch.ts`（`computeHunks`=structuredPatch context=3 + `buildHunkPatch`）；DiffView 按 git hunk 首个变更行渲染悬停按钮（未暂存=暂存/放弃、已暂存=取消暂存），放弃二次确认；应用后 refresh 跟随基准重载。仅工作区文本源（`.iwt`/`.json`/二进制/编辑中不显示）。

### F8 · 历史 / 时间线 (P1)
- **文件级历史 = Explorer 的 Timeline viewer**（对标 VSCode Timeline）：**已实现**。跟随「工作区树选中文件」（关闭 tab 后仍显示），点击某提交 → 打开该版本 diff（本提交 ↔ 父提交）。
- **仓库级历史 = SCM 的 Graph viewer**（面板内，非编辑区 tab）：**已实现**。提交列表，作者/时间/信息/hash。
  - **点击某个提交 → 就地展开该提交的文件 list/tree**（状态字母 + 路径，viewer 头部可切 list⇄tree）；点击文件打开该提交的差异（父提交 ↔ 本提交）。**分支下拉选择**（含「所有分支」`--all`）+ **提交上分支/标签色标**（`%D` 解析，head/branch/remote/tag）已实现。
- **从历史版本还原单文件**：**已实现**（Timeline 行 hover「还原到此版本」→ 二次确认 → `git checkout <hash> -- <file>`）。
- **分支泳道图 DAG（彩色多列 lane 连线）——已实现（2026-07-13，只读 v1）**：Graph viewer 每行提交左侧加泳道 SVG gutter，画出提交↔父提交拓扑（merge 汇入、分叉、pass-through、root）。承载在**侧栏**（非全宽 tab，用户定）。数据：`git log` 扩 `%P` 取父 hash → `GitCommit.parents`；布局：纯函数 `scm/gitGraphLayout.ts`（`computeGraphLayout`，列稳定+回收空位+首父继承色，8 色固定调色板）；渲染：`scm/GitGraphGutter.vue`（每行一个 SVG，cubic 曲线连线 + node 圆点）。分页：`gitStore.loadMoreGraph`/`graphHasMore` +「加载更多」。仍保留分支下拉/--all/分支·tag 色标。**留后**：列压缩左移美化、全宽编辑区 Git Graph tab、图上写操作（checkout/merge/cherry-pick/tag/reset）、滚动自动加载、超多 lane 横向滚动。

### F9 · 合并与冲突解决 (P1) —— **已实现（2026-07-12）**
- 检测冲突文件并归入 Merge Changes 分组（已具备）。
- **修订（2026-07-11）**：~~在 TipTap 编辑器内 inline 渲染 `<<<<<<<`~~ → **改为 diff 家族的「合并 tab」**（**2-pane+结果**：上 ours↔theirs 只读对照，下可编辑结果 + 逐块采用当前/传入/两者）。理由：inline 会重蹈 F12 gutter 的 WYSIWYG 语义 diff 坑；冲突本质是比较+可编辑结果，属 DiffView 家族。
- 数据来自 git 冲突暂存阶段 `:1/:2/:3`（base/ours/theirs）+ 工作区含标记内容；结果侧解析工作区标记切块。
- 解决 → 写回工作区（去标记）→ `git add` 标记已解决 → 离开 Merge Changes；保存不自动关闭 tab（脏点清除即已保存）；全部解决后提交。
- 承载：复用 `DIFF_VIEWER` tab（`DiffSpec.kind='conflict'` 驱动），新建 `MergeView.vue`。
- 完整设计见 [EDITABLE_DIFF_AND_MERGE.md](EDITABLE_DIFF_AND_MERGE.md)（建立在「可编辑 diff」之上）。

### F10 · 贮藏 Stash (P2) —— **已实现（2026-07-12）**
- Stash push（可选信息）/ pop / list / apply / drop：`GitService.stash*`；SCM more-actions →「贮藏更改…/弹出最近贮藏/贮藏列表…」（列表二级菜单 apply/pop/drop，drop 二次确认）；pop 冲突交 Merge Changes。
- **auto-stash sync**：`pull --autostash`（sync 复用）——脏工作区自动 stash→pull→pop，clean 无操作，pop 冲突→进合并 tab。解决「有未提交改动无法 pull」。

### F11 · `.gitignore` 集成 (P0)
- **复用现有** workspace 过滤基础设施（`getEffectiveWorkspaceIgnoreRules` / `WORKSPACE_FILTERING.md`）：git 忽略规则与 Explorer/Search 过滤保持一致来源。
- 变更视图尊重 `.gitignore`（被忽略文件不进 Changes）。
- 右键文件「添加到 .gitignore」快捷项（P1）。

### F12 · 状态栏装饰 (P1)
- 状态栏组件：当前分支、ahead/behind、同步按钮、变更数（对标 VSCode 左下角 SCM 状态）。**已实现**（`statusbar-items/git-status.ts`）。
- ~~编辑器行号旁 gutter 显示增/改/删标记~~ → **不做（2026-07-11 决策 A）**。理由：iWriter 编辑器为 WYSIWYG TipTap，无行/行号；"行号旁 gutter"预设的是逐行源码编辑器，不适用。要在渲染态标块级改动属于 §1.3 明确列为范围外的「渲染态/富文本语义 diff」，故 F12 缩减为仅状态栏部分。

### F13 · 标签 Tags (P1) —— **已实现（2026-07-13，M6 P0，三绿；运行时 smoke 待做）**
- **本工程核心版本命名原语**：知识库「快照里程碑」/ 小说「初稿·投稿版·出版版」用 tag 最自然。
- Create Tag（可附信息，`git tag [-a -m]`）/ Delete Tag / List Tags；入口：面板 `⋯` → Tags 子菜单 + **Graph 提交行右键「在此提交打标签」**。
- Graph 已解析 `%D` 显示 tag 色标（`GitCommit.refs` kind='tag'），本项只补写操作。
- Push Tags（`git push --tags`，有远程时让 tag 进云备份）。
- **不做**：Delete Remote Tag（团队场景）。详见 §5.5 菜单体系。

---

## 5. UI / 交互需求

> 信息架构：Explorer 与 SCM 均为**视图容器 + 多个可折叠 viewer**（对标 VSCode view-container 模型）。每个 viewer 独立折叠；容器标题栏 `⋯` 菜单勾选可选 viewer 的显隐。视觉稿见 `./ui/`。

### 5.1 Explorer 容器（既有面板扩展）
- viewer 组成：
  1. **工作区 Workspace**（文件树）—— **必选，不可隐藏**。
  2. **时间线 Timeline**（当前活动文件的提交历史）—— **可选**，默认可关。
- 通过 Explorer 标题栏 `⋯` 菜单勾选（Workspace 项为 checked 且 disabled）。
- Timeline 跟随当前活动文件；文件右键「查看文件历史」聚焦该文件。

### 5.2 SCM 容器（新增第三档）
- 左侧栏新增第三档 `SidebarMode.SOURCE_CONTROL`，Git 分支图标 + 变更数徽标；无打开文件夹时禁用。
- viewer 组成：
  1. **存储库 Repositories** —— 仓库 + 当前分支 + ahead/behind + 同步；多仓库时列出多行。单仓库可默认折叠。
  2. **更改 Changes**（核心，必选）—— 提交输入框 + 提交按钮（含 Commit All 下拉）+ 变更分组树（Merge / Staged / Changes / Untracked）+ 行内 hover 操作（stage/unstage/discard/open diff）。
  3. **图谱 Graph** —— 提交历史（分支选择在 viewer 头部，icon+文字+下拉）。可选。
- 容器 `⋯` 菜单：勾选 Repositories/Graph 显隐（Changes 必选）+ 全局 Git 操作（pull/push/sync/fetch/分支/贮藏/远程）。

### 5.2.1 提交输入
- 单行起、自动扩展多行（镜像 SearchPanel 的 `textarea.min-h-7.resize-none.overflow-hidden.focus:border-primary.rounded-field`）。
- `Ctrl/Cmd+Enter` 提交。

### 5.2.2 空 / 引导态
- **未检测到 Git**：对齐 `OfficeViewerPage` 安装引导（警告图标 + 安装按钮 + 可展开安装步骤 + 重试）。
- **非仓库**：初始化仓库 / 克隆仓库。
- **有仓库无提交**：Changes 显示「没有更改」；Graph / Timeline 显示「尚无提交」空态。
- **Timeline 无活动文件**：提示「打开文件以查看其时间线」。
- **Timeline 无仓库**：提示「未纳入版本控制」+ 初始化入口。

### 5.2.3 变更列表
- 复用通用 Tree 控件 `src/components/common/tree/Tree.vue`（分组节点 + 文件叶子为 `TreeNode`）。

### 5.3 命令集成
- ~~命令面板 / 菜单（`MenuManager.ts`）注册 Git 命令~~ → **不做（2026-07-13 决策）**。理由：本工程定位为「个人知识库 / 小说写作」的单人本地 Git，用户不在原生菜单栏寻找 Git 命令。**所有 Git 操作由 SCM 面板内菜单全量承载**（`⋯` more-actions + viewer 头下拉 + 变更行/提交行右键上下文），见 §5.5。
- 右键上下文菜单：变更行 / 目录行的 stage/unstage/discard/gitignore/open——**已实现（2026-07-12）**：`GitChangeGroup` `@contextmenu` → `emit('context')` 携带文件集合+分组+是否目录，`SourceControlPanel.onContext` 按分组裁剪原生菜单项（复用 `showContextMenu`）。history 快捷项仍走 Timeline（Explorer 右键「查看文件历史」）。待补项（Open File / Reveal in Finder / Open File(HEAD)）见 §5.5。

### 5.4 快捷键
- 复用 VSCode 习惯（可配）：提交输入框 `Cmd/Ctrl+Enter` 提交。

### 5.5 SCM 菜单体系 —— 做/不做定稿（2026-07-13）

> 对照 VSCode SCM 全量菜单逐项裁定。**判断线**：本工程是「个人知识库 + 小说写作」的**单人、本地优先** Git（Git ≈ 时间机器 + 云备份 + 版本里程碑），不是团队协作 Git。故：commit/history/restore/diff、sync 备份、**tag 里程碑**、stash、copy hash·message、reveal、open file、undo-commit = 高价值；rebase / force / 多 remote / delete-remote-branch / fetch-prune / cherry-pick = 隐藏；破坏性操作（discard-all / delete-branch / undo-commit）加护栏（undo 用 `reset --soft` 降险）。承载：面板 `⋯` more-actions + viewer 头下拉 + 变更行/提交行右键，**不进原生菜单栏**（§5.3）。

**图例**：✅ 已实现 · ⭐ 待实施（本轮定稿纳入）· 🔻 后置 · ❌ 不做

#### A. SCM 主面板菜单（`⋯` more-actions / viewer 头）
| VSCode 项 | 裁定 | 说明 |
| --- | --- | --- |
| Repositories / Changes / Graph 显隐 | ✅ | view 菜单 checkbox |
| Pull / Push / Fetch / Clone / Check out to… | ✅ | remote 子菜单 + branch 菜单 + clone 弹窗 |
| Commit / Commit All / Amend | ✅ | commit ▾ 菜单 |
| **Undo Last Commit** | ⭐ | `reset --soft HEAD~1` + 二次确认；"提交早了/信息写错"高频、soft 低风险 |
| Commit Staged / Amend(Staged/All) 变体 | ❌ | 过细；"Commit"默认即 commit staged，保留单个 Amend |
| Stage All / Unstage All / Discard All | ✅ | 含目录级 |
| Sync / Pull / Push / Fetch | ✅ | remote 子菜单 |
| Pull (Rebase) | 🔻 | 降为偏好项而非菜单 |
| Pull from… / Push to… | ❌ | 多 remote |
| Fetch (Prune) / Fetch From All Remotes | ❌ | 专家/多 remote |
| Merge / Create Branch / Delete Branch / Publish | ✅ | branch 菜单 |
| **Create Branch From…** | ⭐ | 从某分支/提交开支线草稿（novel 支线） |
| **Rename Branch** | ⭐ | 简单低风险，草稿改名 |
| Rebase Branch | ❌ | 重写历史、危险、单人无价值 |
| Delete Remote Branch | ❌ | 团队场景 |
| Add / Remove Remote | ✅ | remote manage（Rename remote ❌） |
| Stash / Pop / Apply / Drop | ✅ | |
| **Stash (Include Untracked)** | ⭐ | 写作者常有未跟踪草稿，加一个选项 |
| Stash Staged / Drop All Stashes | ❌ | 过细/低频 |
| View Stash | 🔻 | 只读查看内容，中价值 |
| **Tags › Create Tag / Delete Tag** | ⭐ | **核心**：知识库快照 / 小说初稿·投稿·出版版本命名（Graph 已显示 tag 色标，只差写操作） |
| **Push Tags** | ⭐ | 让 tag 进云备份（有远程时） |
| Delete Remote Tag | ❌ | 团队场景 |
| Show Git Output | 🔻 | 排障入口，可复用现有 logging |

#### B. Changes 右键菜单（现有 stage/unstage/discard/gitignore/open）
| VSCode 项 | 裁定 | 说明 |
| --- | --- | --- |
| Open Changes / Discard / Stage / Unstage / gitignore | ✅ | |
| **Open File** | ⭐ | 打开工作区文件本体（非 diff），高频 |
| **Reveal in Finder / Explorer** | ⭐ | 复用现有 `revealInFolder` IPC |
| Open File (HEAD) | 🔻 | 打开 HEAD 只读版本，中价值 |
| Collapse All | ❌ | UI 噪音 |

#### C. Graph 提交行右键菜单 —— **当前空白，最大缺口**
| VSCode 项 | 裁定 | 说明 |
| --- | --- | --- |
| **Copy Commit Hash / Copy Commit Message** | ⭐ | 零风险高频 |
| **Create Tag（在此提交）** | ⭐ | 配合 tag 里程碑，语义最自然 |
| **Create Branch from here** | ⭐ | 比 checkout 安全（novel 支线） |
| Open Changes | ✅ | 点提交展开文件即用 |
| Checkout(this commit) | ❌ | 进 detached HEAD 对写作者困惑，用"从此建分支"替代 |
| Compare with… | 🔻 | 选另一提交比 diff，中价值 |

#### 实施优先级
- **P0（补空白 + 里程碑能力）—— ✅已实现（2026-07-13，三绿，运行时 smoke 待做）**：① Tag 全链路（create/delete/list + 面板 Tags 子菜单 + Graph 行"在此打标签"）② Graph 提交行右键（Copy Hash/Message、Create Tag、Create Branch from here）③ Changes 右键补 Open File + Reveal in Finder。
- **P1（便捷增强）**：④ Undo Last Commit（`reset --soft`）⑤ Create Branch From… / Rename Branch ⑥ Stash (Include Untracked) ⑦ Push Tags。
- **不做（明确排除）**：Rebase、Pull(Rebase) 菜单化、Pull from…/Push to…、Fetch Prune/All Remotes、Delete Remote Branch/Tag、Rename Remote、Amend 细分变体、Commit Staged 单列、Collapse All、Checkout 到裸提交、MenuManager 原生菜单（§5.3）。

---

## 6. 非功能需求

| 编号 | 需求 |
| --- | --- |
| NFR1 性能 | status 刷新去抖；大仓库（数千文件）status/diff 不阻塞 UI，主进程异步执行 |
| NFR2 刷新触发 | 复用 chokidar 文件监听 + git 操作后主动刷新；避免轮询风暴 |
| NFR3 健壮性 | git 未安装 / 非仓库 / 分离 HEAD / 网络失败 均有明确降级与提示，绝不静默失败 |
| NFR4 安全 | 不明文存储凭证；破坏性操作（discard/clean/force push/branch delete）必须二次确认 |
| NFR5 i18n | 中英文文案（复用现有 i18n 体系）|
| NFR6 持久化 | 面板宽度/展开态/上次分支等经 `StateStorage` 持久化。**可选 viewer 显隐已实现（2026-07-12）**：`StateStorage.{save,load}PanelViewers`（`iwriter-panel-viewers`：explorerTimeline/scmRepositories/scmGraph），Explorer/SCM 面板初始化读取 + watch 回写 |
| NFR7 跨平台 | macOS/Windows/Linux 路径与换行一致（注意 `core.autocrlf`）|
| NFR8 主题 | 面板与 diff 视图适配 daisyUI 主题及 Markdown 主题 |

---

## 7. 集成点（工程落点）

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 类型 | `src/types/window-content-state.ts` | `SidebarMode` 增 `SOURCE_CONTROL` |
| 侧栏 | `src/components/LeftSidebar.vue` | `mainSidebarModes` 增一档 + 徽标 |
| 面板 | `src/components/sidebar/SourceControlPanel.vue` (新增) | 变更视图/提交/分支 UI |
| 状态 | `src/stores/app.ts` 或新增 `src/stores/git.ts` | Git 状态、分支、变更列表、操作 action |
| 主进程 | `electron/App.ts` | 注册 `git-*` IPC handler（引擎调用）|
| 桥接 | `electron/preload.ts` + `src/types/electron-api.ts` | 暴露 git API |
| 菜单 | `electron/MenuManager.ts` | Git 命令菜单项 |
| Tab 承载 | [tab view refactor](../tab%20view%20refactor/TAB_VIEW_REFACTOR.md) | 先做 tab 重构（全量 S1–S5），再注册 `DIFF_VIEWER` tab 类型 |
| Diff | `src/components/common/diff/DiffViewerPage.vue` + `DiffView.vue`（新建，不复用 `DiffSplitView`） | split/inline + 可选行号 + 差异索引，只读，`diff@9` 已在依赖 |
| 忽略规则 | 现有 workspace filtering | 与 `.gitignore` 统一来源 |
| 状态栏 | StatusBar 组件 | 分支 + ahead/behind + sync |

依赖新增：Git 引擎库（推荐 `simple-git`），git 二进制检测。

---

## 8. 数据与持久化
- 无自建版本数据；一切以 `.git` 为准（真 Git）。
- 仅持久化 UI 偏好（`StateStorage`）：viewer 显隐/折叠态、分组折叠、提交默认行为、同步默认策略。

---

## 9. 里程碑分期建议

| 阶段 | 内容 | 交付 |
| --- | --- | --- |
| **M1 只读基础** | tab 重构（全量 S1–S5）+ 引擎接入 + F0 检测 + F1 状态视图 + F7 diff tab（split/inline，只读）+ 状态栏分支 | 能看状态与差异 |
| **M2 本地写操作** | F2 stage + F3 commit + F4 discard + F11 gitignore + F5 分支切换/新建 | 完整本地版本控制闭环 |
| **M3 远程** | F6 fetch/pull/push/sync/clone/publish + 凭证降级指引 | 与远程互通 |
| **M4 进阶** | F8 历史/时间线 + F9 冲突解决 + F12 状态栏（gutter 已弃） | 对标 VSCode 深度 |
| **M5 增强** | F10 stash、hunk 级 stage、多仓库、图片 diff | 打磨 |

---

## 10. 验收标准（示例 · M1+M2）
- 打开一个 git 仓库文件夹，面板正确列出 modified/untracked，徽标数正确。
- 修改一个 `.md`，点击可见红绿行级 diff；stage 后移入 Staged 分组。
- 输入信息并提交，`git log` 可见该提交；工作树变干净、徽标归零。
- 放弃更改能还原文件且有二次确认。
- 非 git 仓库 / 未装 git 时面板给出正确降级提示而非报错崩溃。

---

## 11. 已定决策（2026-07-10 拍板）
| # | 议题 | 决策 |
| --- | --- | --- |
| Q1 | Git 引擎 | **`simple-git`，依赖系统 git**，不内置便携 git（§3.1） |
| Q2 | 多仓库 | **仅单根仓库**；多仓库/子模块延后（F0） |
| Q3 | Diff 视图 | ~~复用 `DiffSplitView`~~ → **改为：新建独立 Diff 组件作为编辑区 tab**（split+inline 双模、可选行号、可选差异索引，只读），仅参考 `DiffSplitView` 的 UI（2026-07-11 修订，§3.3 / F7） |
| Q4 | 远程认证 | **仅依赖系统凭证，不自建密码 UI**（§3.2 / F6） |
| Q5 | 提交默认 | 无暂存时默认 **Commit All**（对标 VSCode），偏好可改（F3） |
| Q6 | `.iwt` diff | **格式化后再 diff**（§3.3 / F7） |
| Q7 | Diff 承载 | **编辑区 tab（非模态）**，依赖 tab view refactor 新增 `DIFF_VIEWER` 类型；重启不恢复（2026-07-11，§F7.1） |

> 需求已定稿。下一步：技术设计（IPC 契约、store 结构、组件树、simple-git 封装层）另立设计文档。
