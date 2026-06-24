# Creative Agent 调整方案（具体 + 开发阶段）

> 本文是经讨论确认后的**具体调整方案**，按开发阶段（Phase 0–5）组织。每个 Phase 在进入实施时会再拆成多个步骤逐步落地、逐步验证。

## Context（为什么改）

Creative（小说创作）domain 已按 `design/creativeagent/` 落地：MainAgent + 7 个 sub-agent，状态存于 `storybible.md` + `draft/chNN.md` + `draft/fragments.md`，写入走 deepagents `interruptOn` HITL。实测暴露 9 类问题，根因集中在四处：

1. **结构层缺失（问题 5，核心）**：`storybible → 临时 confirm_writing_plan → 正文`，批准的 plan 用完即弃。章节里没有持久的情节提纲层，所以"情节无法调整"，原设计 `01_需求定义.md §5.2` 要的迭代循环跑不起来。
2. **结构化输出过细且脆弱（问题 1）**：planner 用 `responseFormat`(`PlannerResponseSchema`：深层嵌套 + 严格 enum) + 三层 `TaskToolCompatMiddleware` 兜底仍频繁失败；consistency/explorer/writer 要求"整条回复以纯 JSON 结尾"，模型做不到。根因是**让模型手打 JSON 文本**这个机制本身不可靠——应改走工具调用 / 自由 markdown。
3. **技法被当成生成期硬约束（问题 2、4、7）**：writer 被要求"情感场景必读 show-vs-tell + deep-pov"、把 style Recipe 当"每句硬约束"、`information-density` 要求"每句承载多层"——这是"每个字都很设计、不像人话、肤浅"的直接来源。
4. **HITL 粒度太细 + BlockEdit 双源（问题 6、8）**：每个块/文件写都强制中断（无阈值无开关）；已打开文件只改编辑器内存不落盘，`read_file`/`get_session_diff` 读盘拿到旧内容。

目标：在不破坏"作者只做写作+对话、不管理结构化数据"（`01` §3/§6）的前提下，补齐结构层、稳住输出、让文字像人话。

## 已确认的关键决策

- **范围**：整体推进，按 Phase 分批；每个 Phase 进实施时再拆步骤。
- **情节提纲层 = 章节内 blockquote + 哨兵约定（MVP，不新增 TipTap 节点）**。形如 `> [节拍N] <一句话提纲>`，紧跟其统辖的正文段。blockquote 原生往返、已是可寻址单块、纯 markdown 可读，零 TipTap 改动。后续验证有效再考虑升级为专用节点。
- **章节级审批 = 章内自动通过 + 整章完成时一次性审**：写作过程中的块改由 pre-decision 层自动通过；章节检查点触发一次整章 diff 审批（approve/reject）。
- **暂不做** per-role 模型。

## 关键技术锚点（来自代码勘察）

- **beat 复用 blockquote**：`blockquote` 已在 `createBaseExtensions`/`createMarkdownEditorExtensions`（`src/utils/editorExtensions.ts`）注册，原生往返（`formatConverter.ts` 无需改 marked/turndown），且在 `DocumentViewBuilder` 的 `BLOCK_TYPES`/`OPAQUE_BLOCKS` 中已算作**单个可寻址块**（`src/ai/edit/DocumentViewBuilder.ts`）。因此 beat 是"blockquote 之上的语义约定"，由工具+提示识别哨兵，无需新节点、无需碰 5 处 allowlist。
- **审批 hook**：`interruptOn` 是静态、按工具名的 map，无法表达条件门控；LangGraph 按"每条助手消息"打包中断（`langchain hitl`）。真正的门控层是 `AgentEngine._prepareActionRequestsForReview` + `autoDecisionsByIndex`（`electron/ai/AgentEngine.ts:650-719`），已有先例 `FilesystemApprovalPolicy`（`electron/ai/runtime/filesystem/FilesystemApprovalPolicy.ts`）。章节策略 mirror 它。
- **审批策略存储**：`AiSettings`（`src/ai/types.ts:793`）+ `DEFAULT_AI_SETTINGS`，经 `AiConfigStore`（`resumeRun` 已读取）。`toolPermissions` 是结构先例但目前未接线。
- **落盘复用**：`appStore.saveTab(tab, false, true)`（`src/stores/app.ts:2484`）走与 Cmd+S 相同的 markdown 转换 + dirty/checkpoint 记账。
- **字数变化**：`countWordDelta`（`src/utils/textStats.ts:7`）；注意 `recordStoryBibleChange` 是执行后写入，做不了执行前阈值门控（本轮用不到，章节模式不依赖阈值）。

---

## 开发阶段

### Phase 0 — 地基与清理（独立、低风险）

对应问题 8 + 部分 9。与其他 Phase 解耦，可先行。

- **G. BlockEdit 落盘一致性**：在 `src/ai/review/executor.ts` 的 `applyBlockProposalToTarget` 中，对**已打开 tab** 的两条分支，应用成功后调用 `appStore.saveTab(tab, false, true)` 立即落盘；`ReviewExecutorAppStoreLike` 增加可选 `saveTab`，在 `src/ai/store/ai.ts` 调用点把真实 `appStore.saveTab` 传入。未保存(`untitled:`)文档无磁盘路径，跳过。失败仅告警、不使该次编辑失败。
- **死代码清理**：删除未使用的 `ConsistencyResponseSchema` / `ExplorerResponseSchema`（`subAgents/consistency.ts`、`explorer.ts`）。
- 验证：对已打开章节让 agent 编辑后立即 `read_file` / `get_session_diff`，内容一致；`npm run lint && type-check`。

### Phase 1 — B：子代理输出协议简化（问题 1）

把"末尾纯 JSON / responseFormat"迁到**工具调用提交**或**自由 markdown**。

- **planner**：去掉 `responseFormat: PlannerResponseSchema`（`subAgents/planner.ts`），改为返回 **markdown 计划**；`logicAudit` 降为计划内的简短 markdown 小节（动机/因果/常识各一两句），不再深层嵌套 JSON。`src/ai/creative/logicAudit.ts` 相应简化或废弃。
- **TaskToolCompatMiddleware**（`electron/ai/runtime/TaskToolCompatMiddleware.ts`）：planner 不再需要 Zod 兜底，移除其 planner 规范化层；保留与 planner 无关的必要部分（如 task 工具 `prompt→description` 修正，确认后再决定去留）。
- **consistency / explorer**：改为通过**专用提交工具**（如 `submit_consistency_findings(findings[])` / `submit_exploration(...)`）或宽松格式输出，不再要求整条回复纯 JSON 结尾。只对消费端真正机读的字段保留最小结构。
- 关键文件：`subAgents/{planner,consistency,explorer,writer}.ts`、`TaskToolCompatMiddleware.ts`、`logicAudit.ts`、`creative.ts` 中相关消费/格式段落。
- 验证：跑多轮（含易翻车模型），统计输出可被消费成功率提升、不再依赖兜底中间件。

### Phase 2 — A：章节内联情节提纲 + 迭代循环（问题 5，核心）

把"批准即弃的 plan"升级为**持久、可编辑、可定位的章节内 beat 提纲**。

- **核心故事主线**：在 `STORYBIBLE_TEMPLATE`（`electron/ai/tools/CreativeTools.ts:12`）新增 `## 核心故事情节` 段，承接设定→章节。
- **beat 约定 + 工具**：beat = 章节内 `> [节拍N] …` blockquote。新增创意工具（`CreativeTools.ts`）：
  - `get_chapter_beats(file_path)`：解析章节，返回每个 beat 的文本 + 其统辖正文段的 `displayBlockId` 区间（复用 `DocumentViewBuilder`），让"改某 beat → 重写其正文段"可定位。
  - beat 的写入/修改复用现有 `insert_block`/`edit_block`/`replace_range`（blockquote 即一个块），无需新写工具。
- **角色分工**：
  - planner 产出/修订 **beats**（写进章节，markdown），不再产临时 JSON。`confirm_writing_plan` 转为"确认本章节拍提纲"。
  - writer 在**指定 beat 的正文区间**内写/改正文（小范围、beat-scoped 任务）。
  - "调整情节" = 编辑某 beat → writer 仅重写该 beat 统辖区间；改动可向上冒泡到核心主线/设定。
  - **反向生成**：从已有正文提炼 beats（落实原设计 `reverse_outline`）。
- 关键文件：`CreativeTools.ts`、`subAgents/planner.ts`、`subAgents/writer.ts`、`creative.ts`（流程改写：设定→核心主线→章节 beats→正文 的迭代循环）。
- 验证：种子起步 → 预排 beats → 填正文 → 改一个 beat 验证"仅该区间正文被重写" → 反向从正文生成 beats；确认 blockquote 哨兵往返不丢、AI 可定位。

### Phase 3 — F：章节级审批（问题 6）

依赖 Phase 2（章节/beat 提供"整章"单元）。

- **pre-decision 策略层**：新增 `BlockEditApprovalPolicy`（mirror `FilesystemApprovalPolicy`），接入 `AgentEngine._prepareActionRequestsForReview`：在"章节写作进行中"自动通过 writer 的块改并累积。
- **章节检查点**：新增检查点信号/工具（如 `request_chapter_review`），在整章写完时触发**一次**整章 diff 审批（聚合 `BlockEditReviewSurface`）；reject 走撤销（基于本章写前快照 / git）。
- **策略设置**：`AiSettings` 增 `reviewPolicy`（默认 `chapter`），经 `AiConfigStore` 读取于门控层。
- **一致性检查**：从"每次写后强制"改为**可选 / skill 驱动**，纳入章节自动化流程而非硬触发（`creative.ts` 的 Post-write consistency loop 改写）。
- 关键文件：`AgentEngine.ts`、新 `BlockEditApprovalPolicy.ts`、`CreativeDomainStrategy.ts`(`buildReviewItems`/`preDecideMixed`)、`src/ai/types.ts`(`AiSettings`)、`BlockEditReviewSurface.vue` 及 review store。
- 验证：写一整章只弹一次整章审批；中途块改不再逐次中断；reject 能整章回退。

### Phase 4 — C/D：文笔自然度、深度与生活常识（问题 2、3、4）

依赖 Phase 2（writer 现在执行小范围 beat-scoped 任务，便于两遍写法）。

- **C 两遍写法**：writer 先**自然成稿**（仅 voice/flow，少约束），再按需做**定点修订**（修订时才调用对应技法 skill）。删除/重写"每句承载多层""情感场景必读多个 skill""style 当每句硬约束"等生成期硬约束；加入克制/流畅指引（流畅优先于密度、允许平直句、语域有变化）。
- **D 角色具身**：`STORYBIBLE_TEMPLATE` 角色段增加具身字段（年龄/身体状态/阶层/职业语域/物理约束）；常识从"是谁"推导而非抽象三维清单事后检查；`common-sense-audit` 锚定具体启发式（老人移动慢、底层情绪外露强、特定情境暴力先于言语）。必要时用 Researcher 支撑时代/职业/阶层细节。
- 关键文件：`subAgents/writer.ts`、`creative/writer/*` 与 `creative/common/common-sense-audit` skills、`CreativeTools.ts`(模板)、`creative.ts`。
- 验证：同一场景改前/改后各生成，人工对比自然度、常识、深度。

### Phase 5 — E + H：skills 精简验证与收尾（问题 7、9）

- **E**：给 skill 读取加日志（埋点）；按维度逐一验证"读它输出是否真的变好"，砍到被验证过的小核心集；默认改为按需/诊断触发而非强制必读。
- **H**：精简 285 行主系统提示（`creative.ts`，认知负载本身放大不稳定）；`preDecideMixed` 行为透明化/补注释；（可选）修复 `mathBlock` vs `blockMath` allowlist 命名 bug（致 math 块未获 UniqueID、被 AI 块视图跳过）。
- 关键文件：`electron/ai/builtin-skills/creative/**`、各 subAgent skill 触发规则、`creative.ts`、`CreativeDomainStrategy.ts`。
- 验证：核心 skill 集名单产出并经对比验证；主提示瘦身后回归主流程不退化。

---

## 阶段依赖与顺序

```
Phase 0 (G+清理) ── 独立，可先行
Phase 1 (B 输出协议) ── 为 A 去风险（A 里 planner 写 beats 用 markdown 而非 JSON）
        └─> Phase 2 (A 结构层，核心)
                ├─> Phase 3 (F 章节审批，依赖"整章"单元)
                └─> Phase 4 (C/D 质量，依赖 beat-scoped writer)
Phase 5 (E+H) ── 收尾，可与 4 并行/穿插
```

## 整体验证

- 端到端：一个种子 → 设定/核心主线 → 章节 beats → 正文 → 改 beat 触发定点重写 → 整章一次审批 → 反向提纲。
- 输出稳健：易翻车模型多轮不再产非法 JSON、不依赖兜底。
- 一致性：已打开章节编辑后读盘一致。
- 质量：改前/改后人工对比。
- 全程 `npm run lint && npm run type-check`；尽量按 design/creativeagent 风格同步更新设计文档（重大更新时）。

## 进实施时再细化的决策点

- consistency/explorer 提交工具的具体签名与字段。
- beat→正文区间的解析细节与哨兵正则（含与真实引用块的冲突规避）。
- 章节检查点信号的触发方式与 reject 回退实现（快照 vs git）。
- skill 核心集的最终名单（验证后定）。
