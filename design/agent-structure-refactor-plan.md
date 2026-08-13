# Agent 代码结构重构 Phase 0–1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**目标：** 在不改变 Edit、Creative、流式显示、HITL 和 checkpoint 行为的前提下，建立测试护栏，把跨进程契约和纯逻辑迁入 `shared/ai/`，并消除 AI 主进程与 renderer 之间的反向依赖。

**架构：** 先建立测试和依赖门禁，再把跨进程契约及纯逻辑迁到 `shared/ai/`。旧入口暂时变成 re-export，以便按批次迁移消费者。`AgentEngine`、renderer store 和 Vue 组件的拆分列入后续里程碑，分别制定实施计划；进程隔离不包含在本计划内。

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
