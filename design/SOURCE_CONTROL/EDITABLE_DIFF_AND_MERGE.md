# EDITABLE_DIFF_AND_MERGE.md — 可编辑 Diff 与冲突合并设计

> 状态：v0.3（2026-07-13，E1+E2 与外部修改/删除写回保护已实现）
> 关联：SOURCE_CONTROL §F7（Diff 查看器）、§F9（合并与冲突解决）
> 定位：把「diff 中编辑工作区侧」从延后项提为一等能力；F9 冲突解决作为其特例（不再用 TipTap 编辑器 inline）。

---

## 1. 动机与关键认知

### 1.1 需求
- **未暂存改动的 diff 需要可编辑**：场景 1（index ↔ 工作区文件）的右侧就是磁盘文件，用户希望直接在 diff 里改并写回。原 F7 把它锁只读（`editable` 埋了开关但恒 false），现在提为一等能力。
- **F9 冲突解决 = 可编辑 diff 的特例**：冲突本质是 ours↔theirs 的比较 + 可编辑的结果，天然属于 diff 家族。

### 1.2 关键认知：diff 是源文本视图 → 在 diff 里编辑 = 源文本编辑 → **无 WYSIWYG 错配**
- 之前设想「在 TipTap 编辑器里 inline 渲染 `<<<<<<<` + 采用按钮」是错的：和 **F12 gutter 同一个坑**——冲突标记是**源文本**构造，而 TipTap 是所见即所得、显示渲染后的富文本块；要在渲染态定位冲突区就得做「渲染态语义 diff」（§1.3 明确范围外）。
- iWriter 的编辑器**不是源码编辑器**；VSCode 能 inline 是因为它的编辑器本身是文本编辑器。该类比不成立。
- **正解**：diff 视图本就是**源文本**视图，在其右侧/结果侧做**纯文本编辑**，完全避开 WYSIWYG 映射问题，并复用已建的 DiffView / diff-tab 基础设施。VSCode 现代做法也是 **3-way merge 编辑器**（diff 式），非 inline。

---

## 2. 可编辑范围（修订 F7.2）

| # | 场景 | 右侧 | 可编辑决策（修订） |
| --- | --- | --- | --- |
| 1 | 未暂存更改 index↔工作区 | 工作区文件 | **可编辑**（写回工作区文件） |
| 2 | 已暂存更改 HEAD↔index | index blob | 只读（改暂存 = 编辑文件后重新 stage） |
| 3 | 提交内文件差异 | 历史 blob | 只读 |
| 4 | 文件历史版本 | 视右侧 | 只读（右=工作区的子情形延后） |
| 5 | 合并冲突 | 工作区（含标记） | **可编辑结果**（见 §5） |

- **可编辑 = 场景 1 + 场景 5**。规律不变：仅当右侧=工作区磁盘文件才可编辑。
- **仅文本/markdown 源可编辑**：`.iwt`/`.json` 在 diff 里**保持只读**。理由：diff 显示的是**格式化美化后**的 JSON，编辑美化版写回会改变磁盘规范形态、且易破坏结构；结构化格式请回其真实编辑器改。（待决 D2）

---

## 3. 编辑表面（核心 UX 决策）

diff 是源文本，可编辑侧 = 纯文本编辑。两种粒度：

- **方案 A（推荐，先做）· textarea 右侧**：参考 agent `DiffSplitView` 的 `editableRight`。
  - 工具栏加「编辑」开关（或聚焦右侧即进入）。关=只读对齐高亮视图；开=右栏变可编辑 `<textarea>`（等宽、行高对齐），绑定本地 `draft`。
  - **实时 diff**：`watch(draft)` 去抖（~200ms）重算 `diff(oldContent, draft)` → 左侧删除高亮 + overview ruler + 统计实时更新；右侧编辑时为纯 textarea（不做逐词高亮）。
  - 无新依赖、源文本贴切、复用 DiffView。**代价**：编辑时右侧失去逐行对齐/词级高亮（退出编辑即恢复对齐视图）。
- **方案 B（不采用）· CodeMirror 6**：真正的行内可编辑 + 实时 diff 装饰（Monaco/VSCode 观感）。引入较大第三方依赖，**决定不走此路**。

> **决策（2026-07-12）**：inline 编辑**维持方案 A（textarea）现状，不引入 CodeMirror**。未来增强方向改为**基于语义的 diff + inline 编辑，基于 TipTap 自行开发**（见 §9），不依赖第三方源码编辑器。（D1 已定）

---

## 4. 写回、脏标记与同步模型（最复杂处）

### 4.1 脏 / 保存 —— 复用标准保存（无专用 save 图标，2026-07-12 修订）
> 工具栏原有的 💾 图标与 `Cmd+S`/脏点/关闭确认重复（脏点直接读 `tab.isDirty`；`Cmd+S` 经 `handleMenuAction→saveDiffTab` 已通），已**移除**。diff/合并 tab 一律复用标准保存：脏点 + `Cmd+S` + 关闭「是否保存」。合并未解决时按 `Cmd+S` → `notify.warning` 提示剩余冲突；`saveDiffTab` 对 conflict 仅在内容无冲突标记时 `git add`（护栏：防关闭确认路径把部分解决文件误标已解决）。

原「显式保存」设计（E1 已实现，用户明确要非自动保存）：
- **编辑保持 diff**：编辑模式为「左侧旧内容随输入实时 word 级高亮 + 右侧 textarea」，diff 在编辑时可见；不切成纯 textarea。
- **草稿在内存**：DiffView `draftLocal` 输入 → 防抖 emit → `DiffViewerPage.onDraftChange` 只更新 `newContent`(实时 diff) + 镜像到 `tab.diffDraft` + 置 `tab.isDirty`，**不自动写盘**。
- **显式保存**：diff 头部「保存」按钮（脏时高亮/可点）或 `Cmd+S`（`DiffViewerPage.handleMenuAction('save')` 消费）→ `appStore.saveDiffTab(tab)` → `writeWorkingFile(tab.diffDraft, tab.lastSavedHash)`。
- **关闭确认打通**：`FileTab.diffDraft` 存草稿；`saveTab` 顶部对 `DIFF_VIEWER` 转 `saveDiffTab`，于是 closeTab 的 save-on-close 也能写回。选「不保存」则丢弃草稿。
- **无锁**：diff tab 以 `fileReadonly:false` 创建（去掉标题栏 🔒）；只读性靠"无编辑按钮"表达。
- **stage/discard 不空白**：暂存/取消暂存后切换对比基准（unstaged⇄staged）保持改动可见；discard 后文件干净 → 「没有更改」为正确态。

### 4.2 写回
- 保存 = 把 `draft` 写到 `spec.filePath` 指向的工作区文件（`.md`/文本原样写）。
- Diff 载入工作区侧内容时记录 `lastSavedHash`；保存复用主编辑器的 `saveFile(..., { expectedHash })` 守卫。磁盘内容被外部修改、或目标文件已被外部删除时，拒绝写回并提示重新载入后再处理草稿，不静默覆盖，也不以保存操作重建文件。
- 写后 `gitStore.refresh()`（revision++）→ diff tab 重取 `newContent`（= 刚写的内容）→ 与 index 的差异更新（若与 index 相同则「没有更改」）。

### 4.3 与「同文件已在 Markdown 编辑器打开」的协同（关键风险）
- **单一真源 = 工作区磁盘文件**。Markdown 编辑器持 TipTap 富文本表示，diff 持源文本表示，二者**不能同时实时权威**（逐键往返代价过高）。
- **推荐 v1（解耦 + 重载协同）**：
  - diff 保存写文件 → 若该文件在 Markdown tab 打开：**静默强制重载**该 tab（复用外部变更路径，但内部写入不弹「外部已修改」提示，如现有 save 流更新 `lastSavedHash` 的做法）。若 Markdown tab 有**未保存改动**，写回前按脏检查**告警**避免覆盖。
  - 反向：Markdown tab 保存 → 文件变 → diff tab 若**无未保存 draft** 则重载 `newContent`；若**有 draft** 则标记 `diskState='external-modified'` 软告警（复用现有机制）。
  - 即：**允许两处都在，但靠「内部写→静默重载 / 有未存改动→告警 / 写回前 expectedHash 校验」协同**。出现外部修改或删除时，不采用「末次写入生效」；须重新载入后再处理草稿，避免覆盖或重建外部状态。
- （更严格的"打开即互斥锁"备选，v1 不采用，见待决 D3。）

---

## 5. F9 冲突合并（建立在可编辑 diff 之上，修订 §F9）

### 5.1 承载
- 冲突文件（`status.conflicts`）归入 **Merge Changes** 分组（已具备）。点击 → 打开**合并 tab**（非普通 diff tab）。
- `DiffSpec` 扩 `kind: 'conflict'`；合并 tab 复用 `DIFF_VIEWER` 类型（spec 驱动，不新增 kind——待决 D5）。

### 5.2 数据来源：git 冲突暂存阶段（不靠手工解析标记做 3-way 展示）
- `git show :1:<file>` = base（共同祖先）、`:2:<file>` = ours（当前分支）、`:3:<file>` = theirs（传入分支）；某侧被删则为空。
- 新 `GitService.conflictVersions(root, file) → { base, ours, theirs }`（底层 `showSafe(':N:file')` 已具备）。
- **结果侧的冲突块**：直接**解析工作区文件里 git 已写入的标记** `<<<<<<< / |||||||(diff3) / ======= / >>>>>>>` → 切成 段（上下文文本 | 冲突块{ours, theirs, base?}）。这比重算 diff3 简单，且位置精确。

### 5.3 合并视图 UI（复用 DiffView 骨架）
- **布局（D4 已定 2026-07-12：2-pane + 结果）**：上方 ours ↔ theirs 只读对照（来自 :2/:3）+ 下方**可编辑结果**。（3-pane 备选不采用。）
- **结果侧**：复用 §3 的可编辑表面；初值 = 解析后的文件（保留上下文、冲突块待选）。
- **逐冲突块操作**：`采用当前(ours)` / `采用传入(theirs)` / `保留两者(ours 后接 theirs)` → 用所选文本替换结果中该块；上下文不动。
- **导航**：上/下一处冲突 + 剩余冲突计数（复用 DiffView 的变更导航 + overview ruler）。

### 5.4 解决与完成
- 保存结果 → 写回工作区文件（标记移除）→ `git add <file>` 标记已解决（`stage` 已具备）→ 文件离开 Merge Changes。
- 全部冲突文件解决后，用户可提交（合并提交）。
- 顶部提供「全部采用当前 / 全部采用传入」批量（P2）。

---

## 6. 组件 / 工程落点

| 层 | 改动 |
| --- | --- |
| 类型 | `DiffSpec` 增 `kind: 'conflict'`；`editable` 由占位转为**实际生效**（场景 1=true） |
| tab-kind | `DIFF_VIEWER` 的 `dirtyCapable`/`saveable` → true（只读 diff 不受影响） |
| `DiffView.vue` | 增 `editable` 模式：右/结果侧 textarea + `draft` + 去抖实时 diff；编辑↔只读对齐视图切换 |
| `DiffViewerPage.vue` | 脏标记 + `Cmd+S` 保存写回；与开着的 Markdown tab 的重载/告警协同；`.iwt`/`.json` 禁编辑 |
| `GitService` | `conflictVersions(root,file)`；写工作区文件（复用现有 saveFile/writeFile）；`stage` 标记已解决（已具备） |
| 合并 tab | `kind:'conflict'` 的 `DiffViewerPage` 分支：取 :1/:2/:3 + 解析标记 + 逐块 accept + 写回+add |
| store `git.ts` | `openMergeTab(file)`（或复用 `openDiffTab` 传 conflict spec）；Merge Changes 点击入口 |

---

## 7. 待决问题（请拍板）

| # | 议题 | 备选 | 倾向 |
| --- | --- | --- | --- |
| D1 | 编辑表面 | A textarea（现在）/ B CodeMirror | **A 定型**；不上 CodeMirror；未来走 §9 TipTap 语义 diff |
| D2 | 可编辑格式 | 仅文本/markdown / 也含 .iwt·.json | **仅文本/markdown**；结构化只读 |
| D3 | 与开着的编辑器 tab 协同 | 解耦+重载+告警 / 打开即互斥锁 | **解耦+重载+告警** |
| D4 | 合并布局 | 2-pane+结果 / 3-pane(ours\|结果\|theirs) | **2-pane+结果**（上 ours↔theirs 只读对照，下可编辑结果）（2026-07-12 定） |
| D5 | 合并 tab 类型 | 复用 `DIFF_VIEWER`(spec 驱动) / 新增 `MERGE` kind | **复用 DIFF_VIEWER** |

---

## 8. 分期建议
- **E1 可编辑 diff（场景 1）**：DiffView 编辑模式 + DiffViewerPage 脏/存/写回 + Markdown tab 重载协同 + .iwt 只读护栏。**已实现（2026-07-12）**。
- **E2 冲突合并（F9）**：`conflictVersions` + 合并 tab（2-pane+结果）+ 逐块 accept + 写回 + `git add`。**已实现（2026-07-12）**：
  - `GitService.conflictVersions(root,file)→{base,ours,theirs,working}`（:1/:2/:3 + 工作区含标记内容）+ IPC `git:conflict-versions` + preload/GitApi。
  - `DiffSpec.kind` 扩 `'conflict'`；git store `openMergeTab(file)`；SourceControlPanel `onFileOpen` 对 `status==='C'` 走合并 tab。
  - 新建 `MergeView.vue`：上 = ours↔theirs 只读 DiffView 对照；下 = 可编辑结果（解析冲突标记为「上下文｜冲突块」，逐块 采用当前/传入/两者→可再编辑，剩余冲突计数）。
  - `DiffViewerPage.vue` `kind==='conflict'` 分支：取 conflictVersions→MergeView，脏镜像 `diffDraft`，未解决按 Cmd+S 提示剩余冲突；保存=`saveDiffTab`（写回去标记）+ `git add`（护栏：仅内容无标记才 add），保存不自动关闭 tab。
- E1 是 E2 的地基，先做 E1。

---

## 9. 未来方向：基于 TipTap 的语义 diff + inline 编辑（2026-07-12 定，未排期）

当前 diff 是**源文本行级**视图（`diffLines`+`diffWords`），可编辑侧是 textarea。定位为**打底**，不再往「源码编辑器」方向加码（故不引入 CodeMirror，D1）。真正的目标形态是与 iWriter WYSIWYG 编辑体验一致的**渲染态语义 diff**：

- **语义 diff**：在**渲染后的富文本块**层面比较（段落/标题/列表/表格等块级 + 块内文字级），而非源码行。对标「Track Changes / 段落级高亮」，摆脱源文本行噪声。这正是 SOURCE_CONTROL §1.3 原列为 range-out 的「渲染态/富文本语义 diff」——现提为未来增强方向。
- **inline 编辑**：直接在 TipTap 编辑器内就地接受/拒绝变更块并编辑结果，而非 textarea。
- **自研，不用第三方**：基于既有 TipTap 扩展体系自行开发（自定义 mark/decoration + node view），不依赖 CodeMirror/Monaco。
- **难点**（沿用 §1.2 的认知）：源文本构造（冲突标记、行级 hunk）与渲染态富文本块的映射；需要「渲染态语义 diff」算法把两侧 TipTap JSON 做块级对齐。属较大工程，先让 E1/E2 的源文本方案稳定服役。
