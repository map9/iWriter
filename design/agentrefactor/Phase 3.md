# Phase 3 — HITL `respond` 决策扩展与 planner 校验验证（A4 + B3）

## Context

`design/agentrefactor/refactor.md` 列出 iWriter AI 引擎与 deepagents 官方推荐的偏差。Phase 1（A1 + A2，上下文类型化 + streamEvents v3）与 Phase 2（A3 + A5 + B2，DeepSeek 替换 + OrphanStripper + execute hack 移除）已完成。Phase 3 处理 A4 与 B3：

- **A4** — 当前 `ResumeDecision` 仅 `approved / edited / rejected`，无法让用户「以文字回复工具，引导下一步」，只能整盘拒绝再重新输入。Creative HITL 场景下，用户经常希望对 planner / explorer 子代理的中间产物补充指令而非简单拒绝。
- **B3** — `TaskToolCompatMiddleware.ts:92-101` 的 planner 输出 schema 校验段是否仍然必要：refactor.md 假设 deepagents 框架会自动校验 `responseFormat: PlannerResponseSchema`，但探索发现 deepagents `createTaskTool`（`node_modules/deepagents/dist/index.js:2274-2302`）在 `config.toolCall?.id` 存在的常规工具调用路径下**不返回 `structuredResponse`**，校验从未生效；planner 仍可能向父代理回传非 JSON。因此中间件的 JSON+Zod 校验是**唯一**实际拦截非法 planner 结果的关卡。

Phase 3 预期产出：

1. ResumeDecision 增加 `responded` 第四类；Creative HITL UI 增加「以消息回复」入口；自定义 ToolMessage 注入路径绕开 langchain HITL 三类约束。
2. `TaskToolCompatMiddleware` 保留 planner 校验与 `prompt → description` 归一化，补充文件级注释说明为何不能依赖框架。

---

## 关键决策

1. **A4 走自定义 respond 路径**（非 UI 复用 reject+message）：底层不沿用 langchain HITL 的 `reject` 通道（其产物 `ToolMessage{ status: "error" }` 会被 LLM 误解为「工具调用失败」），改为通过 marker 标记 + middleware 重写，使最终送给 LLM 的 ToolMessage 不带 `status: "error"`，语义上等同于「用户给出的指导」。
2. **B3 保留校验 + 加注释**：不删除 `TaskToolCompatMiddleware` 中的 planner 校验块；在文件头部新增 doc 注释，引用 `deepagents/dist/index.js:2291-2302` 解释为何框架不会接管。
3. **范围限定**：Phase 3 只接入 Creative HITL UI 的 respond 操作；Edit HITL 暂不增加（其工具体已带 BlockEditProposal 精细 args，respond 价值低，留 Phase 5 视需要再加）。protocol/AgentEngine 层支持是 domain-agnostic 的，未来扩展无需改动后端。
4. **不引入 feature flag**：respond 路径无网络副作用，回滚靠 git revert PR。

---

## A4 — `respond` 决策类型设计

### A4.1 协议扩展

#### `electron/ai/ipc/protocol.ts:95-101`

```ts
export interface ResumeDecision {
  type: 'approved' | 'edited' | 'rejected' | 'responded'
  message?: string                    // rejected/responded 时使用；responded 必填
  editedArgs?: Record<string, unknown>
}
```

不拆成判别联合（保持向后兼容渲染端现有 IPC 序列化）；语义校验集中在 `AgentEngine.resumeRun` 入口。

#### `src/ai/store/modules/creativeReview.ts`（store 内部判别联合）

`CreativeReviewDecision` 内部类型（约 `:200` 周边）新增分支：

```ts
type CreativeReviewDecision =
  | { kind: 'approved' }
  | { kind: 'edited'; editedArgs: Record<string, unknown> }
  | { kind: 'rejected'; message?: string }
  | { kind: 'responded'; message: string }      // 新增
  | { kind: 'failed_to_apply'; message: string }
```

### A4.2 后端 marker + 重写中间件

#### 新建 `electron/ai/runtime/HumanRespondMessageMiddleware.ts`

> 命名理由：`HumanRespondMessage` 表达「把 HITL 拒绝产物改造为人类指导性 ToolMessage」的意图，优于暴露实现细节的 `RespondMarker`。

```ts
import { ToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'

export const RESPOND_MARKER = '__IWRITER_RESPOND__\n'

export function createHumanRespondMessageMiddleware() {
  return createMiddleware({
    name: 'HumanRespondMessage',
    wrapModelCall: async (request, handler) => {
      const rewritten = request.messages.map((m) => {
        if (!(m instanceof ToolMessage)) return m
        const text = typeof m.content === 'string' ? m.content : ''
        if (!text.startsWith(RESPOND_MARKER)) return m
        return new ToolMessage({
          id: m.id,                          // 保持 id → langgraph reducer 原地替换
          tool_call_id: m.tool_call_id,
          name: m.name,
          content: text.slice(RESPOND_MARKER.length),
          // 关键：不带 status: "error"
        })
      })
      return handler({ ...request, messages: rewritten })
    },
  })
}
```

**算法语义**：
- 幂等：多次穿过中间件不会重复剥离（marker 已被剥）
- 仅改 model 输入快照，不修改 LangGraph state（state 中仍保留 marker，便于回放调试与未来扩展，无副作用）
- 与 `OrphanToolCallStripperMiddleware` 顺序无关（两个 hook 各自独立修改 messages 数组）

#### `electron/ai/AgentEngine.ts:660-663` middleware 数组追加

```ts
middleware: [
  createOrphanToolCallStripperMiddleware(),
  createHumanRespondMessageMiddleware(),       // 新增（OrphanStripper 之后、TaskToolCompat 之前）
  createTaskToolCompatMiddleware(),
],
```

顺序理由：OrphanStripper 先清 history、HumanRespond 改 ToolMessage 形态、TaskToolCompat 处理 task tool 调用归一化。

### A4.3 AgentEngine.resumeRun 映射扩展

#### `electron/ai/AgentEngine.ts:384-401` 替换

```ts
const lgDecisions = decisions.map((d, idx) => {
  if (d.type === 'approved') return { type: 'approve' as const }
  if (d.type === 'edited' && d.editedArgs) {
    return {
      type: 'edit' as const,
      editedAction: { name: interrupted.actionNames[idx] ?? '', args: d.editedArgs },
    }
  }
  if (d.type === 'responded') {
    if (!d.message?.trim()) {
      throw new Error('[AgentEngine] responded decision requires non-empty message')
    }
    // 走 langchain reject 通道完成中断解除，message 加 marker；
    // HumanRespondMessageMiddleware 会在送入模型前剥 marker + 去 status='error'
    return {
      type: 'reject' as const,
      message: `${RESPOND_MARKER}${d.message}`,
    }
  }
  return {
    type: 'reject' as const,
    message: d.message ?? 'User rejected the edit.',
  }
})
```

新增 import：`import { RESPOND_MARKER } from './runtime/HumanRespondMessageMiddleware'`。

**为什么必须借道 reject 通道**：langchain `humanInTheLoopMiddleware`（`langchain/dist/agents/middleware/hitl.js:11-15`）硬编码 `ALLOWED_DECISIONS = ["approve", "edit", "reject"]`，且要求 `decisions.length === actionRequests.length`。绕开 HITL 直接 `Command({ update })` 会留下未解除的 interrupt。借 reject 通道解除中断 + 用中间件重写 ToolMessage 形态，是当前 langchain HITL 约束下唯一无副作用的实现。

### A4.4 渲染端 store 接入

#### `src/ai/store/modules/creativeReview.ts`

新增函数（在 `rejectCreativeReview` 之后）：

```ts
async function respondCreativeReview(reviewId: string, message: string) {
  const batch = reviewBatch.value
  const review = batch?.reviewsById[reviewId]
  if (!review || !message.trim()) return
  batch.decisionsById[reviewId] = { kind: 'responded', message: message.trim() }
  threadSync.updateLocalCreativeToolCall(review, 'rejected')   // 视觉上同 rejected 处理
  removePendingReview(reviewId)
  await maybeFlushResume()
}
```

`maybeFlushResume`（`:284-299`）的 decision 构造段新增分支（在 `rejected` 分支之前）：

```ts
if (decision.kind === 'responded') {
  return { type: 'responded', message: decision.message }
}
```

`rejectAllPendingReviews`（`:227-239`）保持只发 `rejected`（用户主动放弃整盘，无 respond 语义）。

导出 `respondCreativeReview`（约 `:360` 周边的 return 块）。

### A4.5 UI 接入

#### `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue:596-606`

在 approve / edit / reject 按钮组之后新增「以消息回复」入口：

- 点击展开一个 inline `<textarea>` + 「发送」按钮（复用已有 reject 流程的输入框模式）
- 发送时调 `creativeReviewStore.respondCreativeReview(item.id, message)`
- textarea 空时按钮禁用
- 按钮文案 i18n：`'以消息回复' / 'Reply with feedback'`

UI 复用现有 reject 输入框模式，避免新引入弹层组件。

---

## B3 — `TaskToolCompatMiddleware` 注释补全

### B3.1 文件头部 JSDoc

#### `electron/ai/runtime/TaskToolCompatMiddleware.ts:1` 之前新增

```ts
/**
 * TaskToolCompatMiddleware
 *
 * 处理 deepagents `task` 工具的两类兼容性问题：
 *
 * 1. `prompt → description` 归一化（wrapToolCall :68-85）
 *    deepagents 的 task 工具 schema 仅声明 `description` + `subagent_type` 两个参数
 *    （node_modules/deepagents/dist/index.js:2306-2309），但部分模型（DeepSeek、
 *    早期 GPT-4o）会幻觉出 `prompt` 字段。这里把 prompt 内容并入 description，
 *    避免子代理因参数名错位收到空 brief。
 *
 * 2. Planner 子代理输出 schema 校验（wrapToolCall :92-101）
 *    虽然 buildPlannerSubAgent 已声明 `responseFormat: PlannerResponseSchema`，
 *    但 deepagents `createTaskTool` 在常规工具调用路径（即 config.toolCall?.id 存在）
 *    只通过 returnCommandWithStateUpdate 返回 messages，**不会**把 structuredResponse
 *    JSON-stringify 后回灌给父代理（参见 node_modules/deepagents/dist/index.js:2274-2302）。
 *    因此 langchain `responseFormat` 仅在「直接调用 subagent.invoke」的边路生效，
 *    `task` 工具下完全不生效。本中间件的 JSON.parse + Zod safeParse 是
 *    实际唯一拦截 planner 非法输出的关卡，不能删除。
 */
```

### B3.2 验证支撑测试（可选）

先 `grep "vitest\|jest" package.json` 确认测试基建，若存在则新建 `electron/ai/runtime/__tests__/TaskToolCompatMiddleware.spec.ts`：

- mock 返回非 JSON 内容的 task result，断言 middleware 返回 `buildPlannerError`
- mock 返回合法 PlannerResponseSchema JSON 的 result，断言原样透传
- mock args 含 `prompt` 字段，断言 description 合并、prompt 字段被剥

若无测试基建，手测覆盖。

---

## 受影响文件清单

### 新建（1）

- `electron/ai/runtime/HumanRespondMessageMiddleware.ts` — RESPOND_MARKER 常量导出 + middleware 工厂

### 修改（5）

| 文件 | 改动 |
|---|---|
| `electron/ai/ipc/protocol.ts:95-101` | `ResumeDecision.type` 增 `'responded'` |
| `electron/ai/AgentEngine.ts:384-401` | `resumeRun` 决策映射增 `responded` 分支 + RESPOND_MARKER import |
| `electron/ai/AgentEngine.ts:660-663` | middleware 数组追加 `createHumanRespondMessageMiddleware()` |
| `electron/ai/runtime/TaskToolCompatMiddleware.ts` | 文件头部 JSDoc（B3 注释补全，代码行为不变） |
| `src/ai/store/modules/creativeReview.ts` | `CreativeReviewDecision` 联合扩展、`maybeFlushResume` 分支、`respondCreativeReview` 新增与导出 |
| `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue` | 增「以消息回复」按钮 + inline textarea |

### 不动（确认无需修改）

- `electron/ai/domain/edit/buildEditCapabilities.ts` — Edit HITL 不接入 respond（Phase 3 范围决策）
- `electron/ai/domain/creative/buildCreativeCapabilities.ts:80-97` — `interruptOn.allowedDecisions` 不改（底层仍走 reject 通道）
- `electron/ai/runtime/ThreadRuntimeStore.ts` — `interrupted.actionNames` 已就绪
- `src/ai/store/modules/editReview.ts` — Edit HITL UI 不变

**总计：1 新建 + 5 修改（6 文件）。**

---

## 验证清单

### 静态检查

```bash
npm run lint && npm run type-check
```

重点：`ResumeDecision.type` 扩展后所有 mapper 完整覆盖；`CreativeReviewDecision` 联合在 store 内全部分支覆盖。

### 端到端测试

**1. 单 respond 决策（Creative HITL）**
- 新建 creative 线程，触发 planner subagent HITL 拦截
- UI 点「以消息回复」→ 输入「方案太抽象，请给出具体章节标题」→ 发送
- 预期：agent 继续推理；UI 流式输出正常
- 临时 log 验证：lgDecisions[0].type === 'reject' && message.startsWith(RESPOND_MARKER)；HumanRespondMessageMiddleware rewritten ToolMessage 无 `status: "error"`

**2. 混合批次（approve + respond + rejected 同一中断）**
- 触发 ≥3 个 review 的 round
- 第一条 approve、第二条 respond「请把第二条改成 X」、第三条 reject
- 预期：所有 review 同时解除，langchain HITL 不报「decisions count mismatch」

**3. 空消息防御**
- textarea 空时按钮禁用（UI 层）
- 绕过时：`AgentEngine responded` 分支 throw，console.error 可见

**4. 三模式回归基线**
- Edit 模式：edit_block HITL（approve / edit / reject）无回归
- Creative 模式：原三类操作仍正常
- Minimal 模式：无 HITL 路径，不受影响

**5. B3 — planner 校验仍生效**
- 临时改 `buildPlannerSubAgent` 返回非 JSON，断言 TaskToolCompatMiddleware 返回 buildPlannerError

---

## 风险与回滚

| 风险 | 触发条件 | 处理 |
|---|---|---|
| HumanRespondMessageMiddleware 未覆盖 content blocks 形态（如 Anthropic 工具 result） | respond 后 LLM 仍把消息当 error | 将 `messageContentToText`（TaskToolCompatMiddleware 内已有）抽到 shared util，HumanRespondMessage 复用，覆盖 content blocks |
| langgraph state 残留 marker 字符串 | 多轮对话调试日志混乱 | 中间件名清晰；可选 Phase 4 再做 `RemoveMessage` 清理 |
| langchain 未来版本改变 HITL ToolMessage 创建逻辑 | resumeRun 报错 | 版本锁；监控 `langchain/dist/agents/middleware/hitl.js:265-305` |
| respond 视觉与 reject 相同（badge 混淆） | 用户误读状态 | 暂复用 rejected 视觉；Phase 5 UX 优化时独立 badge |
| planner 校验测试基建缺失 | 无 CI 自动覆盖 | Phase 3 内手测；测试基建建设留 Phase 4 |

**回滚策略**：git revert PR。改动点相互独立，可分文件回滚，建议整体回滚保持一致性。

---

## 实施顺序

1. **A4.1** — `protocol.ts` 类型扩展（先 land 让 TS 推断稳定）
2. **A4.2** — `HumanRespondMessageMiddleware.ts` 新建 + `AgentEngine.ts` middleware 数组挂载
3. **A4.3** — `AgentEngine.resumeRun` 增 `responded` 分支
4. **A4.4 + A4.5** — store + UI 同步上线
5. **B3** — `TaskToolCompatMiddleware.ts` 文件头 JSDoc（可并行于 1-4）
6. **验证清单全跑** → 通过后开 PR

---

## 不在 Phase 3 范围（留 Phase 4+）

- B1 — 生产 middleware 栈（summarization / modelRetry / modelFallback / modelCallLimit / toolCallLimit，Phase 4）
- B4 — CheckpointerAdmin 封装（Phase 4）
- B5 — AGENTS.md 按 domain 拆分（Phase 4）
- A4 扩展 Edit HITL（Phase 5 视用户反馈再加）
- C1 — 编辑工具体执行路径决策（开放问题，未排期）
- Phase 5 — DomainStrategy 解耦
