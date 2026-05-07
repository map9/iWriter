# Phase 3.2.1 开发指南

> 版本：v1.0  
> 状态：可执行  
> 来源：整合自 phase3-feature-planning.md / phase3-2-1-implementation-notes.md / phase3-2-1-route-decisions.md  
> 目标：单章压缩 → 用户修正卡片 → 场景卡扩写 → 审批落地 完整闭环

---

## 1. 任务总览与顺序

```
T1 schema（立刻开始）
  ↓
T0 ConfirmGate + IPC skeleton
  ↓
T2 StoryStateStore   T5 validate
  ↓                  ↓
T3 ingest            ↓
  ↓                  ↓
T4 compress          T6 expand（需先完成 T6 Spike）
  ↓                  ↓
T7 端到端集成
```

**T6 开始前必须先做 Spike**，见第 6 节。

---

## 2. 代码目录约定

### 2.1 新增目录

```
electron/ai/novel-harness/
├── NovelHarness.ts              # 入口，注册 IPC handler
├── ipc/
│   └── ConfirmGate.ts           # waitForConfirm()，sessionId → Promise
├── schema/
│   ├── types.ts                 # StoryState / CharacterCard / SceneCard 等 TS 接口
│   └── validator.ts             # Zod schema，导出 validateCharacterCard() 等
├── ingest/
│   └── ChapterSegmenter.ts
├── compress/
│   └── ChapterCompressor.ts
├── store/
│   └── StoryStateStore.ts
├── expand/
│   └── ChapterExpander.ts
└── validate/
    └── ConsistencyValidator.ts

electron/ai/builtin-skills/
├── compress-chapter/SKILL.md    # 新增
└── expand-chapter/SKILL.md      # 新增
```

### 2.2 需要改动的现有文件

| 文件 | 改动内容 |
|------|---------|
| `electron/ai/tools/CreativeArtifactTools.ts` | `STORY_SECTIONS` 加 `timeline` / `foreshadowing` / `outlines` / `style` |
| `electron/ai/ipc/protocol.ts` | 加 `NovelConfirmRequest` / `NovelConfirmResponse` / `NovelConfirmType` |
| `electron/ai/ipc/RendererEventBridge.ts` | 加 `sendNovelConfirm()` |
| `electron/preload.ts` | 暴露 `onNovelConfirmRequest` / `novelConfirmResponse` |
| `src/types/electron-api.ts` | 加对应 renderer 类型 |
| `electron/App.ts` | 注册 `novel:confirm-response` / `novel:start-compress` / `novel:start-expand` |
| `electron/ai/AgentEngine.ts` | 加 `get snapshotBroker()` getter（T3 需要） |
| `src/ai/store/modules/editReview.ts` | 加 `source` 分支（T6 Spike 后再改，< 30 行） |
| `src/ai/types.ts` | `BaseEditProposal` 加 `validationReport?: ValidationIssue[]`（T6） |

---

## 3. story asset 文件布局

### 3.1 目录结构

```
{workspace}/.iwriter/story/
├── characters/     # CharacterCard
├── scenes/         # SceneCard
├── timeline/       # TimelineEvent（一章一文件）
├── foreshadowing/  # ForeshadowingEntry
├── outlines/       # OutlineChapter
├── style/          # StyleProfile（唯一文件 profile.md）
├── worldbook/      # 已有
├── brainstorms/    # 已有
├── storylines/     # 已有
└── notes/          # 已有（互动片段写回也放这里）
```

### 3.2 文件命名规则

| 类型 | 命名 | 示例 |
|------|------|------|
| CharacterCard | `{character_id}.md` | `li-ming.md` |
| SceneCard | `{chapter_id}--{seq}.md` | `ch01--001.md` |
| TimelineEvent | `{chapter_id}.md` | `ch01.md` |
| ForeshadowingEntry | `{entry_id}.md` | `sword-prophecy.md` |
| OutlineChapter | `{chapter_id}.md` | `ch01.md` |
| StyleProfile | `profile.md` | `profile.md` |

`chapter_id`：`ch` + 零填充两位，如 `ch01`。  
`character_id`：人名 `normalizeSlug` 后加 `--{uuid前4位}` 去重。

### 3.3 文件格式

```markdown
---
id: li-ming
type: character_card
name: 李明
confidence: 0.85
updated_at: "2026-05-06T12:00:00Z"
# ... 其余 StoryState schema 字段
---

## 人物简述
人类可读正文（供用户直接阅读和编辑）
```

下次读取以 frontmatter 为准，正文不参与校验。

---

## 4. 确认节点 IPC 约定

### 4.1 渠道

- `novel:confirm-request`（main → renderer）：主进程 emit，触发 ConfirmCard 展示
- `novel:confirm-response`（renderer → main）：用户决策后发回，Promise resolve

### 4.2 类型定义（加入 protocol.ts）

```typescript
export type NovelConfirmType =
  | 'chapter_boundary'
  | 'scene_split'
  | 'alias_merge'
  | 'story_state_write'
  | 'expansion_plan'

export interface NovelConfirmRequest {
  sessionId: string
  type: NovelConfirmType
  payload: ChapterBoundaryPayload | SceneSplitPayload | AliasMergePayload
         | StoryStateWritePayload | ExpansionPlanPayload
}

export interface NovelConfirmResponse {
  sessionId: string
  type: NovelConfirmType
  decision: 'confirm' | 'adjust' | 'cancel'
  adjustmentText?: string   // 仅 decision='adjust' 时有值
}
```

### 4.3 各 payload 结构

**ChapterBoundaryPayload**
```typescript
{ chapters: Array<{ id: string; title: string; wordCount: number; blockCount: number; startBlockId: number; endBlockId: number }> }
```

**SceneSplitPayload**
```typescript
{ chapterId: string; chapterTitle: string; scenes: Array<{ seq: number; summary: string; tone: string; estimatedBlocks: number }> }
```

**AliasMergePayload**
```typescript
{ groups: Array<{ suggestedId: string; canonicalName: string; aliases: string[]; confidence: number; exampleContext?: string }> }
```

**StoryStateWritePayload**
```typescript
{ summary: { characterCount: number; sceneCount: number; timelineEventCount: number; foreshadowingCount: number; hasStyleProfile: boolean; hasOutline: boolean }; lowConfidenceCount: number; targetDirectory: string }
```

**ExpansionPlanPayload**
```typescript
{ sceneId: string; sceneTitle: string; beats: Array<{ seq: number; description: string; estimatedWords: number }> }
```

### 4.4 ConfirmGate 模式

```typescript
// ConfirmGate.ts
class ConfirmGate {
  private pending = new Map<string, (resp: NovelConfirmResponse) => void>()

  async waitForConfirm(sessionId: string, request: NovelConfirmRequest): Promise<NovelConfirmResponse> {
    this.rendererEventBridge.sendNovelConfirm(request)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(sessionId); reject(new Error('timeout')) }, 120_000)
      this.pending.set(sessionId, (resp) => { clearTimeout(timer); resolve(resp) })
    })
  }

  resolve(resp: NovelConfirmResponse): void {
    this.pending.get(resp.sessionId)?.(resp)
    this.pending.delete(resp.sessionId)
  }
}
```

---

## 5. 各任务详细说明

### T1 · schema（前置）

**输出文件**：`electron/ai/novel-harness/schema/types.ts` + `validator.ts`

关键约定：
- 用 `z.infer<typeof XxxSchema>` 让 Zod schema 直接导出 TypeScript 类型，不重复维护
- `source_refs` 的 `start_offset` / `end_offset` 为 optional，MVP 只填 `block_id`
- `confidence` 类型为 `number`（0–1），Zod 用 `z.number().min(0).max(1)`

验收：
1. 给定合规 YAML frontmatter → 验证器返回 pass
2. 缺必填字段 → 明确错误信息
3. `confidence` 超出 0–1 → 校验失败
4. `source_refs` 缺 `file` 或 `chapter_id` → 校验失败

---

### T0 · ConfirmGate + IPC skeleton（T1 后）

**输出文件**：`ConfirmGate.ts` + protocol.ts / preload.ts / RendererEventBridge.ts / electron-api.ts / App.ts 各自小改 + `ConfirmCard.vue` 骨架

**T0/T3 边界**：T0 的 ConfirmCard 只渲染 payload JSON + 三个按钮。T3 负责 `ChapterBoundaryPayload` 列表视图。

验收：
1. main 发送 mock `NovelConfirmRequest` → renderer 出现 ConfirmCard
2. 用户点击 confirm / adjust / cancel → main `waitForConfirm()` Promise resolve
3. 只有匹配 `sessionId` 的 response 会 resolve 对应 Promise

---

### T2 · StoryStateStore（T1 后，可与 T0/T5 并行）

**前置动作**：`npm install js-yaml @types/js-yaml`（加入 `dependencies`，不依赖传递依赖）

**输出文件**：`electron/ai/novel-harness/store/StoryStateStore.ts`

关键约定：
- 写入前调用 T1 validator，不通过则抛错，**不覆盖原有文件**（先写临时文件，校验通过再 rename）
- `STORY_SECTIONS` 在 `CreativeArtifactTools.ts` 中同步扩展（加 `timeline` / `foreshadowing` / `outlines` / `style`）
- `StoryStateStore` 直接用 `fs` 读写（main process），不走 LangChain tool 层

验收（对应 M4）：
1. 写入 CharacterCard → 文件含完整 YAML frontmatter + Markdown 正文
2. 写入文件可被 validator 读回并 pass
3. 写入前 schema 校验失败 → 不覆盖原有文件
4. `list_story_assets` 能枚举新文件，slug 无重复

---

### T3 · ingest（T0 完成后）

**输出文件**：`electron/ai/novel-harness/ingest/ChapterSegmenter.ts`

关键约定：
- 需要 `SnapshotBroker` 实例。在 `AgentEngine.ts` 加 `get snapshotBroker()` getter，`App.ts` 把它传给 `NovelHarness`
- 利用 `snapshot.outline`（已包含标题层级、wordCount、sectionBlocks）做章节边界识别，不需要额外解析
- 无标题结构时按 2000 字固定窗口分块，标注为"未命名章节 N"
- 确认节点 1（`chapter_boundary`）走 T0 的 ConfirmGate；`decision='adjust'` 时重新生成边界
- **T3 负责 ConfirmCard 的 ChapterBoundaryPayload 列表视图**（T0/T3 边界）

验收（对应 M2）：
1. 含标题的文档 → 正确识别章节边界（标题 + block 范围）
2. 确认节点展示后流程暂停，不自动继续
3. 用户可合并相邻章节或拆分过长章节
4. 无标题结构时按固定字数分块并提示

---

### T4 · compress 单章（T0 + T2 + T3 完成后）

**输出文件**：`ChapterCompressor.ts` + `compress-chapter/SKILL.md` + `ConfirmCard.vue` 的三种 payload 视图

**LLM 调用方式**：直接 `createChatModel(providerConfig, { modelId }) → model.invoke([...])` 取模式，与 `AgentEngine.compactInput()` 相同，不走 LangGraph thread。

**SKILL.md 职责**：只放 prompt 模板 + JSON draft 输出格式 + 完整示例。所有状态编排（分块、重试、确认节点、写入事务）由 TypeScript orchestrator 控制。

**关键边界**：
- T4a 输出叫 `CompressionDraft`，不是最终资产。T4c 在用户确认场景和别名后，才把 draft 归一化成最终 `StoryAsset`。
- 模型输出 JSON，不直接输出 YAML；写入时由 `StoryStateStore` 序列化为 YAML frontmatter + Markdown。
- `novel:start-compress` 参数应支持 `{ filePath?, providerConfigId?, modelId?, thinkMode? }`，与现有 provider runtime 思路一致。
- story assets 根目录沿用 workspace-relative 布局：`{workspace}/.iwriter/story/`，与 `CreativeArtifactTools` 和 T2 `StoryStateStore` 保持一致。

**LLM schema 合规风险**（最高风险）：
- 必须在 prompt 里给完整 JSON 示例
- `confidence` 要求输出数字而非字符串（在示例里体现）
- 校验失败 → 提示重试，不写入，最多重试 2 次
- `source_refs[].block_id` 必须来自传入的 blockMap

四个确认节点均走 ConfirmGate：
- 节点 1 章节切分（T3 已实现）
- 节点 2 场景切分（`scene_split` payload）
- 节点 3 别名归并（`alias_merge` payload）—— `confidence < 0.6` 的组标红
- 节点 4 写入确认（`story_state_write` payload）—— 确认后调用 T2 写入

**用户使用流程**：
1. 用户打开小说文档。
2. 用户触发"压缩/提取小说状态"。
3. harness 通过 `SnapshotBroker` 获取当前文档 snapshot。
4. `ChapterSegmenter` 自动生成章节边界。
5. 用户在 `chapter_boundary` 确认卡中改标题、合并或拆分章节。
6. `ChapterCompressor` 选择单章正文和 blockMap 调模型生成 `CompressionDraft`。
7. 程序 parse JSON 并用 T1 schema 校验，失败自动重试，仍失败则报错且不写盘。
8. 用户确认 `scene_split`。
9. 用户确认 `alias_merge`，低置信度人物组标记"需复核"。
10. harness 归一化最终 `CharacterCard[]`、`SceneCard[]`、`TimelineChapter?`。
11. 用户确认 `story_state_write`，看到即将写入的条目列表和目标目录。
12. `StoryStateStore.writeAsset()` 写入 `characters/`、`scenes/`、`timeline/` 等目录。

**最终结果**：用户拿到的不是摘要文本，而是一组可追溯的小说状态资产。每个资产包含 schema 字段、`confidence`、`source_refs.block_id`，后续可用于扩写、检索、多模态生成或角色互动。

**建议拆分**：
- T4a Extractor：SKILL.md + `extractChapter()` + JSON parse / retry / schema validate，不确认、不写盘。
- T4b Confirm UI：`scene_split`、`alias_merge`、`story_state_write` 三种专用视图。
- T4c Orchestrator：串联 T3/T4a/T4b/T2，负责 provider runtime、目标目录、alias 归一和写入错误记录。
- T4d 验收：真实样章端到端跑通，生成文件可被 `StoryStateStore.readAsset()` 读回。

验收（对应 M3）：
1. 单章输出 ≥1 个通过 schema 校验的 SceneCard + CharacterCard
2. `source_refs` 含有效 `block_id`
3. `confidence < 0.6` 的条目标记"需复核"
4. 压缩失败时报错允许重试，不写入损坏数据
5. 确认节点 2/3/4 均暂停等待用户响应

---

### T5 · validate（T1 后，可与 T2/T3 并行）

**输出文件**：`electron/ai/novel-harness/validate/ConsistencyValidator.ts`

关键约定：
- **软校验**：LLM-assisted，输出建议报告，不自动阻断
- 三个校验维度：人物行为（CharacterCard）/ 时间线（TimelineEvent[]）/ 世界观（WorldbookEntry.rules）
- 输出格式：`{ issues: [{ dimension, description, severity: 'warning' | 'error', suggestion }] }`
- MVP 阶段不实现自动修订（严格模式），只输出报告给用户

验收（对应 M6）：
1. 给定文本 + CharacterCard → 输出人物行为问题列表（可为空）
2. 给定文本 + TimelineEvent[] → 检测时间顺序矛盾
3. 给定文本 + WorldbookEntry.rules → 检测规则违反
4. 校验结果始终为建议，不自动拒绝或重生成

---

### T6 · expand（T2 + T5 完成后，需先做 Spike）

**输出文件**：`ChapterExpander.ts` + `ProposalService.ts` + `expand-chapter/SKILL.md`

**MVP 只实现 guided 模式**（参考 SceneCard + CharacterCard + Worldbook + StyleProfile，validate 只给 warning）。`mode?: 'guided'` 占位，不实现 free / strict。

**流程**：
```
用户选择 SceneCard
  → ChapterExpander 生成 ExpansionPlan（beat sheet）
  → ConfirmGate 等待确认（expansion_plan payload）
  → ChapterExpander 逐段生成草稿（StyleProfile few-shot 注入）
  → ConsistencyValidator 软校验
  → ProposalService 创建 insert/edit proposals（附 ValidationReport）
  → renderer 审批 UI（复用现有）
  → 用户 approve / edit / reject
  → BlockEditApplier 落地
```

**ProposalService 耦合点**：需要在 `editReview.ts` 的 `ReviewBatchState` 加 `source: 'agent' | 'novel_harness'`，decisions 提交时按 source 走不同 IPC 渠道。改动预期 < 30 行——Spike 先确认再动。

验收（对应 M5）：
1. 给定有效 SceneCard + CharacterCard → 生成 ExpansionPlan
2. ExpansionPlan 展示后流程暂停
3. 草稿经过 ConsistencyValidator，校验报告随提案展示
4. 提案出现在现有审批 UI
5. approve 后文本插入正确位置，reject 后正文不变

---

### T6 前置 Spike

Spike 需要确认三件事：

1. **`ReviewBatchState` 改动位置**：找到 `createReviewBatchState()` 函数，确认加 `source` 和 `novelSessionId` 字段的最小行数
2. **`BlockEditApplier` 对 `afterNodeId` 为空的处理**：novel-harness 的 insert 提案可能没有 anchor node，确认是否需要加"文档末尾插入"的 fallback
3. **ValidationReport 字段位置**：建议加到 `BaseEditProposal.validationReport?: ValidationIssue[]`，确认 proposal review UI 是否有预留展示区

输出：`editReview.ts` + `src/ai/types.ts` 改动 diff，作为 T6 实现的前置 PR。

---

### T7 · 端到端集成

验收：
1. 打开小说文档 → 压缩单章 → 用户修正卡片 → 扩写 → 审批落地 全程跑通
2. 压缩中途取消 → 已写入 assets 保留，未完成部分不产生残缺文件
3. 扩写中途取消 → 不写入任何正文内容

---

## 6. 关键架构决策汇总

| 决策点 | 选择 | 原因 |
|--------|------|------|
| T4 LLM 调用方式 | `createChatModel` + `invoke`，不走 LangGraph thread | compress 是确定性编排流程，不需要 agent 的不确定性；与 `compactInput` 同模式 |
| T6 提案落地方式 | 新增 `ProposalService`，复用现有审批 UI | 不能伪造 AgentEngine interrupt；`resumeRun()` 的静默失败是陷阱 |
| ConfirmGate 实现 | 独立 Promise map，仿 SnapshotBroker 模式 | 现有代码里唯一的"main 等待 renderer 响应"模式，已验证可行 |
| story asset frontmatter | `js-yaml` 直接读写，不走 LangChain tool 层 | NovelHarness 是 main process 模块，有直接 fs 访问权限；tool 层是给 LLM 用的 |
| ExpansionMode | MVP 只做 guided | free 等于已有能力重复；strict 的自动修订循环不是 MVP 核心假设 |
| `snapshotBroker` 访问 | 加 getter 到 AgentEngine | 最小改动，不重构依赖注入 |

---

## 7. 已知风险与缓解

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| LLM JSON 输出格式不稳定（T4） | 高 | prompt 给完整 JSON 示例；Zod 校验失败后带错误消息重试，最多 2 次；全部失败则报错，不写盘 |
| `editReview.ts` source 分支改动影响现有审批流（T6） | 中 | Spike 先确认改动 diff；改动 < 30 行；现有 agent 路径不动 |
| SnapshotBroker 10 秒超时（T3/T4） | 中 | 目前够用；大文件压缩时可适当提高超时阈值 |
| `confidence < 0.6` 条目过多影响用户体验 | 低 | 软标记"需复核"，不阻止写入；用户可以直接编辑 asset 文件 |
| `source_refs` block_id 在用户编辑后失效 | 低 | 仅用于溯源参考，失效时标记"来源未验证"，不报错 |
