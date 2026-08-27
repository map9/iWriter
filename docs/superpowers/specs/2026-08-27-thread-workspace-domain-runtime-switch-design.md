# Thread Workspace、Domain 与 Runtime 切换设计

## 1. 目标

本设计统一解决三个相互关联的 Thread 生命周期问题：

1. 切换 workspace 时，以受控事务中断当前 Thread，并在目标 workspace 创建新的 draft Thread；
2. domain 只允许在 draft Thread 中选择，首轮对话提交后永久锁定；
3. 同一 Thread 的 provider/model 切换只对下一轮生效；如果候选模型无法容纳当前有效上下文至其自动摘要阈值，则拒绝切换，不执行上下文迁移或桥接摘要。

实现必须保持现有 Thread 历史、HITL 恢复和 DeepAgents 自动摘要行为不回归。

## 2. 核心不变量

### 2.1 Workspace

- 每个已持久化 Thread 必须绑定一个规范化的 `workspacePath`。
- 当前 workspace 内的 Thread 可选择；其他 workspace 和未绑定 workspace 的 Thread 仍显示，但为 disabled。
- 选择 disabled 历史项不得隐式触发 workspace 切换。
- workspace 切换成功后，总是激活目标 workspace 下的一个新 draft Thread，不复用旧 Thread。
- 当前 Thread 在 streaming、resuming 或 HITL 中时，切换前必须获得用户确认。
- 用户取消、目标 workspace 校验失败或切换准备失败时，当前 workspace 和 Thread 均保持不变。

### 2.2 Domain

- draft Thread 定义为：没有已提交的用户轮次、没有活动 run、没有 HITL checkpoint。
- domain picker 只在 draft Thread 显示。
- 第一轮被主进程正式接受后，domain 被锁定；renderer 的乐观消息不能作为锁定依据。
- renderer 和主进程都必须执行锁定校验，主进程是最终权威。
- 对话标题持久值不改写；标题栏展示为 `{domain display name} | {thread title}`。

### 2.3 Provider/model

- picker 中的 provider/model 是下一轮候选配置，不得改变当前 run 或 HITL resume 使用的配置。
- 每轮开始时冻结实际 runtime；该轮的 resume、tool continuation 和 usage 统计始终使用冻结值。
- 候选配置只有通过上下文兼容性校验后，才能写入 Thread 的下一轮配置。
- 兼容性条件为：

  ```text
  currentEffectiveContextTokens < candidateCompactTriggerTokens
  ```

- 相等或超过阈值均拒绝切换，以免目标模型的第一次调用先依赖摘要，而摘要请求本身又无法可靠容纳源上下文。
- 拒绝时不修改 picker 的已提交值、不修改 Thread 元数据、不失效 Agent cache、不执行摘要。
- 本功能不实现上下文迁移、桥接压缩、分层摘要或静默裁剪。

## 3. 数据模型

### 3.1 Thread metadata

在 Thread metadata 中增加：

```ts
interface ThreadMeta {
  workspacePath?: string | null
  domain: AiAgentDomain
  mode: AiAgentMode
  providerConfigId: string
  modelId: string
  thinkingLevel: AiThinkingLevel
  pendingRuntime?: {
    providerConfigId: string
    modelId: string
    thinkingLevel: AiThinkingLevel
    basedOnTurnId: string
  }
}
```

`workspacePath` 使用统一规范化函数处理绝对路径、尾部分隔符和平台大小写规则。旧 Thread 无法推断 workspace 时保持 `null`，在历史列表中显示但禁用。

### 3.2 运行时状态

Thread 配置与当前轮配置分离：

```ts
interface TurnRuntimeSnapshot {
  threadId: string
  turnId: string
  providerConfigId: string
  providerConfigRevision: string
  modelId: string
  thinkingLevel: AiThinkingLevel
  domain: AiAgentDomain
  mode: AiAgentMode
  workspacePath: string | null
}
```

- Thread metadata 的扁平 provider/model 字段保存下一轮已提交配置；活动轮次中选择的新候选保存在 `pendingRuntime`，尚不构成切换。
- `TurnRuntimeSnapshot` 保存当前轮实际配置。
- HITL resume 从 snapshot 恢复，而不是重新读取当前全局 settings。
- provider secret 不复制进 checkpoint；snapshot 引用 provider config revision。仍被活动/HITL 轮次引用的 revision 不得被物理删除。

## 4. Workspace 切换事务

Renderer 增加单一 workspace transition coordinator，所有打开目录入口都必须经过该协调器，不能继续直接执行 `closeFolder()` 再 `openFolder()`。

事务阶段：

```text
idle
  -> validating-target
  -> awaiting-user-confirmation (仅 active/HITL)
  -> preparing-target
  -> terminating-current-thread
  -> committing-workspace
  -> completed
```

失败进入 `rolled-back`。关键顺序如下：

1. 在改动当前 workspace 前验证目标路径并准备基础数据；
2. 检查当前 Thread 状态；
3. streaming/resuming/HITL 时展示确认提示；
4. 用户确认后，先创建尚未激活的目标 workspace provisional draft Thread；
5. 请求主进程中止当前 run，并等待确认；中止失败时删除 provisional Thread；
6. 将目标 workspace 与 provisional Thread 一次性提交到 renderer 状态；
7. 激活新 Thread，并重新计算历史项 selectable 状态。

所有可能失败的目录读取和 Thread 创建都发生在旧 Thread 中止前。旧 Thread 中止成功后的最终提交只包含内存状态替换，不再执行可能失败的 I/O。

提示文案区分状态：

- streaming/resuming：`当前任务仍在运行。切换工作区会中断任务并创建新对话，是否继续？`
- HITL：`当前任务正在等待你的确认。切换工作区会中断该任务并创建新对话，是否继续？`

历史列表查询不按 workspace 删除记录，而是为每项派生：

```ts
interface ThreadListItemState {
  selectable: boolean
  disabledReason?: 'different-workspace' | 'unbound-workspace'
}
```

disabled item 保留标题、domain 和 workspace 标签，不响应选择事件。

## 5. Draft domain 锁定

domain 选择使用两阶段权威：

1. renderer 仅在本地 draft Thread 显示并更新候选 domain；
2. 第一轮发送时，主进程检查 Thread 仍为 draft，并将 domain 与首轮一起提交；
3. 首轮正式接受后，renderer 清除 draft 标记并隐藏 picker；
4. 首轮在进入主进程前失败或被兼容性校验拒绝时，Thread 仍为 draft，picker 保持可用；
5. 对非 draft Thread 的 domain 更新 IPC 返回明确错误，renderer 恢复原值。

标题栏从 domain 注册表获取本地化 display name，再与原始 Thread title 组合。Thread title 本身继续用于历史列表、搜索和重命名。

## 6. Provider/model 兼容性校验

### 6.1 权威 token 计算

主进程提供只读兼容性校验：

```ts
interface RuntimeSwitchCandidate {
  providerConfigId: string
  modelId: string
  thinkingLevel: AiThinkingLevel
}

interface RuntimeSwitchCompatibility {
  compatible: boolean
  currentEffectiveContextTokens: number
  candidateCompactTriggerTokens: number
  candidateRequestBudgetTokens: number
  candidateMaxInputTokens?: number
  budgetSource: ModelBudgetSource
  reason?: 'context-exceeds-compact-trigger' | 'provider-not-found' | 'model-invalid'
}
```

`currentEffectiveContextTokens` 必须基于主进程 checkpoint 的有效投影计算：

```text
system prompt
+ tool schemas
+ existing summary message（如果存在）
+ messages after summary cutoff
```

它不是 Thread 累积 usage，也不能使用 renderer 当前显示的粗略总量。候选预算继续复用 `getEffectiveModelBudget()`；未知模型沿用现有保守 128k request budget。

### 6.2 Picker 事务

provider/model 切换采用 prepare/commit：

1. renderer 暂存候选值，不立即调用 `saveSettings()` 或改已提交的 Thread runtime；
2. 调用主进程兼容性校验；
3. Thread idle 时，`compatible=true` 立即提交候选值，使其成为下一轮配置；
4. Thread streaming/resuming/HITL 时，`compatible=true` 只写入 `pendingRuntime`；当前轮结束进入 idle 后，用最终 checkpoint 再校验并提交；
5. `compatible=false` 时恢复已提交值并显示警告；
6. 校验期间 picker 显示 loading，避免并发选择乱序；较旧请求结果不得覆盖较新候选。

警告文案：

```text
无法切换到 {modelName}：当前上下文约 {currentTokens} tokens，
已达到该模型的自动摘要阈值 {triggerTokens} tokens。
请继续使用当前模型，或新建对话后再切换。
```

provider 与 model 任一变化都必须校验。thinking level 单独变化不改变上下文预算时可直接提交，但仍只在下一轮生效。

### 6.3 活动轮次边界

- 当前轮 runtime 一经创建不可变。
- streaming、resuming 或 HITL 期间的 picker 变更只形成 `pendingRuntime`，不触发 cache invalidation。
- 当前轮进入 terminal idle 后，用包含新增 assistant/tool 内容的最终 checkpoint 再校验一次。通过后才把 pending 值写入已提交配置；失败则清除 pending 并提示用户。
- 下一轮发送前只在 provider config revision 或模型预算定义发生变化时防御性复检；失败时恢复上一轮成功 runtime，并且不启动新轮次。
- 多次快速选择使用递增 request ID；只有最后一次候选可以提交。

### 6.4 Cache 生命周期

删除 `ai:update-config` 后立即全局 `invalidateAgentCache()` 的行为。Agent cache key 已包含 provider/model/runtime 指纹，因此：

- 新候选通过校验后按新 key 延迟创建；
- 当前轮继续持有旧 cache entry；
- idle 且无 checkpoint/HITL 引用的旧 entry 才可回收；
- workspace 切换确认中止旧 Thread 后，可释放该 Thread 的运行态 entry。

## 7. Compact tip

Compact tip 默认显示“已提交的下一轮模型”预算，不显示被拒绝的候选值。存在已通过初检的 `pendingRuntime` 时，额外显示“待本轮结束复检”，不能把它标记为已切换。

运行中/HITL 时分开显示：

```text
当前轮：{activeModel} · {activeTokens} / {activeTrigger}
下一轮：{nextModel} · {effectiveTokens} / {nextTrigger}
候选：{pendingModel} · 待本轮结束复检（可选）
```

要求：

- 当前轮 usage 必须配当前轮 snapshot 的预算；
- 下一轮有效上下文配 Thread 已提交配置的预算；
- 不得把旧模型 live tokens 与新模型 trigger 混合；
- 内部保留未截断 ratio，圆环可封顶 100%，tooltip 可显示超过 100% 的真实比例；
- 被拒绝切换后，tip 保持原模型数据；警告通知承担失败说明。

## 8. 错误处理与并发

- workspace transaction 全程只允许一个实例；重复请求直接合并或拒绝。
- runtime compatibility IPC 是只读操作，不产生 metadata、checkpoint 或 cache 副作用。
- picker 只提交最后一次校验成功且仍为当前候选的响应。
- provider/model 在校验后被删除或修改时，发送前复检失败，不能回退到未声明模型。
- workspace 切换中止失败时不提交目标 workspace。
- Thread 首轮发送失败时不得错误锁定 domain。
- 所有拒绝路径保留原 Thread、原 provider/model 和原上下文。

## 9. 测试策略

### 9.1 Workspace

- idle Thread 切换 workspace 后创建绑定目标 workspace 的新 draft Thread；
- streaming 和 HITL 分别展示正确提示；
- 用户取消时 workspace/Thread 不变；
- 中止失败时不提交 workspace；
- 历史列表显示全部 Thread，但仅当前 workspace 项可选；
- 未绑定 workspace 的旧 Thread 显示且禁用；
- `currentFolder: A -> null -> B` 不得创建两个 Thread。

### 9.2 Domain

- 新 draft Thread 显示 picker；
- 首轮正式接受后隐藏 picker；
- 首轮发送前失败时仍可选择 domain；
- 主进程拒绝修改已有对话的 domain；
- 标题栏展示 `{domain name} | {original title}`，持久化标题不变。

### 9.3 Provider/model

- 当前上下文严格小于候选 trigger 时切换成功；
- 等于或大于 trigger 时拒绝并保持原值；
- provider 变化同样触发校验；
- 快速连续选择只有最后响应能提交；
- 当前轮继续使用 frozen runtime，下一轮才使用新值；
- HITL resume 使用原 runtime；
- 当前轮结束后上下文增长导致发送前复检失败时，不启动新轮次；
- 拒绝切换不触发 cache invalidation；
- Compact tip 不混用 active runtime token 和 next runtime threshold；
- 未知模型按 128k 保守预算判断。

## 10. 非目标

- 不自动将 disabled 历史项所属 workspace 打开；
- 不允许已有对话修改 domain；
- 不实现跨模型上下文迁移或桥接摘要；
- 不改变 DeepAgents 当前同模型自动摘要流程；
- 不在本次工作中实现完整 Transcript Store、Context Capsule 或 Memory Scaffold。
