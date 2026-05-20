# Phase 5 — DomainStrategy 解耦

## Context

`design/agentrefactor/refactor.md` 列出 iWriter AI 引擎与 deepagents 官方推荐的偏差。Phase 1（A1+A2，上下文类型化 + streamEvents v3）、Phase 2（A3+A5+B2，DeepSeek 替换 + OrphanStripper + execute hack 移除）、Phase 3（A4+B3，HITL respond + planner 校验注释）、Phase 4（B1+B4+B5，生产中间件栈 + CheckpointerAdmin + memory 按 domain 拆分）均已完成。

Phase 5 处理 refactor.md §三 Phase 5 —— **AgentEngine 的 domain 分支收敛**。当前 `AgentEngine.ts` (886 行) 共有 5 处 `domain === 'creative'` 分支散布在 4 个方法中：

| 行号 | 位置 | 作用 |
|---|---|---|
| `:568` | `_handleInterrupt` | 整段 33 行 creative 中断分支（CreativeReviewItem 构造） vs `:602-643` 41 行 edit 中断分支（snapshot + EditProposal） |
| `:803` | `_buildMemoryPaths` | AGENTS.creative.md vs AGENTS.edit.md |
| `:813` | `_buildAgentCapabilities` | `buildCreativeCapabilities(aiRootPath, mounts, db, snapshotBroker, language)` vs `buildEditCapabilities(snapshotBroker, aiRootPath, mounts)` |
| `:837` | `_recordCreativeSession` 内 guard | `if (meta?.domain !== 'creative') return` |
| `:878` | 顶层 helper `getSystemPrompt` | `buildCreativeSystemPrompt(language)` vs `EDIT/MINIMAL_SYSTEM_PROMPT` |

`RunInterruptedEvent` (`protocol.ts:131-148`) 同时携带 `proposals: EditProposal[]`（必填）+ `creativeReviews?: CreativeReviewItem[]`（可选）两个并行字段，扩展第三个 domain 时不可持续。渲染端 `runtimeEvents.ts:203-215` 用 `if (event.creativeReviews?.length) ... else ...` 二分派发，同样耦合 domain 字面量。

Phase 5 目标：用 `DomainStrategy` 接口把上述五处分支统一为策略表分派；IPC 合约由双字段切换为统一 `reviews: DomainReviewItem[]`（已确认一次性切换，不保留兼容期）；session 收尾 hook (`_recordCreativeSession`) 也下沉到 strategy。完成后 AgentEngine 内零 `domain === 'creative'` 字面量，添加新 domain 只需新建 strategy 类 + 构造函数注册一行。

业务语义零变化：edit / creative / minimal 三模式端到端行为与 Phase 4 后完全一致。

---

## 用户已确认的关键决策

1. **IPC 合约一次切换**：`RunInterruptedEvent` 新增 `reviews: DomainReviewItem[]`，同 PR 删除 `proposals` / `creativeReviews` 双字段。仓库内 IPC 无外部消费者，单 PR 同步改后端 + 前端，避免临时技术债。
2. **onSessionComplete hook 接管**：`DomainStrategy` 接口加可选 `onSessionComplete(threadId, ctx)`，`CreativeDomainStrategy` 实现 `upsertSession + computeWorkspaceHashes`，`EditDomainStrategy` 不实现。`_streamLoop:517` 改为 `await this.strategies[domain].onSessionComplete?.(...)`，彻底消除 `_recordCreativeSession` 的 domain 守卫。
3. **构造函数一次性注入策略**：AgentEngine 构造函数中初始化 `strategies: Record<AiAgentDomain, DomainStrategy>`，所有共享依赖（snapshotBroker / aiRootPath / runtimeStore / threadListQuery）DI 传给每个 strategy。
4. **minimal 归 EditDomainStrategy**：当前 `AiAgentDomain` 仅 `editing | creative` 两值，minimal mode 落在 editing domain。`EditDomainStrategy.buildCapabilities` 根据 `mode === 'minimal'` 返回空 tools/backend，`getSystemPrompt` 切换为 `MINIMAL_SYSTEM_PROMPT`。零枚举变更。

---

## 设计

### 1. 新建 `electron/ai/domain/DomainStrategy.ts`

接口、共享类型、共享上下文都集中在此文件。**不**新建 `domain/edit/EditDomainStrategy.ts` 旁的 `index.ts` 等冗余 barrel。

```ts
import type { ThreadMessage } from '../../../src/types/ai'
import type { DomainAgentCapabilities } from './types'
import type { AiAgentMode } from '../../../src/types/ai'
import type { FilesystemMount } from '../runtime/FilesystemMounts'
import type { DetectedInputLanguage } from '../../../src/ai/message/detectInputLanguage'
import type { EditProposal, CreativeReviewItem } from '../../../src/types/ai'

/** 统一 review payload；renderer 按 kind 分派 */
export type DomainReviewItem =
  | { kind: 'edit'; payload: EditProposal }
  | { kind: 'creative'; payload: CreativeReviewItem }

export interface DomainBuildContext {
  mode: AiAgentMode
  mounts: FilesystemMount[]
  language: DetectedInputLanguage
}

export interface InterruptContext {
  threadId: string
  turnId: string | undefined
  actionRequests: Array<{ name: string; args: Record<string, unknown> }>
  partialMessage?: ThreadMessage
}

export interface SessionCompleteContext {
  threadId: string
  workspacePath: string | null
}

export interface DomainStrategy {
  /** 构造 deepagents capabilities（tools / backend / interruptOn / subAgents / skills） */
  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities

  /** 当前 domain + mode 下的 system prompt */
  getSystemPrompt(mode: AiAgentMode, language: DetectedInputLanguage): string

  /** 该 domain 对应的 AGENTS.md 文件名（不带路径） */
  getMemoryFileName(): string

  /**
   * 处理 HITL 中断，把 actionRequests 映射为统一 DomainReviewItem[]。
   * 内部可按需调用 SnapshotBroker（仅 edit 需要）。
   * 返回的 DomainReviewItem[] 长度必须 === actionRequests.length，按 index 对齐。
   */
  buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]>

  /** 可选：run 正常完成时的收尾（creative 用于 upsertSession） */
  onSessionComplete?(ctx: SessionCompleteContext): void
}
```

### 2. 新建 `electron/ai/domain/edit/EditDomainStrategy.ts`

```ts
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildEditCapabilities } from './buildEditCapabilities'
import { buildProposalFromAction } from '../../ipc/MessageAdapter'
import { BLOCK_EDIT_TOOLS, type EditProposal } from '../../../../src/types/ai'
import { EDIT_SYSTEM_PROMPT } from '../../../../src/ai/thread/system-prompts/edit'
import { MINIMAL_SYSTEM_PROMPT } from '../../../../src/ai/thread/system-prompts/minimal'
import type { ThreadRuntimeStore } from '../../runtime/ThreadRuntimeStore'
import type {
  DomainStrategy, DomainBuildContext, InterruptContext, DomainReviewItem,
} from '../DomainStrategy'
import type { DomainAgentCapabilities } from '../types'
import type { AiAgentMode } from '../../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'

export class EditDomainStrategy implements DomainStrategy {
  constructor(
    private snapshotBroker: SnapshotBroker,
    private aiRootPath: string,
    private runtimeStore: ThreadRuntimeStore,
  ) {}

  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities {
    if (ctx.mode === 'minimal') return { tools: [], skills: [] }
    return buildEditCapabilities(this.snapshotBroker, this.aiRootPath, ctx.mounts)
  }

  getSystemPrompt(mode: AiAgentMode, _language: DetectedInputLanguage): string {
    return mode === 'minimal' ? MINIMAL_SYSTEM_PROMPT : EDIT_SYSTEM_PROMPT
  }

  getMemoryFileName(): string { return 'AGENTS.edit.md' }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    // 现 AgentEngine.ts:602-633 算法平移
    const firstArgs = ctx.actionRequests[0]?.args ?? {}
    const argFilePath = typeof firstArgs.file_path === 'string' ? firstArgs.file_path : null
    const activeFilePath = this.runtimeStore.getContext(ctx.threadId)?.activeFilePath ?? null
    const snapshotTargetPath = (argFilePath && argFilePath !== activeFilePath) ? argFilePath : null

    let snapshot = null
    try { snapshot = await this.snapshotBroker.requestSnapshot(snapshotTargetPath) }
    catch (err) { console.warn('[EditDomainStrategy] snapshot failed:', err) }

    const pendingEditToolCalls = (ctx.partialMessage?.toolCalls ?? []).filter(tc =>
      BLOCK_EDIT_TOOLS.has(tc.name))

    return ctx.actionRequests.map((ar, index): DomainReviewItem => ({
      kind: 'edit',
      payload: buildProposalFromAction(
        ar.name, ar.args ?? {}, snapshot,
        pendingEditToolCalls[index]?.id,
        ctx.partialMessage?.id,
        ctx.turnId,
      ),
    }))
  }
}
```

### 3. 新建 `electron/ai/domain/creative/CreativeDomainStrategy.ts`

```ts
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildCreativeCapabilities } from './buildCreativeCapabilities'
import { buildCreativeReviewItemFromAction } from '../../ipc/CreativeReviewAdapter'
import { computeWorkspaceHashes, getCreativeDb } from '../../db/CreativeDb'
import { CREATIVE_REVIEW_TOOLS } from '../../../../src/types/ai'
import { buildCreativeSystemPrompt } from '../../../../src/ai/thread/system-prompts/creative'
import type { ThreadRuntimeStore } from '../../runtime/ThreadRuntimeStore'
import type {
  DomainStrategy, DomainBuildContext, InterruptContext,
  DomainReviewItem, SessionCompleteContext,
} from '../DomainStrategy'
import type { DomainAgentCapabilities } from '../types'
import type { AiAgentMode } from '../../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'

export class CreativeDomainStrategy implements DomainStrategy {
  constructor(
    private snapshotBroker: SnapshotBroker,
    private aiRootPath: string,
    private runtimeStore: ThreadRuntimeStore,
  ) {}

  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities {
    const workspacePath = ctx.mounts.find(m => m.virtualPath === '/')?.hostPath
    return buildCreativeCapabilities(
      this.aiRootPath, ctx.mounts,
      workspacePath ? getCreativeDb(workspacePath) : null,
      this.snapshotBroker, ctx.language,
    )
  }

  getSystemPrompt(_mode: AiAgentMode, language: DetectedInputLanguage): string {
    return buildCreativeSystemPrompt(language)
  }

  getMemoryFileName(): string { return 'AGENTS.creative.md' }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    // 现 AgentEngine.ts:568-599 算法平移；workspacePath 从 runtimeStore 读
    const workspacePath = this.runtimeStore.getContext(ctx.threadId)?.workspacePath ?? null
    const pendingCreativeToolCalls = (ctx.partialMessage?.toolCalls ?? []).filter(tc =>
      CREATIVE_REVIEW_TOOLS.has(tc.name))

    return ctx.actionRequests.map((ar, index): DomainReviewItem => ({
      kind: 'creative',
      payload: buildCreativeReviewItemFromAction(
        ar,
        pendingCreativeToolCalls[index]?.id,
        ctx.partialMessage?.id,
        ctx.turnId,
        workspacePath,
      ),
    }))
  }

  onSessionComplete(ctx: SessionCompleteContext): void {
    if (!ctx.workspacePath) return
    try {
      getCreativeDb(ctx.workspacePath).upsertSession(
        ctx.workspacePath, computeWorkspaceHashes(ctx.workspacePath),
      )
    } catch (err) {
      console.warn('[CreativeDomainStrategy] onSessionComplete failed:', err)
    }
  }
}
```

### 4. 改造 `electron/ai/AgentEngine.ts`

#### 4.1 imports（`:31-75` 范围）

**删除**：`:50 buildProposalFromAction`、`:60-62 DomainAgentCapabilities / buildCreativeCapabilities / buildEditCapabilities`、`:64 buildCreativeReviewItemFromAction`、`:65 computeWorkspaceHashes, getCreativeDb`、`:73-75 EDIT/MINIMAL_SYSTEM_PROMPT / buildCreativeSystemPrompt`。

**新增**：

```ts
import type { DomainStrategy, DomainReviewItem } from './domain/DomainStrategy'
import { EditDomainStrategy } from './domain/edit/EditDomainStrategy'
import { CreativeDomainStrategy } from './domain/creative/CreativeDomainStrategy'
```

`BLOCK_EDIT_TOOLS` / `CREATIVE_REVIEW_TOOLS` 也从 `:32` 删除（迁到各 strategy 内）。`EditProposal` / `CreativeReviewItem` 仍保留——`protocol.ts` 内 `DomainReviewItem` 联合需要这两个类型。

#### 4.2 构造函数注入策略表

`:101-107` 改为：

```ts
private readonly strategies: Record<AiAgentDomain, DomainStrategy>

constructor(private getWebContents: () => WebContents | null) {
  this.snapshotBroker = new SnapshotBroker(getWebContents)
  this.rendererBridge = new RendererEventBridge(getWebContents)
  this.aiRootPath = path.join(app.getPath('home'), '.iwriter', 'ai')
  this.bundledSkillsPath = path.join(app.getAppPath(), 'electron', 'ai', 'builtin-skills')
  this.strategies = {
    editing: new EditDomainStrategy(this.snapshotBroker, this.aiRootPath, this.runtimeStore),
    creative: new CreativeDomainStrategy(this.snapshotBroker, this.aiRootPath, this.runtimeStore),
  }
  this.ensureAiDirectories()
}
```

#### 4.3 `_handleInterrupt` (`:549-644`) 收敛为单一策略调用

```ts
private async _handleInterrupt(
  threadId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interruptValue: any,
  partialMessage?: ThreadMessage,
): Promise<void> {
  const actionRequests: Array<{ name: string; args: Record<string, unknown> }> =
    interruptValue?.actionRequests ?? []
  const turnId = this.runtimeStore.getCurrentTurnId(threadId) ?? undefined

  if (!actionRequests.length) {
    console.warn('[AgentEngine] Interrupt with no actionRequests:', interruptValue)
    return
  }

  const domain = this.threadListQuery?.getMeta(threadId)?.domain ?? 'editing'
  const reviews = await this.strategies[domain].buildReviewItems({
    threadId, turnId, actionRequests, partialMessage,
  })

  this.runtimeStore.setInterrupted(threadId, {
    actionRequestCount: actionRequests.length,
    actionNames: actionRequests.map(ar => ar.name),
    turnId,
  })

  this.rendererBridge.sendRunInterrupted({
    threadId, turnId, reviews, partialMessage, actionRequests,
  })
}
```

`buildProposalFromAction` / `buildCreativeReviewItemFromAction` / `BLOCK_EDIT_TOOLS` / `CREATIVE_REVIEW_TOOLS` import 全部从 AgentEngine 移除。

#### 4.4 `_buildAgentCapabilities` (`:807-829`) → 删除整方法，调用点改为 strategy 调用

调用点 `:666` 改为：

```ts
const capabilities = this.strategies[domain].buildCapabilities({ mode, mounts, language })
```

删除 `_buildAgentCapabilities` 方法及 `_getCreativeDb` 辅助方法 (`:831-833`)。

#### 4.5 `_buildMemoryPaths` (`:802-805`) → 委托

```ts
private _buildMemoryPaths(domain: AiAgentDomain): string[] {
  return [path.join(this.aiRootPath, 'memory', this.strategies[domain].getMemoryFileName())]
    .filter(fs.existsSync)
}
```

#### 4.6 `_recordCreativeSession` (`:835-846`) → 删除整方法；`_streamLoop:517` 改为策略调用

```ts
this.threadListQuery?.updateMeta(threadId, { updatedAt: Date.now() })
const domain = this.threadListQuery?.getMeta(threadId)?.domain ?? 'editing'
this.strategies[domain].onSessionComplete?.({
  threadId,
  workspacePath: this.runtimeStore.getContext(threadId)?.workspacePath ?? null,
})
this.rendererBridge.sendRunDone({ ... })
```

`computeWorkspaceHashes` / `getCreativeDb` import 一并删除。

#### 4.7 顶层 `getSystemPrompt` helper (`:873-886`) → 删除；调用点改为策略调用

三处调用点：
- `:682`（`_getOrCreateAgent` 内）→ `this.strategies[domain].getSystemPrompt(mode, language)`
- `:754`（`_getCurrentSessionTokens` 估算）→ 同上
- `:857`（`_assertWithinBudget`）→ 同上

`EDIT_SYSTEM_PROMPT` / `MINIMAL_SYSTEM_PROMPT` / `buildCreativeSystemPrompt` import 全部从 AgentEngine 移除（已下沉到各 strategy 内）。

### 5. IPC 合约统一 — `electron/ai/ipc/protocol.ts`

替换 `:131-148`：

```ts
import type { DomainReviewItem } from '../domain/DomainStrategy'
export type { DomainReviewItem }

export interface RunInterruptedEvent {
  threadId: string
  turnId?: string
  partialMessage?: ThreadMessage
  /** Unified review payload — kind discriminator routes to edit / creative UI. */
  reviews: DomainReviewItem[]
  actionRequests: Array<{ name: string; args: Record<string, unknown> }>
}
```

**完全删除** `proposals` 与 `creativeReviews` 字段。`EditProposal` / `CreativeReviewItem` import (`:12-13`) 保留——`DomainReviewItem` 联合需要。

`RendererEventBridge.ts:16-18` 签名不变（透传整对象），无需改动。

### 6. 前端类型同步

#### 6.1 `src/ai/ipc.ts`

`RunInterruptedEvent` 通过 re-export 自动同步；额外 re-export `DomainReviewItem`：

```ts
export type { RunInterruptedEvent, ResumeDecision, DomainReviewItem } from '../../electron/ai/ipc/protocol'
```

#### 6.2 `src/ai/store/modules/runtimeState.ts:23-36, 54-55, 77-78`

`LiveTurn` 双字段合并：

```ts
export interface LiveTurn {
  // ... 其他字段不变
  reviews: DomainReviewItem[]   // 替换 proposals + creativeReviews
  subTasks: LiveSubTask[]
}
```

新增 computed `pendingReviews` 替代 `pendingEditProposals` / `pendingCreativeReviews`：

```ts
const pendingReviews = computed(() => liveTurn.value?.reviews ?? [])
const pendingEditProposals = computed(() =>
  pendingReviews.value.filter((r): r is Extract<DomainReviewItem, {kind:'edit'}> => r.kind === 'edit')
    .map(r => r.payload))
const pendingCreativeReviews = computed(() =>
  pendingReviews.value.filter((r): r is Extract<DomainReviewItem, {kind:'creative'}> => r.kind === 'creative')
    .map(r => r.payload))
```

后两个 computed 保留是为了 `editReview` / `creativeReview` 子模块**内部**继续按现有 API 消费（避免 review module 内部全面重写）；`runtimeEvents` 内的 dispatcher 改为读 `reviews` 后按 kind 分派（见 6.3）。

`startLiveTurn` 内 `proposals: []` / `creativeReviews: []` 合并为 `reviews: []`。

#### 6.3 `src/ai/store/modules/runtimeEvents.ts:191-248`

`onRunInterrupted` 内分派 fork 改为按 kind 分类：

```ts
const editProposals = event.reviews
  .filter((r): r is Extract<DomainReviewItem,{kind:'edit'}> => r.kind === 'edit')
  .map(r => r.payload)
const creativeReviews = event.reviews
  .filter((r): r is Extract<DomainReviewItem,{kind:'creative'}> => r.kind === 'creative')
  .map(r => r.payload)

if (creativeReviews.length) {
  deps.handleCreativeInterrupt({ threadId, turnId, reviews: creativeReviews })
} else {
  deps.handleEditInterrupt({ threadId, turnId, proposals: editProposals })
}
```

混合 batch（同时含 edit + creative）现实中不存在（HITL 中断由单一 agent 发起），但 filter 写法天然支持。Review module 内部 API 不动。

#### 6.4 `src/ai/store/modules/editReview.ts` / `creativeReview.ts`

不动。它们已经接收 `proposals` / `reviews` 数组参数，与具体存储字段解耦。

### 7. 不动文件清单（已勘察确认）

- `electron/ai/domain/edit/buildEditCapabilities.ts` — strategy 内部复用
- `electron/ai/domain/creative/buildCreativeCapabilities.ts` — strategy 内部复用
- `electron/ai/domain/creative/subAgents/*` — 不动
- `electron/ai/ipc/MessageAdapter.ts` (`buildProposalFromAction`) — strategy 内部复用
- `electron/ai/ipc/CreativeReviewAdapter.ts` (`buildCreativeReviewItemFromAction`) — strategy 内部复用
- `electron/ai/ipc/RendererEventBridge.ts` — 透传整对象，零改动
- `electron/ai/ipc/StreamEventAdapter.ts` — 已 domain-agnostic
- `electron/ai/runtime/ThreadRuntimeStore.ts` — strategy 通过构造注入消费
- `electron/ai/db/CreativeDb.ts` — strategy 内部复用
- `electron/ai/document/SnapshotBroker.ts` — strategy 通过构造注入消费
- `src/types/ai.ts` — `AiAgentDomain` 枚举保持 `editing | creative`（minimal 仍是 mode）
- `src/ai/store/modules/runtimeDisplay.ts` — 已确认仅引用 `BLOCK_EDIT_TOOLS` / `editRoundResult` 等业务字段，不读 `RunInterruptedEvent`

---

## 受影响文件清单

### 新建（3）

| 文件 | 用途 |
|---|---|
| `electron/ai/domain/DomainStrategy.ts` | 接口 + `DomainReviewItem` / `DomainBuildContext` / `InterruptContext` / `SessionCompleteContext` 类型 |
| `electron/ai/domain/edit/EditDomainStrategy.ts` | Edit + minimal 策略实现 |
| `electron/ai/domain/creative/CreativeDomainStrategy.ts` | Creative 策略实现（含 onSessionComplete） |

### 修改（5）

| 文件 | 关键位置 | 改动 |
|---|---|---|
| `electron/ai/AgentEngine.ts` | imports `:31-75` / 字段 + 构造 `:82-107` / `_streamLoop :516-521` / `_handleInterrupt :549-644` / `_getOrCreateAgent :682` / `_getCurrentSessionTokens :754` / `_buildMemoryPaths :802-805` / `_buildAgentCapabilities :807-829`（删除）/ `_getCreativeDb :831-833`（删除）/ `_recordCreativeSession :835-846`（删除）/ `_assertWithinBudget :857` / `getSystemPrompt :873-886`（删除） | 5 处 domain 分支收敛为 `this.strategies[domain].xxx()` 调用；3 处 import 块清理 |
| `electron/ai/ipc/protocol.ts` | `:131-148` | `RunInterruptedEvent`: `proposals` + `creativeReviews` → `reviews: DomainReviewItem[]`；新增 `DomainReviewItem` re-export |
| `src/ai/ipc.ts` | export 列表 | 新增 `DomainReviewItem` re-export |
| `src/ai/store/modules/runtimeState.ts` | `:23-36, 54-55, 77-78` | `LiveTurn.reviews` 合并替换；保留 `pendingEditProposals` / `pendingCreativeReviews` 为派生 computed；新增 `pendingReviews` |
| `src/ai/store/modules/runtimeEvents.ts` | `:191-248 onRunInterrupted` | 改读 `event.reviews` 后按 kind filter 分派 |

### 删除（0）

无文件级删除——`buildEditCapabilities.ts` / `buildCreativeCapabilities.ts` 等仍被各自 strategy 复用。

**总计：3 新建 + 5 修改。**

---

## 实施顺序

1. **DomainStrategy.ts 接口定义** — 先 land 类型，让 TS 推断稳定
2. **EditDomainStrategy.ts + CreativeDomainStrategy.ts** — 实现两个策略类（算法平移，编译通过但尚未接入）
3. **AgentEngine.ts 接入** — 构造函数注入策略表 + 5 处分支收敛 + 删除冗余方法 + import 清理（此时后端切换完成，但 IPC 仍发旧字段则前端会断）
4. **`protocol.ts` 切换 `reviews` 字段 + 后端 `_handleInterrupt` 发 `reviews`** — 同一 commit 内
5. **前端 `runtimeState` / `runtimeEvents` 同步切换** — 同一 commit 内（步骤 4 + 5 必须捆绑，否则中间状态前后端不匹配）
6. **验证清单全跑** — 三模式 HITL + 静态检查全过 → 开 PR

---

## 验证清单

### 静态检查

```bash
npm run lint && npm run type-check
```

重点：
- AgentEngine.ts 内 grep `domain === 'creative'` 必须 **零结果**（除 `_handleInterrupt` 默认 fallback 的 `?? 'editing'`）
- AgentEngine.ts import 块不再 import `EDIT_SYSTEM_PROMPT` / `MINIMAL_SYSTEM_PROMPT` / `buildCreativeSystemPrompt` / `buildEditCapabilities` / `buildCreativeCapabilities` / `BLOCK_EDIT_TOOLS` / `CREATIVE_REVIEW_TOOLS` / `buildProposalFromAction` / `buildCreativeReviewItemFromAction` / `computeWorkspaceHashes` / `getCreativeDb`
- `RunInterruptedEvent` 全仓库无 `proposals:` / `creativeReviews:` 字面量残留（除 review module 内部参数命名）
- `LiveTurn` 类型不再有 `proposals` / `creativeReviews` 字段

### 端到端三模式回归（与 Phase 4 一致）

- **Edit 模式**：打开 .md → "给第二段扩写" → `edit_block` HITL → 审批通过 → TipTap 应用 → 无回归。验证 `runtimeEvents.onRunInterrupted` 走 `kind === 'edit'` 分支
- **Creative 模式**：新建线程 → `task(subagent_type=planner)` → planner 结构化输出 → write_to_chapter HITL → respond 决策 → 验证 `kind === 'creative'` 分支
- **Minimal 模式**：纯文本对话（DeepSeek / Anthropic / Gemini 各一次）→ 无 HITL，验证 system prompt 是 `MINIMAL_SYSTEM_PROMPT`

### 策略表分派验证

- Creative 模式 run 完成后 → 验证 `~/.iwriter/<workspace>/<creative-db>.sqlite` 内 `session_log` 表有新行（`onSessionComplete` 生效）
- Edit 模式 run 完成后 → 验证 `session_log` 表**无**新行（EditDomainStrategy 不实现 onSessionComplete）
- Edit + creative 各跑一次后用 sqlite cli `SELECT thread_id, domain FROM thread_metadata` 与 review 走向交叉确认

### IPC 合约验证

- 在 `RendererEventBridge.ts:17` 临时打 `console.log(JSON.stringify(event))` → 触发 edit HITL → 验证只有 `reviews: [{kind:'edit', payload:{...}}]`，无 `proposals` / `creativeReviews` 字段
- 触发 creative HITL → 同样验证 `reviews: [{kind:'creative', ...}]`
- 验证完移除 log

### Memory 拆分仍然生效（Phase 4 回归）

- Edit 模式新建线程问"读取你的记忆" → 仅命中 `AGENTS.edit.md`
- Creative 模式同理读 `AGENTS.creative.md`

---

## 风险与回滚

| 风险 | 触发条件 | 处理 |
|---|---|---|
| Strategy 构造期就实例化 `CreativeDomainStrategy` 触发副作用（DB 打开） | `CreativeDomainStrategy` 构造函数内未 lazy 化 DB | 设计要求构造函数只存依赖；DB 实例化保持在 `buildCapabilities` / `onSessionComplete` 调用时（`getCreativeDb(workspacePath)` lazy 获取），不在构造函数内 |
| IPC 合约切换后前端字段未同步导致 HITL 卡死 | 步骤 4 / 5 未捆绑 commit | 实施顺序强制要求步骤 4 + 5 同一 commit；CI type-check 会因 `LiveTurn.proposals` 不存在而失败拦截 |
| `runtimeEvents.onRunInterrupted` 内 filter 推断 `r.payload` 类型失败 | 联合类型未正确分派 | 用类型守卫 `(r): r is Extract<DomainReviewItem,{kind:'edit'}>` 显式标注，已在 6.3 写明 |
| `EditDomainStrategy.buildReviewItems` 调用 `SnapshotBroker` 报错被吞 | 与原 `_handleInterrupt:614-616` 行为一致——console.warn 后继续构造 proposals | 行为完全平移，零变化 |
| Phase 4 中间件链调整影响策略接入 | middleware 数组与策略无耦合 | 中间件仍在 `_getOrCreateAgent` 内构造，策略只提供 capabilities，互不相关 |
| 添加第三个 domain 时 `Record<AiAgentDomain, DomainStrategy>` 不全 | TS exhaustive 检查 | `Record<K, V>` 在 K 是固定 union 时强制覆盖；新 domain 加入 union 后构造函数处 type error 立即暴露 |

**回滚策略**：Phase 5 改动可拆为 3 个 commit：
1. 新建 3 个 strategy 文件（不影响运行）
2. AgentEngine 接入策略 + 删除冗余方法（旧 IPC 字段仍发，前端兼容）
3. IPC 合约切换 `reviews` 字段 + 前端同步

回滚时 commit 3 单独 revert 即可恢复双字段 IPC；commit 2 revert 即可恢复 AgentEngine 内 domain 分支。整 PR git revert 是兜底。

---

## 不在 Phase 5 范围

- 跨 provider modelFallback（OpenAI → Anthropic）—— 仍是 Phase 4 留项
- `modelFallback` 触发事件 IPC 通知 —— 仍是 Phase 4 留项
- 第三个 domain（Research / Literary Edit 等）新增 —— Phase 5 完成后视需求评估
- C1 编辑工具体执行路径决策（stub vs in-tool IPC）—— 开放问题，未排期
- `RemoveMessage` 清理 RESPOND_MARKER state 残留 —— Phase 3 留项
- AGENTS.md mode 级细分 —— Phase 4 留项
- summarization summary 内容的 IPC 可视化 —— Phase 4 留项
