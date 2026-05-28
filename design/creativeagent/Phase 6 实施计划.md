# Phase 6 实施计划

> 配套文档：需求见 `Phase 6.md`。本文是**执行级实施计划**——把需求一/二/三拆成可落地、可验证、可回滚的步骤序列。设计细化（接口签名、schema 定稿）在各步骤内随实现确定。

## 执行原则

- 严格按 **阶段 A → B → C** 推进；A 不依赖任何重构，B 为 C 提供干净写入原语，C 收口主 agent。
- 每个阶段结束跑 `npm run lint && npm run type-check`，并在真实 workspace `私人笔记/小说` 做端到端验证后再进下一阶段。
- 每步保持小提交、可回滚；废弃旧工具放在新路径验证通过之后，避免中间态断功能。

---

## 阶段 A：解阻塞（与重构解耦，先行）

### A1. 修复 `get_character_psychology` 解析 bug（P0）

**文件**：`electron/ai/tools/CreativeLogicTools.ts`

根因是解析器与真实 StoryBible 角色 schema 三处漂移：
1. `findSection(content, 2, ['Characters','角色'])` 只取 `## Characters` 段，但真实文件角色写成顶层 `## 沈望——…`，Characters 段为空。
2. `splitCharacterSections` 只找段内 `### name`，真实文件是 `## name`。
3. `extractField(false_belief)` 只找 `虚假信念`，真实文件用 `错误信念`；且字段写成 `**核心欲望**：`，`**` 夹在 label 与冒号之间导致 `colonPattern` 不匹配。

**改造**（保持工具签名/返回结构不变）：
- 角色定位改为「先试 `## Characters` 段内 `### name`，落空则回退到顶层 `## name` 扫描」，标题层级容错。复用现有 `pickCharacterSection` 的 `stripDecorations` + 包含匹配逻辑。
- `extractField` 预处理 body：剥离 label 周围的 `*`/`_`/`#` 装饰（或在 `extractPsychology` 前对 body 做一次 `**`→`` 归一），使 `**核心欲望**：` 能命中。
- `extractField(false_belief)` 标签数组补 `错误信念` 别名。
- 理想：抽出 writer 与 parser 共享的「角色条目字段契约」常量（字段名 + 别名表），消除未来漂移。本步至少集中成一处别名表。

**验证**：对 `沈望/童建军/童瑶` 调 `get_character_psychology`，返回完整三角、`missing` 为空、`missing_fields` 为空。

### A2. 风格写前约束（而非事后否决）

**文件**：`src/ai/thread/system-prompts/creative.ts`（写作流程段）

- 在正文生成步骤前，要求主 agent（阶段 C 后为 WriterAgent）显式加载并复述当前激活的 writing-style skill 的 Generation Recipe / Self-check 要点，作为写作约束注入，而非生成后再比对。
- 与现有「prose generation 必须锚定 skill」规则合并，明确风格 skill 属于强制锚定项。

**验证**：请求「按鲁迅风格重写」时，写作前的 assistant 行为/工具调用包含风格 recipe 加载，生成结果首轮即贴合风格。

### A3. 新建 `style-consistency-check` skill + scoped skill source 机制

**文件**：`electron/ai/builtin-skills/style-consistency-check/SKILL.md`（新建）；`subAgents/consistency.ts`；`buildCreativeCapabilities.ts`

- 定义风格一致性检查协议：对照激活风格 skill 的维度（文白夹杂 / 以轻写重 / 物质细节 / 反高潮 / 虚词频率 / 重复回旋等）逐项核对生成稿。
- **scoped skill source 机制（review P1，A3 与 C1 共享前置）**：
  - deepagents custom subagent **不继承 main agent skills**（`index.d.ts:1987`），须在 SubAgent 上显式设 `skills`。而现有 sub-agent（如 `consistency.ts:75`）根本没有 `skills` 字段。
  - `skills` 的元素是**技能父目录 source**：loader 对 source 路径 `ls` 后扫每个子目录的 `SKILL.md`（`listSkillsFromBackend`，`index.js:3016-3052`）。因此指向全局 `/skills/` 会暴露全部 skills；指向单个 `/skills/deep-pov/` 则扫不到（它把 deep-pov 当父目录找其子目录）。
  - 方案：在 `aiRoot/skills/` 下维护 scoped source 目录，如 `_consistency/`、`_writer/`、`_planner/`、`_explorer/`，其中仅放目标 skill 子目录（建议构建期生成软链/拷贝，指向真实 skill 目录），SubAgent 声明 `skills: ['/skills/_writer/']` 等。或实现自定义 filtered skills middleware 按白名单暴露。二选一在 A3 起始定。
  - consistency sub-agent 的 scoped source 含 `style-consistency-check`（及其它一致性相关 skill），使一致性检查覆盖风格维度。

**按 sub-agent 功能配 skill（Q1，对齐 `04_agent角色设计.md` §9 的角色技法表）**：机制建好后，按功能给每个 sub-agent 配 scoped skill source，避免技能外溢、保持各 agent 聚焦。tools 现状已按功能 scoped（planner=只读+`get_character_psychology`、consistency=只读、explorer=只读+`write_exploration_draft`、researcher=web、styleExtractor=∅、styleCreator=writing-style 工具），阶段 B 替换 DocumentTools 后顺手收敛即可。skill 分配建议：

| sub-agent | scoped skills（source 目录内容） | 收益 |
|---|---|---|
| writer（C1 新建） | deep-pov / character-voice / dialogue-craft / sensory-grounding / show-vs-tell / pacing-control / subtext-craft / foreshadowing-placement | 高（写作必须锚定技法） |
| consistency | pov / character-behavior / timeline / world-rules / foreshadowing-audit / arc-progression / **style-consistency-check** | 高 |
| planner | scene-structure / character-arc-planning / story-logic / pacing-sense / genre-intelligence / foreshadowing-placement | 中 |
| state（C1b 新建） | info-extraction / story-compression / contradiction-detection | 中 |
| advisor（C1c 新建） | plot-extrapolation / theme-recognition / structural-diagnosis / character-potential / conflict-design | 中 |
| explorer | branch-comparison | 中 |
| Researcher / WritingStyleExtractor / WritingStyleSkillCreator | 空（协议已在各自 system prompt） | 低，留空无成本 |

**验证**：consistency_checker 实际加载到 `style-consistency-check`（不暴露无关 skill）；writer 仅加载写作技法 skill；planner 仅加载规划技法 skill；返回结果包含对应维度。

**阶段 A 出口**：lint + type-check 通过；trace 场景的「角色心理误报」「风格首轮不贴合」两处摩擦消除。

---

## 阶段 B：抽共享文档基座，creative 消费 edit 机制（需求一）

目标：creative 的章节读/写/复审改走 edit 域的块级机制，废弃自有弱文档层。已验证复用成本极低（引擎 domain 无关；`DomainReviewItem` 已含 `'edit'` kind；`buildProposalFromAction` 是纯函数；DocumentTools 经 SnapshotBroker 支持任意磁盘文件）。

### B1. 文档基座可复用化

**文件**：`electron/ai/domain/edit/buildEditCapabilities.ts`、`electron/ai/tools/{DocumentTools,EditProposalTools}.ts`

- `buildDocumentTools` / `buildEditProposalTools` 已是独立函数，可直接被 creative 引入，无需新抽象层。仅在 `buildEditCapabilities` 旁确认导出可被复用（必要时把 `EDIT_INTERRUPT_ON_CONFIG` 的工具名导出供 creative 合并）。

### B2. creative capabilities 引入块级读/写工具

**文件**：`electron/ai/domain/creative/buildCreativeCapabilities.ts`

- `mainTools` 增加 `buildDocumentTools(snapshotBroker)` + `buildEditProposalTools()`。
- `CREATIVE_INTERRUPT_ON_CONFIG` 合并 5 个块编辑工具（`edit_block/insert_block/delete_block/replace_range/create_document`，沿用 `EDIT_INTERRUPT_ON_CONFIG` 的 allowedDecisions）。
- planner/consistency/explorer 的只读工具集，把 `read_chapter/read_fragments/search_draft` 替换为 `get_section/get_blocks/search_*_in_document`。
- **路径契约（关键，避免撞墙）**：DocumentTools / 块编辑工具的 `file_path` 强制 **absolute host path**，明确拒绝相对路径与 basename（`DocumentTools.ts:60-66`、`EditProposalTools.ts:112` 的 schema 描述）。因此 sub-agent brief 一律使用绝对 `chapterFilePath`，由主 agent 从 `<workspace>` 拼出 `workspace/draft/chNN.md` 后下发；sub-agent 不得自行传 `draft/...` 相对路径。同步修改 `creative.ts` consistency brief 模板：`target_file: "<chapterFilename, relative to draft/>"` → 绝对 `chapterFilePath`。

### B3. creative 直接消费共享「块提案复审能力」（非绕行 edit domain）

**定位澄清**：`DocumentTools`/`EditProposalTools`/`buildProposalFromAction`/`EditProposal`/`ProposalNavigator` 都是 domain 无关的共享件，edit 只是第一个消费者。creative 直接 import 使用即直接复用，**不进入 edit domain 业务逻辑**。所谓「绕道」只是历史命名（`kind:'edit'`、`EditReviewSurface`、`pendingEditProposals`）和渲染按 domain 门控所致——本质是一条共享的「块提案复审管线」。原则：**复用该管线，不把它复制进 creative**。

**文件**：`electron/ai/domain/creative/CreativeDomainStrategy.ts`

- 对块编辑工具走 `buildProposalFromAction(...)` 产出块提案 review item（沿用现 `kind:'edit'` 标签，仅表示「这是块提案」），流入共享 `pendingEditProposals` 槽；保留 `kind:'filesystem'`（write_file/edit_file）与 `kind:'creative'`（StoryBible / 章节结构 / 计划 / 探索类工具）。
- **可选去 edit 命名重构（决策点，纯清晰度）**：`kind:'edit'→'block_proposal'`、`EditReviewSurface→DocumentReviewSurface`、`pendingEditProposals→pendingBlockProposals`，让共享管线读起来 domain 中立。收益是消除「creative 借 edit」的误读；代价是改动正在工作的 edit 流程命名。**默认不做**（功能上 B3-UI 已实现直接复用），仅当架构可读性优先时启用。
- **per-file snapshot cache（不照搬 edit 域，review P2）**：`EditDomainStrategy.buildReviewItems` 只对 `actionRequests[0].file_path` 取一次 snapshot（`EditDomainStrategy.ts:44-51`）。creative 一个 interrupt 内可能含多文件 block edits，须按每个 action 的 `file_path ?? activeFilePath` 分组、各取一次 snapshot 并缓存（`Map<filePath, snapshot>`），再逐 action `buildProposalFromAction` 用对应 snapshot，否则非首文件 diff 取错 old content。
- `activeFilePath` 来自 `runtimeStore.getContext(threadId)`（已持有 runtimeStore）。

### B3-UI. 复审 UI 与批次状态机改造（review P0，阻塞验收）

**问题（review 确认）**：
1. **渲染按 domain 分流**：`DomainReviewSurface.vue:3` 仅 `activeDomain === 'editing'` 时显示 `EditReviewSurface`；`DomainMessageSession.vue:3` 在 creative 域只渲染 `CreativeMessageSession`。creative 线程即便 pending 是 edit proposals 也看不到 ProposalNavigator。
2. **store 单路分发**：`runtimeEvents.ts:419-437` 按 `filesystem > creative > else edit` 单路处理；只要有 creative review，就只把 creative 子集传给 `handleCreativeInterrupt`，edit proposals 被丢、`interruptActionCount` 变成 creative 子集长度，resume decisions 与 actionRequests 失配。

**文件**：`DomainReviewSurface.vue`、`DomainMessageSession.vue`、`src/ai/store/modules/runtimeEvents.ts`、`creativeReview.ts`

**改造**：
- 渲染分流改为**按 pending review 存在性**而非 domain：`pendingFilesystemReviews.length` → filesystem surface；`pendingEditProposals.length` → `EditReviewSurface`（ProposalNavigator）；`pendingCreativeReviews.length` → creative surface。`DomainMessageSession` 在 creative 域也要能承载 `EditMessageSession`（creative 已把 `editToolCalls` 作为 prop 传入，复用之）。
- **多 kind 批次（决策点，B3-UI 起始定）**：
  - **方案 a（先做，简单）**：约束**每次 interrupt 只产出一种 review kind**。与 plan-first 时序相符——`confirm_writing_plan`（creative）与正文 block edits 天然分属不同 turn。在 `buildReviewItems` 加守卫/断言，混合时记日志并以单 kind 兜底。
  - **方案 b（健壮目标）**：实现 unified review batch——`runtimeEvents` 不再单路丢弃，按原 `reviews[]` 顺序收集多 kind decisions，凑齐全部 action 后一次 resume；`interruptActionCount` 用 `reviews.length` 全集。
  - 取舍：先落 a 解锁验收；若实测出现「同一 interrupt 内 plan/storybible + block edit」共现，再升级到 b。

### B4. 废弃 creative 自有文档工具

**文件**：`electron/ai/tools/CreativeTools.ts`、`buildCreativeCapabilities.ts`、`src/ai/types.ts`、`src/ai/thread/system-prompts/creative.ts`

- 下线 `write_to_chapter` / `read_chapter` / `read_fragments` / `search_draft`：从工具构建、`CREATIVE_INTERRUPT_ON_CONFIG`、`CREATIVE_REVIEW_TOOLS` 中移除。
- 系统 prompt 写作流程改为：定位块 → `replace_range`/`edit_block`/`insert_block` 局部修订，删除整章字符串 anchor 写法。
- 渲染层复用 `ProposalNavigator.vue`（块级 diff + rework 带理由），creative 不再用整章内容卡。

### B4b. 扩展 create_document 以真正落盘到 workspace/draft/（建章路径修复）

**问题（review 确认）**：现有 `create_document` schema 仅 `filename/content/reason`（`EditProposalTools.ts:127`），`buildProposalFromAction` 只产出 `filename`（`MessageAdapter.ts:487`），review executor 执行 `appStore.createTab(filename, undefined, ...)`（`executor.ts:230-232`）——只开内存 tab，**不会写入 `workspace/draft/chNN.md`**。直接把 `create_chapter` 映射到现状 `create_document` 无法满足「建章落盘」。

**改造**：
- 扩展共享 `create_document` schema 与 `FileCreateProposal`：新增受控的 `directory`（或 `file_path`）字段，承载 `workspace/draft/` 目标目录 + `chNN.md` 文件名。`buildProposalFromAction` 透传该字段。
- review executor 的 `create_file` 分支真正写入 `workspace/draft/chNN.md` 后再 open tab（区别于现有「仅 createTab」路径）；保持 HITL 审批。
- `create_chapter` → 映射到扩展后的 `create_document`（已定决策）：creative 不留自有文档写工具；章节编号 / `draft/` 目录命名约定由 capability 装配层或主 agent 编排补齐，主 agent 拼出绝对 `workspace/draft/chNN.md` 下发。
- 该扩展为 edit/creative 共享基座的一部分，edit 域行为保持向后兼容（不传 directory 时维持原 createTab 语义）。

### B5. 更新 AgentEmptyState 入口（需求三）

**文件**：`src/components/ai/agent-panel/chat-area/AgentEmptyState.vue` + 对应 i18n prompt 文案

- B 完成后，更新建议 prompt 反映统一后的能力与降摩擦工作流：块级局部修订、rework 携带理由、未打开的 draft 也可编辑等。
- 仅文案/i18n 改动，放在 B 末尾小步提交。

**阶段 B 验证**：「重写第一章」走块级 `replace_range`/`edit_block`，ProposalNavigator 显示 diff；以「不够鲁迅」rework 携带理由做局部修订而非整章重生成；`draft/ch01.md` 未打开也能编辑（SnapshotBroker）；建新章经 `create_document` 真正写入 `workspace/draft/chNN.md` 并打开；AgentEmptyState 建议 prompt 反映新能力。lint + type-check 通过。

---

## 阶段 C：creative 架构瘦身（需求二）

### C1. 下沉 Writer / State / Advisor 三个角色为 sub-agent（对齐 `04_agent角色设计.md` 目标态）

**决策（已定）**：主 agent 退为**纯路由 + 编排**；04 计划但一直折叠在主 agent 的 StateAgent / WriterAgent / AdvisorAgent 全部下沉为独立 sub-agent。落地后 creative 形态 = MainAgent + {state, planner, writer, consistency, advisor, explorer, researcher, writingStyleExtractor, writingStyleSkillCreator}，主 agent prompt 仅保留 Intent Gate + 编排 + 审批衔接。

**文件**：新建 `subAgents/{writer,state,advisor}.ts`；`buildCreativeCapabilities.ts` 注册；`src/ai/thread/system-prompts/creative.ts` 大幅收薄

**C1a. writer sub-agent**
- 输入 brief = 已审批 plan + 激活的 writing-style Generation Recipe + 目标块范围（**绝对 `chapterFilePath`** + block 范围，见 B2 路径契约）。
- tools = 阶段 B 块编辑工具（`edit_block/replace_range/insert_block`）+ 文档读工具。
- skills = 写作技法 scoped source（`/skills/_writer/`，见 A3 矩阵）。

**C1b. state sub-agent（StateAgent 下沉）**
- 职责（04 §3）：会话启动读 `get_session_diff` + `read_storybible` + rebuild signal，分析 diff → patch/rebuild StoryBible，返回变化摘要。
- 触发时机迁移：原本主 prompt 的「Story State Startup」段（仅 `story_state_lane`）改为**主 agent 在 story lane 起始调用 state sub-agent**，由其产出一次 story-state 上下文（衔接 C3 的「每 turn 取一次」）。
- tools = storybible 读/patch/rebuild/compress + session diff 工具。skills = `info-extraction / story-compression / contradiction-detection`（scoped `/skills/_state/`）。
- **时序风险**：StateAgent 是会话启动第一步且其输出被 planner/writer 复用，下沉后主 agent 须先 await state 结果再编排后续；C3 的 story-state 复用以 state sub-agent 的产出为单一来源。

**C1c. advisor sub-agent（AdvisorAgent 下沉）**
- 职责（04 §7）：被动求助（方向/技法/卡壳）给 2-3 个方向；**主动渗透**——在 plan 阶段前做「扩展可能性」检查，发现更好角度时在 plan 夹带 "Alternative angle" 小节。
- tools = storybible/章节读工具。skills = `plot-extrapolation / theme-recognition / structural-diagnosis / character-potential / conflict-design`（scoped `/skills/_advisor/`）。
- **跨 agent 协作风险**：主动渗透原是主 agent 内的一步；下沉后需重设计为「主 agent 在 task(planner) 前可选调 task(advisor)，把 advisor 的 angle 并入 planner brief」，避免 advisor 与 planner 各写一份 plan。此为 C1c 设计细化决策点。

**主 agent 收薄**：system prompt 删除正文写作、Story State Startup 正文、Advisor 正文三段职责，仅保留 Intent Gate + 各 sub-agent 的编排/审批衔接规则。

### C2. 修 planner 输出契约，移除 3 级重试梯子

**文件**：`electron/ai/domain/creative/subAgents/planner.ts`；`src/ai/thread/system-prompts/creative.ts:90-92`

- 现状：planner 因 deepseek-reasoner 不支持 `tool_choice:"any"` 而不设 `responseFormat`，改用「JSON code block 结尾」约定（见 memory `feedback_subagent_responseformat_toolchoice`，LangChain #31403 仍 open）。主 prompt 因此堆了 retry once → general-purpose 兜底的 3 级梯子。
- 改造：稳固「JSON block 结尾」解析（在主 agent 侧做一次健壮解析 + 单次重试即可），删除 creative.ts:90-92 的兜底梯子。统一所有 sub-agent 的 `{role, brief schema, tools, skills, output schema}` 契约。

### C3. 指令流数据重用：每 turn 取一次 story-state

**文件**：`src/ai/thread/system-prompts/creative.ts`（Story State Startup 段）；planner/consistency brief 模板

- 现状：一个 turn 内 storybible 被主 / planner / consistency 各读一遍（trace 实见冗余）。
- 改造：`story_state_lane` 起始取一次 story-state 上下文（storybible + 相关块），经结构化 brief 传给 sub-agent，sub-agent 不再各自重读；利用 deepagents 共享 `files` state 缓存。

### C4. prompt 按 lane 条件化拼装

**文件**：`src/ai/thread/system-prompts/creative.ts`、`buildCreativeSystemPrompt`

- 现状：4 lane 已分类，但 ~290 行全量注入。
- 改造：`buildCreativeSystemPrompt` 按 lane 条件拼装——`story_state_lane` 才注入 Story State Startup + Plan-first；`style_skill_lane`/`research_lane`/`conversation_lane` 注入精简子集。
  - **C4 是阶段 C 的硬出口门槛**（需求二验收项，不可延后跳过）。
  - 实现前先定 lane 信号来源（设计决策，在 C4 起始解决，不构成延后理由）：当前 lane 判定在 prompt 内由模型完成，拼装期裁剪需要拼装前已知 lane。两条候选路径——(a) 轻量前置分类器在 `buildCreativeSystemPrompt` 前给出 lane 信号；(b) 两段式：首轮注入精简「Intent Gate-only」prompt 由模型判 lane，再按 lane 重注入对应子集。选定后落实施。

**阶段 C 验证**：`style_skill_lane`/`conversation_lane` 注入 prompt 不含 Story State Startup/Plan-first；writer sub-agent 写作时仅挂写作 skills + 风格 recipe；一个 turn 内 storybible 不被重复读取；planner 失败时无 3 级重试梯子。lint + type-check 通过。

---

## 风险与回滚

- **阶段 B 最大风险（已升级，review P0）**：creative 复用 edit 复审不只是 strategy 改动，还需 **renderer 按 pending-review 存在性分流**（非 domain）+ **store/resume 批次状态机**（见 B3-UI）。否则 `kind:'edit'` 产出了也看不到 ProposalNavigator、且 resume decisions 失配。先落「单 kind/interrupt」方案 a 解锁验收，混合共现再升级 unified batch（方案 b）。
- **snapshot（review P2）**：creative 的 `buildReviewItems` 必须 per-file 缓存 snapshot，不能照搬 edit 域单 snapshot。
- **sub-agent skills（review P1）**：custom subagent 不继承 main skills，且 `skills` source 是父目录；必须先落 scoped skill source 机制（A3），A3/C1 才能精确挂 skill。
- `create_document` 落盘扩展（B4b）需与 edit 域向后兼容，单独验证 edit 域建文件不回归。
- **阶段 C 范围扩大（已定全下沉）**：C1 从「仅 Writer」扩到「Writer + State + Advisor 全下沉」，回归 04 目标态但**回归风险与工程量最大**。两个高风险点：(1) **StateAgent 时序**——它是会话启动第一步且产出被下游复用，下沉后主 agent 须先 await 其结果（与 C3 单一 story-state 来源绑定）；(2) **AdvisorAgent 主动渗透**——原是主 agent 内一步，下沉后需重设计为「advisor 产出 angle → 并入 planner brief」，避免双份 plan。建议 C1 内部按 writer → state → advisor 顺序，各自独立验证可回滚。
- **阶段 C 内部顺序**：C1（含 state/advisor 下沉）与 C2/C3 可分别落地；C4（lane 信号来源 + 条件化拼装）是阶段 C 出口门槛，须在阶段 C 收尾前完成，不得跳出阶段 C。其 lane 信号来源决策在 C4 起始解决（见 C4）。
- 每阶段独立可交付：A 解阻塞、B 统一写入与 UX、C 瘦身；任一阶段失败不影响前序成果。

## 验证矩阵（真实 workspace `私人笔记/小说`）

| 阶段 | 验证点 |
|---|---|
| A | `get_character_psychology(沈望/童建军/童瑶)` 三角完整、missing 空；风格首轮贴合；consistency 经 scoped source 实际加载 `style-consistency-check` 且不暴露无关 skill，结果含风格维度 |
| B | 重写第一章在 **creative 线程内**出现 ProposalNavigator（按 pending-review 分流生效）走块级 diff；rework 带理由做局部修订；多文件 block edit 各取对 snapshot；resume decisions 与 actionRequests 对齐不失配；未打开文件可编辑；建新章经 create_document 真正写入 workspace/draft/chNN.md；edit 域建文件不回归；AgentEmptyState 反映新能力 |
| C | 主 agent prompt 仅剩 Intent Gate + 编排（writer/state/advisor 正文职责已移除）；非 story lane 不注入 startup/plan-first；state sub-agent 在 story lane 启动产出 story-state 且下游复用其单一来源；advisor 的 angle 并入 planner brief（不产双份 plan）；writer/consistency/planner/state/advisor 各经 scoped source 仅挂本职 skills；storybible 每 turn 读一次；无重试梯子 |
| 全程 | 每阶段后 `npm run lint && npm run type-check` |
