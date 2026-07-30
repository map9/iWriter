# Agentic Editing

本文档描述 iWriter 当前的 AI 文档编辑与创作架构。  
如果你看到仓库里其他更早的 agentic editing 设计文档，请以本文为准。

## 当前结论

iWriter 的 AI 运行时已经切换到：

- 主进程 `deepagents + langgraph checkpointer`
- 线程级运行配置与上下文
- 文档编辑域与创作域分离
- 文档修改统一走 block edit proposal / HITL 审批

产品层统一称为 **AI 全能创作搭子（AI Writing Buddy）**，包含两个搭子；代码内部继续使用 `Edit` / `Creative` 作为稳定模式标识：

| 产品名称 | 内部模式 | 目标 | 可用能力 |
| --- | --- | --- | --- |
| 日常写作搭子 / `AI Doc Buddy` | `Edit` | 个人知识管理与日常文档写作：信息收集、内容创作、文稿打磨 | document/search/web/PDF tools + edit proposal tools |
| 小说创作搭子 / `AI Story Buddy` | `Creative` | 从灵感构思到作品完稿：小说项目、提纲、正文、评审、重构与导入 | skills + writer/reviewer subagents + document/filesystem/git tools |

说明：

- 不再有独立 `Ask` 模式。`Edit` 本身就是 ask-then-edit 工作流。
- 不再有 `Minimal` 模式。
- 不再有旧的 ACP Agent 主链路。
- 不再使用旧的 renderer-side `AgentRunner` / `ProviderRegistry` 作为主运行时。

## 当前目录

### 主进程 AI Runtime

- `electron/ai/AgentEngine.ts`
  当前 DeepAgents runtime orchestrator
- `electron/ai/runtime/ThreadRuntimeResolver.ts`
  解析线程级 provider / model / profile / domain
- `electron/ai/runtime/ThreadRuntimeStore.ts`
  保存线程运行态、编辑上下文、中断态
- `electron/ai/ipc/StreamEventAdapter.ts`
  deepagents 流事件 -> renderer 事件
- `electron/ai/ipc/RendererEventBridge.ts`
  主进程 -> renderer 的事件桥
- `electron/ai/ipc/MessageAdapter.ts`
  checkpointer message -> 前端 message DTO

### 工具层

- `electron/ai/tools/common/DocumentTools.ts`
  读取活动文档或指定文件的 block-aware 工具，含文档/章节/目录内容搜索
- `electron/ai/tools/common/EditProposalTools.ts`
  生成需要审批的文档编辑 proposal
- `electron/ai/tools/common/WebTools.ts`
  `web_search` / `fetch_url`，网页搜索与抓取
- `electron/ai/tools/common/PdfTools.ts`
  只读 PDF 大纲/分页读取工具
- `electron/ai/tools/common/GitTools.ts`
  Edit / Creative 共用的 Git 状态、历史、提交、标签和恢复工具
- `electron/ai/tools/creative/`
  Creative 写作会话确认、整章收尾、引用影响面与小说导入工具

### Renderer AI Domain

- `src/ai/store/ai.ts`
  前端 AI store 主实现
- `src/ai/types.ts`
  前端 AI 类型定义
- `src/ai/ipc.ts`
  renderer 侧 IPC 类型入口
- `src/ai/thread/system-prompts/edit.ts`
  Edit 模式 prompt
- `src/ai/thread/system-prompts/creative.ts`
  Creative 模式 prompt

兼容桥接仍然保留在：

- `src/stores/ai.ts`
- `src/types/ai.ts`
- `src/types/ai-ipc.ts`

但它们只是 re-export，不再是主实现位置。

## 长会话上下文管理

- 会话历史摘要由 `createDeepAgent` 内置的 SummarizationMiddleware 在达到阈值后自动执行，iWriter 不提供手动摘要入口。
- `src/ai/model/model-budget.ts` 计算唯一的 `effectiveBudget`，自动摘要、发送前预算检查、token 进度和工具栏提示共同读取该结果。DeepAgents 收到显式的 token `trigger` / `keep`，不再自行按完整 context window 计算另一套阈值。
- LangChain `ModelProfile` 只描述能力和物理上下文上限，不承载账号 TPM。iWriter 的运行预算由内置 model/provider policy、可选 `modelPolicies[modelId].maxRequestTokens` 和 provider 级 `maxRequestTokens` 决定，最终不会超过 `profile.maxInputTokens`。
- 内置运行预算当前为：OpenAI 200k（`gpt-5.4-pro` 12k）、DeepSeek 75k、Anthropic 800k、Gemini 128k；新模型在 LangChain 已知 context profile 时继承 provider policy，完全未知模型保守使用 32k。用户无需逐模型配置，只有实际账号配额不同时才需要覆盖。
- 自动摘要通常在运行预算的 85% 触发（DeepSeek 为 80%），压缩后保留约 10% 的最近上下文（上限 100k）。发送前检查只拒绝摘要无法缩小的系统提示、工具 schema 和本轮新输入；累积历史超过阈值时交由摘要中间件先压缩，不再由全局 250k 上限提前失败。
- 工具栏圆环是只读状态指示器，显示当前有效会话 token、自动摘要阈值、压缩保留量、单次运行预算以及可用时的模型物理上下文上限。DeepAgents JavaScript 当前没有直接压缩既有会话的公开 API，因此点击圆环不会触发摘要。
- 摘要结果通过 checkpoint 的 `_summarizationEvent` 保存，较早的完整消息由 DeepAgents offload 到 conversation history。
- 摘要发生后，主进程发送带 `turnId` 和时间戳的压缩事件；渲染层在对应轮次末尾显示居中的“上下文已压缩（时间）”分隔行。该事件不是 `ThreadMessage`，不使用对话 Bubble，也不回灌模型上下文；当前仅保留在本次应用会话的渲染状态中。
- 摘要使用同一个通用框架，`EditDomainStrategy` 与 `CreativeDomainStrategy` 只提供各自需要保留的任务语义。Edit 分型保留文档/区块/审批/编辑约束，Creative 分型保留阶段、Playbook、正式事实/候选、因果与写作会话状态；不复制两套摘要中间件。
- `_contextLedger` 在 checkpoint 中确定性保存已读来源、范围、版本、缺失/失败状态。文件、块或 Git 恢复发生实际修改后，相关读取会标记为 stale；脏的编辑器文档读取只在当前 user turn 内有效。账本只作为隐藏 system context 注入，不创建用户或助手 Bubble，也不保存大段工具返回。

## Checkpoint 持久化与保留

- initial 与 resume 运行统一使用 LangGraph `durability: "exit"`，只在运行结束或中断退出时保存 checkpoint，不再为每个 superstep 持久化完整状态。
- 该设置不会清理既有 checkpoint 数据，也不影响已有会话继续从其最新状态恢复。代价是应用进程在一次运行尚未退出时意外终止，会回到该轮开始前最近一次已持久化状态；未来如重新启用逐步容错，需要同时确保外部工具副作用可幂等重放。
- checkpoint 是运行恢复状态，不应长期兼任完整对话历史和工程事件日志。后续若需要稳定的历史搜索与故障取证，应将 transcript / run events 独立持久化。

本地 SQLite `keep_latest` 方案暂不实现，备忘如下：

1. 仅在任务没有活跃写入、或一次结束/中断状态已经完整落盘后执行清理。
2. 从 root checkpoint 出发计算各 namespace 的可恢复前沿，保留可达 head、对应 pending writes、未解决 interrupt，以及用户明确固定的轮次锚点。
3. 将已解决的工具调用、审批、中断和错误保存为独立事件，而不是依赖旧 checkpoint 快照。
4. 在事务内删除恢复集合之外的 checkpoints 和无主 writes；空闲时按页执行增量 vacuum。
5. 增加每任务 checkpoint 数量、逻辑字节数、空闲页和 GC 结果指标；以软阈值触发清理，不以任意行数直接破坏恢复集合。

## Edit 模式

Edit 模式的原则是：

1. 先读再改
2. 优先使用 block-aware 文档工具
3. 文档修改必须经过 proposal 审批
4. 可以使用只读 shell 在 workspace 中找文件
5. 不允许绕过 proposal 直接原始写文件

Edit 模式当前可用工具：

- 文档读取/检索：`get_document_outline`、`get_section`、`get_sections`、`get_blocks`、`get_block_context`
- 内容搜索：`search_blocks_in_document`、`search_sections_in_document`、`search_in_directory`
- 编辑 proposal：`edit_block`、`insert_block`、`delete_block`、`replace_range`、`create_document`
- 网络：`web_search`、`fetch_url`
- PDF（只读）：`get_pdf_outline`、`get_pdf_pages`
- deepagents 内置：`ls`、`read_file`、`write_file`、`edit_file`、`glob`、`grep`、`execute`（shell，仅按 prompt 约定用于发现，无硬只读限制）、`write_todos`、`task`

关键约束：

- 活动文档和指定 `file_path` 文档都通过文档快照与 block map 访问
- 对 `.iwt / .md / .txt` 的文档编辑不应走原始 `read_file/write_file/edit_file`
- 文档编辑最终都走 proposal + `ai:resume`

## Creative 模式

Creative 模式是工作区限定的小说创作域，采用纯 Markdown 对象模型。

正式对象位于工作区根目录：

- `project.md`
- `worldbuilding/worldbuilding.md`
- `characters/characters.md`
- `storylines.md`（可选、单文件，独立于总纲）
- `outline/`（总纲 / 卷纲 / 章纲）
- `manuscript/`
- `materials/cards.md`（可选、未确认或未归位的原子想法）
- `process/`
- `exploration/`
- `styles/`

紧凑对象模型：

- 人物、世界、故事线和卡片是并列对象；总纲只安排顺序与交汇，不复制故事线。
- 一个事实只在唯一归属对象中保存完整内容，其他文件使用稳定 ID 引用。
- 简单人物或设定使用一个核心段；主要人物或重要设定最多增加六条正文会使用的自然事实句；故事线阶段、结构节点和场景各用一个因果句。
- 模板只规定记录形状与长度预算。对应任务 Skill 在内部验收创作语义，项目文件不保存分析字段。
- 人物使用短小传和故事事实；世界观设定按作品内名称建立条目，不预设内容分类。
- `characters.md`、`worldbuilding.md`、`storylines.md` 和 `cards.md` 先读结构、再按 ID 读取目标块，不因单文件集合而整份装入上下文。

主 Agent 按每轮意图加载阶段 Playbook 或独立任务 Skill：

- `ideation-outline-playbook`
- `drafting-playbook`
- `revision-playbook`
- `novel-import`
- `restructuring`
- `style-transfer`

专用 subagent 只有两个：

- `writer`：写或改正文，不做评审
- `reviewer`：只读评审，不改正文

复杂研究、风格或导入证据提取使用 DeepAgents 的 `general-purpose` subagent。

正文写作使用 write-session：`confirm_writing_plan` 批准目标章节后，授权范围内的 block edit 自动累积；完成时 `finalize_chapter` 提交整章差异，作者可以接受、反馈返工或拒绝并恢复基线。章纲必须 confirmed 且场景可写；beat 是可选的 GFM `[!BEAT]` 锚点，不是进入正文阶段的必需条件。

## Skills 目录结构

`electron/ai/builtin-skills/`（运行时同步到 `<aiRoot>/skills/`）按域组织：

- `common/` —— Edit + Creative 公用技能，包含文档块工具与 web research。
- `edit/` —— 仅 Edit 域使用，目前含 `image-sourcing`。
- `creative/reference/` —— 小说工作区与各类正式对象模板。
- `creative/main/` —— 主 Agent 的阶段流程。
- `creative/common/` —— 跨阶段创作技法。
- `creative/reviewer/` —— Reviewer 专用评审约束。
- `creative/delegated/` —— 可委托给 general-purpose 的独立任务。

Creative 主 Agent 的装载顺序是 common → creative/common → creative/reference → creative/main → creative/delegated → `<workspace>/.iwriter/skills`。项目级技能最后加载，可以覆盖同名内置技能。Writer / Reviewer 由 `electron/ai/builtin-subagents/creative/` 的声明式 agent 定义装配。

## 文档快照与编辑执行

当前文档编辑链路：

1. 主进程通过 `SnapshotBroker` 请求 renderer 提供快照
2. renderer 使用 `DocumentViewBuilder` 构造 block-aware 视图
3. `SerializedSnapshot` 直接基于结构化 block 数据生成，不再从 `viewMarkdown` 反向切块
4. proposal 审批通过前端统一执行器应用到：
   - 活动编辑器
   - 非活动磁盘文件
   - 新文档创建

相关文件：

- `electron/ai/document/SnapshotBroker.ts`
- `src/ai/document/SnapshotSerializer.ts`
- `src/ai/document/DocumentViewBuilder.ts`
- `src/ai/document/BlockEditApplier.ts`
- `src/ai/document/UnifiedDocumentAccess.ts`

## 已废弃或不再作为现状的设计

以下内容如果在仓库中仍能看到，只应视为历史资料，不代表当前实现：

- ACP Agent 作为主交互路径
- `Write / Ask / Minimal / Creative` 四模式并存
- renderer-side `AgentRunner` 多轮 tool loop 主链路
- 旧 `ContextBuilder` 中那套 LMTool/schema 文档
- `read_file / write_file / edit_file` 作为 Edit 模式文档编辑路径
- “streaming 一套 UI，done 后另一套 UI” 的消息渲染方式

## Chat 显示规范

Agent Chat 的前端显示规则，不再由单个组件各自决定，而是以统一规范为准。

当前必须遵守的几条结论：

1. 这是前端显示层重组，不是后端消息结构重组
2. 流式与持久态必须一致
3. thinking 必须挂到合适的可见宿主上，而不是优先单独成泡
4. `write_todos`、edit tool calls、普通 tool calls 三类输出有不同宿主规则
5. 连续普通 tool calls 必须按显示层连续性成组，而不是按原始 persisted message 生硬切开

当前参考规范：

- `design/AGENT-CHAT-SPEC.md`

其中已经包含：

- `BlockEditReviewSurface` / `EditSummaryCard` 的编辑域规范
- `TaskPlanCard` 的归属规则
- 普通 `ToolCallCard` 的分组规则
- thinking 的挂载规则
- 空白 bubble 的禁止规则

## 开发建议

如果要继续扩展 AI 功能：

1. 文档正文相关能力优先放在 `Edit` 模式
2. 小说设定、脑暴、创意规划优先放在 `Creative` 模式
3. 不要把 creative skill 直接做成 block edit proposal
4. 新的 renderer AI 逻辑优先放到 `src/ai/`
5. 新的主进程运行时逻辑优先放到 `electron/ai/`

## 相关文档

- `README.md`
- `docs/docs/ai-overview.md`
- `docs/docs/ai-edit-mode.md`
- `docs/docs/ai-creative-mode.md`
