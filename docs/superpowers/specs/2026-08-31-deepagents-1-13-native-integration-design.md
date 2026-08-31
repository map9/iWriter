# DeepAgents 1.13 原生能力迁移设计

## 1. 目标

本次调整将 iWriter 从 DeepAgents 1.11.1 升级到 1.13.2，并删除对 `deepagents` 包的运行时代码 patch。实现尽量使用 DeepAgents 和 LangChain 的公开接口，同时保留 iWriter 已有的上下文压缩体验与安全审批能力。

具体目标：

1. 使用 DeepAgents 原生 `delete` 文件系统工具，移除对外暴露的自定义 `delete_file`；
2. 将 iWriter 特有的 token 估算、摘要 fallback、摘要归档、完成事件实现为项目自有 LangChain middleware；
3. 通过 LangGraph v3 公开事件流投影摘要事件，不依赖 DeepAgents 私有运行时代码；
4. 删除 `patches/deepagents+1.11.1.patch`，并将 patch 校验改为项目边界行为校验；
5. 保留现有网络重试、HITL 审批、上下文压缩 UI 和 subagent 展示行为。

## 2. 采用 DeepAgents 原生能力

### 2.1 原生 delete

DeepAgents 1.13.2 的文件系统 middleware 提供 `delete({ file_path })`，目录删除采用递归语义。iWriter 不再把自定义 `delete_file` 提供给模型，仅保留自定义 `rename_file` 和 `move_file`。

安全边界：

- `delete` 始终进入 HITL，不做内部路径自动批准；
- 删除 `/`、当前 workspace 根、AI 根、`/conversation_history/` 根和 `/large_tool_results/` 根时直接拒绝；
- UI 明确提示目录删除会递归执行；
- 审批契约在迁移期识别历史 checkpoint 中的 `delete_file`，自动拒绝并提示 Agent 用原生 `delete` 重新发起；新 Agent 只发布 `delete`。

### 2.2 中间件替换

DeepAgents 1.13.x 支持同名 middleware 覆盖默认 middleware。项目提供名为 `SummarizationMiddleware` 的 `IWriterSummarizationMiddleware`，使 DeepAgents 在组合 middleware 栈时用项目实现替换默认摘要实现，而不是通过新增的非公开 `summarizationMiddlewareOptions` 参数修改框架。

每个 declarative subagent 显式获得独立的摘要 middleware 实例。这样避免并发运行共享 closure 状态，也符合 DeepAgents 对自定义 subagent middleware 不自动继承的约定。

### 2.3 公开事件流

Agent 继续使用 `streamEvents({ version: 'v3' })`。项目新增上下文压缩事件 transformer：

- 消费 middleware 通过 `getWriter()` 写出的 `deepagents_summarization` custom event；
- 根据公开的 namespace、task 和 tool-call 协议派生 root/subagent 归属；
- 使用父 `task` tool call id 作为稳定的 subagent id；
- 向 AgentEngine 暴露独立的 context-compression async iterable。

因此不再需要给 DeepAgents 的 task 工具注入 `iwriter_subagent_id` 元数据。

## 3. IWriterSummarizationMiddleware

项目 middleware 以 DeepAgents 1.13.2 的公开摘要 middleware 行为为基线，并仅加入 iWriter 所需的扩展：

- 注入的 CJK-aware `tokenCounter`，负责项目阈值判断和保留窗口计算；
- DeepAgents 原生 middleware 负责摘要生成、安全截断、模型校验、历史 offload 和摘要 state；
- 独立摘要模型失败或返回空文本、纯 reasoning、tool call 时的 fallback 路径，且不进入主模型 retry 链；取消信号不触发 fallback；
- 摘要正文与原始历史归档到 `/conversation_history/`；
- 摘要开始、完成与失败事件；
- 当本轮响应令上下文越过阈值时，在 `wrapModelCall` 返回 `Command` 完成 post-response 压缩。

如果 post-response 压缩失败，middleware 保留 `failed` 压缩事件但返回已经成功生成的主回复，避免用户先看到完整回答、随后又看到整轮失败。

每次压缩都会创建独立的原生摘要 middleware；持久状态沿用 DeepAgents 的 `_summarizationEvent` / `_summarizationSessionId` graph state，不在项目 middleware closure 中共享。DeepAgents 1.13.x 已阻止这些内部字段泄露到 subagent 的输入输出。

## 4. 删除的 patch 行为

升级后不再保留以下 patch：

- DeepAgents 类型声明中的 `summarizationMiddlewareOptions` 扩展；
- 默认摘要 middleware 的 `fallbackModel`、`summaryInstruction`、`tokenCounter` 私有扩展；
- task 元数据中的 `iwriter_subagent_id`；
- grep 的 `|` alternation 扩展；
- CompositeBackend mounted path 自定义诊断；
- 对 DeepAgents 构建产物 JS/CJS/d.ts 的同步修改。

原生框架已覆盖的部分直接采用上游实现，包括内部摘要字段过滤、subagent 摘要 session 隔离、同名 middleware 替换、原生 delete、读取分页元数据和 glob 结果限制。

## 5. 测试策略

- 文件系统行为测试验证新 Agent 暴露 `delete`、删除进入审批、受保护根及其祖先/真实路径别名被拒绝，以及历史 `delete_file` 自动拒绝并提示重试；
- middleware 行为测试验证 token 阈值、fallback、归档、完成/失败事件和 post-response `Command`；
- 流转换测试验证 root 与 subagent 摘要事件的 id/name 投影；
- AgentFactory 测试验证 root 和 declarative subagent 均注入独立摘要 middleware，且不再传私有参数；
- 依赖校验脚本验证 DeepAgents 版本、公开导出和无 patch 安装，不再匹配 `node_modules` 内部源码文本；
- 最终运行 type-check、聚焦测试、完整测试套件与 diff 检查。
