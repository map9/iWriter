# Phase 3.2.1 Route Decisions

> 版本：v1.0  
> 状态：实现路线补充决策  
> 关联文档：
> - `docs_add/phase3-feature-planning.md`
> - `docs_add/phase3-2-1-implementation-notes.md`

本文整合 Phase 3.2.1 开始实现前的路线判断，重点覆盖：

1. 哪些任务可以直接开始。
2. 哪些任务需要先拍板。
3. 是否需要新增 T0。
4. T4 compress 的 LLM 调用方式。
5. T6 expand 如何接入 insert / edit 审批落地。

---

## 1. 总体结论

Phase 3.2.1 的整体规划已经可以进入实现，但任务顺序需要略微调整：

1. `T1 schema` 可以直接开始。
2. 建议新增 `T0 ConfirmGate + IPC skeleton`，作为确认节点基础设施。
3. `T2 StoryStateStore`、`T5 validate` 可以在 T1 后并行推进。
4. `T3 ingest` 依赖 T0。
5. `T4 compress` 需要先确定 LLM 调用方式。
6. `T6 expand` 需要采用新的 ProposalService 路线，而不是强行复用 `AgentEngine.resumeRun()` 注入提案。

推荐开发顺序：

```text
T1 schema
  ↓
T0 ConfirmGate + IPC skeleton
  ↓
T2 StoryStateStore        T5 validate
  ↓                       ↓
T3 ingest                 ↓
  ↓                       ↓
T4 compress               T6 expand
  ↓                       ↓
T7 end-to-end integration
```

---

## 2. 代码现状判断

### 2.1 有利条件

1. `UnifiedDocumentAccess.fromFile()` 已经能从磁盘文件构造无头 TipTap editor。

   这意味着 `.md` / `.iwt` 小说文件不需要先打开在编辑器里，也可以生成 `SerializedSnapshot`，包含 `blockMap` 和 `outline`。

2. `DocumentViewBuilder.buildSectionView()` 已存在。

   Ingest 可以复用它做章节级 Markdown view 和 block 范围提取。

3. `zod` 已经在代码中使用。

   `CreativeArtifactTools.ts` 已经直接 import `zod`。T1 可以直接用 Zod 写 schema validator。

4. IPC 注册位置清楚。

   现有 `ipcMain.handle` 主要集中在 `electron/App.ts`，新增 `novel:*` channel 不需要重构架构。

5. `AgentEngine.compactInput()` 已经示范了直接通过 `ModelFactory.createChatModel()` 调用模型。

   这说明 novel harness 不一定必须经过 LangGraph agent thread 才能调用 LLM。

### 2.2 风险点

1. `CreativeArtifactTools` 没有 frontmatter 解析。

   当前 `save_story_asset` / `read_story_asset` 只是纯文本写入和读取。T2 必须新增 `StoryStateStore`，负责 YAML frontmatter parse / stringify / validate。

2. `js-yaml` / `yaml` 目前不是直接 dependency。

   **T2 开始前必须先执行 `npm install js-yaml @types/js-yaml`，加入 `dependencies`**，不依赖传递依赖（传递依赖随上游版本变化可能消失）。

3. `snapshotBroker` 当前是 `AgentEngine` 的 private 字段。

   T3 ingest 如果需要复用 `SnapshotBroker.requestSnapshot()`，需要：

   - 给 `AgentEngine` 增加 getter；或
   - 将 `SnapshotBroker` 提升为 App 层共享依赖，再分别注入 `AgentEngine` 和 `NovelHarness`。

   更小改动方案：先加 getter。

4. `AgentEngine.resumeRun()` 不是外部创建提案的入口。

   它是恢复已经 interrupted 的 LangGraph run。T6 不应依赖它来“凭空注入”扩写提案。

---

## 3. 新增 T0：ConfirmGate + IPC Skeleton

### 3.1 为什么需要 T0

确认节点不是 T3 或 T4 的局部 UI，而是 Phase 3.2.1 多个模块共享的基础能力。

它会被这些流程复用：

1. 章节切分确认。
2. 场景切分确认。
3. 人物别名归并确认。
4. StoryState 写入确认。
5. ExpansionPlan 确认。

如果不独立成 T0，T3/T4/T6 会各自假设不同的确认机制，后期容易冲突。

### 3.2 T0 范围

T0 只做管道，不做完整业务 UI。

包含：

1. `electron/ai/novel-harness/ipc/ConfirmGate.ts`

   管理 `sessionId -> Promise`，提供 `waitForConfirm()`。

2. `electron/ai/ipc/protocol.ts`

   增加 `NovelConfirmRequest` / `NovelConfirmResponse` / `NovelConfirmType`。

3. `electron/ai/ipc/RendererEventBridge.ts`

   增加 `sendNovelConfirm()`。

4. `electron/preload.ts`

   暴露：

   ```typescript
   onNovelConfirmRequest(cb)
   novelConfirmResponse(resp)
   ```

5. `src/types/electron-api.ts`

   增加 renderer 可见类型。

6. `electron/App.ts`

   注册：

   ```typescript
   ipcMain.on('novel:confirm-response', ...)
   ipcMain.handle('novel:start-compress', ...)
   ipcMain.handle('novel:start-expand', ...)
   ```

7. `ConfirmCard.vue`

   第一版只需要能展示 payload JSON，并提供：

   - confirm
   - adjust + adjustmentText
   - cancel

   **T0/T3 边界**：T0 的 ConfirmCard 只展示原始 JSON，不做类型专用布局。T3 的验收终点包含 `ChapterBoundaryPayload` 的列表视图——T3 负责第一个真实 payload 的渲染，T0 只管管道通畅。

### 3.3 T0 验收终点

1. main process 可以发送一个 mock `NovelConfirmRequest`。
2. renderer 可以显示 ConfirmCard。
3. 用户点击 confirm / adjust / cancel 后，main process 的 `waitForConfirm()` Promise resolve。
4. 只有匹配 `sessionId` 的 response 会 resolve 对应请求。

---

## 4. T4 Compress 路线

### 4.1 不推荐隐藏 Agent Thread 作为默认路线

不建议让 compress 启动一个隐藏 creative domain thread，再从 thread messages 里提取结构化结果。

原因：

1. compress 是后台编排任务，不是普通对话。
2. 隐藏 thread 需要额外处理 thread list、message visibility、checkpoint 清理。
3. 从对话消息中提取 YAML / JSON 结果比直接模型调用更绕。
4. T4 的关键是确定性流程：分块、提取、校验、确认、写入。用 agent thread 会增加不必要的不确定性。

### 4.2 推荐路线

T4 使用 TypeScript orchestrator 直接调用模型：

```text
ChapterCompressor
  -> load prompt template from SKILL.md
  -> createChatModel(...)
  -> model.invoke(...)
  -> parse output
  -> validate schema
  -> ConfirmGate
  -> StoryStateStore.write(...)
```

### 4.3 SKILL.md 的职责

`SKILL.md` 只作为 prompt 模板和输出格式说明，不承担状态编排。

职责边界：

```text
SKILL.md:
  - 单章压缩 prompt
  - 字段要求
  - source_refs 要求
  - 输出示例

TypeScript orchestrator:
  - 分块
  - 调用模型
  - 解析输出
  - Zod 校验
  - 失败重试
  - ConfirmGate 等待
  - 写入事务
```

### 4.4 T4 主要风险

最大风险是 LLM 输出 schema 不稳定。

常见问题：

1. 漏必填字段。
2. `confidence` 输出为字符串。
3. `source_refs` 格式不符合 schema。
4. YAML frontmatter 被 markdown 正文污染。

缓解方式：

1. prompt 中给完整示例。
2. 写入前必须 Zod 校验。
3. 校验失败不写文件。
4. 允许重试。
5. 必要时要求模型输出 JSON，再由程序转换为 YAML frontmatter。

---

## 5. T6 Expand 路线

### 5.1 T6 的真实目标

T6 不是简单生成一段小说文本。

它的目标是：

> 从 StoryState 生成扩写草稿（guided 模式：参考 SceneCard / CharacterCard / Worldbook / StyleProfile，validate 只给 warning 不阻断），再通过可审批的 insert / edit 机制进入正文。

MVP 阶段只实现 guided 模式，不做模式选择 UI。`free` 和 `strict` 留作 Phase 3.2.2 扩展点，在 `ChapterExpander` 里用 `mode?: 'guided'` 占位。

### 5.2 不推荐路线

不推荐：

```text
ChapterExpander 生成草稿
  -> 强行塞进 AgentEngine.resumeRun()
  -> 假装这是一次 LangGraph interrupt
```

原因：

1. `resumeRun()` 是恢复已有 interrupt，不是创建新 proposal。
2. 这会把 harness 的确定性流程塞进 agent runtime 的异常路径。
3. 出问题时调试边界不清楚。

也不推荐：

```text
隐藏 edit agent thread
  -> 让 agent 重新调用 insert_block / edit_block
```

原因：

1. 已经生成了草稿，再让 agent 调用工具会增加一轮不稳定。
2. 插入位置、约束模式、validation report 都是 harness 已知信息，不需要让 agent 重新判断。
3. 隐藏 thread 会带来 thread list 和状态管理问题。

### 5.3 推荐路线：ChapterExpander + ProposalService

T6 推荐拆成两层：

```text
Expansion Harness:
  StoryState + user goal
  -> ExpansionPlan
  -> DraftParagraphs
  -> ValidationReport

Proposal / Apply Layer:
  DraftParagraphs + target position
  -> EditProposal[]
  -> renderer review UI
  -> approve / edit / reject
  -> BlockEditApplier
```

新增 `ProposalService`，负责把 novel harness 生成的草稿转换成现有可审批提案。

### 5.4 T6 推荐流程

```text
用户选择扩写目标（SceneCard）
  -> ChapterExpander 生成 ExpansionPlan（beat sheet）
  -> ConfirmGate 等待用户确认 ExpansionPlan
  -> ChapterExpander 生成 DraftParagraphs
  -> ConsistencyValidator 软校验（输出 warning，不阻断）
  -> ProposalService 创建 insert/edit proposals（附 ValidationReport）
  -> renderer 展示审批 UI
  -> 用户 approve / edit / reject
  -> BlockEditApplier 应用到 TipTap
```

### 5.5 ProposalService 职责与耦合约束

`ProposalService` 不是新的编辑器写入通道，它只负责创建 proposal。

它应复用现有：

1. `EditProposal` 数据结构（`sourceMessageId` / `sourceTurnId` / `toolCallId` 均为 optional，不影响）。
2. proposal review UI。
3. `BlockEditApplier` 落地逻辑。
4. stale content 检查机制。

它不应该：

1. 绕过用户审批。
2. 直接写 TipTap 文档。
3. 调用 `AgentEngine.resumeRun()` 创建伪 interrupt。

**关键耦合约束**：`editReview.ts::handleInterrupt()` 要求 `threadId` 必填，提交 decisions 后调用 `window.electronAPI.aiResume({ threadId, decisions })`，最终进入 `agentEngine.resumeRun()`。若 `threadId` 不对应真实 AgentEngine interrupt，`resumeRun` 静默失败，段落不会写入。

因此 `ProposalService` 需要在 `editReview.ts` 里加一个 source 分支：

```typescript
// editReview.ts 内部（伪代码）
if (batch.source === 'novel_harness') {
  window.electronAPI.novelProposalResponse?.({ sessionId: batch.novelSessionId, decisions })
} else {
  window.electronAPI.aiResume?.({ threadId, decisions })
}
```

`source: 'agent' | 'novel_harness'` 加在 `ReviewBatchState` 上，不加在 `EditProposal` 上。

### 5.6 T6 验收终点

T6 完成时必须满足：

1. 用户能从一个 SceneCard 发起扩写。
2. 系统先生成 ExpansionPlan，并等待用户确认。
3. 用户确认后生成正文草稿。
4. 草稿带 validation report（warning 级，不阻断）。
5. 草稿以 proposal 形式进入审批 UI。
6. 用户 approve 后文本插入指定位置。
7. 用户 reject 后正文不变。

---

## 6. T6 前置 Spike

在正式实现 T6 前，需要做一个小侦察任务，确认 ProposalService 的最小改动清单。

已知结论（代码已确认）：

1. `EditProposal` 的 `sourceMessageId` / `sourceTurnId` / `toolCallId` 均为 optional，不需要改类型定义。
2. `editReview.ts::handleInterrupt()` 的 `threadId` 是 required，且决策提交后强制走 `aiResume`。这是唯一需要改造的耦合点。

Spike 需要确认的内容：

1. `ReviewBatchState` 的定义位置和字段结构——确认加 `source` 和 `novelSessionId` 的最小改动行数。
2. `BlockEditApplier` 是否接受 `nodeId` 为空的 proposal（novel-harness 生成的 insert 提案可能没有 `afterNodeId`，需要从用户光标位置推断）。
3. validation report 挂在 `BlockEditProposal` 的哪个字段合适（建议加 `validationReport?: ValidationIssue[]` 到 `BaseEditProposal`）。

Spike 完成后输出：`editReview.ts` 改动 diff（预期 < 30 行），作为 T6 实现的前置 PR。

---

## 7. 最终建议

1. 将 `T0 ConfirmGate + IPC skeleton` 补入 Phase 3.2.1。
2. `T1 schema` 立即开始。
3. `T4 compress` 使用 `ModelFactory` 直接调用模型，不走隐藏 Agent thread。
4. `T6 expand` 使用 `ChapterExpander + ProposalService`，不使用 `AgentEngine.resumeRun()` 注入提案。
5. `SKILL.md` 只放 prompt，复杂状态流由 TypeScript orchestrator 控制。
6. T6 前必须先做 ProposalService spike，输出 `editReview.ts` 改动 diff（预期 < 30 行）。
7. MVP 阶段 expand 只实现 guided 模式，`free` 和 `strict` 留 Phase 3.2.2。

