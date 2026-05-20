# Phase 6 — 遗留修补与可观测性

## Context

Phase 1–5 完成后，功能主干已对齐 deepagents 规范。Phase 6 处理四项遗留问题：

| 编号 | 问题 | 来源 |
|---|---|---|
| 6.1 | C1 edit stub — `edited` 决策的结构性 args 未传播到 TipTap apply | refactor.md §六 Q1，采用方案 A |
| 6.2 | RESPOND_MARKER checkpoint 残留 | Phase 3 留项 |
| 6.3 | Summarization 事件 IPC 可视化 | Phase 4 留项 |
| 6.4 | modelFallback 触发 IPC 通知 | Phase 4 留项 |

业务语义零变化：三模式端到端行为与 Phase 5 后完全一致。

---

## 6.1 — C1 edit stub 修补（方案 A）

### 背景

`executor.ts:applyRecordedDecision` 处理 `edited` 决策时，仅把 `editedArgs.new_content` 写回 `blockProposal`，其余结构性字段（`block_id`、`after_block_id`、`start_block_id`、`end_block_id`）被丢弃——renderer 仍用原始 proposal 的 block 位置执行 apply，而 LangGraph 工具体收到的是用户修改后的 args，两者不一致。

工具体 success 消息也不区分 approved / edited，LLM 无法感知内容已被用户改写。

### 修改

#### `src/ai/review/executor.ts`（`:187-190` 附近）

当前：
```ts
if (decision.kind === 'edited' && decision.editedArgs) {
  const normalizedEditedArgs = normalizeEditedArgsForProposal(blockProposal, decision.editedArgs)
  setProposalDecision(proposalId, 'edited', { editedArgs: normalizedEditedArgs, message: decision.message })
  if (typeof normalizedEditedArgs.new_content === 'string') blockProposal.newContent = normalizedEditedArgs.new_content
}
```

改为（在 `new_content` 之后补充其余字段回写）：
```ts
if (decision.kind === 'edited' && decision.editedArgs) {
  const normalizedEditedArgs = normalizeEditedArgsForProposal(blockProposal, decision.editedArgs)
  setProposalDecision(proposalId, 'edited', { editedArgs: normalizedEditedArgs, message: decision.message })
  if (typeof normalizedEditedArgs.new_content === 'string')
    blockProposal.newContent = normalizedEditedArgs.new_content
  // Propagate structural position args so apply targets what the user actually confirmed.
  if (typeof normalizedEditedArgs.block_id === 'number')
    (blockProposal as BlockEditProposal & { displayBlockId?: number }).displayBlockId = normalizedEditedArgs.block_id
  if (typeof normalizedEditedArgs.after_block_id === 'number')
    (blockProposal as BlockEditProposal & { displayBlockId?: number }).displayBlockId = normalizedEditedArgs.after_block_id
  if (typeof normalizedEditedArgs.start_block_id === 'number' && 'startDisplayBlockId' in blockProposal)
    (blockProposal as Extract<BlockEditProposal, { type: 'replace_range' }>).startDisplayBlockId = normalizedEditedArgs.start_block_id
  if (typeof normalizedEditedArgs.end_block_id === 'number' && 'endDisplayBlockId' in blockProposal)
    (blockProposal as Extract<BlockEditProposal, { type: 'replace_range' }>).endDisplayBlockId = normalizedEditedArgs.end_block_id
}
```

**注意**：`displayBlockId` / `startDisplayBlockId` / `endDisplayBlockId` 均为 `BlockEditProposal` 的字段，不是工具体 args 的字段（工具体用 `block_id`），`normalizeEditedArgsForProposal` 已将工具体 args 命名空间转换为 proposal 命名空间，此处直接写 `normalizedEditedArgs` 的原始字段值即可（它们是同一个值）。

实际实现时，按 `blockProposal.type` 分支更为安全，可直接在 `normalizeEditedArgsForProposal` 的 switch 返回对象中同时返回 displayBlockId 等 proposal 字段，由调用处统一写回，避免多处类型断言。

#### `electron/ai/tools/EditProposalTools.ts`

在各工具体 success 消息中区分 `edited`（工具体本身不知道是否 edited，但可在消息末尾加说明）：

当前所有工具体消息格式：`"Edit applied to ... at block {b:N}. The document has changed..."`

改为：不变（工具体运行时无法感知 decision 类型，修改消息无意义）。

工具体 success 消息保持现状；LLM 在下一次 `get_blocks` 调用时会看到实际内容。**不改工具体消息**。

### 受影响文件

| 文件 | 改动 |
|---|---|
| `src/ai/review/executor.ts` | `applyRecordedDecision` 补充 block_id 等字段回写 |

---

## 6.2 — RESPOND_MARKER checkpoint 残留清理

### 背景

用户选择 `responded` 决策时，`_continueSession` 向 LangGraph 传入的 rejection message 为 `${RESPOND_MARKER}${userMessage}`。deepagents 将这个字符串存入 checkpoint 的 ToolMessage.content，后续每次 LLM 调用前由 `HumanRespondMessageMiddleware.wrapModelCall` strip 标记——功能正确，但 checkpoint 数据库中的 ToolMessage 永久保存了 `__IWRITER_RESPOND__\n` 前缀，会在 thread history 导出、调试查看时造成干扰。

deepagents 当前版本（langchain `^1.x`）无 `RemoveMessage` 类公共 API，`ClearToolUsesEdit` 仅清除工具调用输入，不适用。

### 方案

在 `CheckpointerAdmin` 中新增 `stripRespondMarkers(threadId)` 方法，通过直接操作 better-sqlite3 更新 checkpoint 中包含标记的 ToolMessage content。在 `_continueSession` 完成 resume 后异步调用。

### 修改

#### `electron/ai/checkpoint/CheckpointerAdmin.ts`（新增方法）

```ts
/**
 * Remove RESPOND_MARKER prefix from ToolMessages stored in the checkpoint.
 * Called after a 'responded' HITL decision is processed.
 * Operates on the raw checkpoint blob; safe to call asynchronously after resume.
 */
stripRespondMarkers(threadId: string): void {
  const db = this.getDb()
  if (!db) return
  try {
    const rows: Array<{ task_id: string; channel: string; blob: Buffer }> = db
      .prepare(`SELECT task_id, channel, blob FROM checkpoint_blobs WHERE thread_id = ? AND channel = 'messages'`)
      .all(threadId) as Array<{ task_id: string; channel: string; blob: Buffer }>

    for (const row of rows) {
      const parsed = JSON.parse(row.blob.toString('utf8')) as unknown
      if (!Array.isArray(parsed)) continue
      let changed = false
      const cleaned = parsed.map((msg: Record<string, unknown>) => {
        if (msg.type !== 'tool' && msg._type !== 'tool') return msg
        const content = msg.content
        if (typeof content === 'string' && content.startsWith(RESPOND_MARKER)) {
          changed = true
          return { ...msg, content: content.slice(RESPOND_MARKER.length) }
        }
        return msg
      })
      if (changed) {
        db.prepare(`UPDATE checkpoint_blobs SET blob = ? WHERE task_id = ? AND channel = ?`)
          .run(Buffer.from(JSON.stringify(cleaned), 'utf8'), row.task_id, row.channel)
      }
    }
  } catch (err) {
    console.warn('[CheckpointerAdmin] stripRespondMarkers failed:', err)
  }
}
```

`RESPOND_MARKER` 从 `HumanRespondMessageMiddleware` 导入复用。

#### `electron/ai/AgentEngine.ts`（`_continueSession` 末段）

在 `responded` 决策分支确认 resume 启动后，异步触发清理（不阻塞主流程）：

```ts
if (decisions.some(d => d.type === 'responded')) {
  // Fire-and-forget: strip markers after the resumed run has a chance to checkpoint.
  setTimeout(() => {
    try { this.checkpointerAdmin?.stripRespondMarkers(threadId) } catch { /* ignore */ }
  }, 2000)
}
```

延迟 2s 是为了在 deepagents resume 完成首次 checkpoint write 之后再读取（乐观等待，不保证精确）。

### 受影响文件

| 文件 | 改动 |
|---|---|
| `electron/ai/checkpoint/CheckpointerAdmin.ts` | 新增 `stripRespondMarkers(threadId)` |
| `electron/ai/AgentEngine.ts` | `_continueSession` 末段触发异步清理 |

---

## 6.3 — Summarization 事件 IPC 可视化

### 背景

`SummarizationMiddleware` 在 context 超过阈值时自动压缩历史，用户无感知。压缩后 `channelValues._summarizationEvent` 持久存储在 checkpoint 中（含 `cutoffIndex`）。需要在压缩发生后通知 renderer 展示一条系统提示。

### 设计

检测时机：每次 run 正常完成（`_streamLoop` 末段 `sendRunDone` 之前），从 `channelValues._summarizationEvent.cutoffIndex` 与 `ThreadRuntimeStore` 中缓存的 `lastSummarizationCutoff` 对比——若变化，则本次 run 触发了压缩，发送 IPC 事件。

`modelFallbackMiddleware` 无 hook，无法在 middleware 内拦截，只能事后轮询 checkpoint。Summarization 同理，也是事后检测。

### 修改

#### `electron/ai/ipc/protocol.ts`

新增事件类型：

```ts
/** Fired when SummarizationMiddleware compressed this thread's history. */
export interface RunContextCompressedEvent {
  threadId: string
  /** Number of original messages that were summarized. */
  compressedMessageCount: number
}
```

#### `electron/ai/ipc/RendererEventBridge.ts`

```ts
import type { RunContextCompressedEvent } from './protocol'

sendRunContextCompressed(event: RunContextCompressedEvent): void {
  this.getWebContents()?.send('ai:context-compressed', event)
}
```

#### `electron/ai/runtime/ThreadRuntimeStore.ts`

在 per-thread context 中新增 `lastSummarizationCutoff?: number`：

```ts
// 在 setContext / updateContext 相关接口中增加该字段
getLastSummarizationCutoff(threadId: string): number | undefined
setLastSummarizationCutoff(threadId: string, cutoff: number): void
```

#### `electron/ai/AgentEngine.ts`（`_streamLoop` 末段）

在 `sendRunDone` 之前检测并发送：

```ts
// Detect summarization
const summarizationCutoff: number | undefined = (channelValues._summarizationEvent as any)?.cutoffIndex
const lastCutoff = this.runtimeStore.getLastSummarizationCutoff(threadId)
if (
  typeof summarizationCutoff === 'number' &&
  summarizationCutoff > 0 &&
  summarizationCutoff !== lastCutoff
) {
  this.runtimeStore.setLastSummarizationCutoff(threadId, summarizationCutoff)
  this.rendererBridge.sendRunContextCompressed({
    threadId,
    compressedMessageCount: summarizationCutoff,
  })
}
```

**注意**：`channelValues._summarizationEvent` 已在 `_getCurrentSessionTokens` 处读取，`_streamLoop` 中需要读取 `channelValues`。当前 `_streamLoop` 通过 `streamEvents` 迭代，不直接读 checkpoint。需要在 run 结束后读取一次 checkpoint 的 `channelValues`，或复用 `_getCurrentSessionTokens` 的内部逻辑提取出辅助函数。

推荐：提取 `_readCheckpointChannelValues(threadId): Promise<Record<string, unknown>>` 私有方法，供 `_streamLoop` 末段和 `_getCurrentSessionTokens` 复用。

#### `src/ai/ipc.ts`

```ts
export type { RunContextCompressedEvent } from '../../electron/ai/ipc/protocol'
```

并在 IPC 监听中注册 `ai:context-compressed`：

```ts
window.electronAPI.on('ai:context-compressed', (event: RunContextCompressedEvent) => {
  // 派发到 store
})
```

#### `electron/preload.ts`

在 `electronAPI` 暴露 `onContextCompressed` 监听接口（与 `onRunDone` 等模式一致）。

#### 前端展示

在 `src/ai/store/modules/runtimeEvents.ts` 中处理 `ai:context-compressed` 事件，调用 `notify.info('会话历史已自动压缩以节省 context 空间')` 或在对话区插入一条系统消息（样式参考现有 `AgentMessageBubble` 的系统提示行）。

采用 `notify.info` 方式实现最简，不需要新增消息气泡类型。

### 受影响文件

| 文件 | 改动 |
|---|---|
| `electron/ai/ipc/protocol.ts` | 新增 `RunContextCompressedEvent` |
| `electron/ai/ipc/RendererEventBridge.ts` | 新增 `sendRunContextCompressed` |
| `electron/ai/runtime/ThreadRuntimeStore.ts` | 新增 `lastSummarizationCutoff` per-thread 字段 + getter/setter |
| `electron/ai/AgentEngine.ts` | `_streamLoop` 末段检测 + 提取 `_readCheckpointChannelValues` |
| `electron/preload.ts` | 新增 `ai:context-compressed` 监听暴露 |
| `src/ai/ipc.ts` | re-export `RunContextCompressedEvent` + 注册监听 |
| `src/ai/store/modules/runtimeEvents.ts` | 处理 `ai:context-compressed` 事件 |

---

## 6.4 — modelFallback 触发 IPC 通知

### 背景

`modelFallbackMiddleware` 内部无 callback hook（源码确认：try primary → catch → try fallbacks，无通知出口）。需替换为自实现的 instrumented fallback middleware，行为等价但新增 `onFallback` 回调。

### 修改

#### `electron/ai/runtime/middleware-config.ts`（或单独文件）

新增 `createInstrumentedFallbackMiddleware`：

```ts
import { createMiddleware } from 'langchain'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

export function createInstrumentedFallbackMiddleware(
  fallbackModels: BaseChatModel[],
  onFallback: (fallbackModelId: string) => void,
) {
  return createMiddleware({
    name: 'instrumentedFallbackMiddleware',
    wrapModelCall: async (request, handler) => {
      try {
        return await handler(request)
      } catch (primaryError) {
        for (let i = 0; i < fallbackModels.length; i++) {
          try {
            const result = await handler({ ...request, model: fallbackModels[i] })
            // Fallback succeeded — notify caller
            const modelId = (fallbackModels[i] as any).modelName
              ?? (fallbackModels[i] as any).model
              ?? `fallback[${i}]`
            onFallback(modelId)
            return result
          } catch (fallbackError) {
            if (i === fallbackModels.length - 1) throw fallbackError
          }
        }
        throw primaryError
      }
    },
  })
}
```

#### `electron/ai/ipc/protocol.ts`

```ts
/** Fired when modelFallbackMiddleware switched to a backup model. */
export interface RunModelFallbackEvent {
  threadId: string
  fallbackModelId: string
}
```

#### `electron/ai/ipc/RendererEventBridge.ts`

```ts
sendRunModelFallback(event: RunModelFallbackEvent): void {
  this.getWebContents()?.send('ai:model-fallback', event)
}
```

#### `electron/ai/AgentEngine.ts`（`_getOrCreateAgent` 内 middleware 构建段）

将现有：
```ts
...(fallbackModels.length ? [modelFallbackMiddleware(...fallbackModels)] : []),
```

替换为：
```ts
...(fallbackModels.length
  ? [createInstrumentedFallbackMiddleware(fallbackModels, (fallbackModelId) => {
      this.rendererBridge.sendRunModelFallback({ threadId, fallbackModelId })
    })]
  : []),
```

同时从 import 中移除 `modelFallbackMiddleware`（langchain 原版）。

#### `electron/preload.ts`

暴露 `ai:model-fallback` 监听接口。

#### `src/ai/ipc.ts` + `src/ai/store/modules/runtimeEvents.ts`

注册监听，调用 `notify.warning('主模型不可用，已切换至备用模型：{fallbackModelId}')` 提示用户。

i18n key 参考现有 `agentPanel.*` 命名规范添加到 `zh-CN.ts` / `en-US.ts`。

### 受影响文件

| 文件 | 改动 |
|---|---|
| `electron/ai/runtime/middleware-config.ts` | 新增 `createInstrumentedFallbackMiddleware` |
| `electron/ai/ipc/protocol.ts` | 新增 `RunModelFallbackEvent` |
| `electron/ai/ipc/RendererEventBridge.ts` | 新增 `sendRunModelFallback` |
| `electron/ai/AgentEngine.ts` | 替换 `modelFallbackMiddleware` 调用；`threadId` 传入闭包 |
| `electron/preload.ts` | 新增 `ai:model-fallback` 监听暴露 |
| `src/ai/ipc.ts` | re-export `RunModelFallbackEvent` + 注册监听 |
| `src/ai/store/modules/runtimeEvents.ts` | 处理事件，触发 notify.warning |
| `src/i18n/messages/zh-CN.ts` / `en-US.ts` | 新增 fallback 通知 i18n key |

---

## 实施顺序

建议顺序：**6.1 → 6.4 → 6.3 → 6.2**

- **6.1 最先**：纯 executor 层修改，无 IPC 变更，风险最低，可独立验证
- **6.4 次之**：IPC 路径简单（主进程 → renderer 单向通知），无前端状态改动
- **6.3 稍复杂**：涉及 checkpoint 读取 + ThreadRuntimeStore 新字段 + preload 扩展
- **6.2 最后**：checkpoint 直写，乐观延迟触发，影响最小但需要仔细测试不破坏 checkpoint 结构

---

## 受影响文件汇总

### 修改（10）

| 文件 | 涉及项 |
|---|---|
| `src/ai/review/executor.ts` | 6.1 |
| `electron/ai/checkpoint/CheckpointerAdmin.ts` | 6.2 |
| `electron/ai/AgentEngine.ts` | 6.2 + 6.3 + 6.4 |
| `electron/ai/runtime/ThreadRuntimeStore.ts` | 6.3 |
| `electron/ai/ipc/protocol.ts` | 6.3 + 6.4 |
| `electron/ai/ipc/RendererEventBridge.ts` | 6.3 + 6.4 |
| `electron/preload.ts` | 6.3 + 6.4 |
| `src/ai/ipc.ts` | 6.3 + 6.4 |
| `src/ai/store/modules/runtimeEvents.ts` | 6.3 + 6.4 |
| `src/i18n/messages/zh-CN.ts` / `en-US.ts` | 6.4 |

### 新增逻辑（1）

| 位置 | 内容 |
|---|---|
| `electron/ai/runtime/middleware-config.ts` | `createInstrumentedFallbackMiddleware` 函数 |

---

## 验证清单

```bash
npm run lint && npm run type-check
```

| 项 | 验证方式 |
|---|---|
| 6.1 | Edit 模式 HITL → `edited` 决策修改 `block_id` → 验证 TipTap 应用到正确 block |
| 6.1 | Edit 模式 HITL → `edited` 决策仅修改 `new_content` → 行为与修改前一致（回归） |
| 6.2 | `responded` 决策后等待 ~3s → 用 sqlite3 CLI 查询 `checkpoint_blobs` → `__IWRITER_RESPOND__` 前缀消失 |
| 6.3 | 构造 100+ 消息线程触发 summarization → run 结束后 toast 提示出现；重复 run 不重复提示 |
| 6.4 | 配置 fallback 模型 → 模拟主模型失败（临时设错误 API key）→ fallback 切换成功 + toast 通知出现 |
| 全部 | 三模式端到端回归：Edit / Creative / Minimal 各跑一次，行为与 Phase 5 后一致 |
