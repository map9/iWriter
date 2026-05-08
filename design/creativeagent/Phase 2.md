# Creative Agent Phase 2 实施方案

## 0. Context

iWriter 的 Creative Agent Phase 1 已完成（`Phase 1.md`）：单 LLM 同时承担 MainAgent / WriterAgent / StateAgent，通过 `confirm_writing_plan` + `interruptOn` 实现 plan-first，通过 `session_log` + `get_session_diff` 实现 diff 感知，11 个 creative tools 与 3 个 craft skills（scene-structure / character-voice / deep-pov）已全部落地，CreativeReviewSurface 阻塞审批 UI 工作正常。

Phase 2 在 **保持单 LLM 形态** 的前提下，引入 ConsistencyAgent 角色与配套 craft skills，把"写完后做一致性审查"作为常态流程纳入闭环；同时升级 `search_draft` 解决长篇上下文检索能力薄弱的问题，并通过新表跟踪 StoryBible 累积变化、由 agent 自检触发 rebuild 提议。Phase 2 不引入真正的 sub-agent 编排（仍是单 LLM 角色扮演），但在 capabilities 装配层预留 sub-agent 装配点，使 Phase 3 仅做填充而无需重新设计。

Phase 2 也是一次小型工程清理：删除 Phase 1 遗留的 `CreativeArtifactTools.ts`、把 `countWords` 抽到 `src/utils/textStats.ts` 供 main 进程共用、为 `CreativeDb` 直接在 `setup()` 中追加新表（`CREATE TABLE IF NOT EXISTS` 自然兼容老库，不引入 migration 框架）。

**Phase 2 不做的事**：真正的 sub-agent 编排、review_finding 表持久化、阻塞型 finding 审批、`recent_writes` scope 实际生效、Pilot Mode、方向探索、git 集成、语义搜索。这些放到后续 Phase。

---

## 1. 关键决策

| # | 决策 | 选择 | 备注 |
|---|---|---|---|
| 1 | ConsistencyAgent 形态 | 单 LLM 角色扮演 + 工具返回素材 + skills 引导，**工具内不嵌套 LLM** | 与"Phase 2 仍单 LLM"对齐 |
| 2 | Finding 持久化 | **不入库**，不建 review_finding 表 | finding 全在 assistant text 里，checkpointer 重放即可 |
| 3 | Finding 展示 | LLM 输出 ` ```consistency-findings ` 围栏；渲染层识别 → 非阻塞建议条 | 数据结构零改动 |
| 4 | Finding 审批 | 不阻塞，不进 `interruptOn` | 与 Phase 1 阻塞审批形态区分 |
| 5 | search_draft 升级 | 复用 edit domain：`listWorkspaceDocumentPaths` + `snapshotBroker.requestSnapshot` + `DocumentSearch.searchDocumentBlocksRaw` | block-aware，与 edit domain 一致 |
| 6 | StoryBible rebuild 触发 | 新表 `storybible_change_log` 累积字数；新工具 `get_storybible_rebuild_signal` 自检；阈值 2000 字（绝对值累加） | rebuild 后清零 |
| 7 | run_consistency_check scope | Phase 2 仅实现 `full` 模式；`recent_writes` 留 schema 字段，依赖 git 集成 | 简化实现 |
| 8 | DB schema 演进 | 直接在 `CreativeDb.setup()` 中追加 `CREATE TABLE IF NOT EXISTS` 新表，不引入 migration 框架 | 老库重跑无副作用；Phase 2 仅 1 张新表，简单优先 |
| 9 | sub-agent 装配点 | `DomainAgentCapabilities` 加 `subAgents?` 可选字段，Phase 2 传空数组 | Phase 3 仅需填充 |
| 10 | 字数统计 | 抽离 `countWords` 到 `src/utils/textStats.ts`，main 与 renderer 共用 | 已确认 main 可 import src |

---

## 2. 复用与新建边界

**直接复用：**
- Phase 1 全部既有协议（interruptOn / domain 分流 / session_log / 11 个 creative tools 中除 `search_draft` 外）
- `electron/ai/document/DocumentSearch.ts`：`listWorkspaceDocumentPaths` + `searchDocumentBlocksRaw`
- `electron/ai/document/SnapshotBroker.ts`：`requestSnapshot(filePath)` 支持任意磁盘路径
- `src/components/ai/agent-panel/chat-area/AgentMessageBubble.vue`：作为围栏识别注入点
- `src/components/pages/markdown-editor/stats.ts`：`countWords` 改为 import 自 utils

**不复用：**
- 不复用 `CreativeReviewSurface.vue`（finding 不阻塞，不进 review 通道）
- 不复用 `EditProposal` / block proposal 结构（与 Phase 1 决策一致）
- 不引入 SQLite FTS5（保持轻量；block-aware search 已足够 Phase 2 需要）

**新建命名空间：**
- `electron/ai/tools/CreativeAnalysisTools.ts`：分析类工具（与 `CreativeTools.ts` 关注点分离，Phase 3+ 继续在此扩展）
- `src/ai/message/consistency-findings.ts`：finding 类型定义与文本切分函数
- `src/utils/textStats.ts`：字数统计纯函数

---

## 3. 文件清单

### 3.1 新建（12 个文件）

| 路径 | 用途 |
|---|---|
| `electron/ai/tools/CreativeAnalysisTools.ts` | `run_consistency_check` + `get_storybible_rebuild_signal` |
| `electron/ai/builtin-skills/dialogue-craft/SKILL.md` | 对话技法（Writer 用） |
| `electron/ai/builtin-skills/pacing-control/SKILL.md` | 节奏控制（Writer 用） |
| `electron/ai/builtin-skills/character-arc-planning/SKILL.md` | 角色弧光规划（Planner 用） |
| `electron/ai/builtin-skills/story-logic/SKILL.md` | 因果一致（Planner / Consistency 共用） |
| `electron/ai/builtin-skills/pov-consistency-check/SKILL.md` | POV 越界检查（Consistency 用） |
| `electron/ai/builtin-skills/character-behavior-check/SKILL.md` | 角色行为对照（Consistency 用） |
| `src/utils/textStats.ts` | `countWords(text)` / `countWordDelta(prev, next)` 纯函数 |
| `src/ai/message/consistency-findings.ts` | `ConsistencyFinding` 类型 + `splitTextWithFindings` 切分器 |
| `src/components/ai/agent-panel/chat-area/views/ConsistencyFindingCard.vue` | 单 finding 视觉条（severity 色调 + layer 标签 + locationRef） |
| `src/components/ai/agent-panel/chat-area/views/ConsistencyFindingsBlock.vue` | 整组 findings 容器（总览行 + 折叠列表） |
| `src/i18n/messages/{zh-CN,en-US}.ts` 中 `consistencyFinding.*` 命名空间 | severity / layer 本地化（不是新文件，只是新增节段，但合并到既有 i18n 文件） |

### 3.2 修改（11 个文件）

| 路径 | 主要变更 |
|---|---|
| `electron/ai/db/CreativeDb.ts` | 在现有 `setup()` 中追加 `CREATE TABLE IF NOT EXISTS storybible_change_log` 与索引；新增 `recordStoryBibleChange` / `getStoryBibleChangeStats` / `clearStoryBibleChangeLog` 三个方法；导出 `STORYBIBLE_REBUILD_WORD_THRESHOLD = 2000` |
| `electron/ai/tools/CreativeTools.ts` | 重写 `search_draft` 用 `listWorkspaceDocumentPaths + snapshotBroker + DocumentSearch.searchDocumentBlocksRaw`；`buildCreativeTools` 入参增加 `snapshotBroker`；`add_fragment` / `patch_storybible` / `write_to_chapter` / `replace_storybible_section` 写盘成功后调用 `recordStoryBibleChange`；`rebuild_storybible` 写盘成功后调用 `clearStoryBibleChangeLog` |
| `electron/ai/AgentEngine.ts` | `_buildAgentCapabilities` creative 分支把 `this.snapshotBroker` 传给 `buildCreativeCapabilities`；`_getOrCreateAgent` 把 `capabilities.subAgents` 传给 `createDeepAgent` 的 `subagents` 参数 |
| `electron/ai/domain/creative/buildCreativeCapabilities.ts` | 签名增加 `snapshotBroker`；合并 `buildCreativeAnalysisTools` 产出；`subAgents: []` 占位 |
| `electron/ai/domain/types.ts` | `DomainAgentCapabilities` 增加 `subAgents?: unknown[]`（Phase 3 收紧类型） |
| `src/ai/thread/system-prompts/creative.ts` | 追加：会话启动序列加 `get_storybible_rebuild_signal`；写完 chapter 必须 `run_consistency_check`；finding 围栏格式约定；新 skills 触发关键字 |
| `src/ai/types.ts` | `inferToolKind` 加 `run_consistency_check: 'search'` / `get_storybible_rebuild_signal: 'read'`；不进 `CREATIVE_REVIEW_TOOLS` |
| `src/ai/message/display-normalizer.ts` | 加两个新工具的 case；删除 `list_story_assets` / `read_story_asset` / `save_story_asset` 三个旧 case |
| `src/components/ai/agent-panel/chat-area/AgentMessageBubble.vue` | text content block 渲染前先 `splitTextWithFindings`，将围栏块替换为 `<ConsistencyFindingsBlock>` |
| `src/components/pages/markdown-editor/stats.ts` | 删除 module-private `countWords`，改 `import { countWords } from '@/utils/textStats'` |
| `src/i18n/messages/{zh-CN,en-US}.ts` | 加 `toolNames.run_consistency_check` / `get_storybible_rebuild_signal` / `displayNormalizer.summary.findings` / `consistencyFinding.severity.*` / `consistencyFinding.layer.*`；删除 `list_story_assets` / `read_story_asset` / `save_story_asset` 残留键 |

### 3.3 删除（1 个文件）

- `electron/ai/tools/CreativeArtifactTools.ts` —— Phase 1 遗留，已不再被 `buildCreativeCapabilities` 引用

---

## 4. ConsistencyAgent 工具协议

### 4.1 `run_consistency_check`（L1，无 HITL）

```ts
schema: z.object({
  target_filename: z.string(),  // 必填，相对 draft/ 的 .md 文件
  scope: z.enum(['full', 'recent_writes']).optional(), // Phase 2 仅 full 生效
  layers: z.array(z.enum(['pov','character','logic','voice','pacing','continuity'])).optional(),
})
```

实现：解析路径 → 读 storybible.md（截断 4000 字符）→ 读 chapter（超 12k 字符截断并标 `truncated: true`）→ 通过 `snapshotBroker` 取 outline → 把 `{target, requested_layers, storybible_excerpt, chapter_outline, chapter_content, instructions}` 作为 JSON 返回。

工具不直接产 findings，**指示 LLM 在下一轮 assistant 输出中**用 `consistency-findings` 围栏块产 findings。这样：
- 避免嵌套 LLM 调用与 token 浪费
- finding 自然落入 chat（assistant prose），渲染层只识别围栏
- 重新加载 thread 时 finding 仍可重放（数据全在文本里）

调用时机（写在 system prompt）：每次 `write_to_chapter` 成功写盘后立即调用；用户主动询问"看看一致性"时也调；不在每段写之间调。

### 4.2 `get_storybible_rebuild_signal`（L1，无 HITL）

```ts
schema: z.object({})
```

返回：

```jsonc
{
  "threshold_words": 2000,
  "total_word_delta_since_last_rebuild": 1234,
  "record_count": 8,
  "by_tool": { "patch_storybible": { "count": 5, "wordDelta": 320 }, ... },
  "should_propose_rebuild": false,
  "hint": "..."
}
```

agent 在会话启动序列中调用；`should_propose_rebuild=true` 时在后续 plan 中提议 `rebuild_storybible`，**不得未经用户同意自行调用**。

### 4.3 finding JSON schema（围栏块内容）

```jsonc
{
  "layer": "pov | character | logic | voice | pacing | continuity | other",
  "severity": "info | minor | major",
  "locationRef": "draft/ch01.md::第二段第3句",
  "description": "...",
  "suggestion": "..."
}
```

`locationRef` 不强制结构化，给作者看的人类可读位置。

---

## 5. Finding 在 chat 中的非阻塞渲染

System prompt 约定：

````
After write_to_chapter is applied, call run_consistency_check; then in the
next assistant message produce findings as a fenced code block with language
tag "consistency-findings", containing a JSON array of findings. Place normal
prose before/after the block. If no findings, say so in plain prose; do not
emit an empty block.

```consistency-findings
[ { "layer": "pov", "severity": "minor", "locationRef": "...", "description": "...", "suggestion": "..." } ]
```
````

`AgentMessageBubble.vue` 在渲染 text content block 前先调用 `splitTextWithFindings(text)`，得到 `Array<{kind:'prose',text} | {kind:'findings',findings:[]}>`，按段渲染：prose 走 `MarkdownContentView`，findings 走 `ConsistencyFindingsBlock`。

容错：JSON 解析失败 → 退化为普通 markdown code block；缺字段 → 用默认值（severity='info'，layer='other'）；LLM 漏围栏 → 退化为 prose。

视觉规范（daisyUI 5 调色板）：
- info: `border-info bg-info/10`
- minor: `border-warning bg-warning/10`
- major: `border-error bg-error/10`

---

## 6. CreativeDb schema 演进

不引入 migration 框架。直接在现有 `setup()` 中追加新表 SQL，依靠 `CREATE TABLE IF NOT EXISTS` 自然兼容老库（老库已有 `session_log` 表，重跑无副作用；新增的 `storybible_change_log` 表会在首次启动时创建）。

### 6.1 新表 schema

```sql
CREATE TABLE IF NOT EXISTS storybible_change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_path TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  tool_name TEXT NOT NULL,    -- 'patch_storybible' | 'replace_storybible_section' | 'write_to_chapter' | 'add_fragment'
  target_path TEXT NOT NULL,
  word_delta INTEGER NOT NULL,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_change_log_ws_recorded
  ON storybible_change_log(workspace_path, recorded_at DESC);
```

老库情形（Phase 1 已部署、`session_log` 表存在）：`setup()` 重跑时 `session_log` CREATE IF NOT EXISTS 跳过，`storybible_change_log` CREATE 成功，零风险。

### 6.2 CreativeDb 暴露的新方法

```ts
recordStoryBibleChange(workspacePath, { toolName, targetPath, wordDelta, summary? }): void
getStoryBibleChangeStats(workspacePath, sinceTimestamp?): {
  totalWordDelta: number
  recordCount: number
  byTool: Record<string, { count: number; wordDelta: number }>
  oldestRecordedAt: number | null
  newestRecordedAt: number | null
}
clearStoryBibleChangeLog(workspacePath): void
```

阈值：`export const STORYBIBLE_REBUILD_WORD_THRESHOLD = 2000`。`get_storybible_rebuild_signal` 用 `Σ |wordDelta|` 与阈值比较。

防膨胀：`recordStoryBibleChange` 检测某 workspace 行数 > 1000 时 trim 最旧 200 条（非关键路径）。

---

## 7. search_draft 升级方案

新实现（替换 `CreativeTools.ts` 内 `searchDraftFiles` + 工具定义）：

```ts
// buildCreativeTools 接收 snapshotBroker
const draftDir = path.join(workspacePath, 'draft')
const filePaths = listWorkspaceDocumentPaths(draftDir, '**/*.md', undefined, 200)
const fileLimit = Math.max(1, Math.min(limit ?? 3, 10))
const matchBudget = fileLimit * 5
let remaining = matchBudget
const files = []
for (const filePath of filePaths) {
  if (remaining <= 0 || files.length >= fileLimit) break
  const snapshot = await snapshotBroker.requestSnapshot(filePath)
  if (!snapshot) continue
  const result = DocumentSearch.searchDocumentBlocksRaw(snapshot, query, {}, remaining)
  if (!result?.matches?.length) continue
  remaining -= result.total_matches
  files.push({
    file_path: filePath,
    file_name: path.basename(filePath),
    document_type: 'md',
    total_matches: result.total_matches,
    matches: result.matches.map(m => ({
      block_id: m.block_id, heading_block_id: m.heading_block_id, heading: m.heading,
      node_type: m.node_type, match_count: m.match_count,
      match_texts: m.match_texts, preview: m.preview,
    })),
  })
}
return DocumentSearch.formatWorkspaceSearchResult(query, files, filePaths.length)
```

工具签名保持 `(query, limit?)`，工具描述更新为 "Block-aware search"，注入 snapshotBroker 通过 `buildCreativeCapabilities` 的新参数传入。

---

## 8. system_prompts/creative.ts 关键追加内容

```
Session startup (in this order):
1. call get_session_diff
2. call read_storybible
3. call get_storybible_rebuild_signal
4. if diff shows relevant changes, read changed files; if you can extract small confirmed facts, patch_storybible
5. if get_storybible_rebuild_signal.should_propose_rebuild is true, mention this when next proposing a plan; do NOT silently call rebuild_storybible.

After writing prose to a chapter (write_to_chapter approved and applied):
- Always call run_consistency_check on the file you just wrote.
- Surface each finding as a non-blocking suggestion in the assistant message.
- Do NOT call confirm_writing_plan or write_to_chapter automatically based on findings.
- Use this fenced block format (renderer renders it as suggestion cards):

```consistency-findings
[ { "layer": "pov", "severity": "minor", "locationRef": "...", "description": "...", "suggestion": "..." } ]
```

Skills directory:
- scene-structure / character-voice / deep-pov: planning + drafting
- dialogue-craft / pacing-control: dialogue-heavy or pacing-sensitive scenes
- character-arc-planning / story-logic: plan formation
- pov-consistency-check / character-behavior-check: load before run_consistency_check
```

---

## 9. 实施顺序（建议 PR 拆分）

### PR 1 —— 基础设施 + 清理 + search 升级（无新行为面向作者）

文件改动：
- 新建：`src/utils/textStats.ts`
- 修改：`electron/ai/db/CreativeDb.ts`（`setup()` 中追加 `storybible_change_log` 表与索引；新增三个 CRUD 方法，但不接入到工具）、`electron/ai/tools/CreativeTools.ts`（仅 `search_draft` 重写 + 接收 `snapshotBroker`）、`electron/ai/AgentEngine.ts`（注入 snapshotBroker）、`electron/ai/domain/creative/buildCreativeCapabilities.ts`（新增 `snapshotBroker` 参数 + `subAgents: []` 占位）、`electron/ai/domain/types.ts`（加 `subAgents?` 字段）、`src/components/pages/markdown-editor/stats.ts`（改 import）、`src/ai/message/display-normalizer.ts` 与 i18n（清理 `list_story_assets` 等遗留键）
- 删除：`electron/ai/tools/CreativeArtifactTools.ts`

完成后：search_draft 升级，`storybible_change_log` 表已创建但未被工具写入。Phase 1 全部行为回归通过。

### PR 2 —— ConsistencyAgent + skills + system prompt + finding UI

文件改动：
- 新建：6 个 SKILL.md、`electron/ai/tools/CreativeAnalysisTools.ts`、`src/ai/message/consistency-findings.ts`、`ConsistencyFindingCard.vue` + `ConsistencyFindingsBlock.vue`
- 修改：`buildCreativeCapabilities.ts`（合并 analysis tools）、`CreativeTools.ts`（写盘工具接入 `recordStoryBibleChange`，rebuild 工具接入 `clearStoryBibleChangeLog`）、`src/ai/types.ts`（inferToolKind 新工具）、`display-normalizer.ts`（新工具 case）、`AgentMessageBubble.vue`（识别围栏并切分渲染）、`src/ai/thread/system-prompts/creative.ts`（追加流程与格式约定）、i18n（新条目）

完成后：Phase 2 完整闭环。

PR 1 全部是工程化变更、零行为风险，可单独合并；PR 2 依赖 PR 1 的 snapshotBroker 注入与 change_log CRUD。两 PR 各 < 800 行新增，review 友好。

---

## 10. Verification

### 10.1 PR 1 回归

1. 拿 Phase 1 已部署的 workspace 启动应用 → 应用启动无报错；用 sqlite cli 验证 `storybible_change_log` 表已创建且与原 `session_log` 表共存
2. `search_draft("具体词")` 返回 block-aware 结果（含 `block_id` / `heading` / `preview`）
3. 编辑器底栏字数显示正确（countWords 抽离不破坏功能）
4. Phase 1 的全部既有功能：confirm_writing_plan / write_to_chapter / add_fragment / rebuild_storybible / get_session_diff / 三种 decision / 路径安全 / 无 workspace 拦截 —— 全部回归通过

### 10.2 PR 2 端到端测试

**A. ConsistencyAgent 全流程**：新建 workspace；写完一章并批准 write_to_chapter；验证 agent 自动调用 `run_consistency_check`；chat 中出现 `ConsistencyFindingsBlock` 卡片，severity 色调正确，不阻塞流程；继续对话不被打断。

**B. Finding 围栏容错**：手动构造畸形 JSON（截断 LLM 响应或 patch checkpointer）→ 渲染降级为普通 code block，不崩溃。

**C. StoryBible rebuild 自检**：累计写多次（绝对值 > 2000 字）→ 关闭/重开 thread → 新消息触发 `get_storybible_rebuild_signal` → agent 在 plan 中提议 rebuild → 用户同意后 `rebuild_storybible` 调用成功 → change_log 清空 → 下次 signal 报 `should_propose_rebuild=false`。

**D. 写盘工具 change_log 记录**：每次 `add_fragment` / `patch_storybible` / `write_to_chapter` / `replace_storybible_section` 写盘后 → `storybible_change_log` 多 1 行 → wordDelta 与实际增减一致。

**E. 新 skills 加载**：`run_consistency_check` 之前 LLM 应在 trace 中体现读取 pov-consistency-check / character-behavior-check 等 skills（通过 deepagents 的 read_skills 工具调用证据）。

### 10.3 自动化检查（每 PR 必跑）

```bash
npm run lint
npm run type-check
npm run dev      # 主进程冷启动 ready
```

特别注意 `DomainAgentCapabilities` 与 `buildCreativeCapabilities` 签名变更后 `AgentEngine` 调用处的同步 type-check。`CreativeDb` 启动时可手动 smoke：`node -e "new CreativeDb('/tmp/foo')"`，确认两张表都创建。

### 10.4 不在 Phase 2 验证范围

- 真正的 sub-agent 编排（仅装配点已留）
- review_finding 表 / 阻塞型 finding 审批
- finding 跨 turn 累积视图与统计
- `recent_writes` scope 实际生效（依赖 git 集成或 anchor 持久化）
- Pilot Mode / 方向探索 / 语义搜索 / git 集成

这些按 03 概要设计 §10 与 04 角色设计 §11 的 Phase 3+ 推进。
