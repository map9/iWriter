# AI Context Compaction and Memory Scaffold

本文定义 iWriter 下一代会话历史、上下文压缩与长期记忆脚手架，作为后续正式实施的架构依据。

本文只描述目标设计和分阶段实施，不包含旧数据迁移、旧 session 文件导入或旧 checkpoint 兼容方案。

## 1. 结论

iWriter 将建立一套 Edit / Creative 共用的 Context Scaffold：

- **Transcript Store** 是完整会话事实的唯一应用层来源；
- **Context Capsule** 是 Transcript 的有损、结构化模型上下文投影；
- **LangGraph Checkpoint** 只承担运行恢复，不再长期承担完整会话历史；
- **Memory Store** 保存跨线程可复用的关键事实、偏好、经验和协作规则；
- Edit / Creative 只提供领域 profile，不各自实现摘要、历史和记忆基础设施；
- 不修改或 fork DeepAgents 内置 SummarizationMiddleware；创建 Agent 时停止启用它，改用 iWriter 自有中间件；
- 取消 `/conversation_history/*.md` 和单文件 `memory.md` 作为运行时状态方案。

目标关系如下：

```text
完整会话          -> Transcript Store
模型当前上下文    -> Context Capsule + Recent Tail
运行恢复          -> LangGraph Checkpoint
跨会话关键点      -> Memory Store
领域语义差异      -> Edit / Creative DomainContextProfile
```

## 2. 背景与现有问题

当前 DeepAgents 摘要路径同时涉及：

1. LangGraph checkpoint 中的完整 `messages`；
2. `_summarizationEvent` 中的摘要和 cutoff；
3. `/conversation_history/{sessionId}.md` 中的 offload 消息；
4. renderer 生命周期内的压缩 UI 事件。

当前实现存在以下结构性问题：

- conversation history 使用 Agent 实例私有临时目录，Agent cache 清理或重建后文件可以消失；
- checkpoint 和 conversation history 重复保存相同旧消息；
- session Markdown 缺少稳定事件 ID、turn 边界和结构化索引；
- 历史工具只能按文件/行/字符串读取，不能按 turn、工具、文件、状态和证据定向检索；
- 摘要是未经 schema 校验的 Markdown，无法确定性验证完成状态和证据；
- memory 是只读单文件并被全量注入，不支持“请记住”、定向召回、冲突、来源和作用域；
- checkpoint 的运行恢复职责与产品历史、检索、审计职责混在一起。

## 2.1 参考实现调研与选型依据

调研结论基于 2026-08-06 检索到的官方文档和开源仓库资料。外部实现用于确认可复用的架构模式，不作为 iWriter 的运行时兼容承诺。

### Codex

Codex 的开源实现提供了两组值得采用的模式：

- compaction 把旧上下文替换为可继续执行的 replacement history，并暴露异步 `thread/compact/start`；
- auto compaction 使用独立 token threshold，而 session/rollout 仍承担持久历史记录；
- memory pipeline 分为 per-thread rollout extraction 和 global consolidation；
- extraction job 使用 lease、retry backoff，consolidation 单飞并使用 watermark；
- root session 后台形成 memory，subagent 不递归启动同一管线。

采用：持久历史与活动模型上下文分离、手动异步压缩、两阶段后台记忆、lease/backoff/watermark、root/subagent 边界。

不直接复制：Codex 的 rollout 文件、Rust state DB schema、filesystem memory artifacts 和全局 consolidation 目录不适配 iWriter 的 Electron/TypeScript、workspace/document 作用域与 renderer 历史 UI。

参考：

- [Codex app-server thread compaction API](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex local compaction implementation](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs)
- [Codex memories pipeline](https://github.com/openai/codex/blob/main/codex-rs/core/src/memories/README.md)

### OpenCode

OpenCode V2 的 compaction 设计与本项目问题最接近：

- durable session messages 不因有损压缩而删除；
- 模型请求从最新 completed checkpoint 和其后的消息组装；
- model call 前按 system prompt、messages、tools 的最终估算触发；
- provider overflow 只恢复一次，并避免重复提交输入；
- 手动压缩被持久接纳，在下一个安全边界执行，重复请求合并；
- checkpoint 使用结构化 summary + 有预算的 recent tail，running/failed compaction 不进入模型上下文。

采用：最终请求预算、completed-only capsule、recent tail、自动/overflow/手动三触发、安全边界与幂等合并。

不直接复制：OpenCode session/checkpoint 是其自身 runner 的协议与存储实现，不能替换 LangGraph checkpoint，也不能直接表达 iWriter 的 edit proposal、creative state、approval 和 document revision。

参考：[OpenCode V2 Compaction](https://opencode.ai/v2/docs/compaction)

### LangGraph 与 LangMem

LangGraph 明确区分：

- thread-scoped short-term state 通过 checkpointer 持久化，用于恢复会话；
- cross-thread long-term memory 通过自定义 namespace 的 store 保存和召回。

LangMem 提供了可借鉴的记忆原语：

- active conversation 内的 manage/search memory tools，即 hot path；
- conversation 后异步 extract/consolidate，即 background path；
- semantic、episodic、procedural memory 分类；
- profile 与 collection 两种组织方式；
- structured schema，以及 insert/update/delete 控制。

采用：short-term/long-term 职责区分、命名空间、显式 memory tools、后台提取、结构化类型与合并语义。

不直接引入 LangMem Python 包：iWriter 主进程是 TypeScript/Electron；Python sidecar 会增加打包、进程、模型配置和故障域，同时 LangMem 本身不提供 iWriter 所需的完整 Transcript、renderer 历史、checkpoint 裁剪和领域 capsule。因此只复用设计思想，并以 TypeScript 接口实现。

参考：

- [LangGraph Memory Overview](https://docs.langchain.com/oss/python/concepts/memory)
- [LangMem Introduction](https://langchain-ai.github.io/langmem/)
- [LangMem Core Concepts](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)
- [LangMem Memory Tools API](https://langchain-ai.github.io/langmem/reference/tools/)

### 三类方案比较

| 方案 | 优点 | 主要缺口 | 结论 |
| --- | --- | --- | --- |
| 直接利用 LangMem/LangGraph Store | memory 原语成熟，接近现有 LangGraph 技术栈 | LangMem 以 Python 为主；不解决 Transcript、UI、checkpoint 去重和领域状态 | 不采用完整方案 |
| 基于 DeepAgents 摘要中间件改造 | 初始改动较小 | 需要持续 patch 上游，仍受 session 文件和 middleware state 设计约束 | 不采用 |
| 移植 Codex/OpenCode 实现 | 已验证长会话模式 | runner、语言、协议、持久化和产品对象均不兼容 | 只移植架构原则 |
| iWriter 自有 Context Scaffold | 能统一 Edit/Creative，并控制 Transcript、capsule、memory、IPC 和 checkpoint 边界 | 实施范围最大，需要分阶段质量门槛 | **采用** |

最终选择是“基于开源模式的自有实现”：继续直接使用 LangGraph checkpointer；不 fork DeepAgents；用 TypeScript + better-sqlite3 实现 Transcript/Capsule/Memory；将 Codex、OpenCode、LangMem 中验证过的触发、持久化、检索和后台合并模式纳入 iWriter 领域模型。

## 3. 目标与非目标

### 3.1 目标

1. 解决摘要 session 文件丢失、覆盖、断裂和重复问题。
2. 保留完整、可分页、可检索、可审计的会话历史。
3. 让 checkpoint 大小随“当前恢复状态”而不是“完整历史长度”增长。
4. 在最终模型调用前统一判断是否需要压缩。
5. 支持自动压缩、provider overflow 紧急压缩和手动压缩。
6. 用结构化 capsule 保留后续工作所需的任务、约束、证据和领域状态。
7. 支持用户显式要求记忆、Agent 主动形成候选记忆和后台合并。
8. 支持按 global、domain、workspace、document 作用域检索记忆。
9. Edit / Creative 复用同一套脚手架，领域差异通过 profile 注入。
10. 支持 root Agent 与 subagent 独立压缩、共享受控记忆。

### 3.2 非目标

- 不迁移旧 conversation history 文件、旧 `_summarizationEvent` 或旧 `memory.md`。
- 不用 Transcript 重放整个 LangGraph 执行图。
- 不保存模型隐藏推理或 chain-of-thought。
- 不把创作项目事实从正式项目文档迁移到 Memory Store。
- 第一阶段不依赖向量数据库或 embedding 服务。
- 不修改 `node_modules/deepagents` 或维护 DeepAgents fork。
- 不在本项目中引入 Python/LangMem sidecar。

## 4. 术语与职责边界

| 组件 | 保存内容 | 是否完整 | 主要消费者 | 生命周期 |
| --- | --- | --- | --- | --- |
| Transcript | 用户消息、正式模型输出、工具调用/结果、审批、错误、压缩事件 | 是 | UI、历史工具、压缩器、记忆提取器 | 持久 |
| Context Capsule | 当前任务所需的结构化历史投影 | 否 | Context Assembler、模型 | 持久、版本化 |
| Recent Tail | 最近完整 turn 和当前工具组 | 否 | 模型、checkpoint | 有界 |
| Checkpoint | graph channels、interrupt、pending writes、capsule 引用、recent messages | 否 | LangGraph | 有界恢复前沿 |
| Memory | 跨线程可复用的事实、偏好、经验、规则 | 否 | Memory Retriever、Memory Tools | 持久、可管理 |
| Context Ledger | 已读来源、范围、revision、current/stale/missing/failed | 否 | Context Assembler、模型 | checkpoint 内有界状态 |

### 4.1 Transcript 不替换 Checkpoint

Transcript 记录“发生了什么”，但不记录 LangGraph 当前执行到哪个节点以及如何恢复。以下状态仍必须由 checkpoint 保存：

- 当前 graph channel values；
- interrupt 和 resume 位置；
- pending writes；
- subgraph namespace；
- middleware state；
- 当前未完成工具组；
- 当前可恢复执行前沿。

因此 Transcript 替换的是：

- `/conversation_history/*.md`；
- checkpoint 的“完整聊天历史来源”职责；
- UI 直接从 checkpoint 恢复完整消息的职责。

它不替换 LangGraph checkpointer。

### 4.2 Transcript 保存完整历史，不只保存被压缩区间

只在压缩时保存被淘汰消息会导致：

- 多个边界不断变化的 session 片段；
- overflow 重试重复写入区间；
- UI 同时拼接 checkpoint 与 session；
- 后台记忆提取缺少统一、连续来源；
- compaction 删除或失败后难以恢复边界。

因此 Transcript 从 thread 开始就追加完整事件。大内容可以外置为 blob，但逻辑事件序列必须完整。

## 5. 总体架构

```text
AgentEngine
  |
  +-- ContextScaffold
      |
      +-- TranscriptMiddleware ------> TranscriptStore
      +-- ContextManagementMiddleware
      |     +-- ContextAssembler
      |     +-- ContextBudgetPolicy
      |     +-- CompactionCoordinator
      |     +-- CapsuleGenerator
      |     +-- CapsuleValidator
      |
      +-- HistoryTools
      +-- MemoryRetriever
      +-- MemoryTools
      +-- MemoryExtractionWorker
      +-- DomainContextProfile
```

### 5.1 Context Scaffold 组装

```ts
interface ContextScaffold {
  transcriptStore: TranscriptStore
  capsuleStore: CapsuleStore
  memoryStore: MemoryStore
  transcriptMiddleware: AgentMiddleware
  contextManagementMiddleware: AgentMiddleware
  historyTools: StructuredTool[]
  memoryTools: StructuredTool[]
}
```

`AgentEngine._getOrCreateAgent()` 应：

1. 构建 domain profile；
2. 构建公共 Context Scaffold；
3. 不再传入 `summarizationMiddlewareOptions`；
4. 不再挂载 `createReadonlyMemoryMiddleware`；
5. 将 Transcript、Context Management、History、Memory 能力装配到 root Agent；
6. 为 subagent 使用相同基础设施和独立 `agentNamespace`。

## 6. 物理存储

### 6.1 `ai-checkpoint.db`

由 LangGraph SqliteSaver 管理：

- checkpoints；
- writes；
- graph runtime recovery。

本模块不直接修改 SqliteSaver 私有表结构。checkpoint GC 通过单独的 admin 边界实现，并在 Transcript 与 Capsule 稳定后启用。

现有 thread metadata 是否迁出不属于本设计范围。

### 6.2 `ai-context.db`

由 iWriter 管理，启用：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

包含：

- `thread_context_settings`；
- `thread_sequences`；
- `transcript_events`；
- `event_blobs`；
- `context_capsules`；
- `compaction_requests`；
- `memory_items`；
- `memory_evidence`；
- `memory_jobs`；
- `memory_usage`；
- FTS 索引和 schema version。

应用数据库与 checkpoint 数据库分离，避免：

- 依赖 SqliteSaver 私有 schema；
- 上游升级破坏应用表；
- checkpoint 清理误删 transcript/memory；
- 应用层备份、查询和迁移与 runtime state 耦合。

## 7. Transcript Store

### 7.1 事件模型

```ts
type TranscriptEventKind =
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'approval_requested'
  | 'approval_resolved'
  | 'interrupt'
  | 'run_error'
  | 'run_status'
  | 'compaction_started'
  | 'compaction_completed'
  | 'compaction_failed'
  | 'memory_created'
  | 'memory_updated'
  | 'memory_deleted'

interface TranscriptEvent {
  eventId: string
  threadId: string
  agentNamespace: string
  seq: number
  turnId: string | null
  runId: string | null
  parentEventId: string | null
  kind: TranscriptEventKind
  role: 'user' | 'assistant' | 'tool' | 'system' | null
  name: string | null
  status: 'pending' | 'completed' | 'failed' | 'rejected' | 'interrupted' | null
  contentText: string | null
  contentJson: unknown | null
  searchText: string | null
  blobId: string | null
  tokenCount: number | null
  createdAt: number
  metadata: Record<string, unknown>
}
```

### 7.2 表结构概要

```sql
CREATE TABLE transcript_events (
  event_id        TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL,
  agent_ns        TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  turn_id         TEXT,
  run_id          TEXT,
  parent_event_id TEXT,
  kind            TEXT NOT NULL,
  role            TEXT,
  name            TEXT,
  status          TEXT,
  content_text    TEXT,
  content_json    TEXT,
  search_text     TEXT,
  blob_id         TEXT,
  token_count     INTEGER,
  created_at      INTEGER NOT NULL,
  metadata_json   TEXT NOT NULL,
  UNIQUE(thread_id, seq)
);
```

`seq` 在 `BEGIN IMMEDIATE` 事务内通过 `thread_sequences` 分配，保证 root 与并发 subagent 事件在同一个 thread 中有稳定全序。

### 7.3 幂等键

事件写入必须支持 `INSERT OR IGNORE`。外部稳定键优先使用：

- LangChain message ID；
- tool call ID；
- review item ID；
- run ID + event kind + ordinal；
- compaction ID；
- memory ID + version。

流式 delta 不直接写 Transcript。Transcript 只保存已经形成正式状态的消息或事件；renderer 可继续显示 live delta，完成后与 Transcript 对账。

### 7.4 捕获时机

公共 TranscriptMiddleware 负责 message 事件：

- `beforeAgent`：写入未见过的 user message；
- `afterModel`：写入正式 assistant message 和 tool calls；
- `beforeModel`：补齐上一工具阶段产生的 ToolMessages；
- `afterAgent`：最终 flush 未见消息；
- interrupt/resume：在稳定退出点 flush。

AgentEngine/IPC adapter 负责非 message 事件：

- approval requested/resolved；
- run error/status；
- context compression lifecycle；
- 用户可见的 filesystem/edit/creative review 结果。

### 7.5 大内容与 Blob

大于阈值的工具结果或附件描述写入 `event_blobs`：

```sql
CREATE TABLE event_blobs (
  blob_id       TEXT PRIMARY KEY,
  sha256        TEXT NOT NULL UNIQUE,
  encoding      TEXT NOT NULL,
  mime_type     TEXT,
  byte_length   INTEGER NOT NULL,
  data          BLOB NOT NULL,
  created_at    INTEGER NOT NULL
);
```

Transcript event 只保存：

- 限长 excerpt；
- blob ID；
- hash；
- 原始长度；
- MIME/type metadata。

隐藏推理、未公开 chain-of-thought 不进入 Transcript。

### 7.6 查询接口

```ts
interface TranscriptStore {
  append(events: NewTranscriptEvent[]): Promise<TranscriptEvent[]>
  getByIds(eventIds: string[]): Promise<TranscriptEvent[]>
  readRange(input: TranscriptRangeQuery): Promise<TranscriptPage>
  search(input: TranscriptSearchQuery): Promise<TranscriptSearchPage>
  getLatestSeq(threadId: string): Promise<number>
}
```

第一版使用结构化过滤 + SQLite FTS5，不依赖 embedding。中文检索优先使用 FTS5 trigram；运行环境不支持时回退到规范化关键词/LIKE 查询并记录能力状态。

## 8. Checkpoint 边界

压缩后 checkpoint messages 应真实变为：

```text
[HistoricalContextCapsule]
[Recent complete user turn]
[Assistant tool call]
[Tool result]
[Current unfinished state]
```

而不是继续保存全部旧消息后仅在请求时通过 cutoff 隐藏。

checkpoint 中保留：

```ts
interface ContextCheckpointState {
  _contextCapsuleId?: string
  _contextCapsuleThroughSeq?: number
  _contextSchemaVersion?: number
}
```

## 9. Context Capsule

### 9.1 通用 Schema

```ts
interface EvidenceRef {
  sourceEventIds: string[]
  sourcePaths?: string[]
  confidence: 'confirmed' | 'inferred'
}

interface WorkItem extends EvidenceRef {
  id: string
  text: string
  status: 'completed' | 'pending' | 'blocked' | 'failed' | 'rejected'
}

interface ConstraintItem extends EvidenceRef {
  id: string
  text: string
  priority: 'explicit_user' | 'authoritative_source' | 'derived'
}

interface ArtifactState extends EvidenceRef {
  path: string
  scope: string
  revision?: string
  status: 'current' | 'stale' | 'missing' | 'failed'
}

interface ContextCapsuleV1 {
  schemaVersion: 1
  domain: 'editing' | 'creative'
  objective: string
  currentPhase: string
  completed: WorkItem[]
  pending: WorkItem[]
  decisions: ConstraintItem[]
  constraints: ConstraintItem[]
  artifacts: ArtifactState[]
  approvalsAndInterrupts: WorkItem[]
  failuresAndStaleItems: WorkItem[]
  openQuestions: WorkItem[]
  nextActions: WorkItem[]
  domainState: unknown
}
```

JSON 字段名稳定使用英文，用户内容使用用户主要语言；路径、ID、引用原文和技术名保持原样。

### 9.2 领域扩展

Edit：

```ts
interface EditingCapsuleState {
  targets: Array<{
    path: string
    section?: string
    blockIds?: number[]
    revision?: string
    stale: boolean
  }>
  operation: string
  preservationRequirements: string[]
  proposalState: Array<{
    proposalId: string
    status: 'proposed' | 'applied' | 'rejected' | 'failed'
  }>
}
```

Creative：

```ts
interface CreativeCapsuleState {
  stage: string
  activePlaybook?: string
  confirmedFacts: EvidenceFact[]
  candidates: EvidenceFact[]
  rejectedDirections: EvidenceFact[]
  causalLinks: EvidenceFact[]
  continuityConstraints: EvidenceFact[]
  writingSessions: WritingSessionState[]
  reviewerFindings: EvidenceFact[]
}
```

### 9.3 验证规则

1. 所有 `sourceEventIds` 必须存在并属于当前 thread。
2. `completed` 必须有成功工具结果、用户确认或正式 assistant 交付证据。
3. proposed action 不得标记为 completed。
4. rejected/failed/interrupted 不得被后续摘要静默改为 completed。
5. explicit user constraint 只有新的明确用户指令才能覆盖。
6. confirmed creative fact 不得无证据降级为 candidate 或被删除。
7. artifact revision 不匹配时必须标为 stale。
8. capsule 无效时保留上一版，不进入模型上下文。
9. structured output 不可用时允许 JSON prompt + Zod parse + 一次 repair retry。

## 10. 压缩触发与执行

### 10.1 不修改内置中间件

最终配置中：

- 不传 `summarizationMiddlewareOptions`；
- DeepAgents SummarizationMiddleware 不参与运行；
- 不 fork、不 patch DeepAgents；
- iWriter `ContextManagementMiddleware` 独立负责预算、触发、生成、验证、投影和 checkpoint 更新。

只增加 Transcript 而继续启用旧摘要中间件可以作为开发过程中的短暂观测状态，但不能作为任何交付阶段的最终状态。

### 10.2 最终请求预算

压缩判断必须基于即将发送给模型的最终请求：

```text
system prompt
+ tool schemas
+ context ledger
+ retrieved memories
+ current capsule
+ recent messages
+ current user input
+ current tool calls/results
```

复用现有 model budget 与 CJK-aware token counter：

```text
threshold = effectiveInputBudget - max(outputReserve, safetyBuffer)

shouldCompact =
  estimatedFinalInputTokens >= threshold
  AND hasCompressibleCompletedTurns
```

建议 recent tail：

```text
tailBudget = clamp(8k, usableInputBudget * 12%, 32k)
```

同时保证：

- 至少保留最后两个完整用户 turn；
- 当前用户输入永远保留；
- AI tool-call 与所有对应 ToolMessage 作为原子组；
- 当前未解决 interrupt 和待审批工具组不压缩；
- 单个过大工具结果改用 excerpt + Transcript event/blob reference。

### 10.3 自动前置触发

每次真正调用主模型前，在 `wrapModelCall` 中执行：

1. Context Assembler 注入 ledger、相关 memory、capsule；
2. 计算最终输入 token；
3. 判断是否超过阈值；
4. 选择完整 turn cutoff；
5. 从 Transcript 读取增量区间；
6. 生成并验证下一版 capsule；
7. 用 capsule + recent tail 调用主模型；
8. 主模型调用成功后返回 `Command` 更新 messages 和 capsule 引用。

### 10.4 Provider Overflow 紧急触发

当 provider 返回标准 context overflow：

- 只有当前 step 尚未产生 assistant 正式输出时才允许自动重试；
- 同一个 model step 最多强制压缩并重试一次；
- 不重放已经发生外部副作用的步骤；
- 没有可压缩 head 时返回固定上下文过大的明确错误；
- overflow retry 使用同一 idempotency key，不能重复创建有效 capsule。

### 10.5 手动触发

通过 IPC：

```ts
requestContextCompaction({ threadId, agentNamespace? })
```

行为：

- 运行中：记录 pending request，在下一个安全 model-call 边界执行；
- 空闲：启动内部 compaction-only job，并通过 compiled graph 的公开 state update 边界更新状态；
- 不直接修改 SqliteSaver 表；
- 多次 pending request 合并；
- 不创建用户消息；
- lifecycle 写入 Transcript 并恢复到 UI。

安全边界要求：

- 无正在流式生成的 assistant output；
- 无不完整 AI/Tool 消息组；
- 不在 review decision 应用过程中；
- 当前稳定 checkpoint 已存在或本次状态更新可原子提交。

### 10.6 可选空闲预压缩

后续可在 run 正常结束且：

```text
activeTokens >= hardThreshold * 0.9
```

时后台预压缩，以降低下一轮等待。该能力不是第一版正确性要求，不得先于自动前置、overflow 和手动触发实现。

### 10.7 中间件结构

建议对外暴露一个 ContextManagementMiddleware，内部拆分：

```text
ContextManagementMiddleware
  +-- ContextAssembler
  +-- ContextBudgetPolicy
  +-- CompactionBoundarySelector
  +-- CapsuleGenerator
  +-- CapsuleValidator
  +-- CompactionCoordinator
```

这样可以确保预算计算看到 ledger 和 memory 的最终注入结果，避免跨 middleware 顺序导致漏算。

### 10.8 Compaction 状态机

```text
requested -> generating -> ready -> referenced-by-checkpoint
                       \-> failed
ready but unreferenced -> orphaned -> GC
```

步骤：

1. 按 `(threadId, agentNamespace)` 获取互斥锁；
2. 计算 idempotency key；
3. 插入/复用 requested 记录；
4. 读取 previous capsule + 新 Transcript 区间；
5. 生成 capsule；
6. 校验并写为 ready；
7. 调用主模型或执行公开 state update；
8. checkpoint 写入 `_contextCapsuleId`；
9. best-effort 标记 referenced；
10. 未被任何 checkpoint 引用的 ready 记录可在空闲期 GC。

checkpoint 中的 capsule ID 是当前有效 capsule 的权威引用。不能仅按数据库 created time 选择最新 capsule。

## 11. History Tools

### 11.1 搜索

```ts
search_conversation_history({
  query,
  threadId?,
  agentNamespace?,
  roles?,
  eventKinds?,
  toolNames?,
  filePaths?,
  statuses?,
  fromSeq?,
  toSeq?,
  limit?,
  cursor?,
})
```

默认只返回：

- event ID；
- seq/turn；
- kind/role/tool/status；
- 限长 snippet；
- source path；
- created time；
- 是否存在 blob。

### 11.2 精确读取

```ts
read_conversation_events({
  eventIds?,
  seqRange?,
  includeToolContent?: false,
  maxChars?,
  cursor?,
})
```

### 11.3 邻接上下文

```ts
read_conversation_context({
  eventId,
  before?: 2,
  after?: 2,
  maxChars?,
})
```

工具必须分页和预算受限，不能默认返回整段 transcript 或完整大工具输出。

## 12. Memory Store

### 12.1 Memory 与 Compaction 分离

Context Capsule 的目标是继续当前 thread；Memory 的目标是跨 thread 复用关键点。两者不能相互替代：

- capsule 不自动成为 memory；
- memory 不复制整个 capsule；
- memory evidence 可以引用 Transcript event；
- background extraction 可以消费 Transcript 增量。

### 12.2 类型

```ts
type MemoryKind =
  | 'semantic_user_fact'
  | 'user_preference'
  | 'project_fact'
  | 'episodic_experience'
  | 'procedural_rule'
  | 'tool_context'
```

含义：

- semantic：用户事实、确认知识；
- preference：表达、编辑、创作和交付偏好；
- project_fact：项目级事实或权威文档引用；
- episodic：过去任务、决策、结果和经验；
- procedural：协作规则和从明确反馈形成的工作模式；
- tool_context：未来工具调用所需但非密钥的稳定信息。

### 12.3 作用域

```ts
type MemoryScope =
  | { type: 'global'; key: 'author' }
  | { type: 'domain'; key: 'editing' | 'creative' }
  | { type: 'workspace'; key: string }
  | { type: 'document'; key: string }
```

默认选择最具体作用域：

- 当前文档特有 -> document；
- 当前项目事实 -> workspace；
- 某一搭子的稳定偏好 -> domain；
- 用户明确说明跨项目长期适用 -> global。

### 12.4 状态

```ts
type MemoryStatus =
  | 'candidate'
  | 'confirmed'
  | 'superseded'
  | 'deleted'
```

规则：

- 用户明确“记住” -> confirmed；
- 模型主动发现但用户未确认 -> candidate；
- 新事实与旧事实冲突 -> 创建新版本并 supersede 旧版本；
- confirmed 不被后台任务自动删除；
- delete 使用 tombstone 和审计事件；
- 写入使用 optimistic version。

### 12.5 表结构概要

```sql
CREATE TABLE memory_items (
  memory_id          TEXT PRIMARY KEY,
  scope_type         TEXT NOT NULL,
  scope_key          TEXT NOT NULL,
  domain             TEXT,
  kind               TEXT NOT NULL,
  canonical_key      TEXT NOT NULL,
  content            TEXT NOT NULL,
  status             TEXT NOT NULL,
  confidence         REAL NOT NULL,
  importance         REAL NOT NULL,
  version            INTEGER NOT NULL,
  supersedes_id      TEXT,
  source_thread_id   TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  last_used_at       INTEGER,
  use_count          INTEGER NOT NULL DEFAULT 0,
  expires_at         INTEGER,
  metadata_json      TEXT NOT NULL
);

CREATE TABLE memory_evidence (
  memory_id       TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  relation        TEXT NOT NULL,
  PRIMARY KEY(memory_id, event_id, relation)
);
```

### 12.6 权威优先级

模型使用上下文时按以下顺序处理冲突：

```text
当前用户明确指令
> 当前 workspace/document 权威内容
> confirmed scoped memory
> candidate memory
> context capsule 中的推断
```

Creative 项目中的人物、世界观、提纲和正文仍以 workspace 正式对象为权威。Memory 保存项目事实时必须携带 workspace/document scope 和来源；revision 失效时不能继续当作 confirmed current fact 使用。

### 12.7 Memory Tools

```ts
remember_memory({
  content,
  scope?,
  kind?,
  sourceEventIds?,
})

recall_memories({
  query,
  scopes?,
  kinds?,
  statuses?: ['confirmed'],
  limit?,
  cursor?,
})

update_memory({
  memoryId,
  expectedVersion,
  content,
})

forget_memory({
  memoryId,
  expectedVersion,
})
```

不允许 Agent 通过 `edit_file` 直接编辑 memory 文件。Memory 写入全部经过结构化工具、schema、作用域和审计策略。

### 12.8 显式记忆

用户明确表达以下意图时，root Agent 必须在当前 turn 内调用 `remember_memory`：

- “记住……”；
- “以后都……”；
- “下次不要再……”；
- 明确更新或撤回先前记忆。

流程：

1. 用户消息进入 Transcript；
2. root Agent 调用 Memory Tool；
3. 写入 confirmed memory 和 evidence；
4. Transcript 写入 memory lifecycle event；
5. renderer 显示成功/更新/删除通知；
6. Agent 再完成用户的主要任务。

不得保存：

- API key；
- access token；
- password；
- session cookie；
- 私钥；
- 一次性验证码；
- 明显瞬时、与未来无关的信息。

### 12.9 主动候选记忆

Agent 可以在以下情况写 candidate：

- 用户明确纠正并说明原因；
- 重复出现的稳定偏好；
- 未来任务所需的非敏感工具上下文；
- 可复用的成功/失败模式。

一次性任务要求、寒暄和短期状态不得形成 candidate。

### 12.10 注入策略

不全量注入 Memory Store：

1. 固定注入小型 global author profile，预算 500-800 tokens；
2. 根据当前输入、domain、workspace、document 检索 3-8 条相关 memory；
3. 总 memory 注入预算 1,500-2,500 tokens；
4. 更多内容通过 `recall_memories` 工具获取；
5. 排序综合 scope、confirmed、关键词/FTS、importance、recency、use_count；
6. Memory token 必须计入压缩触发预算。

### 12.11 后台提取与合并

分两阶段：

Phase A：per-thread extraction

- thread 空闲后处理未消费 Transcript 区间；
- 使用 watermark 和 lease；
- 提取 candidate、rollout summary 和 evidence；
- 并发有上限；
- 失败使用 retry backoff；
- 显式 confirmed memory 不依赖后台任务。

Phase B：per-scope consolidation

- 同一 scope 串行；
- 去重、冲突消解、合并和 supersede；
- candidate 可以过期；
- confirmed 不自动删除；
- 保存 selection watermark 和输入 hash；
- 不阻塞当前用户响应。

## 13. DomainContextProfile

```ts
interface DomainContextProfile<TDomainState> {
  domain: 'editing' | 'creative'

  compaction: {
    preservationInstructions: readonly string[]
    domainStateSchema: z.ZodType<TDomainState>
    validateDomainState(
      state: TDomainState,
      evidence: TranscriptEvent[],
    ): ValidationResult
  }

  memory: {
    allowedKinds: readonly MemoryKind[]
    defaultScope(ctx: IWriterAgentContext): MemoryScope
    extractionInstructions: readonly string[]
    authorityRules: readonly string[]
  }

  retrieval: {
    preferredEventKinds: readonly TranscriptEventKind[]
    defaultHistoryLimit: number
  }
}
```

`DomainStrategy` 最终提供：

```ts
getContextProfile(): DomainContextProfile<unknown>
```

取代摘要/记忆分别暴露目录和 prompt 的做法。公共脚手架不得通过 `if (domain === ...)` 分叉核心流程。

## 14. Root Agent 与 Subagent

### 14.1 Transcript

- root 与 subagent 共用 thread `seq`；
- 每个事件带 `agentNamespace`；
- UI 可以按 root task 展示子任务事件；
- subagent capsule 只压缩自己的 namespace；
- root capsule 可保存子任务结果引用，但不复制完整子任务 transcript。

### 14.2 Checkpoint

- 每个 graph namespace 保持自己的恢复前沿；
- checkpoint GC 必须从 root head 计算可达 namespace；
- 未完成 subagent/interrupt 不得清理。

### 14.3 Memory

- root Agent 可以写 confirmed memory；
- subagent 默认只读 confirmed memory；
- subagent 可以提交 candidate，但必须携带自身 evidence 和 caller/root thread；
- subagent 不得直接删除或覆盖 global/domain confirmed memory。

## 15. UI 与 IPC

### 15.1 History

- 线程历史 UI 从 TranscriptStore 分页读取；
- live turn 继续使用 renderer 实时事件；
- turn 结束后用 Transcript 对账；
- 不再通过 `getThreadMessages()` 从 checkpoint 获取完整历史；
- checkpoint 仅用于 interrupt/recovery projection。

### 15.2 Context Compression

压缩卡片状态持久化到 Transcript：

- started；
- completed；
- failed；
- reason：automatic/manual/provider_overflow/idle；
- capsule ID；
- compressed event count；
- through seq；
- recent tail tokens；
- before/after token estimate。

应用重启后仍可恢复压缩卡片。

### 15.3 Memory

需要支持：

- 当前 thread 是否使用 memory；
- 当前 thread 是否贡献 background memory；
- memory 列表、scope、状态、来源和最后使用时间；
- 用户编辑/忘记；
- 写入后的 undo；
- candidate 与 confirmed 的视觉区分。

## 16. 并发、一致性与故障处理

### 16.1 Transcript

- 单次 append 使用事务；
- seq 分配和事件写入同一事务；
- 稳定 external key 幂等；
- 并发 subagent 不依赖 wall-clock 排序。

### 16.2 Compaction

- `(threadId, agentNamespace)` 单飞；
- idempotency key：

```text
threadId
+ agentNamespace
+ previousCapsuleId
+ fromSeq
+ throughSeq
+ promptVersion
+ schemaVersion
+ modelId
```

- ready 但未被 checkpoint 引用的 capsule 不进入模型上下文；
- capsule 生成失败不修改现有 checkpoint projection；
- overflow 重试不得重复写 Transcript 原始事件。

### 16.3 Memory

- update/delete 需要 `expectedVersion`；
- canonical key 冲突创建新版本，不进行无条件覆盖；
- per-scope consolidation 使用 lease；
- candidate 自动任务不得覆盖 confirmed；
- memory retrieval failure 不阻断主任务，只记录 warning/metrics。

### 16.4 数据库故障

- `ai-context.db` 无法初始化时，Agent 应明确报告上下文基础设施不可用；
- packaged build 不允许静默回退到纯内存 Transcript/Memory；
- development 可以通过显式环境开关启用 in-memory fallback；
- 不能出现“线程列表存在，但 Transcript 丢失”的 ghost thread 状态。

## 17. 安全与隐私

1. Transcript 只保存用户可见消息、正式模型输出、工具与运行事件。
2. 不保存隐藏推理或 chain-of-thought。
3. Memory 写入前执行确定性 secret redaction。
4. Memory Tool 拒绝 credential 类型内容。
5. History/Memory Tool 严格限制 thread、workspace 和用户 namespace。
6. Tool 输出默认 snippet，不返回全量 blob。
7. 当前用户指令和 workspace 权威内容永远高于 memory。
8. 所有 memory 写入、更新、删除可审计。

## 18. 可观测性

至少记录：

- transcript append latency/error/idempotent hit；
- transcript event/blob logical bytes；
- active context token composition；
- compaction trigger reason；
- before/after token estimate；
- compaction generation/validation latency；
- capsule validation failure type；
- provider overflow retry result；
- per-thread/root/subagent checkpoint count 和逻辑字节；
- history search latency/result count；
- memory create/update/delete/retrieval count；
- memory retrieval hit/use count；
- background extraction/consolidation job outcome；
- orphan capsule 和 checkpoint GC 结果。

用户可见结果使用 status-bar notifications；开发诊断使用现有 logging 系统。

## 19. 分阶段实施方案

每一阶段必须独立可验证。不得在 Transcript 未成为可靠历史来源前物理清理 checkpoint messages 或启用 checkpoint GC。

### Phase 0：契约、测试基线与 Scaffold 空壳

范围：

- 定义 Transcript、Capsule、Memory、DomainContextProfile 类型；
- 建立 `electron/ai/scaffold/context/` 公共边界；
- 建立 schema version 常量；
- 为当前摘要、interrupt、root/subagent、context ledger 建立行为测试基线；
- 建立 feature flag，默认保持旧运行路径。

验收：

- 类型编译通过；
- 现有行为测试不回归；
- Edit/Creative 均可装配同一个空 Scaffold；
- feature flag 关闭时完全不改变行为。

### Phase 1：`ai-context.db` 与 Transcript 基础设施

范围：

- ContextDatabase 初始化、schema 和事务封装；
- TranscriptStore、event/blob 表、seq 分配和幂等写入；
- TranscriptMiddleware 捕获 messages；
- AgentEngine/IPC 捕获审批、错误和运行事件；
- FTS5 能力检测；
- 暂时继续使用旧摘要中间件，不改变模型上下文。

验收：

- 一个完整 turn 的 user/assistant/tool/approval 事件顺序正确；
- root 与并发 subagent seq 稳定且不重复；
- 重复 flush 不产生重复事件；
- 大工具结果使用 blob，hash 去重；
- 应用重启后 Transcript 可读取；
- Transcript 写入失败有明确日志和运行策略。

### Phase 2：历史 UI 切换与定向 History Tools

范围：

- 线程历史分页读取改为 Transcript；
- live turn 与 persisted transcript 对账；
- 实现 search/read/context 三个历史工具；
- token/字符/分页限制；
- Context Ledger cursor 改为 event seq。

验收：

- UI 不依赖 checkpoint 全量消息仍能恢复历史；
- 中文关键词、路径、tool name、status 和 turn 范围可检索；
- 工具默认不返回完整大结果；
- messages 数组缩短不会清空 Context Ledger；
- root/subagent 历史可以按 namespace 过滤。

### Phase 3：自有 Context Compaction

范围：

- ContextAssembler、BudgetPolicy、BoundarySelector；
- CapsuleGenerator、Zod schema 和 Validator；
- CompactionCoordinator 和状态机；
- 自动前置、provider overflow、手动触发；
- compaction Transcript events 和 UI 恢复；
- Agent 创建时停止传 `summarizationMiddlewareOptions`；
- 删除 `/conversation_history/` backend route；
- 物理更新 checkpoint messages 为 capsule + recent tail。

验收：

- DeepAgents 内置摘要中间件不再运行；
- 不再创建 conversation history session 文件；
- 三次以上连续压缩可稳定更新 previous capsule；
- 每个完成/约束/事实均可追溯到 event ID；
- 无效 capsule 不替换上一版；
- tool-call/ToolMessage 不被拆分；
- interrupt、approval、write-session 和 subagent resume 不回归；
- overflow 最多重试一次；
- 手动压缩在 active/idle 两种状态下行为确定；
- 重启后模型和 UI 使用相同有效 capsule。

### Phase 4：显式 Memory

范围：

- MemoryStore、scope、status、version、evidence；
- remember/recall/update/forget tools；
- secret redaction；
- root/subagent 权限；
- ContextAssembler 相关性注入；
- memory token 纳入压缩预算；
- renderer 通知和基础管理 UI。

验收：

- 用户“记住”在当前 turn 内生成 confirmed memory；
- 新 thread 能按 scope 召回；
- workspace memory 不泄漏到其他 workspace；
- 当前用户指令可以覆盖旧 memory；
- update/delete 使用 optimistic version；
- candidate 不能覆盖 confirmed；
- secret 测试样本全部拒绝或脱敏；
- Memory Store 不再全量注入。

### Phase 5：后台 Memory Extraction 与 Consolidation

范围：

- per-thread extraction jobs；
- watermark、lease、backoff；
- per-scope consolidation；
- candidate 去重、冲突、supersede、过期；
- thread use/contribute 设置；
- usage/last-used 统计。

验收：

- 活跃 thread 不被后台处理；
- 相同 Transcript 区间不重复提取；
- 并发启动不会重复占有同一 job；
- failed job 不 hot-loop；
- confirmed memory 不被后台删除；
- 同 scope 合并串行；
- 禁用 contribute 的 thread 不产生后台 memory。

### Phase 6：Checkpoint GC、故障注入与容量治理

范围：

- 可恢复前沿计算；
- root/subgraph 可达 checkpoint、pending writes、interrupt 保留；
- resolved events 已在 Transcript 后清理旧 checkpoint；
- orphan writes/capsules 清理；
- 增量 vacuum；
- 容量、延迟和故障注入测试；
- 可选 idle pre-compaction。

验收：

- 100+ turns 后 checkpoint 数量和逻辑字节保持有界；
- Transcript 仍完整可分页；
- interrupt/subagent 恢复所需 checkpoint 不被清理；
- GC 中断可安全重试；
- Agent cache invalidation、模型切换、应用重启后 context 一致；
- compaction ready/checkpoint 写入之间的故障不会选择错误 capsule；
- 数据库 busy、磁盘写入失败和 provider 超时有确定结果。

### Phase 7：可选语义检索与质量调优

前置条件：FTS、scope 和证据检索已经稳定。

可选范围：

- provider embedding adapter；
- hybrid lexical + semantic ranking；
- capsule/memory eval 数据集；
- 自动调节 tail/memory budget；
- memory relevance 和 false-positive 指标。

不得把 embedding 作为基础正确性依赖。

## 20. 跨阶段质量门槛

每阶段提交前运行：

```bash
npm run lint
npm run type-check
```

实现阶段至少建立以下测试矩阵：

| 场景 | Edit | Creative | Root | Subagent |
| --- | --- | --- | --- | --- |
| 自动压缩 | 必测 | 必测 | 必测 | 必测 |
| 手动压缩 | 必测 | 必测 | 必测 | 适用时必测 |
| provider overflow | 必测 | 必测 | 必测 | 必测 |
| interrupt/resume | 必测 | 必测 | 必测 | 必测 |
| approval | 必测 | 必测 | 必测 | 适用时必测 |
| 连续多次压缩 | 必测 | 必测 | 必测 | 必测 |
| history search/read | 必测 | 必测 | 必测 | 必测 |
| explicit memory | 必测 | 必测 | 必测 | 权限必测 |
| background memory | 必测 | 必测 | 必测 | evidence 必测 |
| restart/cache invalidation | 必测 | 必测 | 必测 | 必测 |

关键质量指标：

- explicit constraints recall >= 95%；
- 已完成/失败状态误判为 0；
- source event 引用有效率 100%；
- Transcript 重复 event 为 0；
- 相同 compaction idempotency key 有效 capsule <= 1；
- secret memory 持久化为 0；
- checkpoint 存储随 active recovery state 有界，而不随完整 transcript 线性增长。

## 21. 预期代码落点

建议结构，实际实施时可在不破坏职责边界的前提下调整文件名：

```text
electron/ai/
├── context/
│   ├── ContextDatabase.ts
│   ├── ContextScaffold.ts
│   ├── ContextAssembler.ts
│   ├── ContextBudgetPolicy.ts
│   ├── transcript/
│   │   ├── TranscriptStore.ts
│   │   ├── TranscriptMiddleware.ts
│   │   └── TranscriptTypes.ts
│   ├── compaction/
│   │   ├── CompactionCoordinator.ts
│   │   ├── CompactionMiddleware.ts
│   │   ├── CapsuleGenerator.ts
│   │   ├── CapsuleStore.ts
│   │   ├── CapsuleTypes.ts
│   │   └── CapsuleValidator.ts
│   ├── history/
│   │   └── HistoryTools.ts
│   └── memory/
│       ├── MemoryStore.ts
│       ├── MemoryRetriever.ts
│       ├── MemoryTools.ts
│       ├── MemoryExtractionWorker.ts
│       └── MemoryTypes.ts
├── domain/
│   ├── DomainStrategy.ts
│   ├── edit/EditContextProfile.ts
│   └── creative/CreativeContextProfile.ts
└── checkpoint/
    └── CheckpointGc.ts
```

主要现有修改点：

- `electron/ai/AgentEngine.ts`：装配 Scaffold、停止内置摘要、历史/手动压缩入口；
- `electron/ai/domain/DomainStrategy.ts`：提供 `getContextProfile()`；
- `electron/ai/scaffold/filesystem/AgentFilesystem.ts`：移除 conversation history route；
- `electron/ai/ipc/StreamEventAdapter.ts`：持久压缩事件；
- `electron/ai/ipc/RendererEventBridge.ts`：history/memory/compaction IPC；
- `src/ai/store/`：Transcript 分页、live/persisted 对账、memory 状态；
- `src/components/ai/agent-panel/`：历史、压缩、memory 管理 UI；
- `src/ai/model/model-budget.ts`：继续作为唯一预算来源。

## 22. 最终不变量

实现完成后必须始终成立：

1. 完整会话只有 Transcript 一个应用层权威来源。
2. checkpoint 不承担完整历史查询和 UI 历史来源。
3. Context Capsule 只引用 Transcript，不复制完整原始历史。
4. 不存在 conversation history session 文件。
5. DeepAgents 内置摘要中间件未启用、未修改。
6. 压缩判断包含 system、tools、ledger、memory、capsule 和 messages 的最终 token。
7. 当前用户输入、未完成工具组和 interrupt 不被压缩。
8. capsule 只有通过 schema、状态和 evidence 验证后才可被 checkpoint 引用。
9. Memory 与 Capsule 分离；显式记忆不依赖摘要触发。
10. 用户当前指令和 workspace 权威内容高于 memory。
11. Edit / Creative 共用核心实现，只通过 DomainContextProfile 表达差异。
12. Transcript/Memory 不保存隐藏推理或凭据。
13. root/subagent 的事件、capsule 和 checkpoint namespace 可追踪且不串线。
14. checkpoint 大小与恢复前沿有界，不随完整 Transcript 无限制增长。
