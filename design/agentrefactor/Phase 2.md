# Phase 2 — DeepSeek 替换、Orphan 中间件抽取、execute hack 移除（A3 + A5 + B2）

## Context

`design/agentrefactor/refactor.md` 列出了 iWriter AI 引擎与 deepagents 官方推荐的偏差。Phase 1（A1 + A2，上下文类型化 + streamEvents v3）已完成。Phase 2 处理三项 A/B 组偏差：

- **A3** — `electron/ai/providers/ChatDeepSeek.ts`（637 行）是 `BaseChatModel` 全量自实现。官方 `@langchain/deepseek@1.0.25` 已稳定，继承 `ChatOpenAICompletions`，由 LangChain core team 维护。继续维护本地 fork 风险高、收益低。
- **A5** — 孤儿 tool_call 清理逻辑被绑死在 `ChatDeepSeek.convertMessages :573-636`。一旦 ChatDeepSeek 替换为官方包，该保护消失；同时 Anthropic 在 context 截断场景下也有同类孤儿拒识问题，需要抽到通用 middleware。
- **B2** — `buildCreativeCapabilities.ts:42` 用 `Object.defineProperty(backend, 'id', { get: () => undefined })` hack 骗过 deepagents `isSandboxBackend` 检测，阻止 `execute` 工具被注入 creative agent。依赖内部 duck-typing，升级易碎。

Phase 2 不动业务语义。预期产出：deepseek provider 走官方包；新增一条通用孤儿清理 middleware 全局启用；execute hack 移除。

---

## 关键决策（已用户确认）

1. **ChatDeepSeek.ts 完全删除**，纯官方包。`reasoning_content` 通过 `StreamEventAdapter` 的 fallback 解码路径承接（同时补全 Phase 1 遗漏的 4 种 reasoning 编码 fallback）。
2. **OrphanToolCallStripper 无条件全局启用**。算法是 no-op friendly（无孤儿时不修改消息），安全网价值高，避免 middleware 内嗅探 provider type 的耦合。
3. **thinkingLevel 四档映射**：`low/medium/high/max`（与 OpenAI Responses 协议、`AiThinkingLevel` 枚举对齐，修正现有两档实质是 bug）。

---

## A3 — ChatDeepSeek 替换

### A3.1 修改 `electron/ai/providers/ModelFactory.ts:124-138`

deepseek 分支重写。改 import：从 `'./ChatDeepSeek'` 改为 `from '@langchain/deepseek'`（包已安装在 `package.json:78`）。

新分支结构（与其他 provider 风格对齐，走 `applyProfileOverride`）：

```ts
case 'deepseek': {
  const reasoningEffort = mapThinkingLevelToDeepSeekReasoningEffort(opts.thinkingLevel)
  const modelKwargs: Record<string, unknown> = {
    thinking: { type: 'enabled' },
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  }
  let model = new ChatDeepSeek({
    model: opts.model,
    apiKey: opts.apiKey,
    configuration: { baseURL: opts.baseUrl },
    streaming: true,
    temperature: opts.temperature,
    topP: opts.topP,
    frequencyPenalty: opts.frequencyPenalty,
    presencePenalty: opts.presencePenalty,
    modelKwargs,
  })
  model = applyProfileOverride(model, getProfileOverride('deepseek', opts.model))
  return model
}
```

在 `mapThinkingLevelToOpenAIReasoningEffort` 邻位新增辅助：

```ts
function mapThinkingLevelToDeepSeekReasoningEffort(lvl?: AiThinkingLevel): string | undefined {
  switch (lvl) {
    case 'low': return 'low'
    case 'medium': return 'medium'
    case 'high': return 'high'
    case 'extra_high': return 'max'
    default: return undefined
  }
}
```

### A3.2 删除 `electron/ai/providers/ChatDeepSeek.ts`（637 行）

理由覆盖度：
- `thinking` / `reasoning_effort` 由 `modelKwargs` 注入承接
- `cached_tokens` / `reasoning_tokens` 由 `ChatOpenAICompletions` 父类原生翻译（字段名 `cache_read` / `reasoning` 与自实现一致）
- 孤儿 tool_call 清理由 A5 middleware 接管
- `reasoning_content` 流由 A3.3 StreamEventAdapter fallback 接管
- `profile` getter 官方包已实现

### A3.3 修改 `electron/ai/ipc/StreamEventAdapter.ts:_consumeOneMessage`（约 :120-146）

补全 Phase 1 计划要求但未实现的 4 种 reasoning 编码 fallback。当前实现只消费 `msg.reasoning` v3 流（`:139-144`）。

新增 fallback：若 chunk 的 `additional_kwargs` 中含以下任一字段，按优先级解码（同步发出 `thinking` chunk）：

| 来源 | 字段路径 | 适用 provider |
|---|---|---|
| OpenAI Responses | `additional_kwargs.reasoning.summary[].text` | OpenAI o1/o3 |
| DeepSeek（官方包） | `additional_kwargs.reasoning_content` | DeepSeek |
| Anthropic | `content[{type:'thinking'}].thinking` | Anthropic Sonnet 4 |

抽为静态方法 `StreamEventAdapter.decodeFallbackReasoning(msg): string | null`。

调用模式（互斥优先 v3 高阶流）：

```ts
// 优先消费 v3 reasoning 流
const reasoningPromise = (async () => {
  for await (const delta of msg.reasoning) {
    this.thinkingContent += delta
    this._send({ ..., type: 'thinking', delta, subagentName })
  }
})()

// fallback：若 v3 reasoning 流为空但 message 自身带 reasoning 编码
// （在 message 结束时统一处理，避免 v3 重复发出）
```

具体调用点放在 `_consumeOneMessage` 内 `Promise.all([...])` 完成之后，检查 `this.thinkingContent` 是否还是空、`msg` 上是否有 fallback 字段；有则一次性发出补偿 chunk。

---

## A5 — OrphanToolCallStripper Middleware

### A5.1 新建 `electron/ai/runtime/OrphanToolCallStripperMiddleware.ts`

参照 `electron/ai/runtime/TaskToolCompatMiddleware.ts` 的写法。**hook 选择**：用 `wrapModelCall`（不是 `wrapToolCall`，后者是单次工具执行的后置 hook，拿不到 message history）。`wrapModelCall.request.messages` 是即将送给 model 的完整消息序列。

骨架：

```ts
import { createMiddleware } from 'langchain'
import { AIMessage, isAIMessage, isToolMessage } from '@langchain/core/messages'

export function createOrphanToolCallStripperMiddleware() {
  return createMiddleware({
    name: 'OrphanToolCallStripper',
    wrapModelCall: async (request, handler) => {
      const responded = new Set<string>()
      for (const m of request.messages) {
        if (isToolMessage(m) && m.tool_call_id) responded.add(m.tool_call_id)
      }
      const cleaned = request.messages.map((m) => {
        if (!isAIMessage(m) || !m.tool_calls?.length) return m
        const kept = m.tool_calls.filter((tc) => !tc.id || responded.has(tc.id))
        if (kept.length === m.tool_calls.length) return m
        return new AIMessage({
          ...m,
          content: m.content,
          tool_calls: kept,
          additional_kwargs: {
            ...m.additional_kwargs,
            tool_calls: kept.length ? m.additional_kwargs?.tool_calls : undefined,
          },
        })
      })
      return handler({ ...request, messages: cleaned })
    },
  })
}
```

算法等价移植自 `ChatDeepSeek.convertMessages :573-583` + `:619-621`。

### A5.2 修改 `electron/ai/AgentEngine.ts:662`

`createDeepAgent({ ... middleware: [...] })` 数组加入新 middleware。最终顺序：

```ts
middleware: [
  createOrphanToolCallStripperMiddleware(),
  createTaskToolCompatMiddleware(),
],
```

OrphanStripper 在前：先清理 history，再让 TaskToolCompat 处理 task 归一化。

---

## B2 — execute hack 移除

### B2.1 修改 `electron/ai/domain/creative/buildCreativeCapabilities.ts:38-42`

删除整段 hack（含解释注释）：

```ts
// 删除：
// CompositeBackend 通过 execute() / id 字段被 isSandboxBackend 识别为 sandbox，
// 导致 execute 工具自动注入。这里把 id getter 覆写为 undefined 让 guard 失败。
Object.defineProperty(backend, 'id', { get: () => undefined })
```

**安全性验证依据**（已勘察）：
- `WorkspaceFilesystemBackend implements BackendProtocol`，**不实现** `execute()` 方法（已 grep 验证 `electron/ai/runtime/WorkspaceFilesystemBackend.ts`）
- `CompositeBackend.get id()` 在 default 非 sandbox 时返回 `""`（deepagents `index.js:893-896`）
- `isSandboxBackend(b)` 要求 `typeof b.id === 'string' && b.id !== ''`（deepagents `index.js:460`），空串失败
- deepagents `filesystem` middleware `wrapModelCall`（`index.js:1855-1864`）在非 sandbox 时自动 `tools.filter(t => t.name !== "execute")`

→ 删除 hack 后 execute 工具仍然不会出现在 creative agent 的工具列表中。

---

## 修改文件清单

### 新建（1）
- `electron/ai/runtime/OrphanToolCallStripperMiddleware.ts`

### 修改（3）
- `electron/ai/providers/ModelFactory.ts:124-138` — deepseek 分支重写，新增 `mapThinkingLevelToDeepSeekReasoningEffort`
- `electron/ai/ipc/StreamEventAdapter.ts:120-146` — `_consumeOneMessage` 增加 4 种 reasoning fallback 解码
- `electron/ai/domain/creative/buildCreativeCapabilities.ts:38-42` — 删除 `Object.defineProperty` hack
- `electron/ai/AgentEngine.ts:662` — middleware 数组加入 OrphanToolCallStripper

### 删除（1）
- `electron/ai/providers/ChatDeepSeek.ts`（637 行）

**总计：5 文件改动 + 1 删除。**

---

## 风险与回滚

| 风险 | 触发条件 | 回滚 |
|---|---|---|
| 删除 ChatDeepSeek 后 reasoning 不流到 UI | 官方包 `additional_kwargs.reasoning_content` 路径与 StreamEventAdapter fallback 不匹配 | git revert 删除；保留为最小子类（≤80 行，override `_convertCompletionsDeltaToBaseMessageChunk` 把 reasoning 镜像为 v3 stream block） |
| `modelKwargs` 字段名 DeepSeek 服务端不识别 | API 返回 400 | 二分排查；最差情况 `thinking` / `reasoning_effort` 走子类 `invocationParams` override |
| 四档 reasoning_effort 中 `low`/`medium` DeepSeek API 拒识 | 接口报错 | 回退两档映射（`high` / `max`）；保留四档常量待官方支持后启用 |
| Orphan middleware 误删合法 tool_call | 边界情况（如 ID 为空但合法） | middleware 内加 `console.debug` 计数；可直接从 middleware 数组移除，无副作用 |
| StreamEventAdapter fallback 与 v3 流重复发 thinking chunk | v3 流和 fallback 同时触发 | fallback 仅在 `this.thinkingContent === ''` 时补偿；单测验证互斥 |
| 删除 execute hack 后工具仍被注入 | `WorkspaceFilesystemBackend` 未来添加 `execute()` 方法 | 启动时 assert `tools.find(t => t.name === 'execute')` 不存在；失败则恢复 hack |

---

## 验证清单

### 静态检查
```bash
npm run lint && npm run type-check
```
重点：删除 `ChatDeepSeek.ts` 后无残留 import；`@langchain/deepseek` 包正常解析。

### 端到端测试（5 项 refactor.md 验证点落地）

**1. DeepSeek `reasoning_content` 流到 UI thinking 通道**
- 选 deepseek-reasoner，发"请详细思考：写一首关于秋天的小诗"
- 预期：UI Thinking 区域有 reasoning 流式输出
- DevTools network 检查请求体：`body.thinking = { type: 'enabled' }`，`body.reasoning_effort` 字段存在

**2. thinkingLevel 四档映射**
- AgentToolbar 切换 low → medium → high → extra_high，每档发一条提问
- 抓请求体 `reasoning_effort`，断言为 `low / medium / high / max`
- 若 DeepSeek 拒识 `low` / `medium`，触发回退两档预案

**3. 孤儿 tool_call 中断恢复场景**
- Creative 模式发起一次 multi-tool 任务，进入 HITL 时 reject 部分 tool_call
- 触发下一轮对话，断言 DeepSeek API 不返回 400 错误
- 加临时 log 打印 OrphanStripper 过滤前后的 `tool_calls.length` 对比

**4. execute 工具未注入 creative agent**
- 启动 creative 模式新线程
- 在 `_getOrCreateAgent` 后加临时 log 打印 agent.tools 列表
- 断言 `tools.find(t => t.name === 'execute')` 为 `undefined`
- 验证后移除 log

**5. usage metadata 完整性**
- 发一次带 reasoning + cache 命中的提问（同一线程内连续两轮）
- 检查 ThreadMessage `usage` 字段：包含 reasoning tokens 与 cache_read tokens
- 字段名以 `ChatOpenAICompletions` 实际输出为准；若与现有 `cache_read` / `reasoning` 不一致，在 MessageAdapter 加映射

### 三模式回归基线（与 Phase 1 一致）
- **Edit 模式**：打开 .md → "给第二段扩写" → edit_block HITL → 审批通过 → TipTap 应用 → 无回归
- **Creative 模式**：新建线程 → `task(subagent_type=planner)` → planner 结构化输出正常
- **Minimal 模式**：纯文本对话 + thinking 流（DeepSeek + Anthropic + Gemini 各一次）

---

## 实施顺序

1. **A3.3（StreamEventAdapter fallback）先做** — 为删除 ChatDeepSeek 铺路
2. **A5（OrphanStripper middleware 抽取）** — 删除 ChatDeepSeek 前要先把它的关键保护逻辑搬走
3. **A3.1 + A3.2（ModelFactory 重写 + 删除 ChatDeepSeek.ts）** — 核心替换
4. **B2（删除 execute hack）** — 独立改动，可与 A3 并行
5. **验证清单全跑一遍** — 通过后开 PR

---

## 不在 Phase 2 范围（留 Phase 3+）

- A4 — HITL `respond` 决策类型（Phase 3）
- B1 — 生产 middleware 栈（summarization 等，Phase 4）
- B3 — planner schema 校验是否被框架接管的验证（Phase 3）
- B4 — CheckpointerAdmin 封装（Phase 4）
- B5 — AGENTS.md 按 domain 拆分（Phase 4）
- C1 — 编辑工具体执行路径决策（开放问题，未排期）
