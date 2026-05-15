# Deep Agents JS 对齐重构方案

> 基于 deepagents JS 官方文档（overview / customization / human-in-the-loop / context-engineering / subagents / skills / event-streaming / going-to-production）与代码库逐条比对，记录当前实现的偏差与分阶段对齐路线。
>
> 如遇版本疑问，以 deepagents `^1.10.2` + `@langchain/core ^1.1.35` 为基准。

---

## 一、现状速览

### 1.1 createDeepAgent 入口

单一入口位于 `electron/ai/AgentEngine.ts:649`（`_getOrCreateAgent`）：

```ts
const agent = createDeepAgent({
  model,                            // BaseChatModel，来自 ModelFactory
  systemPrompt,                     // 静态常量 / buildCreativeSystemPrompt(language)
  tools: capabilities.tools,        // StructuredTool[]
  backend: capabilities.backend,    // CompositeBackend
  skills: capabilities.skills,      // ['/skills/']（creative）或 []
  memory: [path.join(aiRootPath, 'memory', 'AGENTS.md')],
  checkpointer: sqliteSaver,
  interruptOn: capabilities.interruptOn,
  subagents: capabilities.subAgents,
  middleware: [createTaskToolCompatMiddleware()],
})
```

agent 实例按 `threadId:configId:domain:mode:modelId:...` 指纹缓存，凭证或挂载变更时失效重建。所有调用统一走 `agent.streamEvents(input, { ...runConfig, version: 'v2' })`，无 `agent.invoke` 路径。

### 1.2 Capabilities 工厂

| 域 | 工具 | Backend | 子代理 | interruptOn | Skills | Sys Prompt |
|---|---|---|---|---|---|---|
| **edit** | DocumentTools + EditProposalTools | CompositeBackend(FS + 附件) | 无 | 5 个 block-edit 工具 | [] | `EDIT_SYSTEM_PROMPT` |
| **creative** | ~30 个创作工具 | CompositeBackend(WorkspaceFS + /skills/) | planner / consistency / explorer | 16 个创作工具 | ['/skills/'] | `buildCreativeSystemPrompt(language)` |
| **minimal** | 无 | 默认 | 无 | 无 | [] | `MINIMAL_SYSTEM_PROMPT` |

### 1.3 自定义层一览

| 组件 | 文件 | 作用 | 是否标准 deepagents |
|---|---|---|---|
| `ChatDeepSeek` | `providers/ChatDeepSeek.ts` | DeepSeek HTTP 客户端，全量自实现（634 行） | 否，官方有 `@langchain/deepseek` |
| `ModelFactory` | `providers/ModelFactory.ts` | provider 分派 + ModelProfile 注入 | 自定义包装 |
| `TaskToolCompatMiddleware` | `runtime/TaskToolCompatMiddleware.ts` | `task` 工具参数归一化 + planner 输出校验 | 自定义 middleware |
| `WorkspaceFilesystemBackend` | `runtime/WorkspaceFilesystemBackend.ts` | 路径白名单 + 创作写入限制 | 自定义 Backend |
| `AttachedFileBackend` | `runtime/AttachedFileBackend.ts` | 单文件挂载沙箱 | 自定义 Backend |
| `StreamEventAdapter` | `ipc/StreamEventAdapter.ts` | v2 事件 → renderer chunk，兼容 4 种 thinking 编码 | 自定义适配 |
| `ThreadRuntimeStore` | `runtime/ThreadRuntimeStore.ts` | per-thread 上下文存储，输出到 configurable | 部分偏离（见 A1） |
| `SnapshotBroker` | `document/SnapshotBroker.ts` | IPC 往返取 TipTap 快照 | iWriter 专用 |
| `SubAgent × 3` | `domain/creative/subAgents/` | planner / consistency / explorer | 标准 deepagents SubAgent |

---

## 二、偏差矩阵

### A 组 — 必须对齐（影响升级路径或类型安全）

#### A1 — 运行时上下文通过 configurable 注入

**当前实现**  
`ThreadRuntimeStore.buildConfigurable`（`:32-44`）把 `active_file_path`、`workspace_path`、`output_language`、`attached_*_paths` 写入 LangGraph `configurable`。工具内通过 `getRuntimeString(runtime.config.configurable, key)` 字符串 key 读取，无类型保障。

**官方推荐**（context-engineering 文档）  
使用 `contextSchema`（Zod）定义上下文 schema，调用时传入：
```ts
await agent.invoke(input, { context: { activePath, workspacePath, outputLanguage, attachedPaths } })
```
工具内通过 `runtime.context.activePath` 类型安全读取，且自动透传至子代理。

**影响**  
- 子代理目前不能自动继承 `active_file_path` / `output_language`；每个子代理需单独传 configurable
- `getRuntimeString` 存在 typo 就静默返回空值（无类型检查）
- 官方可能在未来版本弱化或改写 `configurable` 注入路径，埋下升级风险

**调整目标**  
定义 `IWriterAgentContext` Zod schema；将 `buildConfigurable` 改为 `buildContext`；所有工具改为 `runtime.context.*` 读取。

---

#### A2 — streamEvents 使用 v2

**当前实现**  
`AgentEngine.ts:466` — `agent.streamEvents(input, { ...runConfig, version: 'v2' })`。`StreamEventAdapter` 手动解析原始 LangGraph 事件区分 subagent 流，逻辑复杂（`on_chain_stream` metadata 嗅探）。

**官方推荐**（event-streaming 文档）  
`version: 'v3'` 提供结构化分流：
```ts
const stream = await agent.streamEvents(input, { version: 'v3' })
for await (const subagent of stream.subagents) { ... }
```
subagent 流、消息流、工具调用流各自独立，无需 metadata 嗅探。

**影响**  
- v2 下区分 coordinator 与 subagent 事件依赖 run_name / tags 前缀，脆弱
- v3 subagent 流中带有 `subagent.name`，层次清晰

**调整目标**  
StreamEventAdapter 迁移到 v3 事件 API，重写 subagent 事件消费逻辑。

---

#### A3 — ChatDeepSeek 634 行自实现可替换

**当前实现**  
`electron/ai/providers/ChatDeepSeek.ts`：直接继承 `BaseChatModel`，自实现 HTTP fetch、流式解析、tool_call 转换、reasoning_content 提取、usage 翻译、orphan 清理等全部逻辑，634 行。

**官方推荐**  
`@langchain/deepseek@1.0.25`（LangChain 官方，2 周前发布，43 个版本迭代）：
- 继承 `ChatOpenAICompletions`，自动复用 OpenAI 兼容层
- 原生支持 `reasoning_content` 流 + `<think>` 标签解析
- 维护者为 LangChain core team
- 体量约 17KB，iWriter 自实现为约 25KB（含 map）

**DeepSeek 特有需验证项**（替换前需确认官方包覆盖度）

| 特性 | 自实现 | 官方包 | 处理 |
|---|---|---|---|
| `reasoning_content` 流式 | ✓ | ✓ 原生支持 | 直接替换 |
| `<think>` 标签解析 | ✓ | ✓ 原生支持 | 直接替换 |
| `body.thinking = { type: 'enabled' }` | ✓ 硬编码 | 待验证 | 若缺失用 `modelKwargs` / `extraBody` 注入 |
| `reasoning_effort: 'high' \| 'max'` 映射 | ✓ | 待验证 | 若缺失加薄包装 |
| `cached_tokens` / `reasoning_tokens` usage 翻译 | ✓ | 待验证（ChatOpenAICompletions 已有基础翻译） | 按需补 |
| orphan tool_call 清理（DeepSeek 400 拒绝） | ✓ 在 convertMessages 内联 | ✗ 官方保留而非清理 | 抽为通用 middleware（A5） |

**替换兜底**：若任何一项不可用且无 hook，保留 ChatDeepSeek 但缩减为对官方 `ChatDeepSeek` 的最小扩展（继承 override 目标方法），而非另起炉灶。

---

#### A4 — HITL 缺少 respond 决策类型

**当前实现**  
`AgentEngine._continueSession`（`:380-406`）仅映射 `approve / edit / reject`。`src/ai/types.ts ResumeDecision` 类型同样只有三种。

**官方推荐**（human-in-the-loop 文档）  
支持第四种决策：
```ts
{ type: 'respond', message: '请把标题改成更简短的版本' }
```
该决策让工具收到人类回复作为 ToolMessage，工具体本身不执行，agent 据此继续推理。

**影响**  
- Creative 模式的人工审批无法"以文字回复工具，引导下一步"，只能全盘拒绝再重新输入
- Edit 模式偶尔也需要"告知 agent 修改意图"而非直接拒绝

**调整目标**  
扩展 `ResumeDecision` 类型；映射新分支；UI 增加"以消息回复"操作（Creative HITL 优先接入）。

---

#### A5 — 孤儿 tool_call 清理耦合在 ChatDeepSeek

**当前实现**  
`ChatDeepSeek.ts:570-625 convertMessages`：遍历历史消息，找出无对应 ToolMessage 的 tool_call_id 并剔除，防止 DeepSeek 400 拒绝。逻辑内联于一个 provider，无法复用。

**问题**  
- Anthropic 同样在特定条件下拒绝孤儿 tool_calls（超过 context 被截断后）
- 替换 ChatDeepSeek 为官方包后，该保护消失
- 其他 provider 若有同类严格限制，需各自重写

**调整目标**  
提取为 `createOrphanToolCallStripperMiddleware()`（`runtime/OrphanToolCallStripperMiddleware.ts`），在 middleware 链中配置；deepseek / anthropic 均启用。

---

### B 组 — 可改进（影响稳定性与可观测性）

#### B1 — 缺少生产中间件栈

**当前实现**  
只有 `createTaskToolCompatMiddleware()`（`AgentEngine.ts:659`）。

**官方推荐**（going-to-production 文档）  
生产环境需要：

| middleware | 作用 | 优先级 |
|---|---|---|
| `summarizationMiddleware` | 长会话压缩，防 context 溢出 | **高**（deepagents 迁移决策原始承诺的能力） |
| `modelRetryMiddleware` | 瞬时错误自动重试（指数退避） | 高 |
| `modelFallbackMiddleware` | 主模型不可用时切备用 | 中 |
| `modelCallLimitMiddleware` | 限制单 run LLM 调用次数（防 runaway） | 中 |
| `toolCallLimitMiddleware` | 限制单 run 工具调用次数 | 中 |

**调整目标**  
Phase 4 补齐，顺序为：`[summarization, modelRetry, modelFallback, modelCallLimit, toolCallLimit, orphanStripper, taskToolCompat]`。

---

#### B2 — execute 工具屏蔽使用反射黑魔法

**当前实现**  
`buildCreativeCapabilities.ts:38-42`：
```ts
Object.defineProperty(backend, 'id', { get: () => undefined })
```
目的：骗过 deepagents `isSandboxBackend()` 检查，阻止自动注入 `execute` 工具。

**问题**  
依赖内部 duck-typing 实现，deepagents 升级时易碎。

**调整目标**  
改用非 sandbox backend 类型组合（使用不触发 `isSandboxBackend` 的 backend），或在 deepagents 支持的情况下通过显式配置禁用 execute 工具。

---

#### B3 — TaskToolCompatMiddleware planner 校验可能重复

**当前实现**  
`TaskToolCompatMiddleware.ts:92-101`：当 `subagent_type === 'planner'` 时，解析工具结果，若不符合 `PlannerResponseSchema` 则注入重试指令。

**但 `subAgents/planner.ts:55`** 已声明 `responseFormat: PlannerResponseSchema`，deepagents 框架理论上应自动做 schema 校验。

**需要验证**  
写 minimal repro 测试 planner subagent `responseFormat` 是否真正被 deepagents 强制（Zod 校验失败时是否自动重试）。

- **若生效**：删除 middleware 中的 planner 校验段，保留 `prompt → description` 归一化（该部分处理模型 hallucinate 参数名，仍然必要）
- **若不生效**：保留并补充注释说明 deepagents 当前版本不强制 responseFormat

---

#### B4 — SqliteSaver 直接 DELETE 绕过 API

**当前实现**  
`AgentEngine.ts:135-156`：`(saver as any).db ?? (saver as any).conn` 拿到 better-sqlite3 Database 对象，手动执行 DELETE 语句清理 checkpoint 和 writes。

**问题**  
- `any` 类型断言遮蔽升级风险
- SqliteSaver 内部字段名变更则静默失效

**调整目标**  
封装 `electron/ai/runtime/CheckpointerAdmin.ts`，暴露类型安全的 `deleteThread(threadId)` / `clearAll()` 方法；`AgentEngine` 改为调用 admin，`any` 收拢到 admin 内部。同时跟进 SqliteSaver 是否在新版本提供官方 delete API。

---

#### B5 — 单 AGENTS.md 不区分 domain

**当前实现**  
`AgentEngine.ts:655`：`memory: [path.join(aiRootPath, 'memory', 'AGENTS.md')]`，edit / creative 共用同一份。

**调整目标**  
按 domain 拆分为 `AGENTS.edit.md` / `AGENTS.creative.md`；`_buildAgentCapabilities` 内按 domain 选取对应文件传入 `memory: [...]`。

---

### C 组 — 架构性可接受偏离（不修改，写入说明）

#### C1 — 编辑工具体为 stub，Renderer 在 ai:resume 前 mutate TipTap

**现状**  
`EditProposalTools.ts:18-22` 工具体只返回成功字符串；实际 TipTap 变更由 Renderer 在收到审批决策后、发送 `ai:resume` 前异步执行。

**TipTap 在渲染进程的硬约束**  
这是当前实现的根本原因：TipTap 编辑器运行在 Electron Renderer，主进程工具体无法直接调用其 API。

**开放问题（⚠️ 待决定）**  
下列两条路径尚未选定：

1. **保留现状（Renderer 先 mutate，工具体确认）**：工具体仅作"审批完成"回执。HITL `edit` 决策修改的 args 无法影响实际变更（因为变更已经发生）。需补全注释说明此约定，防止未来维护者误解。

2. **改为工具体内 IPC 触发（主进程调渲染进程）**：工具体通过 `RendererEventBridge` 发 IPC 请求执行变更，等待返回结果后才 resolve 工具调用。符合 deepagents 标准语义，启用 `edit` 决策的 args 传递。改动较大，需评估 IPC 延迟与错误处理。

#### C2 — WorkspaceFilesystemBackend / AttachedFileBackend 路径白名单

安全性硬约束，无需修改。

#### C3 — Block-aware 文档工具完全替换 deepagents 原生 fs 操作

iWriter 文档非纯文本，使用 TipTap JSON 表示，block-aware 工具（`edit_block` / `insert_block` / ...）是正确抽象，无需修改。

---

## 三、分阶段重构计划

### Phase 1 — 上下文与流接口对齐（A1 + A2）

**前置条件**：无。是最低风险的基础改造，为后续 Phase 提供类型安全基础。

**新建**
- `electron/ai/runtime/AgentContext.ts` — `IWriterAgentContext` Zod schema + 类型导出

**修改**
- `electron/ai/runtime/ThreadRuntimeStore.ts` — `buildConfigurable` → `buildContext()`，返回 `IWriterAgentContext` 实例
- `electron/ai/AgentEngine.ts:424-478` — `streamEvents` 调用改为 `version: 'v3'`；传入 `context` 字段代替 configurable 内的自定义 key
- `electron/ai/tools/runtimeHelpers.ts` — 提供 `getContext(runtime): IWriterAgentContext` 类型安全入口
- `electron/ai/tools/DocumentTools.ts`、`EditProposalTools.ts`、`CreativeTools.ts`（及所有其他 tools/*.ts）— `getRuntimeString(runtime.config.configurable, ...)` 改为 `getContext(runtime).xxx`
- `electron/ai/ipc/StreamEventAdapter.ts` — 迁移到 v3 事件 API，重写 subagent 流消费

**风险**：v3 事件结构变化较大，需在改造前建立回归基线（三模式各一次文本 + 工具调用 + 中断）。

---

### Phase 2 — DeepSeek 与 middleware 对齐（A3 + A5 + B2）

**前置条件**：Phase 1 完成（v3 streaming 路径稳定后再改 provider）。

**安装**
- `@langchain/deepseek@^1.0.25`

**新建**
- `electron/ai/runtime/OrphanToolCallStripperMiddleware.ts` — 基于 `createMiddleware` 的通用孤儿 tool_call 清理

**修改**
- `electron/ai/providers/ModelFactory.ts:124-138` — deepseek 分支改为实例化 `@langchain/deepseek` 的 `ChatDeepSeek`
- `electron/ai/AgentEngine.ts:659` — middleware 数组加入 `createOrphanToolCallStripperMiddleware()`（deepseek / anthropic provider 时启用）
- `electron/ai/domain/creative/buildCreativeCapabilities.ts:38-42` — 移除 `Object.defineProperty` hack，改用正确的 backend 组合

**删除**
- `electron/ai/providers/ChatDeepSeek.ts`（完整确认官方包覆盖度后删除）

**验证项**（Phase 2 完成前必须全部 pass）
1. DeepSeek 模型的 `reasoning_content` 仍流到 UI thinking 通道
2. `body.thinking` + `reasoning_effort` 参数正确下发（若官方包不支持，用 `extraBody` 注入）
3. usage_metadata `cached_tokens` / `reasoning_tokens` 正确翻译
4. ModelProfile（`getDefaultDeepSeekProfile`）注入路径正常
5. 中断恢复时孤儿 tool_call 不再造成 DeepSeek 400

---

### Phase 3 — HITL 决策扩展与子代理收敛（A4 + B3）

**前置条件**：Phase 1 完成（context 类型体系稳定后再改 HITL 路径）。

**验证**
- 写 minimal repro 跑 planner subagent，确认 `responseFormat: PlannerResponseSchema` 是否被 deepagents 强制

**修改**
- `src/ai/types.ts` — `ResumeDecision` 加 `{ type: 'respond'; message: string }` 分支
- `electron/ai/AgentEngine.ts:380-406` — `_continueSession` 决策映射加 respond 分支
- 渲染端 Creative HITL 审批 UI — 增加"以消息回复"操作

**条件修改**
- 若 planner `responseFormat` 已生效：删除 `runtime/TaskToolCompatMiddleware.ts:92-101` planner 输出校验段；保留 `prompt → description` 归一化段
- 若未生效：保留并补注释

---

### Phase 4 — 生产中间件栈与运维收敛（B1 + B4 + B5）

**前置条件**：Phase 2 完成（middleware 框架确定后再扩展中间件链）。

**新建**
- `electron/ai/runtime/CheckpointerAdmin.ts` — 封装 `deleteThread(threadId)` / `clearAll()` 替代 `(saver as any).db` 直查

**修改**
- `electron/ai/AgentEngine.ts:135-156` — 改为调用 `CheckpointerAdmin`
- `electron/ai/AgentEngine.ts:659` — middleware 链最终顺序：
  ```
  [summarization, modelRetry, modelFallback, modelCallLimit, toolCallLimit, orphanStripper, taskToolCompat]
  ```
- `electron/ai/AgentEngine.ts:655` — memory 按 domain 拆分：
  ```ts
  memory: domain === 'creative'
    ? [join(aiRootPath, 'memory', 'AGENTS.creative.md')]
    : [join(aiRootPath, 'memory', 'AGENTS.edit.md')]
  ```
- 配置：summarization 阈值 75% context window；各 provider fallback 模型各配一档

---

### Phase 5 — DomainStrategy 解耦

**前置条件**：Phase 4 完成（中间件稳定后再动 AgentEngine 架构）。

**背景**：AgentEngine 内共 4 处 `if (domain === 'creative')` 分支，`_handleInterrupt` 内含两套完全不同算法（发散性修改气味）。`RunInterruptedEvent` 同时携带 `proposals` 和 `creativeReviews` 两个平行字段，随 domain 增加不可扩展。已经正确做到 domain-agnostic 的部分（`ThreadRuntimeStore`、`StreamEventAdapter`、IPC 信封、工具层）无需改动。

**新建**
- `electron/ai/domain/DomainStrategy.ts` — `DomainStrategy` interface + `DomainBuildContext` / `InterruptContext` / `DomainInterruptPayload` 类型定义

```ts
interface DomainStrategy {
  buildCapabilities(ctx: DomainBuildContext): Promise<DomainAgentCapabilities>
  getSystemPrompt(language: string): string
  handleInterrupt(ctx: InterruptContext): Promise<DomainInterruptPayload>
  onSessionComplete?(threadId: string, meta: ThreadMeta): Promise<void>
}
```

- `electron/ai/domain/edit/EditDomainStrategy.ts` — 实现 `DomainStrategy`，封装原 `buildEditCapabilities` + Edit 中断逻辑（`SnapshotBroker` → `EditProposal[]`）
- `electron/ai/domain/creative/CreativeDomainStrategy.ts` — 实现 `DomainStrategy`，封装原 `buildCreativeCapabilities` + Creative 中断逻辑（`CreativeReviewItem[]`）+ `_recordCreativeSession`

**修改**
- `electron/ai/AgentEngine.ts` — 去除 4 处 `if (domain === 'creative')` 分支，改为策略注册表分派：
  ```ts
  private readonly strategies: Record<AiAgentDomain, DomainStrategy> = {
    editing: new EditDomainStrategy(...),
    creative: new CreativeDomainStrategy(...),
  }
  ```
  `_buildAgentCapabilities` / `getSystemPrompt` / `_handleInterrupt` / `_recordCreativeSession` 均委托给 `this.strategies[domain].xxx()`
- `electron/ai/ipc/protocol.ts` — `RunInterruptedEvent` 统一为 `reviews: DomainReviewItem[]`，移除 `proposals` / `creativeReviews` 双字段：
  ```ts
  type DomainReviewItem =
    | { kind: 'edit'; payload: EditProposal }
    | { kind: 'creative'; payload: CreativeReviewItem }
  ```
- `electron/ai/ipc/RendererEventBridge.ts` — 同步 `sendRunInterrupted` 签名
- `src/ai/types.ts` — 前端 `DomainReviewItem` 类型同步
- `src/ai/store/ai.ts` — HITL 分流改为 `review.kind` 判断

**结果**：添加第三个 domain 只需新建 `XxxDomainStrategy.ts` 并在构造函数注册，AgentEngine 本身不改动。

**IPC 过渡策略**：`DomainReviewItem` 引入时保持双字段兼容期（`reviews` 新增，旧字段临时保留），前端切换完成后再删除旧字段。

---

## 四、风险与回滚策略

| 阶段 | 主要风险 | 回滚策略 |
|---|---|---|
| Phase 1 (A2) | v3 事件结构改变导致 streaming UI 断层 | 保留 `StreamEventAdapter` v2 旧文件，feature flag 切换；Phase 1 单独 PR |
| Phase 2 (A3) | 官方 `@langchain/deepseek` 缺少某特性 | 退回最小扩展（继承官方 ChatDeepSeek 只 override 缺失方法），不回退到全量自实现 |
| Phase 2 (B2) | execute hack 移除导致 creative 意外获得 shell 权限 | 改造前先增测试确认 execute 工具是否被注入 creative agent |
| Phase 3 | respond 决策 UI 复杂度超预期 | 先仅接入 Creative HITL，Edit HITL 保持三选项 |
| Phase 4 | summarization 压缩截断关键工具调用历史 | summarization 配置 `preserve: ['tool_calls']`；阈值先设 80% 保守值 |
| Phase 5 | IPC 合约变更需前后端同步 | 双字段兼容期过渡，前端切完再删旧字段 |

---

## 五、验证清单

**每个 Phase 完成前须通过：**

```
npm run lint && npm run type-check
```

**端到端三模式回归：**

- **Edit 模式**：打开 Markdown → "给第二段扩写" → 走 `edit_block` HITL → 审批通过 → TipTap 应用 → 无回归
- **Creative 模式**：新建线程 → `task(subagent_type=planner)` → 拿到结构化计划 → TaskToolCompatMiddleware 无错误重试
- **Minimal 模式**：纯文本对话 + thinking 流（DeepSeek / Anthropic / Gemini 各跑一次）

**分阶段验证点：**

| Phase | 验证点 |
|---|---|
| 1 后 | v3 事件下 thinking / text / tool_call / subagent 子流均在 UI 正确显示；工具能正确读取 `runtime.context.*` |
| 2 后 | DeepSeek `reasoning_content` 流到 thinking 通道；中断恢复时无 400 错误；creative execute 工具未出现在 tool list |
| 3 后 | HITL 可选"以消息回复"；planner 正确返回结构化 JSON |
| 4 后 | 100+ 消息线程无 token 溢出；线程删除无 TypeError |
| 5 后 | AgentEngine 无任何 `if (domain === 'creative')` 分支；三模式端到端行为与 Phase 4 后完全一致；HITL 中断 / resume / reviews 显示无差异 |

---

## 六、开放问题（实施前需决定）

1. **C1 — 编辑工具体执行路径**（stub-then-renderer vs in-tool IPC）：影响 HITL `edit` 决策能否真正改变 args。若选 in-tool IPC，Phase 3 改造量增加约 2x。

2. **Phase 2 ChatDeepSeek 替换兜底**：若 `body.thinking={type:'enabled'}` 等参数官方包无法表达，且通过 `extraBody` 也无效，是否接受退化（关闭强制 thinking 参数，依赖模型默认行为）？

3. **Memory 拆分粒度**：domain 级（edit / creative）是否足够，还是需要进一步细分到 mode 级（edit/minimal 各一份）？

4. **新 domain 扩展时机**：Phase 5 完成后，DomainStrategy 接口就绪，届时可按需评估是否增加新 domain（如 Research、Literary Edit 等），注册策略即可，无需再改 AgentEngine。
