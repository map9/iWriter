# Agent 代码结构重构实施计划

> 实施状态（2026-08-13）：共享契约与纯逻辑、主进程 runtime/interrupt/thread/writing-session 拆分、renderer `AgentClient`/state/conversation 分层、AI 组件归并及兼容入口清理已落地。`AgentEngine` 继续作为 facade，保留模型装配、预算、运行与流式编排；本轮严格行为等价重构已完成。进程隔离及进一步提取 `RunCoordinator`/`AgentService` 不属于本轮范围。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**目标：** 在不改变 Edit、Creative、流式显示、HITL 和 checkpoint 行为的前提下，建立测试护栏，把跨进程契约和纯逻辑迁入 `shared/ai/`，并消除 AI 主进程与 renderer 之间的反向依赖。

**架构：** 已通过测试和依赖门禁把跨进程契约及纯逻辑收敛到 `shared/ai/`，并删除旧兼容入口。`AgentEngine` 继续作为公共门面，将线程用例交给 `ThreadService`，将写作事务生命周期交给 `WritingSessionCoordinator`；renderer store 和 Vue 组件已按 AI feature 垂直聚合。进程隔离不包含在本计划内。

**技术栈：** Electron 43、Vue 3、TypeScript 5.9、Pinia、DeepAgents 1.11、LangGraph 1.4、Node test runner、ESLint flat config。

## 全局约束

- 保持 `AiAgentMode` 的 `edit | creative` 和 `AiAgentDomain` 的 `editing | creative` 值不变。
- 保持现有 Electron IPC channel 名称和 payload 行为不变。
- 保持 block edit proposal、Creative review、filesystem review 的审批与 resume 语义不变。
- `shared/ai/**` 不得依赖 `electron/**`、`src/**`、Vue、Pinia、DOM 或 Electron API。
- `electron/ai/**` 不得依赖 `src/**`。
- `src/ai/**` 不得依赖 `electron/**`。
- 旧入口只能作为临时 re-export；所有消费者迁移完成后删除。
- 文件移动和行为修改分批完成；每个任务结束必须运行对应测试及 `npm run type-check`。
- 不修改 `electron/ai/builtin-skills/**` 和 `electron/ai/builtin-subagents/**` 的内容或运行时路径。
- 不在本计划中迁移 `utilityProcess`。

---

## 目标文件结构

```text
shared/ai/
├── contracts/
│   ├── agent.ts
│   ├── provider.ts
│   ├── tool.ts
│   ├── review.ts
│   ├── message.ts
│   ├── thread.ts
│   ├── settings.ts
│   ├── protocol.ts
│   └── index.ts
└── core/
    ├── detectInputLanguage.ts
    ├── hitl.ts
    ├── modelBudget.ts
    ├── modelProfiles.ts
    ├── threadTitle.ts
    └── tokenEstimation.ts

electron/ai/
├── AgentService.ts
├── application/
│   ├── RunCoordinator.ts
│   ├── InterruptCoordinator.ts
│   ├── ThreadService.ts
│   └── WritingSessionCoordinator.ts
├── runtime/
│   ├── AgentFactory.ts
│   ├── AgentRunner.ts
│   ├── AgentCache.ts
│   └── RuntimeConfig.ts
├── domain/
│   ├── edit/
│   │   ├── EditDomainStrategy.ts
│   │   ├── buildEditCapabilities.ts
│   │   └── systemPrompt.ts
│   └── creative/
│       ├── CreativeDomainStrategy.ts
│       ├── buildCreativeCapabilities.ts
│       └── systemPrompt.ts
└── adapters/                       # 现有 ipc/config/checkpoint/document 适配器逐步归类

src/ai/
├── client/AgentClient.ts
├── state/
│   ├── aiStore.ts
│   ├── settings.ts
│   ├── threads.ts
│   ├── run.ts
│   └── reviews/
├── presentation/conversation/
│   ├── buildConversationEntries.ts
│   ├── mergeLiveTurn.ts
│   ├── displayRules.ts
│   └── types.ts
├── editor/
└── components/
    ├── shell/
    ├── composer/
    ├── conversation/
    ├── reviews/editing/
    ├── reviews/creative/
    ├── reviews/filesystem/
    └── settings/
```

## Task 1：统一测试入口与架构门禁

**文件：**

- 新建：`tests/ai-architecture-boundaries.test.mjs`
- 修改：`package.json`

**接口：**

- 输入：仓库中的 TypeScript/Vue import 声明。
- 输出：当 `shared/ai` 依赖进程代码、`electron/ai` 依赖 renderer、或 `src/ai` 依赖主进程时失败的 Node 测试。

- [ ] **Step 1：编写失败的架构测试**

  测试递归读取 `shared/ai`、`electron/ai`、`src/ai` 的 `.ts/.vue` 文件，解析静态 `import`、`export ... from` 和动态 `import()`。断言以下集合为空：

  ```js
  const forbidden = [
    { owner: 'shared/ai', patterns: [/(^|\/)electron\//, /(^|\/)src\//, /^@\//] },
    { owner: 'electron/ai', patterns: [/(^|\/)src\//, /^@\//] },
    { owner: 'src/ai', patterns: [/(^|\/)electron\//] },
  ]
  ```

  失败信息必须打印源文件、specifier 和违反的边界。

- [ ] **Step 2：验证测试因现有反向依赖失败**

  运行：`node --test tests/ai-architecture-boundaries.test.mjs`

  预期：FAIL，至少报告 `electron/ai/AgentEngine.ts -> ../../src/types/ai` 和 `src/ai/ipc.ts -> ../../electron/ai/ipc/protocol`。

- [ ] **Step 3：增加统一测试脚本**

  在 `package.json` 增加：

  ```json
  "test": "node --test tests/*.test.mjs",
  "test:ai-architecture": "node --test tests/ai-architecture-boundaries.test.mjs"
  ```

  `.test.ts` 继续由现有独立流程执行；本任务不引入新的 test runner 或 loader。

- [ ] **Step 4：运行既有基线**

  运行：`npm test`

  预期：只有新架构测试失败；现有 268 项测试保持通过。

- [ ] **Step 5：提交护栏**

  ```bash
  git add package.json tests/ai-architecture-boundaries.test.mjs
  git commit -m "test(ai): add architecture boundary checks"
  ```

## Task 2：拆分共享 AI 契约

**文件：**

- 新建：`shared/ai/contracts/agent.ts`
- 新建：`shared/ai/contracts/provider.ts`
- 新建：`shared/ai/contracts/tool.ts`
- 新建：`shared/ai/contracts/review.ts`
- 新建：`shared/ai/contracts/message.ts`
- 新建：`shared/ai/contracts/thread.ts`
- 新建：`shared/ai/contracts/settings.ts`
- 新建：`shared/ai/contracts/index.ts`
- 修改：`src/ai/types.ts`
- 修改：`src/types/ai.ts`
- 修改：`tsconfig.json`
- 修改：`tsconfig.electron.json`
- 修改：`vite.config.ts`
- 测试：`tests/ai-contracts.test.mjs`

**接口：**

- 生成：`@shared/ai/contracts` 公共入口。
- 保留：`@/ai/types` 与 `@/types/ai` 临时兼容入口。

- [ ] **Step 1：编写契约兼容测试**

  使用 esbuild 加载 `shared/ai/contracts/index.ts`，对以下可观察行为使用字面量断言：

  ```js
  assert.equal(normalizeAgentMode('creative'), 'creative')
  assert.equal(normalizeAgentMode('removed-mode'), 'edit')
  assert.equal(resolveAgentDomain('edit'), 'editing')
  assert.equal(inferToolKind('get_section'), 'read')
  assert.equal(inferToolKind('edit_block'), 'edit')
  assert.equal(resolveApiKeyReference('$AI_KEY', name => name === 'AI_KEY' ? 'secret' : ''), 'secret')
  assert.deepEqual(normalizeWebSearchProviderConfigs([]).map(item => item.type), [
    'bocha', 'exa', 'serper', 'tavily',
  ])
  ```

- [ ] **Step 2：验证共享入口尚不存在**

  运行：`node --test tests/ai-contracts.test.mjs`

  预期：FAIL，esbuild 报告无法解析 `shared/ai/contracts/index.ts`。

- [ ] **Step 3：建立共享目录编译配置**

  - `tsconfig.json` include 增加 `shared/**/*.ts`，paths 增加 `@shared/* -> ./shared/*`。
  - `tsconfig.electron.json` include 增加 `shared/**/*.ts`，paths 增加相同映射。
  - `vite.config.ts` alias 增加 `@shared: resolve(__dirname, 'shared')`。

- [ ] **Step 4：按职责迁移类型和纯函数**

  - `agent.ts`：domain、mode、thinking level、tool permission 及其 normalize/resolve 函数。
  - `provider.ts`：provider/model config、API key 解析、provider usability。
  - `tool.ts`：tool call/result/display、`inferToolKind`、tool name sets。
  - `review.ts`：edit/creative/filesystem review 与 round result。
  - `message.ts`：message blocks、subtask、compression event、`ThreadMessage`。
  - `thread.ts`：send context、attachment、usage、`AiThread`。
  - `settings.ts`：web search、fetch URL、`AiSettings` 和默认设置。
  - `index.ts`：只 re-export 上述七个文件。

  文件内部依赖使用同级相对 import，例如：

  ```ts
  import type { AiAgentDomain, AiAgentMode, AiThinkingLevel } from './agent'
  import type { ThreadMessage } from './message'
  ```

- [ ] **Step 5：将旧入口改成兼容 re-export**

  `src/ai/types.ts` 只保留：

  ```ts
  export * from '../../shared/ai/contracts'
  ```

  `src/types/ai.ts` 继续从 `../ai/types` re-export，确保现有 renderer 调用方不需要同批修改。

- [ ] **Step 6：验证契约行为和类型检查**

  运行：

  ```bash
  node --test tests/ai-contracts.test.mjs
  npm run type-check
  npm test -- --test-name-pattern="Effective model budget|Agent tool-name translations|pending command queue"
  ```

  预期：全部 PASS。

- [ ] **Step 7：提交共享契约**

  ```bash
  git add shared/ai/contracts src/ai/types.ts src/types/ai.ts tsconfig.json tsconfig.electron.json vite.config.ts tests/ai-contracts.test.mjs
  git commit -m "refactor(ai): extract shared contracts"
  ```

## Task 3：收敛 IPC 协议与解除 DomainStrategy 循环

**文件：**

- 新建：`shared/ai/contracts/protocol.ts`
- 修改：`shared/ai/contracts/review.ts`
- 修改：`shared/ai/contracts/index.ts`
- 修改：`electron/ai/ipc/protocol.ts`
- 修改：`electron/ai/domain/DomainStrategy.ts`
- 修改：`src/ai/ipc.ts`
- 修改：`src/types/ai-ipc.ts`
- 修改：`electron/preload.ts`
- 测试：`tests/ai-contracts.test.mjs`

**接口：**

- 生成：共享 `AiIpcInvokeMap`、run events、snapshot/editor state DTO 和 `DomainReviewItem`。
- 保留：`electron/ai/ipc/protocol.ts`、`src/ai/ipc.ts`、`src/types/ai-ipc.ts` 临时兼容入口。

- [ ] **Step 1：扩展失败测试**

  从共享入口导入 `isDomainReviewItem`，断言只接受三种合法 payload：

  ```js
  assert.equal(isDomainReviewItem({ kind: 'filesystem', payload: { id: 'x' } }), true)
  assert.equal(isDomainReviewItem({ kind: 'unknown', payload: {} }), false)
  ```

  该 guard 用于 IPC 边界的最小判别，不替代完整业务校验。

- [ ] **Step 2：验证 guard 尚不存在**

  运行：`node --test tests/ai-contracts.test.mjs`

  预期：FAIL，`isDomainReviewItem` 未导出。

- [ ] **Step 3：迁移协议和 review 联合类型**

  - 将现有 `electron/ai/ipc/protocol.ts` 的 DTO 移到共享 `protocol.ts`。
  - 将 `DomainReviewItem` 移到共享 `review.ts`。
  - `protocol.ts` 从 `review.ts` 导入，不再反向引用 DomainStrategy。
  - 实现 `isDomainReviewItem(value: unknown): value is DomainReviewItem`，仅检查对象、kind 和 payload 对象存在。

- [ ] **Step 4：改造兼容入口与直接消费者**

  - `electron/ai/ipc/protocol.ts` 改为从共享协议 re-export。
  - `src/ai/ipc.ts`、`src/types/ai-ipc.ts` 直接从共享协议 re-export。
  - `DomainStrategy.ts` 从共享契约导入 `DomainReviewItem` 和 `ResumeDecision`。
  - `electron/preload.ts` 从共享契约导入 AI 类型。

- [ ] **Step 5：验证循环解除**

  运行：

  ```bash
  node --test tests/ai-contracts.test.mjs tests/domain-review-strategy.test.mjs
  npm run type-check
  ```

  预期：全部 PASS，`DomainStrategy.ts ↔ protocol.ts` 不再互相 import。

- [ ] **Step 6：提交协议收敛**

  ```bash
  git add shared/ai/contracts electron/ai/ipc/protocol.ts electron/ai/domain/DomainStrategy.ts src/ai/ipc.ts src/types/ai-ipc.ts electron/preload.ts tests/ai-contracts.test.mjs
  git commit -m "refactor(ai): centralize IPC contracts"
  ```

## Task 4：迁移共享纯逻辑并清除 `electron/ai -> src` 依赖

**文件：**

- 新建：`shared/ai/core/detectInputLanguage.ts`
- 新建：`shared/ai/core/hitl.ts`
- 新建：`shared/ai/core/modelBudget.ts`
- 新建：`shared/ai/core/modelProfiles.ts`
- 新建：`shared/ai/core/threadTitle.ts`
- 新建：`shared/ai/core/tokenEstimation.ts`
- 新建：`electron/ai/domain/edit/systemPrompt.ts`
- 新建：`electron/ai/domain/creative/systemPrompt.ts`
- 修改：所有当前从 `src/ai` 或 `src/types/ai` 导入的 `electron/ai/**/*.ts`
- 修改：`electron/App.ts`
- 修改：`src/ai/model/*`、`src/ai/message/detectInputLanguage.ts`、`src/ai/hitl.ts`、`src/ai/thread/title.ts`
- 修改：引用旧 prompt 路径的测试
- 测试：`tests/ai-architecture-boundaries.test.mjs`

**接口：**

- 生成：主进程和 renderer 均可使用的纯逻辑入口。
- 保留：renderer 旧路径的临时 re-export。

- [ ] **Step 1：再次运行架构测试确认 RED**

  运行：`node --test tests/ai-architecture-boundaries.test.mjs`

  预期：FAIL，并列出尚存的 `electron/ai -> src` import。

- [ ] **Step 2：移动纯逻辑并保留 renderer 兼容入口**

  原文件内容原样迁移，旧文件只 re-export：

  ```ts
  export * from '../../../shared/ai/core/detectInputLanguage'
  ```

  `modelBudget.ts` 和 `modelProfiles.ts` 从共享契约导入 provider/model 类型。

- [ ] **Step 3：把 system prompt 归还给主进程 domain**

  将 Edit 和 Creative prompt 移入各自 domain 目录；策略使用同目录 import。更新 prompt 测试入口，不保留 renderer 到 main 的 re-export。

- [ ] **Step 4：迁移主进程 AI import**

  所有 `electron/ai/**/*.ts` 改为从 `shared/ai/contracts` 或 `shared/ai/core/*` 导入。`electron/App.ts` 和 `electron/preload.ts` 的 AI 类型也改为共享入口。

- [ ] **Step 5：验证边界测试转绿**

  运行：

  ```bash
  node --test tests/ai-architecture-boundaries.test.mjs
  node --test tests/agent-engine-initialization.test.mjs tests/edit-prompt-skills.test.mjs tests/creative-skill-playbook.test.mjs tests/web-research-skill.test.mjs
  npm run type-check
  npm test
  ```

  预期：架构测试及全部既有测试 PASS。

- [ ] **Step 6：提交边界清理**

  ```bash
  git add shared/ai/core electron/ai electron/App.ts electron/preload.ts src/ai tests
  git commit -m "refactor(ai): enforce shared runtime boundary"
  ```

## 后续里程碑

以下内容是总体路线，不属于本文件的当前执行批次。Phase 0–1 验收后，逐项重新检查真实代码并各自制定带测试循环的详细计划。

### 里程碑 2：拆解主进程 AgentEngine

#### 已确认设计：线程与 writing-session 编排

本批次只调整应用层职责归属，保持现有 IPC channel、公开方法签名、LangGraph
resume payload、renderer review payload、审批顺序、自动应用条件、checkpoint 行为及错误
处理不变。`AgentEngine` 继续作为 IPC 门面，保留模型装配、预算校验、初始/恢复运行、
stream 消费和 LangGraph interrupt 接线，不引入新的事件总线或通用状态机。

##### `ThreadService`

`electron/ai/application/ThreadService.ts` 负责线程用例编排，依赖
`ThreadListQuery`、`ThreadRuntimeStore`、`AgentRunner`、`AgentCache`、
`WritingSessionRegistry`、`CheckpointerAdmin` 和 checkpointer 读取接口。它不创建模型、
不启动 agent、不解析 stream，也不直接发送 renderer 事件。

它提供以下应用接口：

- `listThreads()`：读取 metadata 并转换为 `AiThread`。
- `readMessages(threadId)`：从 checkpoint 读取 LangChain messages，返回
  `{ messages: ThreadMessage[]; rawMessages: unknown[] }`，供 `AgentEngine` 维持现有 interrupt
  rehydration 时机；读取失败时记录日志并返回两个空集合。
- `prepareTurn(settings, request)`：解析或创建 thread/turn ID，更新 provider、model、domain、
  mode、thinking level、标题、workspace、语言和 current turn，并清理该线程遗留的内存
  interrupt；返回 `PreparedThreadTurn`，不构建用户消息、不校验预算、不启动运行。
- `cancel(threadId)`：等待活动任务结束，然后清理 interrupted/current-turn 和本 turn 的
  fallback 通知键。
- `deleteThread(threadId)` 与 `clearThreads()`：按当前顺序清理 metadata、runtime、runner、
  agent cache、writing session 和 checkpoint；fallback 通知状态通过显式回调清理。

`PreparedThreadTurn` 包含 `threadId`、`turnId`、`isNewThread`、`ResolvedThreadRuntime` 和
`DetectedInputLanguage`。`AgentEngine.sendMessage()` 只使用该结果构建消息、执行预算校验并启动
`_runSession()`。

##### `WritingSessionCoordinator`

`electron/ai/application/WritingSessionCoordinator.ts` 围绕现有
`WritingSessionRegistry` 管理 writing transaction 的副作用。Registry 继续只保存授权、
活动 session、基线、累积编辑和 agent snapshot；既有纯裁决函数仍留在 approval 层。
Coordinator 依赖 Registry、`SnapshotBroker`、`ThreadRuntimeStore`、domain strategy 查询和
`RendererEventBridge`；不创建模型、不解析 stream、不访问 checkpoint，也不拼装 LangGraph
resume decision。

它负责：

- 从 interrupt action requests 提取并保存 `confirm_writing_plan` 与 `finalize_chapter` 参数。
- 执行 writing-session 相关的 interrupt Stage 2/2b 编排：调用既有纯裁决函数检查委派写入
  授权，判定授权范围内的 block edit/`create_document` 是否进入 renderer 静默应用，并返回
  `autoApplyOriginalIndices`、`autoApplyFiles`、累积结果或拒绝结果。Filesystem Stage 1、批次
  poisoning 和 domain mixed-kind 规则仍由 `AgentEngine` 维持现有先后顺序。
- 通过统一快照路由捕获章节：优先读取打开编辑器的 `viewMarkdown`，失败或未打开时回退
  磁盘；文件不存在返回 `null`。
- 对本批 `autoAppliedFiles` 逐一记录 agent snapshot，禁止扫描所有活动 session，以免把
  中断期间的作者手改错误归因给 agent。
- 在 plan 获批或修改后，以修改后的参数为准登记授权，并在任何正文编辑发生前锚定基线。
- 为 finalize review 填充现有协议字段 `baseline`、`current` 和 `hasExternalEdits`；不扩展
  renderer review payload。
- 处理 finalize decision：approve/edit 保留文件并关闭 session；responded 保持 session
  开放以便返工；rejected 将 baseline 写回磁盘后关闭 session。写回失败沿用现有错误日志，
  不改变 decision 流程。
- Creative run 正常结束但仍存在已累积且未 finalize 的 session 时，生成 synthetic
  finalize interrupt；editing domain 不生成。Synthetic finalize 的 resume 只执行上述 host
  副作用并发送 run-done，不向 LangGraph 发送不存在的 `Command`。

##### 调用顺序与所有权

初始消息的数据流固定为：

```text
AgentEngine.sendMessage
  -> ThreadService.prepareTurn
  -> buildUserMessage + budget check
  -> AgentEngine._runSession
```

恢复审批的数据流固定为：

```text
AgentEngine.resumeRun
  -> InterruptCoordinator.mergeDecisions
  -> WritingSessionCoordinator.recordAutoAppliedSnapshots
  -> WritingSessionCoordinator.registerApprovedPlans
  -> WritingSessionCoordinator.applyFinalizeDecisions
  -> synthetic finalize: run-done
     live interrupt: InterruptCoordinator.buildLangGraphDecisions -> _continueSession
```

正常 run 结束的数据流固定为：

```text
AgentEngine._streamLoop
  -> domain onSessionComplete
  -> WritingSessionCoordinator.synthesizeRunEndFinalize
  -> interrupted: 等待终审
     not interrupted: run-done
```

依赖所有权保持单向：`AgentEngine -> application services -> runtime/registry/adapters`。
`ThreadService` 与 `WritingSessionCoordinator` 不互相引用，二者通过 `AgentEngine` 现有调用顺序
协作，避免形成新的中心对象。

##### 测试与验收

实现必须按 TDD 分成两个独立批次：

1. `ThreadService` 直接测试覆盖新建/已有线程、标题和 context 初始化、读取失败、取消、单线程
   删除及全部清理；测试先因模块/接口不存在而失败，再迁移生产逻辑。
2. `WritingSessionCoordinator` 直接测试覆盖 approved/edited plan、auto-applied snapshot 归因、
   finalize approve/reject/responded、拒绝回滚、Creative synthetic finalize 和 editing no-op；
   测试先因模块/接口不存在而失败，再迁移生产逻辑。

每批迁移后运行对应直接测试、`tests/agent-engine-initialization.test.mjs`、
`tests/writing-session.test.mjs` 和类型检查。最终验收运行完整 `npm test`、`npm run lint`、
`npm run type-check` 与 `git diff --check`，并确认 `AgentEngine` 不再持有线程资源清理及
writing-session 生命周期私有方法。

#### 里程碑 2 后续执行任务

##### Task 2.1：提取并接入 `ThreadService`

**文件：**

- 新建：`electron/ai/application/ThreadService.ts`
- 新建：`tests/thread-service.test.mjs`
- 修改：`electron/ai/AgentEngine.ts`
- 修改：`tests/agent-engine-initialization.test.mjs`

**接口：**

```ts
export interface PreparedThreadTurn {
  threadId: string
  turnId: string
  isNewThread: boolean
  runtime: ResolvedThreadRuntime
  language: DetectedInputLanguage
}

export class ThreadService {
  listThreads(): AiThread[]
  readCheckpointMessages(threadId: string): Promise<unknown[]>
  convertMessages(rawMessages: unknown[]): ThreadMessage[]
  prepareTurn(settings: AiSettings, request: SendMessageRequest): PreparedThreadTurn
  clearStaleInterrupt(threadId: string): void
  cancel(threadId: string): Promise<void>
  deleteThread(threadId: string): void
  clearThreads(): void
  getMeta(threadId: string): ThreadMeta | null
}
```

构造依赖使用窄接口注入：checkpoint `get`、`ThreadListQuery`、`ThreadRuntimeStore`、runner
`cancel/deleteThread/clear`、cache `deleteThread/clear`、writing registry `clearThread/clearAll`、
checkpointer admin `deleteThread/clearAll`，以及 fallback 通知清理回调。

- [x] **Step 1：编写失败的 ThreadService 直接测试**

  `tests/thread-service.test.mjs` 通过 esbuild 加载尚不存在的模块，使用记录调用的 fake ports。
  核心断言为：

  ```js
  const prepared = service.prepareTurn(settings, {
    threadId: 'thread-1',
    turnId: 'turn-1',
    userText: '继续修改',
    uiLocale: 'zh-CN',
    domain: 'editing',
    mode: 'edit',
    workspacePath: '/workspace',
  })
  assert.equal(prepared.threadId, 'thread-1')
  assert.equal(prepared.turnId, 'turn-1')
  assert.equal(prepared.language, 'zh-CN')
  assert.deepEqual(runtimeStore.getContext('thread-1'), {
    workspacePath: '/workspace',
    language: 'zh-CN',
  })
  ```

  另测新线程创建并生成标题、已有线程 runtime metadata 更新、checkpoint 消息转换、读取异常
  返回双空集合、cancel 的清理顺序、delete/clear 覆盖全部资源。

- [x] **Step 2：验证测试因模块缺失失败**

  运行：`node --test tests/thread-service.test.mjs`

  预期：FAIL，esbuild 报告无法解析 `electron/ai/application/ThreadService.ts`。

- [x] **Step 3：实现最小 ThreadService 并接入 AgentEngine**

  在 `AgentEngine.initialize()` 创建 service；公开线程方法委托给 service。`sendMessage()` 改为：

  ```ts
  const prepared = this.threadService!.prepareTurn(AiConfigStore.loadSettings(), req)
  const { threadId, runtime, language } = prepared
  const userContent = await buildUserMessage(req)
  this._assertWithinBudget(
    runtime.providerConfig,
    runtime.domain,
    runtime.mode,
    runtime.modelId,
    runtime.thinkingLevel,
    userContent,
    language,
    threadId,
  )
  ```

  `getThreadMessages()` 依次调用 `readCheckpointMessages()`、`_maybeRehydrateInterrupt()` 和
  `convertMessages()`，并以同一个 `try/catch` 保持旧错误边界。`sendMessage()` 仅在消息构建和预算
  校验成功后调用 `clearStaleInterrupt()`。Context stats 和 stream metadata 查询统一改用
  `threadService.getMeta()`。

- [x] **Step 4：验证 ThreadService 与 AgentEngine 回归**

  运行：

  ```bash
  node --test tests/thread-service.test.mjs tests/agent-engine-initialization.test.mjs
  npm run type-check
  ```

  预期：新增测试和现有 AgentEngine 初始化测试全部 PASS，TypeScript 无错误。

- [x] **Step 5：提交线程编排拆分**

  ```bash
  git add electron/ai/application/ThreadService.ts electron/ai/AgentEngine.ts \
    tests/thread-service.test.mjs tests/agent-engine-initialization.test.mjs
  git commit -m "refactor(ai): extract thread orchestration"
  ```

##### Task 2.2：提取 writing-session 生命周期协调器

**文件：**

- 新建：`electron/ai/application/WritingSessionCoordinator.ts`
- 新建：`tests/writing-session-coordinator.test.mjs`

**接口：**

```ts
export interface HitlActionRequest {
  name: string
  args: Record<string, unknown>
}

export type PreparedWritingAction =
  | { kind: 'requires-review' }
  | { kind: 'auto-apply'; filePath: string }
  | {
      kind: 'auto-reject'
      decision: ResumeDecision
      filePath: string
      message: string
    }

export class WritingSessionCoordinator {
  stashInterruptArgs(actionRequests: HitlActionRequest[]): Pick<
    InterruptedRun,
    'confirmPlanArgsByIndex' | 'finalizeArgsByIndex'
  >
  recordAutoAppliedSnapshots(threadId: string, files: string[]): Promise<void>
  registerApprovedPlans(
    threadId: string,
    interrupted: InterruptedRun,
    decisions: ResumeDecision[],
  ): Promise<void>
  applyFinalizeDecisions(
    threadId: string,
    interrupted: InterruptedRun,
    decisions: ResumeDecision[],
  ): void
  decorateReviews(
    reviews: DomainReviewItem[],
    threadId: string,
    reviewOriginalIndices?: number[],
    autoApplyOriginalIndices?: Set<number>,
  ): Promise<void>
}
```

构造依赖为 `WritingSessionRegistry`、`SnapshotBroker`、`ThreadRuntimeStore`、读取线程 domain 的
回调、domain strategy 查询回调及 `RendererEventBridge`。文件存在性、磁盘读取和拒绝回滚继续使用
Node `fs`，保持现有日志和 watcher 触发语义。

- [x] **Step 1：编写失败的 lifecycle 直接测试**

  使用真实 `WritingSessionRegistry`、临时章节文件和 fake snapshot broker，覆盖：

  ```js
  await coordinator.registerApprovedPlans('thread-1', {
    actionRequestCount: 1,
    actionNames: ['confirm_writing_plan'],
    confirmPlanArgsByIndex: {
      0: { plan: '初稿计划', targetFiles: [chapter] },
    },
  }, [{
    type: 'edited',
    editedArgs: { plan: '修改后计划', target_files: [chapter] },
  }])

  assert.equal(registry.getPlanText('thread-1'), '修改后计划')
  assert.equal(registry.getActiveSession('thread-1', chapter).baselineSnapshot, 'EDITOR BASELINE')
  ```

  再分别断言 `recordAutoAppliedSnapshots()` 只更新入参文件；finalize approve/edit 关闭、responded
  保持、rejected 恢复 baseline 后关闭；`decorateReviews()` 只写入当前协议字段并正确计算
  `hasExternalEdits`。

- [x] **Step 2：验证测试因模块缺失失败**

  运行：`node --test tests/writing-session-coordinator.test.mjs`

  预期：FAIL，esbuild 报告无法解析
  `electron/ai/application/WritingSessionCoordinator.ts`。

- [x] **Step 3：实现 lifecycle 方法**

  从 `AgentEngine` 原样迁移参数提取、路径验证、统一快照、计划登记、snapshot 归因、review
  decoration 和 finalize decision 副作用。拒绝回滚代码保持：

  ```ts
  if (decision.type === 'rejected' && session?.baselineSnapshot != null) {
    try {
      fs.writeFileSync(chapterPath, session.baselineSnapshot, 'utf-8')
    } catch (error) {
      console.error('[AgentEngine] finalize reject restore failed:', error)
    }
  }
  if (decision.type !== 'responded') registry.closeSession(threadId, chapterPath)
  ```

- [x] **Step 4：验证 lifecycle 测试**

  运行：

  ```bash
  node --test tests/writing-session-coordinator.test.mjs tests/writing-session.test.mjs
  npm run type-check
  ```

  预期：新增 lifecycle 测试及 Registry 既有测试全部 PASS。

- [x] **Step 5：提交 writing-session 生命周期模块**

  ```bash
  git add electron/ai/application/WritingSessionCoordinator.ts \
    tests/writing-session-coordinator.test.mjs
  git commit -m "refactor(ai): extract writing session lifecycle"
  ```

##### Task 2.3：接入 interrupt Stage 2/2b 与 synthetic finalize

**文件：**

- 修改：`electron/ai/AgentEngine.ts`
- 修改：`electron/ai/application/WritingSessionCoordinator.ts`
- 修改：`tests/writing-session-coordinator.test.mjs`
- 修改：`tests/writing-session.test.mjs`
- 修改：`tests/agent-engine-initialization.test.mjs`

**接口：** 扩展 Task 2.2 的 coordinator；不新增通用 review coordinator。

```ts
prepareAction(
  threadId: string,
  action: HitlActionRequest,
  delegated: boolean,
): Promise<PreparedWritingAction>

synthesizeRunEndFinalize(threadId: string, turnId?: string): Promise<boolean>
```

- [x] **Step 1：先增加失败测试**

  增加三类可观察断言：

  ```js
  const rejected = await coordinator.prepareAction('thread-1', {
    name: 'edit_block',
    args: { file_path: chapter, block_id: 1 },
  }, true)
  assert.equal(rejected.kind, 'auto-reject')

  const allowed = await coordinator.prepareAction('thread-1', {
    name: 'edit_block',
    args: { file_path: chapter, block_id: 1 },
  }, false)
  assert.deepEqual(allowed, { kind: 'auto-apply', filePath: chapter })

  assert.equal(await coordinator.synthesizeRunEndFinalize('thread-1', 'turn-1'), true)
  assert.equal(sentEvents[0].reviews[0].payload.autoFallback, true)
  ```

  同时先增加架构 source assertion：两个 application service 文件必须存在；`AgentEngine` 不得
  声明 Task 2.3 将删除的九个私有方法；只有 coordinator 可以调用
  `decideWritingSessionApproval()`/`decideDelegatedWriteGate()`。保留既有断言，确保 delegated
  origin 仍只来自最新 root tool batch，而不是 run-wide partial message。

- [x] **Step 2：验证新增测试按预期失败**

  运行：

  ```bash
  node --test tests/writing-session-coordinator.test.mjs tests/writing-session.test.mjs
  ```

  预期：FAIL 于尚未实现的 `prepareAction()`/`synthesizeRunEndFinalize()`，以及 AgentEngine
  仍残留的直接编排断言。

- [x] **Step 3：迁移 AgentEngine 接线**

  - Filesystem Stage 1 和 poisoning 仍先执行。
  - `delegatedActionIndices()` 仍基于最新 root tool batch计算，但每项 Stage 2/2b 交给
    `writingSessionCoordinator.prepareAction()`。
  - auto-apply 项仍进入 review batch，只通过 `decorateReviews()` 标记给 renderer；auto-reject
    项不进入 review batch。
  - interrupted state 的 plan/finalize args 来自 `stashInterruptArgs()`。
  - resume 顺序保持 snapshot → plan registration → finalize decisions → synthetic/live 分支。
  - 正常 run complete 改调 `synthesizeRunEndFinalize()`；返回 true 时不发送 run-done。

- [x] **Step 4：删除 AgentEngine 中已迁移私有方法并修正注释**

  删除 `_stashConfirmPlanArgs`、`_stashFinalizeArgs`、`_resolveChapterPath`、
  `_captureChapterBaseline`、`_enrichFinalizeReviews`、`_handleFinalizeDecisions`、
  `_maybeSynthesizeRunEndFinalize`、`_markAutoApplyReviews` 和
  `_registerApprovedWritingPlans`。更新 `CreativeReviewAdapter`、`FinalizeChapter`、
  `WritingSessionRegistry` 中指向旧私有方法的注释。

- [x] **Step 5：验证 interrupt/resume 与 AgentEngine 回归**

  运行：

  ```bash
  node --test tests/writing-session-coordinator.test.mjs \
    tests/writing-session.test.mjs tests/agent-engine-initialization.test.mjs \
    tests/agent-runtime-modules.test.mjs
  npm run type-check
  ```

  预期：所有定向测试 PASS，`AgentEngine.ts` 不含上述九个私有方法。

- [x] **Step 6：提交 coordinator 接线**

  ```bash
  git add electron/ai/AgentEngine.ts electron/ai/application/WritingSessionCoordinator.ts \
    electron/ai/ipc/CreativeReviewAdapter.ts \
    electron/ai/scaffold/approval/WritingSessionRegistry.ts \
    electron/ai/tools/creative/FinalizeChapter.ts \
    tests/writing-session-coordinator.test.mjs tests/writing-session.test.mjs \
    tests/agent-engine-initialization.test.mjs
  git commit -m "refactor(ai): delegate writing session orchestration"
  ```

##### Task 2.4：最终验收与文档状态

**文件：**

- 修改：`tests/ai-architecture-boundaries.test.mjs`
- 修改：`design/AGENTIC_EDITING.md`
- 修改：`design/agent-structure-refactor-plan.md`

- [x] **Step 1：更新现有架构说明与实施状态**

  `design/AGENTIC_EDITING.md` 记录 `ThreadService` 与 `WritingSessionCoordinator` 的职责；本文件
  顶部状态更新为已落地，并勾选 Task 2.1–2.4 的步骤。

- [x] **Step 2：执行最终验证**

  运行：

  ```bash
  npm test
  npm run lint
  npm run type-check
  git diff --check
  ```

  预期：全部测试 PASS，ESLint 和两个 TypeScript project 无错误，diff 无空白错误。

- [x] **Step 3：提交验收门禁与文档**

  ```bash
  git add tests/ai-architecture-boundaries.test.mjs design/AGENTIC_EDITING.md \
    design/agent-structure-refactor-plan.md
  git commit -m "test(ai): guard application orchestration boundaries"
  ```

**文件：**

- 新建：`electron/ai/runtime/RuntimeConfig.ts`
- 新建：`electron/ai/runtime/AgentCache.ts`
- 新建：`electron/ai/runtime/AgentFactory.ts`
- 新建：`electron/ai/runtime/AgentRunner.ts`
- 新建：`electron/ai/application/ThreadService.ts`
- 新建：`electron/ai/application/InterruptCoordinator.ts`
- 新建：`electron/ai/application/WritingSessionCoordinator.ts`
- 新建：`electron/ai/application/RunCoordinator.ts`
- 新建：`electron/ai/AgentService.ts`
- 修改：`electron/ai/AgentEngine.ts`
- 测试：拆分 `tests/agent-engine-initialization.test.mjs` 并为每个新模块增加直接测试。

**接口：**

- `RuntimeConfig`：稳定描述 provider/model/domain/mode/language/workspace/budget。
- `AgentFactory.build(config)`：装配 DeepAgent 和 filesystem scaffold。
- `AgentCache.getOrCreate(config, build)`：管理实例、失效和 scaffold 清理。
- `AgentRunner.runInitial/runResume/cancel`：管理流和 AbortController。
- `AgentService`：保持现有公共方法签名。

拆分顺序为 `RuntimeConfig/AgentCache`、`AgentFactory`、`AgentRunner`、`InterruptCoordinator`、`ThreadService/WritingSessionCoordinator`、`AgentService`。每个模块先写直接行为测试，再迁移对应职责；保持当前公共方法签名。

### 里程碑 3：拆解 renderer 状态和 conversation presentation

**文件：**

- 新建：`src/ai/client/AgentClient.ts`
- 新建：`src/ai/state/settings.ts`
- 新建：`src/ai/state/threads.ts`
- 新建：`src/ai/state/run.ts`
- 新建：`src/ai/state/reviews/*`
- 新建：`src/ai/presentation/conversation/types.ts`
- 新建：`src/ai/presentation/conversation/displayRules.ts`
- 新建：`src/ai/presentation/conversation/mergeLiveTurn.ts`
- 新建：`src/ai/presentation/conversation/buildConversationEntries.ts`
- 修改：`src/ai/store/ai.ts`
- 修改：`src/ai/store/modules/runtimeDisplay.ts`
- 测试：`tests/context-summarization.test.mjs`、`tests/pending-command-queue.test.mjs`、`tests/review-rejection.test.mjs`。

**接口：**

- `AgentClient` 是 `window.electronAPI.ai*` 的唯一 AI 访问入口。
- `buildConversationEntries(input): ConversationEntry[]` 是不依赖 Vue 的纯转换函数。
- `useAiStore` 保持现有组件调用 API，内部只装配模块。

先引入 `AgentClient`，再提取纯 `conversation` 转换，最后按 settings/threads/run/reviews 拆 store。`useAiStore` 保持兼容 facade，直到所有组件完成迁移。

### 里程碑 4：将 AI Vue 组件垂直聚合到 `src/ai/components`

**文件：**

- 移动：`src/components/ai/** -> src/ai/components/**`
- 移动：`src/components/AiStatusButton.vue -> src/ai/components/shell/AiStatusButton.vue`
- 修改：`src/views/MainView.vue`
- 修改：`src/components/preferences/PreferencesDialog.vue`
- 修改：所有 AI 组件内部 import。

**接口：**

- AI 外部只直接引用 `AgentPanel.vue`、`AiStatusButton.vue` 和 `ProviderSettings.vue`。
- `src/ai/components` 可以依赖 state/presentation/editor；这些目录不得依赖 components。

按 shell/composer/conversation/reviews/settings 移动组件。AI 外部只直接引用三个入口组件，并增加反向依赖门禁。

### 里程碑 5：删除兼容入口并更新架构说明

**文件：**

- 删除：无消费者后的 `src/types/ai.ts`、`src/types/ai-ipc.ts`、`src/stores/ai.ts`、`electron/ai/ipc/protocol.ts` 兼容文件。
- 修改：`design/AGENTIC_EDITING.md`
- 修改：`eslint.config.mjs`
- 修改：`tests/ai-architecture-boundaries.test.mjs`

**接口：**

- 新代码统一使用 `@shared/ai/contracts`。
- renderer 统一使用 `@/ai/state/aiStore` 和 `@/ai/components/*`。

确认旧入口零消费者后再删除，随后把边界规则加入 ESLint，并更新 `design/AGENTIC_EDITING.md`。

## Phase 0–1 验收

- `electron/ai/**` 到 `src/**` 的 import 为零。
- `src/ai/**` 到 `electron/**` 的 import 为零。
- `shared/ai/**` 只依赖 shared 内部或第三方纯运行时库。
- `DomainStrategy` 和 IPC protocol 不再形成循环依赖。
- 共享 contract/core 的兼容测试通过。
- 完整 type-check 和 `.test.mjs` 测试通过。
