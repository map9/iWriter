# Phase 1 — 上下文与流接口对齐（A1 + A2）

## Context

`design/agentrefactor/refactor.md` 列出 iWriter AI 引擎与 deepagents 官方推荐的偏差。Phase 1 处理最基础的两项 A 组偏差：

- **A1**：运行时上下文通过 LangGraph `configurable` 注入字符串 key，工具内 `getRuntimeString(...)` 读取无类型保障；子代理不能自动继承 `active_file_path` / `output_language`；官方可能未来弱化 `configurable` 路径，埋下升级风险。
- **A2**：`agent.streamEvents` 用 v2，subagent 嗅探依赖 `run_name` / metadata 启发式，脆弱。当前实现实际**没有**做 subagent 嗅探（refactor.md 描述与代码现状有出入），混在一起处理。

Phase 1 不动业务语义，纯接口对齐，为后续 Phase（DeepSeek 替换、HITL 扩展、生产中间件栈、DomainStrategy 解耦）提供类型安全与流分离的基础。

**关键决策**：
1. A1 + A2 合并为单 PR（共享端到端三模式回归基线）
2. Subagent chunk 颗粒度：仅新增 `subagent_start` / `subagent_end` 两类；内部 text/thinking/tool_call 沿用现有 chunk 但增加可选 `subagentName` 字段
3. 不引入 `IWRITER_STREAM_V2_FALLBACK` 双轨开关，直接切 v3、删除 v2 路径（回滚策略：git revert PR）
4. 不做原型验证，运行期回归测试覆盖 v3 中断捕获

---

## A1 — Context 类型化设计

### 新建 `electron/ai/runtime/AgentContext.ts`

```ts
import { z } from 'zod'

export const IWriterAgentContextSchema = z.object({
  threadId: z.string(),
  agentDomain: z.enum(['editing', 'creative']),
  activeFilePath: z.string().nullable(),
  workspacePath: z.string().nullable(),
  outputLanguage: z.string(),                  // 空串表示未检测
  attachedTextFilePaths: z.array(z.string()),
  attachedBinaryFilePaths: z.array(z.string()),
  attachedDirectories: z.array(z.string()),
})
export type IWriterAgentContext = z.infer<typeof IWriterAgentContextSchema>
```

命名约定：context schema 内字段全部 camelCase。`threadId` 入 schema 用于工具日志/审计；`configurable.thread_id` 仍冗余保留（LangGraph checkpointer 强依赖）。`agentDomain` 保留作为子代理自检 hook 点。

### `ThreadRuntimeStore` 改造

`electron/ai/runtime/ThreadRuntimeStore.ts`：

- 新增 `buildContext(threadId, domain): IWriterAgentContext`，从 `getContext(threadId)` 读 `ThreadExecutionContext` 后映射为 schema 字段
- 收缩 `buildConfigurable` 仅返回 `{ thread_id: threadId }`
- 保留现有 `getContext` / `setContext` / `deleteThread` 等 API

### `AgentEngine` 改造

`electron/ai/AgentEngine.ts`：

- `_buildRunConfigurable` 收缩为只返回 `{ thread_id }`；新增 `_buildRunContext(threadId, domain): IWriterAgentContext`
- `createDeepAgent` 调用（约 :649）增加 `contextSchema: IWriterAgentContextSchema`
- `_runSession` / `_continueSession` 的 `runConfig` 新增 `context` 字段：

```ts
const runConfig = {
  configurable: { thread_id: threadId },
  context: this._buildRunContext(threadId, domain),
  signal: abortController.signal,
  recursionLimit: 100,
  version: 'v3' as const,
}
```

### 工具改造（7 文件，单行替换）

**统一改为直接 `runtime.context.xxx`，不引入额外 helper**。deepagents 的 `contextSchema` 推断链已经把 `runtime.context: IWriterAgentContext` 传到工具体，inline 访问即类型安全。

| 文件 | 改动 |
| --- | --- |
| `electron/ai/tools/DocumentTools.ts:22` | `getRuntimeString(runtime, 'active_file_path')` → `runtime.context.activeFilePath` |
| `electron/ai/tools/CreativeTools.ts:41` | `getRuntimeString(runtime, 'workspace_path')` → `runtime.context.workspacePath` |
| `electron/ai/tools/CreativeLogicTools.ts:21` | 同上 |
| `electron/ai/tools/CreativeGitTools.ts:26` | 同上 |
| `electron/ai/tools/CreativeExplorationTools.ts:11` | 同上 |
| `electron/ai/tools/CreativeAdvisorTools.ts:12` | 同上 |
| `electron/ai/tools/CreativeAnalysisTools.ts:13` | 同上 |

### 删除 `electron/ai/tools/runtimeHelpers.ts`

`getRuntimeString` 全部下线，`getRuntimeStringArray` 当前 0 调用——整个文件可删。

---

## A2 — streamEvents v3 迁移设计

### v3 接口确认

deepagents `1.10.2` 暴露的 `streamEvents(..., { version: 'v3' })` 返回 `DeepAgentRunStream`（`node_modules/deepagents/dist/index.d.ts:2752`），扩展自 langgraph `AgentRunStream`，提供：

- `run.messages: AsyncIterable<ChatModelStream>` — 每条消息含 `.text` / `.reasoning` 子流
- `run.toolCalls: AsyncIterable<ToolCallStream>` — `.input` / `.output` / `.status`
- `run.subagents: AsyncIterable<SubagentRunStream>` — `.name` 字面量 union 命中 `'planner' | 'consistency' | 'explorer'`
- `run.values` / `run.output` / `run.signal` / `run.abort()`
- `run.interrupted: boolean` / `run.interrupts: readonly InterruptPayload[]` —— langgraph `AgentRunStream` getter（`@langchain/langgraph/dist/stream/run-stream.d.ts:139-149`）

### `_streamLoop` 重写

`electron/ai/AgentEngine.ts:458-532`（保守估计行号）。三个独立协程并行消费，IPC chunk 通过同一 channel 串行化发送：

```ts
private async _streamLoop(threadId, agent, input, runConfig) {
  const run = await agent.streamEvents(input, { ...runConfig, version: 'v3' })
  const adapter = new StreamEventAdapter(threadId, this.rendererBridge)
  await Promise.all([
    adapter.consumeMessages(run.messages),
    adapter.consumeToolCalls(run.toolCalls),
    adapter.consumeSubagents(run.subagents),
  ])
  await run.output.catch(() => { /* signal abort 时静默 */ })
  if (run.interrupted) {
    return this._handleInterrupt(threadId, run.interrupts[0]?.value, adapter.buildPartialMessage(turnId))
  }
  // 正常完成路径
}
```

Renderer 已能容忍 chunk 跨子流乱序（thinking / text / tool_call 各自独立 sink），不需要 mux/queue。

### `StreamEventAdapter` 重写

`electron/ai/ipc/StreamEventAdapter.ts` 完全重写为类，按子流职责拆分：

- `consumeMessages(stream: AsyncIterable<ChatModelStream>)` — 内部嵌套 `for await (chunk of message.text)` 和 `for await (chunk of message.reasoning)`；对未被 v3 normalize 的 reasoning 编码保留 4 种 fallback 解码（Anthropic `thinking`、OpenAI Responses `reasoning`、DeepSeek `additional_kwargs.reasoning_content`、OpenAI o1 `additional_kwargs.reasoning.summary[].text`）抽到静态方法 `decodeFallbackReasoning`
- `consumeToolCalls(stream: AsyncIterable<ToolCallStream>)` — 复用现有 `inferToolKind` / `extractToolResult` 逻辑，发 `tool_call_start` / `tool_call_end`
- `consumeSubagents(stream: AsyncIterable<SubagentRunStream>)` — 收到 subagent 即发 `subagent_start { subagentName, taskInput }`；内部递归调 `consumeMessages` / `consumeToolCalls` 但 chunk 携带 `subagentName`；结束发 `subagent_end { subagentName, output }`
- `buildPartialMessage(turnId)` — 提供中断时未完成 message 的快照（沿用现有快照构造逻辑）

中断检测从 `__interrupt__` 探针迁移到 `run.interrupted` getter 检查；旧的 `on_chain_stream` / `on_chain_end` 嗅探代码全部删除。

### Protocol 扩展

`electron/ai/ipc/protocol.ts`：

```ts
export type StreamChunkEvent =
  | { type: 'text'; threadId; turnId; delta; subagentName?: string }
  | { type: 'thinking'; threadId; turnId; delta; subagentName?: string }
  | { type: 'tool_call_start'; threadId; turnId; toolCallId; toolCall; subagentName?: string }
  | { type: 'tool_call_end'; threadId; turnId; toolCallId; toolCall; subagentName?: string }
  | { type: 'subagent_start'; threadId; turnId; subagentName: string; taskInput: unknown }
  | { type: 'subagent_end'; threadId; turnId; subagentName: string; output: unknown }
```

`subagentName` 在主 agent chunk 上保持 `undefined`，在 subagent 内部 chunk 上必填。

### Renderer 同步

`src/ai/store/ai.ts`（约 :701 onStreamChunk 处）：

- 现有 4 类 chunk handler 增加 `if (chunk.subagentName)` 分流到 SubAgentBubble 已有结构
- 新增 `subagent_start` / `subagent_end` 两类 handler，在 ThreadMessage 上挂载 subagent 子任务进度结构

`src/types/electron-api.ts:141` 同步类型。

### TaskToolCompatMiddleware 处置

`runtime/TaskToolCompatMiddleware.ts` 当前做 `prompt → description` 归一化 + planner 输出 schema 校验。**Phase 1 内不动**——deepagents v3 原生 `createSubagentTransformer` 在 `__native: true` 链上，与 user middleware 不冲突；planner schema 校验是否被 v3 自动接管留到 Phase 3 处理（refactor.md B3）。

---

## 受影响文件清单

### 新建（1）

- `electron/ai/runtime/AgentContext.ts` — Zod schema + 类型导出

### 重写（2）

- `electron/ai/ipc/StreamEventAdapter.ts` — 从事件分派改为子流投影消费（类化、三个 consume 方法）
- `electron/ai/AgentEngine.ts:_streamLoop` 及周边 — v3 投影、`run.interrupted` 中断检测、`runConfig.context` 注入、`createDeepAgent({ contextSchema })`

### 修改（10）

- `electron/ai/runtime/ThreadRuntimeStore.ts` — 新增 `buildContext`，`buildConfigurable` 收缩
- `electron/ai/ipc/protocol.ts` — `StreamChunkEvent` 扩展（subagent_start/end + subagentName 字段）
- `electron/ai/tools/DocumentTools.ts` — `runtime.context.activeFilePath`
- `electron/ai/tools/CreativeTools.ts` / `CreativeLogicTools.ts` / `CreativeGitTools.ts` / `CreativeExplorationTools.ts` / `CreativeAdvisorTools.ts` / `CreativeAnalysisTools.ts` — `runtime.context.workspacePath`
- `src/ai/store/ai.ts` — chunk handler 处理 subagentName 分流 + 新增 subagent_start/end
- `src/types/electron-api.ts` — chunk 类型同步

### 删除（1）

- `electron/ai/tools/runtimeHelpers.ts`

**总计：14 文件改动**。

---

## 验证策略

### 1. lint & type-check

```
npm run lint && npm run type-check
```

重点关注：
- 删除 `runtimeHelpers.ts` 后是否有遗漏 import
- `runtime.context.*` 在工具体内是否被正确推断（若推断失败，给 `tool(fn, {...})` 第二参数显式标 runtime 泛型）

### 2. 端到端三模式回归

- **Edit 模式**：打开 Markdown 文件 → "给第二段扩写" → 走 `edit_block` HITL → 验证 `run.interrupted === true` 触发 `_handleInterrupt` → 审批通过 → TipTap 应用变更 → 无回归
- **Creative 模式**：新建创作线程 → `task(subagent_type=planner, prompt='生成大纲')` → renderer SubAgentBubble 收到 `subagent_start` → 流式 thinking / text → `subagent_end` 带最终 output → 主 agent 继续推理；同样跑 consistency 与 explorer
- **Minimal 模式**：纯文本对话 + thinking 流（DeepSeek / Anthropic / Gemini 各一次），确认 4 种 reasoning 编码全部正确显示

### 3. 工具上下文验证

在 edit / creative 模式各随机触发一个工具调用，断言 `runtime.context.activeFilePath` / `workspacePath` / `outputLanguage` 与预期一致；调 planner subagent 内的工具，断言 context 自动继承（不需额外注入）。

---

## 风险与回滚

| 风险 | 触发条件 | 处理 |
| --- | --- | --- |
| `run.interrupts` 在 v3 实际未填充 | edit_block HITL 不触发中断处理 | git revert PR；同时上报 deepagents issue |
| 子代理工具拿不到 context | tool 内 `runtime.context` 为 undefined | 检查 deepagents `subAgents` 是否真的透传 context；若否，临时在 buildSubAgent 时显式继承父 context |
| 4 种 thinking 编码中 o1 路径丢失 | UI thinking 空白 | fallback 解码已保留，bug 路径会自动覆盖 |
| Chunk 跨子流乱序导致 UI 错乱 | thinking 与 text 交错错位 | Renderer 各 sink 独立无需顺序保证；若特定场景出问题，再加 mux |
| v3 experimental 接口在 patch 版本破坏 | 升级 deepagents 后构建失败 | `package.json` 锁 `"deepagents": "1.10.2"`（去掉 `^`） |

**版本锁**：实施时同步把 `package.json` 的 `"deepagents"` 由 `^1.10.2` 改为 `1.10.2`，等 v3 标 stable 后再放开。
