# Phase 4 — 生产中间件栈、CheckpointerAdmin、Memory 按 domain 拆分（B1 + B4 + B5）

## Context

`design/agentrefactor/refactor.md` 列出 iWriter AI 引擎与 deepagents 官方推荐的偏差。Phase 1（A1 + A2，上下文类型化 + streamEvents v3）、Phase 2（A3 + A5 + B2，DeepSeek 替换 + OrphanStripper + execute hack 移除）、Phase 3（A4 + B3，HITL respond + planner 校验注释）已完成。Phase 4 处理三项 B 组偏差：

- **B1** — 生产中间件栈缺失。`AgentEngine.ts:681` 的 middleware 数组只有 Phase 1–3 的三条业务 middleware（OrphanStripper / HumanRespondMessage / TaskToolCompat），没有任何官方推荐的稳定性 / 资源约束 middleware。长会话已观察到 token 溢出风险（`_assertWithinBudget` 仅在入口拦截单次输入，不防止累积超限）；瞬时网络错误直接挂掉 stream；单 run 工具调用无上限。deepagents 迁移决策当初承诺的 `summarizationMiddleware` 至今未接入，是技术债中价值最高的一项。

- **B4** — `AgentEngine.ts:134-160` 的 `deleteThread` / `clearThreads` 直接通过 `(saver as any).db` 拿到 better-sqlite3 Database，手写 `DELETE FROM checkpoints` / `DELETE FROM writes`。`CheckpointerFactory.ts:45` 的 `(saver as any).db ?? (saver as any).conn` cast 把内部字段名暴露给业务层；SqliteSaver 字段名一旦在升级中改变，编译期不报错，运行时静默失效（删除按钮看似正常但数据未清）。封装到 `CheckpointerAdmin` 把 `any` 收拢到一个文件并把 `Database` 类型化，是低成本的可维护性改进。

- **B5** — `AgentEngine.ts:677` 的 `memory: [path.join(this.aiRootPath, 'memory', 'AGENTS.md')].filter(fs.existsSync)` 让 edit / creative 两个 domain 共用同一份 AGENTS.md。两个 domain 的工具集、子代理、Backend、HITL 行为差异巨大（refactor.md §1.2），共用 memory 意味着任何 domain-specific 指引都污染另一方上下文。按 domain 拆分为 `AGENTS.edit.md` / `AGENTS.creative.md`，是 Phase 5（DomainStrategy 解耦）的前置整理。

Phase 4 不动业务语义。预期产出：5 条生产 middleware 接入；`CheckpointerAdmin` 封装写路径；memory 按 domain 拆分；`AiProviderConfig` 新增 `fallbackModelId` 字段并在设置 UI 暴露。

---

## 关键决策（已用户确认）

1. **Summarization 走 deepagents 的 `createSummarizationMiddleware`，不用 langchain 同名变体**。理由：`AgentEngine.ts:722` 的 `_getCurrentSessionTokens` 已读 `channel_values._summarizationEvent.summaryMessage` / `cutoffIndex`——这是 deepagents 变体写入 state 的字段（langchain 变体不写）。token-counting 快速路径要保留，必须沿用 deepagents 变体。同时 deepagents 变体接受 `backend` 参数把 offloaded messages 持久化到 `CompositeBackend`，与 iWriter 现有 backend 拓扑契合。

2. **`modelFallbackMiddleware` 完整接入**（不延期、不写死）。`AiProviderConfig` 新增 `fallbackModelId?: string`，`ProviderSettings.vue` 提供配置入口，`_getOrCreateAgent` 把 fallback 解析为 `BaseChatModel` 后传入。语义对齐：fallback 共享当前 provider 的 apiKey / baseUrl，只切 modelId（跨 provider fallback 留 Phase 5+ 评估）。

3. **`CheckpointerAdmin` 范围按 refactor.md 收紧**：只覆盖写路径 `deleteThread(threadId)` / `clearAll()`。读路径（`getThreadMessages` 的 `tuple as any` @ AgentEngine.ts:123、`_getCurrentSessionTokens` @ AgentEngine.ts:719）不动——它们读 checkpoint tuple 的公开字段，与 SqliteSaver 内部存储无关。`ThreadListQuery.ts` 继续直接管理 `thread_metadata` 表（独立表，非 SqliteSaver 内部表）。

4. **AGENTS.md 拆分粒度限定为 domain 级**：`AGENTS.edit.md` / `AGENTS.creative.md`。`minimal` mode 落在 `editing` domain 下（`_buildAgentCapabilities:794-798`），共享 `AGENTS.edit.md`。Mode 级拆分留待真有需求时再细分。

5. **refactor.md §四风险表里的 `preserve: ['tool_calls']` 不存在**：实勘 `node_modules/deepagents/dist/index.d.ts:2440-2487` 的 `SummarizationMiddlewareOptions`，无任何 `preserve` 字段；AI/Tool message 对的连贯性保护在 deepagents 与 langchain 两个变体内都是内置行为，由 `keep` window 自然保证。Phase 4 不接 `preserve` 选项；refactor.md 这一行需勘误。

6. **中间件链顺序补丁**：refactor.md §三 Phase 4 给出的最终顺序漏掉了 Phase 3 新增的 `HumanRespondMessageMiddleware`。最终顺序见 §B1.2。

---

## B1 — 生产中间件栈

### B1.1 配置常量集中

新建 `electron/ai/runtime/middleware-config.ts`：

```ts
// Phase 4 生产中间件统一配置常量。调优时改这里，不要散落到 AgentEngine。
import {
  SUMMARIZATION_TRIGGER_FRACTION,
  SUMMARIZATION_KEEP_FRACTION,
  SUMMARIZATION_FALLBACK_TRIGGER_TOKENS,
  SUMMARIZATION_FALLBACK_KEEP_MESSAGES,
} from '../../../src/ai/model-budget'

export const MIDDLEWARE_CONFIG = {
  summarization: {
    // 与 model-budget.ts 同源：_assertWithinBudget 用 SUMMARIZATION_TRIGGER_FRACTION 拦截
    // 单次输入，summarization 用同一阈值触发压缩，确保两条线一致。
    triggerFraction: SUMMARIZATION_TRIGGER_FRACTION,              // 0.85
    keepFraction: SUMMARIZATION_KEEP_FRACTION,                    // 0.10
    fallbackTriggerTokens: SUMMARIZATION_FALLBACK_TRIGGER_TOKENS, // 170_000
    fallbackKeepMessages: SUMMARIZATION_FALLBACK_KEEP_MESSAGES,   // 6
    trimTokensToSummarize: 4000,
    historyPathPrefix: '/conversation_history',
  },
  retry: {
    maxRetries: 3,
    backoffFactor: 2.0,
    initialDelayMs: 500,
    maxDelayMs: 8000,
    jitter: true,
    onFailure: 'continue' as const, // 主+fallback 都失败时返回带 error 的 AIMessage，不 throw
  },
  modelCallLimit: {
    // creative 长 plan + 多轮 review 在 800-1200 calls 量级是常态，2000 留足边际
    threadLimit: 2000,
    runLimit: 200,
    exitBehavior: 'end' as const, // 优雅终止，不 throw
  },
  toolCallLimit: {
    threadLimit: 1000,
    runLimit: 200,
    exitBehavior: 'continue' as const, // 超限工具拒绝、其他工具仍可执行
  },
} as const
```

**模型 profile 未提供 maxInputTokens 时**：deepagents `createSummarizationMiddleware` 在 `fraction` trigger 下需要 model 有 `profile.maxInputTokens`；若缺失，需在调用点用 `buildSummarizationTrigger(model)` helper 切换到绝对 token 阈值兜底（详见 §B1.5）。

### B1.2 最终 middleware 数组顺序

`AgentEngine.ts:669-683` 的 `createDeepAgent` 调用前先解析 `fallbackModels`，然后扩展 middleware 数组：

```ts
const fallbackModels: BaseChatModel[] = []
if (config.fallbackModelId && config.fallbackModelId !== modelId) {
  try {
    fallbackModels.push(createChatModel(config, { modelId: config.fallbackModelId, thinkingLevel }))
  } catch (err) {
    // 静默降级：fallback 配错不应阻塞主模型；console.warn 暴露给开发者
    console.warn(
      `[AgentEngine] Failed to instantiate fallback model "${config.fallbackModelId}" for provider "${config.id}":`,
      err,
    )
  }
}

const agent = createDeepAgent({
  model,
  systemPrompt: getSystemPrompt(domain, mode, language),
  tools: capabilities.tools,
  backend: capabilities.backend,
  skills: capabilities.skills,
  memory: this._buildMemoryPaths(domain),
  checkpointer: this.checkpointerInstance?.checkpointer,
  interruptOn: capabilities.interruptOn,
  subagents: capabilities.subAgents,
  contextSchema: IWriterAgentContextSchema,
  middleware: [
    // 顺序原则：
    //   1. 历史/消息形态处理类（OrphanStripper / HumanRespond / TaskCompat）排最前
    //   2. 资源约束类（call limit）在历史改造之后
    //   3. retry / fallback 包裹模型调用，必须最贴近 wrapModelCall
    //   4. summarization 作为最外层（"在所有处理之后再决定要不要压缩"）

    createOrphanToolCallStripperMiddleware(),                         // Phase 2
    createHumanRespondMessageMiddleware(),                            // Phase 3
    createTaskToolCompatMiddleware(),                                 // Phase 1 起

    modelCallLimitMiddleware(MIDDLEWARE_CONFIG.modelCallLimit),       // B1 新
    toolCallLimitMiddleware(MIDDLEWARE_CONFIG.toolCallLimit),         // B1 新

    modelRetryMiddleware(MIDDLEWARE_CONFIG.retry),                    // B1 新
    ...(fallbackModels.length ? [modelFallbackMiddleware(...fallbackModels)] : []), // B1 新

    createSummarizationMiddleware({                                   // B1 新
      backend: capabilities.backend,
      ...buildSummarizationTrigger(model),
      trimTokensToSummarize: MIDDLEWARE_CONFIG.summarization.trimTokensToSummarize,
      historyPathPrefix: MIDDLEWARE_CONFIG.summarization.historyPathPrefix,
    }),
  ],
})
```

**为何 retry 在 summarization 之前（内层）**：retry 包裹单次模型调用是其设计意图。summarization 的 wrapModelCall 内部会发起一次额外 LLM 调用生成 summary——若 retry 在 summarization 外层，会把 summary 生成失败也算进 retry 次数，行为发散；放内层只重试主调用，summary 失败由 summarization 自身 fallback（deepagents 内部在 summary 失败时跳过压缩、不阻塞主流程）。

**为何 callLimit 在 retry 之前（外层）**：`modelCallLimitMiddleware` 累计 `threadModelCallCount`，放在 retry 外层意味着每次 retry 都算一次模型调用（计数膨胀 3 倍）；放内层只计入「成功送达 model 的调用」，更符合直觉。

### B1.3 modelFallback 数据流

#### 字段定义

`src/ai/types.ts:48-68` `AiProviderConfig` 接口新增：

```ts
/** Optional fallback model ID used by modelFallbackMiddleware when the primary model call fails. */
fallbackModelId?: string
```

#### 设置 UI 接入

`src/components/ai/ProviderSettings.vue`：

- `FormState` 接口（约 :281-292）新增 `fallbackModelId: string`
- 默认值（:294-305 + :349-355）新增 `fallbackModelId: ''`
- `startEdit` (:360-380) 映射 `cfg.fallbackModelId ?? ''`
- `submitForm` (:388-427) 写回 `fallbackModelId: form.value.fallbackModelId.trim() || undefined`
- 模板：在 `:127-143` 的 models 输入框之后（`selectedPreset?.id !== 'ollama'` 同条件下）插入：

```vue
<div v-if="selectedPreset?.id !== 'ollama'" class="flex flex-col gap-1.5">
  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.fallbackModel') }}</label>
  <input
    v-model="form.fallbackModelId"
    type="text"
    list="iw-fallback-models"
    :placeholder="t('preferences.ai.fallbackModelPlaceholder')"
    class="iw-input"
  />
  <datalist id="iw-fallback-models">
    <option v-for="m in availableModels" :key="m" :value="m" />
  </datalist>
  <p class="text-xs text-base-content/65">{{ t('preferences.ai.fallbackModelHint') }}</p>
</div>
```

`availableModels` 是新增 computed，复用现有 `form.value.modelsStr` 切分逻辑（参见 :391-394 同型代码）。

#### i18n key 增量

`src/i18n/messages/en-US.ts` 与 `src/i18n/messages/zh-CN.ts` 的 `preferences.ai.*` 段（仅这两个文件，仓库内无 zh-TW）：

```ts
// en-US
fallbackModel: 'Fallback model',
fallbackModelPlaceholder: 'Optional, used when primary model fails',
fallbackModelHint: 'Pick from the available models above',

// zh-CN
fallbackModel: '备用模型',
fallbackModelPlaceholder: '选填，主模型失败时自动切换',
fallbackModelHint: '从上面的可用模型列表中选择',
```

#### 主进程解析

见 §B1.2 中 `fallbackModels` 局部变量构造段。**为何不跨 provider**：跨 provider fallback（OpenAI → Anthropic）需处理 apiKey / baseUrl / thinking 参数体差异，复杂度大。Phase 4 限定同 provider 切 modelId，无歧义。

#### Fallback 触发通知

`modelFallbackMiddleware` 切换 fallback 时不发任何事件。Phase 4 接受静默生效（UI 不卡死、最终成功响应），Phase 5+ 评估接入 IPC 通知。

### B1.4 Summarization 与 HITL 的安全性

`HumanRespondMessageMiddleware`（Phase 3）依赖 `RESPOND_MARKER` 标记 ToolMessage。在 middleware 链中：OrphanStripper → HumanRespond → TaskCompat → callLimit → toolLimit → retry → fallback → summarization。HITL 恢复后下一次 wrapModelCall 进入链路时，HumanRespond 先于 summarization 改造 messages 形态，marker 已被剥；summarization 触发时永远看不到带 marker 的 ToolMessage。**结论：HITL 与 summarization 互不干扰**，无需额外协调。

### B1.5 buildSummarizationTrigger helper

deepagents `fraction` trigger 依赖 model 的 `profile.maxInputTokens`；自定义 provider 无 profile 时会退化为 NaN。在 `AgentEngine.ts` 内新增私有方法：

```ts
private _buildSummarizationTrigger(model: BaseChatModel): {
  trigger: { type: 'fraction' | 'tokens'; value: number }
  keep: { type: 'fraction' | 'messages'; value: number }
} {
  const profile = (model as BaseChatModel & { profile?: { maxInputTokens?: number } }).profile
  if (typeof profile?.maxInputTokens === 'number' && profile.maxInputTokens > 0) {
    return {
      trigger: { type: 'fraction', value: MIDDLEWARE_CONFIG.summarization.triggerFraction },
      keep: { type: 'fraction', value: MIDDLEWARE_CONFIG.summarization.keepFraction },
    }
  }
  return {
    trigger: { type: 'tokens', value: MIDDLEWARE_CONFIG.summarization.fallbackTriggerTokens },
    keep: { type: 'messages', value: MIDDLEWARE_CONFIG.summarization.fallbackKeepMessages },
  }
}
```

DeepSeek（`getDefaultDeepSeekProfile`，`maxInputTokens=128k`）与 OpenAI（`ChatOpenAI.profile` getter）均有 profile → 命中 fraction 路径；自定义 provider 无 profile → 命中 fallback tokens 路径。

---

## B4 — CheckpointerAdmin

### B4.1 新建 `electron/ai/checkpoint/CheckpointerAdmin.ts`

放在 `checkpoint/` 目录下与 `CheckpointerFactory.ts` 同模块边界。

```ts
/**
 * CheckpointerAdmin — typed admin operations for the LangGraph checkpointer.
 *
 * Encapsulates SqliteSaver internal DB access (currently requires `(saver as any).db`
 * casts because @langchain/langgraph-checkpoint-sqlite does not expose a public
 * delete API). Centralizing the cast here keeps `any` confined to this file
 * and gives the rest of the codebase a typed surface.
 *
 * Scope (per refactor.md Phase 4 B4):
 *   - deleteThread(threadId): remove a thread's checkpoints + writes rows
 *   - clearAll(): drop all checkpoint rows
 *
 * NOT in scope (intentional):
 *   - getThreadMessages / getCurrentSessionTokens: those read public
 *     checkpoint tuple fields via `checkpointer.get()`, not internal storage
 *   - thread_metadata table: owned by ThreadListQuery
 */
import type { Database } from 'better-sqlite3'
import type { CheckpointerInstance } from './CheckpointerFactory'

export class CheckpointerAdmin {
  private readonly db: Database | null

  constructor(instance: CheckpointerInstance) {
    this.db = instance.backend === 'sqlite' && instance.db ? instance.db : null
  }

  /** Delete all checkpoint + writes rows for a single thread. No-op for MemorySaver. */
  deleteThread(threadId: string): void {
    if (!this.db) return
    try {
      this.db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(threadId)
      this.db.prepare('DELETE FROM writes WHERE thread_id = ?').run(threadId)
    } catch (err) {
      console.warn(`[CheckpointerAdmin] deleteThread(${threadId}) failed:`, err)
    }
  }

  /** Drop all checkpoint + writes rows. No-op for MemorySaver. */
  clearAll(): void {
    if (!this.db) return
    try {
      this.db.prepare('DELETE FROM checkpoints').run()
      this.db.prepare('DELETE FROM writes').run()
    } catch (err) {
      console.warn('[CheckpointerAdmin] clearAll failed:', err)
    }
  }
}
```

**异常处理升级**：原 `AgentEngine.ts:146-147` 用空 `catch { /* ignore */ }`，admin 内改为 `console.warn`，方便定位删除失败（DB 锁、SqliteSaver schema 变更等）。

### B4.2 `CheckpointerFactory.ts` 类型收紧

```ts
// :17 增加 import
import type { Database } from 'better-sqlite3'

// :20-26 改 interface
export interface CheckpointerInstance {
  checkpointer: BaseCheckpointSaver
  backend: CheckpointerBackend
  /** Raw better-sqlite3 Database instance, only set when backend === 'sqlite' */
  db: Database | null
}

// :43-47 cast 收紧（从 as any 改为 as unknown as）
const rawSaver = saver as unknown as { db?: Database; conn?: Database }
const db = rawSaver.db ?? rawSaver.conn ?? null
_instance = { checkpointer: saver, backend: 'sqlite', db }

// :72 MemorySaver 分支显式
_instance = { checkpointer: new MemorySaver(), backend: 'memory', db: null }
```

`unknown as { db?: ... }` 比 `as any` 更收紧——字段名一旦改变，编译器仍能在该文件内给出提示（`as any` 不能）。

### B4.3 `ThreadListQuery.ts` 适配

`ThreadListQuery.ts:93-99` 内部用 `ci.db` 管理 `thread_metadata` 表。`CheckpointerInstance.db` 从 `any` 改为 `Database | null` 后，`ThreadListQuery` 内 `this.db` 类型随之改变，所有写路径加 `if (!this.db) return` 早返；读路径返回空数组。

### B4.4 AgentEngine 接入

```ts
// :60 附近 imports
import { CheckpointerAdmin } from './checkpoint/CheckpointerAdmin'

// :89 字段
private checkpointerAdmin: CheckpointerAdmin | null = null

// initialize() :102-106
async initialize(): Promise<void> {
  const ci = await getCheckpointer()
  this.checkpointerInstance = ci
  this.checkpointerAdmin = new CheckpointerAdmin(ci)
  this.threadListQuery = new ThreadListQuery(ci)
}

// :134-148 deleteThread 改为薄委托
deleteThread(threadId: string): void {
  this.threadListQuery?.deleteMeta(threadId)
  this.runtimeStore.deleteThread(threadId)
  this.activeRuns.delete(threadId)
  this.checkpointerAdmin?.deleteThread(threadId)
}

// :150-160 clearThreads 改为
clearThreads(): void {
  this.threadListQuery?.clearMetas()
  this.runtimeStore.clear()
  this.activeRuns.clear()
  this.checkpointerAdmin?.clearAll()
}
```

### B4.5 better-sqlite3 类型确认

`electron/ai/db/CreativeDb.ts:4` 已成功 `import Database from 'better-sqlite3'`——类型已可用。实施前 `grep -n "better-sqlite3\|@types/better-sqlite3" package.json` 确认；若 `@types/better-sqlite3` 非直接依赖（仅 transitive），显式加 devDependency 避免漂移。

---

## B5 — Memory 按 domain 拆分

### B5.1 `_buildMemoryPaths` 新增

`AgentEngine.ts:677` 改为：

```ts
memory: this._buildMemoryPaths(domain),
```

新增私有方法（紧邻 `_buildAgentCapabilities` :777）：

```ts
private _buildMemoryPaths(domain: AiAgentDomain): string[] {
  const file = domain === 'creative' ? 'AGENTS.creative.md' : 'AGENTS.edit.md'
  // fs.existsSync filter 保留：用户未创建该文件时，传给 createDeepAgent 的 memory
  // 数组为空，与 Phase 0/1/2/3 行为一致；deepagents memory loader 容忍空数组。
  return [path.join(this.aiRootPath, 'memory', file)].filter(fs.existsSync)
}
```

### B5.2 不再读 `AGENTS.md`

generic 名称 `AGENTS.md` 不再被加载。仓库内 `find -name AGENTS.md` 已确认无匹配、`~/.iwriter/ai/memory/` 为空——零迁移成本。若用户之前手动建过 `AGENTS.md`，通过 release note 提示重命名为 `AGENTS.edit.md` 或 `AGENTS.creative.md`。

### B5.3 不创建 `.md` 文件

Phase 4 不预置示例文件。memory 文件是用户长期记忆载体（由用户/agent 自行写入），不应出厂塞示例内容。`fs.existsSync` filter 保证未创建时不报错。

### B5.4 minimal mode 归属

`_buildAgentCapabilities :794-798` 已让 `minimal` mode 归到 `'editing'` domain，因此 minimal 自然读 `AGENTS.edit.md`。无需额外分支。

---

## 受影响文件清单

### 新建（2）

| 文件 | 用途 |
|---|---|
| `electron/ai/checkpoint/CheckpointerAdmin.ts` | B4 — 类型安全的 deleteThread / clearAll |
| `electron/ai/runtime/middleware-config.ts` | B1 — 中间件配置常量集中点 |

### 修改（6）

| 文件 | 关键位置 | 改动概要 |
|---|---|---|
| `electron/ai/AgentEngine.ts` | :60 imports / :89 字段 / :102 initialize / :134-160 deleteThread+clearThreads / :669-683 createDeepAgent / 新增 `_buildMemoryPaths` / 新增 `_buildSummarizationTrigger` | middleware 数组扩展、fallbackModels 解析、CheckpointerAdmin 接入、memory 按 domain 选择 |
| `electron/ai/checkpoint/CheckpointerFactory.ts` | :17 import / :20-26 interface / :43-47 cast / :72 MemorySaver 分支 | `db: Database \| null` 类型化，cast 用 `unknown as` 替代 `any` |
| `electron/ai/thread/ThreadListQuery.ts` | :93-99 + 所有 `this.db.prepare(...)` 调用点 | `db: Database \| null` 类型推进 + null guard |
| `src/ai/types.ts` | :48-68 `AiProviderConfig` | 新增 `fallbackModelId?: string` |
| `src/components/ai/ProviderSettings.vue` | :127-143 模板 + `FormState` / `startEdit` / `submitForm` | 接入 fallbackModelId 表单字段、`availableModels` computed |
| `src/i18n/messages/en-US.ts` + `src/i18n/messages/zh-CN.ts` | `preferences.ai.*` 段 | 新增 `fallbackModel` / `fallbackModelPlaceholder` / `fallbackModelHint` 三个 key |

### 删除（0）

无文件删除；Phase 4 纯增量。

### 不动（已勘察确认）

- `electron/ai/AgentEngine.ts:115-132` `getThreadMessages` 与 :706-738 `_getCurrentSessionTokens` — 读路径 cast 保留
- `electron/ai/runtime/OrphanToolCallStripperMiddleware.ts` / `HumanRespondMessageMiddleware.ts` / `TaskToolCompatMiddleware.ts` — 行为不变
- `src/ai/model-budget.ts` — 常量复用（middleware-config.ts 直接 import，不重复定义）

**总计：2 新建 + 6 修改。**

---

## 验证清单

### 静态检查

```bash
npm run lint && npm run type-check
```

重点：
- `CheckpointerInstance.db: Database | null` 改为 required 后，所有引用点（`CheckpointerFactory.ts`、`ThreadListQuery.ts`、`CheckpointerAdmin.ts`）显式处理 null
- `AiProviderConfig.fallbackModelId` 加入后，所有字面量构造点 TS 推断仍为可选（`provider-presets.ts`、设置导入路径）
- `langchain` 包的 4 个 middleware exports（`modelRetryMiddleware`、`modelFallbackMiddleware`、`modelCallLimitMiddleware`、`toolCallLimitMiddleware`）与 deepagents `createSummarizationMiddleware` 全部解析成功

### 端到端三模式回归基线（与 Phase 1-3 一致）

- **Edit 模式**：打开 .md → "给第二段扩写" → edit_block HITL → 审批通过 → TipTap 应用 → 无回归
- **Creative 模式**：新建线程 → `task(subagent_type=planner)` → planner 结构化输出正常
- **Minimal 模式**：纯文本对话 + thinking 流（DeepSeek + Anthropic + Gemini 各一次）

### B1 — 中间件链验证

**1. summarization 触发**
- DeepSeek 模型（maxInputTokens=128k）连发 ≥40 轮长内容（每轮 ≥3000 字），累计接近 85% 阈值（约 108k tokens）
- console.log 加 `_summarizationEvent` 检测：触发 summarization 后下一轮 messages 数组首条为 `summaryMessage`，长度大幅缩减
- `_getCurrentSessionTokens` 在 summarization 后返回值应显著下降

**2. modelRetry 重试**
- 临时把 apiKey 改为非法字符串（注入 401），发一条消息
- 预期：console 看到 3 次重试 + 指数退避日志
- 恢复 apiKey，行为正常

**3. modelFallback 切换**
- ProviderSettings UI 填 `fallbackModelId = deepseek-chat`，主 modelId 改为不存在的 modelId（如 `deepseek-fake-model`）
- 发消息 → 预期 fallback 接管 → 流式输出正常完成

**4. modelCallLimit / toolCallLimit**
- 临时把 `MIDDLEWARE_CONFIG.modelCallLimit.runLimit` 降到 `5`
- Creative 模式发起 `planner` 子代理 + 多轮工具调用
- 验证 `exitBehavior: 'end'`：agent 优雅终止 + UI 收到完成事件、不 throw
- 恢复到 200

**5. HITL 与 summarization 互不干扰**
- 在 long-thread 即将触发 summarization 阈值时发起 HITL（edit_block）
- respond 决策恢复 → 验证下一轮 wrapModelCall 中 HumanRespond marker 已剥、summarization 正常触发，UI 流式继续

### B4 — CheckpointerAdmin 验证

**1. deleteThread 正确清理**
- 新建线程 → 发 5 条消息 → 删除线程
- 重启 app → 确认线程列表不显示该线程
- SQL 查 `~/.iwriter/ai/ai-checkpoint.db`：`SELECT COUNT(*) FROM checkpoints WHERE thread_id = '<deleted_id>'` 应为 0

**2. clearAll 全清**
- 创建 ≥3 个线程 → AgentToolbar 点击「Clear all」
- SQL：`SELECT COUNT(*) FROM checkpoints` / `FROM writes` 均为 0

**3. MemorySaver fallback 路径**
- 设置 `IWRITER_ALLOW_MEMORY_CHECKPOINTER=1` 启动
- deleteThread / clearThreads 应 no-op 完成（无 throw）

### B5 — Memory 拆分验证

**1. 各 domain 加载对应 memory**
- 手动创建 `~/.iwriter/ai/memory/AGENTS.edit.md`（内容 `# Edit test - lorem ipsum`）和 `AGENTS.creative.md`（内容 `# Creative test - sit dolor`）
- Edit 模式新建线程发"读取你的记忆" → 回答含 "lorem ipsum"，不含 "sit dolor"
- Creative 模式同理反向验证

**2. 文件不存在时不报错**
- 删除两个 .md → 三模式仍正常工作

---

## 风险与回滚

| 风险 | 触发条件 | 处理 / 回滚 |
|---|---|---|
| summarization keep window 太小切断 AI/Tool 对 | `keepFraction = 0.10` 在 128k 模型上保留 ~12.8k tokens，若单工具结果 >12k 会被切 | deepagents 内置 AI/Tool 对完整性保护兜底；如观察到，把 keepFraction 提到 0.15 |
| modelFallback 主模型偶发 429 时被静默切换，用户无感 | 网络抖动 / 限流 | Phase 4 接受静默；Phase 5 评估 IPC 通知 |
| modelCallLimit `runLimit = 200` 切断长 creative 会话 | 长 plan + 多 subagent + HITL 循环 | 200 在长 plan 场景仍有 50%+ 余量；如真切，runtime override：`config.configurable.runLimit = 500` 临时放开 |
| modelCallLimit threadLimit `2000` 累计触发 | 同一 thread 持续聊数百轮 | 累计 2000 相当于 ~200 轮交互，已超日常使用；触发即应建议用户开新 thread |
| CheckpointerAdmin null db 路径回退到 no-op | MemorySaver 兜底场景 | 已显式 no-op；不抛错；ThreadRuntimeStore 内存清理仍生效 |
| modelFallback 配错 modelId（拼写错误） | 用户填 `fallbackModelId = 'deepsek-chat'` | fallback 自身失败会被 modelRetry 兜住；最终主+fallback 都失败时 `onFailure: 'continue'` 返回带 error 的 AIMessage → UI 显示错误消息 |
| summarization 在自定义 provider 上无 `maxInputTokens` | 用户自填 provider 无 profile | `_buildSummarizationTrigger` helper 切换到绝对 token 阈值兜底 |

**整体回滚策略**：Phase 4 三项在文件层面解耦，可独立 git revert。建议整体一个 PR、分 3 个 commit（B5 → B4 → B1），回滚时按需 cherry-pick revert。

---

## 实施顺序

1. **B5（最低风险，先开胃）** — `_buildMemoryPaths` + AGENTS 路径拆分（约 10 行改动）
2. **B4** — CheckpointerAdmin 新建 + CheckpointerFactory 类型收紧 + ThreadListQuery null guard
3. **B1.1 + B1.3 数据层** — middleware-config.ts + `AiProviderConfig.fallbackModelId` + ProviderSettings UI + i18n（编译通过但还未生效）
4. **B1.2** — AgentEngine middleware 数组扩展，附带 fallbackModels 解析、`_buildSummarizationTrigger`
5. **验证清单全跑** — 静态检查 → 三模式回归 → B1/B4/B5 各自验证项 → 通过后开 PR

---

## 不在 Phase 4 范围（留 Phase 5）

- **Phase 5** — DomainStrategy 解耦（refactor.md §三 Phase 5）：AgentEngine 内 4 处 `if (domain === 'creative')` 分支拆出策略类
- 跨 provider modelFallback（OpenAI → Anthropic）
- modelFallback 触发事件 IPC 通知
- AGENTS.md mode 级细分（`AGENTS.minimal.md`）
- summarization summary 内容的 IPC 可视化
- CheckpointerAdmin 读路径覆盖（`getThreadMessages` / `_getCurrentSessionTokens` 的 `tuple as any` cast）
