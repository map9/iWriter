# Phase 6：基于真实 trace 的重构需求

> **历史衔接**：Phase 5 完成后，`write-style and researcher.md` 落地了 writing-style / Researcher 改造与 Intent Gate 分 lane。原 Phase 6 规划（语义搜索/embedding、git branch 探索、探索批量管理 UI）尚未展开即被打断。
>
> 本 Phase 6 **重定向**：依据两份真实 trace 与真实 workspace 的诊断，先做一轮架构重构（统一 edit/creative 文档机制 + creative 架构瘦身 + 阻塞 bug 修复），再回到原 Phase 6 的能力扩展（见文末「暂不做」）。
>
> 本文是**需求**，不是设计。描述「要解决什么问题、改造后应达到什么目标」，不规定具体实现。后续设计文档（沿用 `0X_*` 系列或新增）依据本需求做细化。

## 背景

实际代码已超出 Phase 5（6 sub-agent + 31 skill + writing-style 嵌套）。基于两份真实 trace（`conversion01/02.json`，字节完全相同）、真实 workspace（`私人笔记/小说`）、BlockEditReviewSurface / AgentEmptyState UI 用例做架构级诊断。

trace 还原：作者「依据 storybible 重写第一章」→「完全不是鲁迅风格，要大改」。流程形状正确，但每次写入撞墙（2 次自然语言拒绝 + 1 次 anchor 报错 + 1 次盲目 offset 越界），每次请求退化成 2-3 次整章（26-37k 字符）重生成。

本次重构聚焦三类问题：
1. **edit / creative 两域的统一**：creative 自建了一套更弱的文档访问层，应改为复用 edit 域机制，并统一两域 UX。
2. **creative 架构调整**：主 agent 过载；sub-agent 角色/工具/skills/逻辑需更清晰；指令流数据重用度需更高。
3. **独立阻塞问题**：实测 bug 与「风格作为约束而非事后检查」。

---

## 需求一：edit / creative 的统一

### 问题

creative 域重新实现了一套比 edit 域更弱的文档访问层：

| 能力 | edit 域（现有） | creative 域（自建，待废弃） |
|---|---|---|
| 读 | `get_document_outline/section(s)/blocks/block_context/search_*`，块级 `{b:n}`、分页、跨文件（SnapshotBroker） | `read_chapter/read_fragments/search_draft`，整章字符串，无块 ID |
| 写 | `edit_block/insert_block/delete_block/replace_range/create_document`，**块级提案**，`expected_*` 过期保护，resume 前应用到 TipTap | `write_to_chapter`（字符串 anchor，无整章覆盖），工具体内 `fs.writeFileSync` 直写 |
| 复审 UX | `BlockEditReviewSurface.vue`：diff 视图 + 定位 + skip + **rework 带理由** + edit-approve | 整章内容卡，拒绝 = 整章重生成 |

后果：无块 ID、anchor 脆弱（trace 报错根因）、无过期保护、直写磁盘、**拒绝即全文重生成**。

### 改造目标

- **不合并**两个用户可见 mode（creative 的 StoryBible/planner/skill 认知层是 edit 用户不需要的）。
- **抽出共享「文档基座」**（读：DocumentTools；块级写：EditProposalTools；复审：BlockEditReviewSurface），让 creative **消费**而非自建。
- **废弃 creative 自有文档工具**：`read_chapter/read_fragments/search_draft/write_to_chapter` 全部下线，改用文档基座的块级读写。
- **`create_chapter` 映射到 `create_document`**（已定决策）：creative 不保留任何自有文档写工具；章节编号 / `draft/` 目录约定逻辑由外层（capability 装配或主 agent 编排）补齐，不下放进工具体。
- **保留 creative 专属层**：StoryBible 工具、story-state 智能（session diff、rebuild signal、character psychology、logic audit）、sub-agent、skills、plan-first HITL 编排。

### 可行性与待补工作

后端工具/提案/复审管线本身 domain 无关（已验证）：

- 引擎 domain 无关：`AgentEngine._handleInterrupt` 只调 `strategies[domain].buildReviewItems()`，渲染层按 `kind` 分发。
- `DomainReviewItem` 联合已含 `'edit' | 'creative' | 'filesystem'` 三 kind。
- `CreativeDomainStrategy.buildReviewItems` 已把 filesystem 写工具分流到 `kind:'filesystem'`——同一策略已能混合多 kind。
- `buildProposalFromAction` 是纯函数，edit 策略已直接调用，creative 可同样调用。
- DocumentTools 经 `SnapshotBroker.requestSnapshot(filePath)` 支持任意磁盘文件（draft/chXX.md 不必在编辑器打开）。

**但复用非零摩擦，以下为本需求附带的必做改造（实施计划阶段 B 细化）**：

- **渲染分流**：`DomainReviewSurface.vue` / `DomainMessageSession.vue` 现按 `activeDomain==='editing'` 才挂 BlockEditReviewSurface；需改为按「是否存在 pending 块级 review」分流，creative 的 `kind:'edit'` review 才能进入统一复审 UI。
- **store 批次状态机**：`runtimeEvents.onRunInterrupted` 现为单路径分发（filesystem→creative→edit 三选一），同 turn 混合多 kind 会丢弃块级 proposal；需支持多 kind 共存的 review 批次。
- **create_document 落盘**：现有 `create_document` 经 `buildProposalFromAction` 只产出 in-memory tab（`create_file`），未落 `workspace/draft/`；需扩展落盘并补章节编号/目录约定（与「`create_chapter→create_document`」决策配套）。

### 验收

「重写第一章」走块级 `replace_range`/`edit_block`，在 BlockEditReviewSurface 显示 diff；以「不够鲁迅」rework 时携带理由做**局部修订**而非整章重生成；draft/ch01.md 即使未打开也能编辑。

---

## 需求二：creative 架构调整

### 问题：主 agent 过载

`src/ai/thread/system-prompts/creative.ts`（~290 行单体）让主 agent 同时承担：Intent Gate、Story State Startup、Collaboration mode、Plan-first 编排（含逐字 planner brief + **3 级重试/兜底梯子**）、Skill Gate、Advisor、Author writing style 三步流程编排、Narrative exploration 编排、Git、Compression、Communication。**且 04 设计中本应独立的三个角色——WriterAgent（正文写作）、StateAgent（story-state 启动/抽取）、AdvisorAgent（叙事顾问）——全部塞在主 agent 内**——最吃 skill 的写作任务与全部编排规则共享上下文，是 prompt 膨胀与「写作未锚定 skill」的根源。

### 改造目标

1. **Writer + State + Advisor 三角色一步到位全下沉为独立 sub-agent**（已定决策，对齐 `04_agent角色设计.md`）：主 agent 同步收薄为纯路由/编排，不做过渡版。
   - **WriterAgent**：输入 = 已审批 plan + 激活的 writing-style Generation Recipe + 目标块范围；工具 = 共享文档基座的块编辑工具 + 读工具；skills = 仅写作技法（deep-pov / character-voice / dialogue-craft / sensory-grounding / show-vs-tell / pacing-control / subtext-craft）。
   - **StateAgent**：承担 Story State Startup / session diff / 抽取；每 turn 一次性产出结构化 story-state 上下文（storybible + 相关块）供主 agent 与其余 sub-agent 复用（呼应改造目标 3）。
   - **AdvisorAgent**：承担叙事顾问职责（结构诊断 / 主题识别 / 冲突设计等），从主 agent 剥离。
2. **sub-agent 契约标准化**：每个 sub-agent 显式定义 `{role, 结构化 brief schema, tools, skills, 输出 schema}`。修复 planner 输出契约（`responseFormat` vs「JSON block 结尾」约定，deepseek-reasoner 不支持 tool_choice:"any"，见已知约束），以**移除主 prompt 里的 3 级重试梯子**。
3. **指令流数据重用**：一个 turn 内 storybible 被主/planner/consistency 各读一遍（trace 实见冗余重读）。每 turn 取一次 story-state 上下文（storybible + 相关块），经结构化 brief 传给 sub-agent，而非各自重读；利用 deepagents 共享 `files` state 缓存。
4. **prompt 按 lane 条件化拼装**：Intent Gate 已分 4 lane（见 `write-style and researcher.md`），但 290 行全量注入。`story_state_lane` 才注入 Story State Startup + Plan-first；其余 lane 注入精简子集。

### 验收

`style_skill_lane`/`conversation_lane` 注入 prompt 不含 Story State Startup/Plan-first；Writer/State/Advisor 均为独立 sub-agent，WriterAgent 写作时仅挂写作 skills + 风格 recipe；一个 turn 内 storybible 不被重复读取（由 StateAgent 统一供给）；planner 失败时无 3 级重试梯子。

---

## 需求三：独立阻塞问题（不被前两项吸收）

### P0：`get_character_psychology` 解析 bug

`electron/ai/tools/CreativeLogicTools.ts` 的解析器与真实 StoryBible 角色 schema 漂移，三处不匹配：
- 解析器找 `## Characters` 段内 `### name`，但真实 storybible 把角色写成顶层 `## 沈望——…`（Characters 段空）。
- 字段是 `**核心欲望**：`（粗体未剥离）。
- 解析器只找 `虚假信念`，真实文件用 `错误信念`。

→ 全部角色判 missing → planner 误报心理缺失（trace 实见）。

**需求**：标题层级容错 + 剥离 `*_#` 装饰 + 补 `错误信念` 别名；理想是建立 writer 与 parser 共享的角色条目契约，从根上消除漂移。**需先修**（与需求一/二独立）。

### 风格作为约束而非事后检查

鲁迅风格 skill 当前仅在生成后被作者否决；信号来自作者而非系统。

**需求**：配合需求二-1，WriterAgent 写前注入风格 Generation Recipe / Self-check；新建 `style-consistency-check` skill 并纳入 ConsistencyAgent。

### AgentEmptyState 入口（次要）

`AgentEmptyState.vue` 的建议 prompt 应反映统一后的能力与降摩擦工作流（可发现性）。

---

## 优先级与分期

- **阶段 A（先行，解阻塞）**：P0 心理解析 bug 修复 + 风格写前约束 + `style-consistency-check` skill。低风险、立即缓解 trace 暴露的摩擦。
- **阶段 B（需求一，结构性收益最大）**：抽共享文档基座 → creative 引入块编辑/读工具 + `kind:'edit'` 分流 → 废弃 `write_to_chapter`/`read_chapter`/`search_draft`，`create_chapter→create_document`。统一 UX、消除整章重生成（含渲染分流 + store 多 kind 批次 + create_document 落盘改造）。
- **阶段 C（需求二，重架构）**：Writer + State + Advisor 三角色全下沉 sub-agent + planner 输出契约修复 + brief/结果结构化 + prompt lane 条件化拼装。

顺序理由：A 不依赖任何重构即可缓解痛点；B 为 C 提供干净的写入原语（WriterAgent 下沉后直接用块编辑）；C 收口主 agent 过载。

---

## 关键文件索引（供后续设计定位）

- `electron/ai/AgentEngine.ts` — 引擎 domain 无关的 review 分发（无需改）
- `electron/ai/domain/DomainStrategy.ts` — `DomainReviewItem` 三 kind 联合（已就绪）
- `electron/ai/domain/edit/{buildEditCapabilities,EditDomainStrategy}.ts` — 复用样板（snapshot + `buildProposalFromAction`）
- `electron/ai/tools/{DocumentTools,EditProposalTools}.ts` — 待抽为共享基座
- `electron/ai/domain/creative/buildCreativeCapabilities.ts` — 引入文档基座工具、调整 interruptOn、注册 WriterAgent sub-agent
- `electron/ai/domain/creative/CreativeDomainStrategy.ts` — `buildReviewItems` 增加 `kind:'edit'` 分流
- `electron/ai/tools/CreativeTools.ts` — 废弃 `write_to_chapter/read_chapter/search_draft`，保留 storybible 工具
- `electron/ai/tools/CreativeLogicTools.ts` — P0 心理解析修复
- `electron/ai/domain/creative/subAgents/{planner,consistency}.ts` + 新建 `{writer,state,advisor}.ts` — 输出契约 + Writer/State/Advisor 下沉 + 风格一致性
- `electron/ai/builtin-skills/style-consistency-check/SKILL.md` — 新建
- `src/ai/thread/system-prompts/creative.ts` — lane 条件化、写作流程改块编辑、风格注入、移除重试梯子
- `src/components/ai/agent-panel/chat-area/BlockEditReviewSurface.vue` — 复用的统一复审 UI
- `src/components/ai/agent-panel/domains/{DomainReviewSurface,DomainMessageSession}.vue` — 渲染分流改造（按 pending review 而非 domain 挂载）
- `src/ai/store/modules/runtimeEvents.ts` — review 批次多 kind 共存改造
- `electron/ai/ipc/MessageAdapter.ts` / `src/ai/review/executor.ts` — `create_document` 落盘到 `workspace/draft/`

---

## 暂不做（保留至本轮重构稳定后）

- 原 Phase 6 能力扩展：语义搜索/embedding、git branch 探索、探索批量管理 UI。
- StoryBible 结构去重（第一部内容 3 处重复）——稳定后单列。
