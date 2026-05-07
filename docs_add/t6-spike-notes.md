# T6 Spike Notes

## 1. ReviewBatchState

`createReviewBatchState()` 位于 `src/ai/review/state.ts`。

已补最小字段：

1. `source: 'agent' | 'novel_harness'`
2. `novelSessionId?: string`

默认 `source` 是 `agent`，所以现有 AI 编辑审批流不受影响。

## 2. Novel Harness Proposal 路线

`editReview.ts` 现在可以创建 `source: 'novel_harness'` 的 review batch。

审批时：

1. 仍复用 `flushReviewedBatch()`。
2. approve / edit 会先调用现有 `BlockEditApplier` 落地。
3. `source === 'agent'` 时继续调用 `aiResume()`。
4. `source === 'novel_harness'` 时不调用 `aiResume()`，避免落入 AgentEngine 的无中断恢复路径。

正式 T6 还需要补一个 main/renderer IPC 回执，用来把用户审批结果通知 `ChapterExpander`。

## 3. Insert Anchor

`BlockEditApplier.applyInsertBlock()` 已支持：

1. `afterNodeId === '0'`：文档开头插入
2. `afterNodeId` 缺失：当前实现同样按文档开头插入

T6 如果要“文档末尾插入”，建议 ProposalService 明确计算最后一个 block 的 `afterNodeId`，不要依赖空 anchor。

## 4. ValidationReport

`BaseEditProposal` 已新增：

```ts
validationReport?: ValidationIssue[]
```

`ProposalNavigator.vue` 已能展示 warning / error 级别的 validation issue。

## 5. T6 后续建议

1. 新增 `ProposalService`，只负责把 novel harness 草稿包装成 `BlockEditProposal`。
2. ProposalService 必须传入明确 anchor：
   - 章节后插入：使用章节末尾 block 的 `nodeId`
   - 文档开头插入：使用 `afterNodeId: '0'`
3. 新增 `novel:review-response` IPC，让 renderer 审批完成后通知 main process。
4. 不使用 `AgentEngine.resumeRun()` 创建伪中断。
