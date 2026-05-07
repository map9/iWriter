# iWriter Phase 3.2 小说工程系统立项规划

> 版本：草案 v0.3  
> 状态：立项讨论稿，含验收标准与实现映射，未进入实现阶段  
> 前提：Phase 1（编辑器）、Phase 2（AI Edit 审批流）已基本完成

---

## 1. 项目目标

> 将 iWriter 从 AI 辅助写作编辑器升级为**小说工程系统**：
> 能把长篇小说压缩为结构化故事状态（StoryState），能从 StoryState 扩写回接近原文风格的正文，并支持基于 StoryState 的图片视觉化与互动化（角色对话/文字游戏）使用。
> 视频生成作为后期预留接口，不进入当前阶段目标。

---

## 2. 当前可复用基础

| 能力 | 来源 | 可用于 |
|------|------|--------|
| 按章节/标题切分文档 | `DocumentTools.get_section` / `DocumentViewBuilder` | 压缩分块 |
| 文档 block 结构化读取 | `DocumentViewBuilder`（viewMarkdown + blockMap） | 精细分块、场景边界识别 |
| story asset 分区存储 | `CreativeArtifactTools`（save/read/list） | StoryState 持久化 |
| 编辑提案 + HITL 审批 | `EditProposalTools` + `interruptOn` | 扩写结果落地 |
| 内置 skill 系统 | builtin-skills / SKILL.md | 压缩/扩写 orchestrator |
| SQLite 会话持久化 | LangGraph checkpoint | 压缩/互动会话跨次恢复 |
| Multi-provider | ModelFactory + ProviderRegistry | 文字生成/图片生成接入 |

---

## 3. 核心数据结构：StoryState

StoryState 是整个系统的核心。压缩、扩写、多模态、互动四个能力都围绕它运转。其余模块（人物卡、场景卡等）是它的子模块。

### 3.1 顶层结构

```
StoryState
├── meta              # 小说基本信息
├── characters[]      # 人物卡列表
├── worldbook         # 世界观
├── outline[]         # 章节粗纲
├── scenes[]          # 场景卡列表
├── timeline[]        # 时间线事件
├── foreshadowing[]   # 伏笔表
└── style_profile     # 风格档案（用于扩写）
```

### 3.2 各子模块字段

**meta**
```
title         小说标题
genre         类型（奇幻/言情/悬疑等）
pov           叙述视角（第一/第三人称有限/全知）
total_words   原文总字数（估算）
source_file   原始文件路径
created_at    创建时间
updated_at    最近更新
```

**CharacterCard**
```
id            唯一标识
name          姓名
aliases       别名/称呼列表（用于实体归并）
role          角色定位（主角/配角/反派等）
appearance    外貌描述（供图片生成使用）
personality   性格特点
desire        欲望/目标
fear          恐惧/弱点
wound         过去的创伤
arc           角色弧线（变化轨迹）
relationships [{target_id, relation, tension}]
state_by_chapter  [{chapter_id, status}]  # 随剧情更新的当前状态
visual_prompt     英文图片生成 prompt（由外貌自动生成）
source_refs   [{file, chapter_id, block_id, start_offset?, end_offset?}]  # 来源追踪；字符偏移为可选，MVP 阶段只填 block_id
confidence    0-1  # 压缩结果可信度，低于阈值时提示用户复核
```

**SceneCard**
```
id            唯一标识
chapter_id    所属章节
sequence      在章节内的顺序
time          故事内时间（相对或绝对）
location      地点
characters    在场人物 id 列表
summary       场景摘要（1-3句）
beats         [场景内主要事件节拍，有序列表]
tone          情绪基调（紧张/温馨/悲伤等）
foreshadowing_ids  埋下或兑现的伏笔 id
visual_prompt      英文图片生成 prompt
source_refs   [{file, chapter_id, block_id, start_offset?, end_offset?}]
confidence    0-1
```

**WorldbookEntry**
```
id
category      类别（地理/魔法体系/政治/文化/物品等）
name
description
rules         不可违背的约束（用于校验）
related_characters  []
```

**OutlineChapter**
```
id
number        章节序号
title
summary       章节摘要（2-5句）
scene_ids     []
major_turns   主要转折点描述
end_state     章节结束时主角处境
```

**TimelineEvent**
```
id
time          故事内时间
event
characters    []
chapter_id
scene_id      （可空）
is_turning_point  boolean
source_refs   [{file, chapter_id, block_id, start_offset?, end_offset?}]
confidence    0-1
```

**ForeshadowingEntry**
```
id
description   伏笔内容
plant_scene_id    埋点场景
resolve_scene_id  兑现场景（可空，未兑现时为空）
status        planted / resolved / dropped
source_refs   [{file, chapter_id, block_id, start_offset?, end_offset?}]
confidence    0-1
```

**StyleProfile**
```
sentence_length   short / medium / long / mixed
tone              基调描述
pov               叙述视角
dialect_markers   方言/特色表达（列表）
sample_paragraphs [原文样本段落，用于 few-shot]
avoid_patterns    应避免的写法
```

### 3.3 存储位置

- StoryState 存为 `.iwriter/story/` 下的分区 Markdown 文件（现有 CreativeArtifactTools 支持）
- 结构化字段存在 frontmatter（YAML），正文部分为人类可读 Markdown
- **用户可以直接编辑这些文件**，不依赖专用 UI（本地文件优先原则）

---

## 4. 四大能力

### 能力 A：小说压缩

**定义**

> 压缩不是普通摘要。目标是把原文转为**可复用、可校验、可扩写、可多模态生成**的结构化 StoryState。

**输入**：一章或全书的 Markdown / IWT 文档  
**输出**：完整或部分填充的 StoryState（持久化到 story assets）

**三阶段流程（含人工确认节点）**

```
Pass 1：局部提取（按章节并行）
  → 每章独立生成：局部场景卡草稿、出现人物、事件节拍、时间线事件

  ✋ 确认节点 1：章节切分确认
     → 展示识别到的章节列表，用户确认边界正确后再继续

  ✋ 确认节点 2：场景切分确认
     → 展示每章的场景划分，用户可合并或拆分场景后再继续

Pass 2：跨章合并
  → 人物实体归并（别名解析）
  → 场景去重与排序
  → 时间线整合与矛盾检测

  ✋ 确认节点 3：人物别名归并确认（最关键）
     → 展示别名归并结果（"李明 = 明少 = 三哥"），用户逐项确认或拆分
     → 归并错误会污染后续所有扩写和互动，必须在此修正

Pass 3：全局校验与补全
  → 生成章节粗纲（从场景卡汇总）
  → 提取世界观规则（从高频设定描述）
  → 识别伏笔（埋点 → 兑现对）
  → 生成风格档案（从原文采样）

  ✋ 确认节点 4：StoryState 生成确认
     → 展示 StoryState 全貌预览，用户确认整体结构后写入 story assets
```

**关键挑战**

1. **实体归并**：同一人物跨章节有多种称呼，需要 alias 列表 + 相似度匹配
2. **长文分块**：百万字小说需要多轮分块，每次处理一章，状态需要跨轮传递
3. **结构一致性**：不同章节提取结果字段必须符合统一 schema（不能自由发挥）

**用户可编辑**：压缩结果生成后，用户可直接编辑 story asset 文件修正错误

---

### 能力 B：小说扩写

**定义**

> 扩写不是百分之百还原原文。目标是根据 StoryState 生成**接近原文风格、剧情、人物关系和节奏**的新正文。

**输入**：StoryState（全部或指定章节的场景卡 + 人物卡 + 世界观 + 风格档案）  
**输出**：Markdown 正文，通过 HITL 审批后写入文档

**四步流程**

```
Step 1：读取目标 StoryState
  → 载入相关人物卡、场景卡、世界观约束、风格档案

Step 2：生成扩写计划（ExpansionPlan）
  → 为每个场景卡生成 beat sheet（每段主要内容的有序计划）
  → ✋ 用户审阅 beat sheet，修改后再继续（进入 Step 3 前的人工确认）

Step 3：生成正文草稿 → 一致性校验 → 必要时自动修订
  → 以 StyleProfile.sample_paragraphs 做 few-shot 风格锚定
  → 以 WorldbookEntry.rules 做约束生成段落草稿
  → 对草稿执行一致性校验：
      · 人物行为是否符合人物卡
      · 时间线是否与现有 timeline 矛盾
      · 世界观约束是否被违反
  → 若校验发现问题，先自动修订一次再进入下一步
  → 校验结果（含修订说明）随提案一并展示给用户

Step 4：HITL 审批落地
  → 校验通过的草稿通过 EditProposalTools 提案
  → 用户看到的是已经过校验（可能已自动修订）的版本
  → approve / edit / reject 后写入正文
```

**与现有系统的衔接**：扩写段落以 `insert_block` / `edit_block` 形式走现有 HITL 审批流，**不需要绕过任何现有机制**。

---

### 能力 C：多模态生成

**定义**

> 复用 StoryState 中的人物卡和场景卡，驱动图片生成，实现视觉化呈现。
> 第一目标是图片视觉化；视频通过分镜脚本预留接口，后期再接入生成 API。

**输入**：CharacterCard.visual_prompt / SceneCard.visual_prompt  
**输出**：图片文件，关联到对应 story asset

**子功能**

| 子功能 | 输入 | 输出 | 优先级 |
|--------|------|------|--------|
| 人物立绘 | CharacterCard.appearance → 视觉 prompt | 角色图 | 高 |
| 场景插图 | SceneCard（时间+地点+基调）→ 视觉 prompt | 场景图 | 高 |
| 分镜脚本 | 多个 SceneCard → 文字分镜 | Markdown 分镜文件 | 中（预留接口）|
| 短视频 | 分镜脚本 → 视频生成 API | 短视频 | 不在当前阶段 |

**实现要点**

1. 新增图片生成 Provider 类型（与文字 Provider 分开管理，独立配置 API Key）
2. `visual_prompt` 由 AI 根据中文描述自动生成适配目标模型的英文 prompt
3. 生成结果存储在 `.iwriter/story/assets/` 目录，文件名对应 asset id
4. 图片生成是异步任务，不阻塞编辑器主流程；用户手动触发，显示估算费用

**当前阶段不做**：视频生成 API 对接、实时渲染、ComfyUI 深度集成

---

### 能力 D：互动 / 游戏化

**定义**

> 让用户选择 StoryState 中的角色，进入以该角色为核心的互动体验。互动内容与正文编辑隔离，用户可选择是否将互动结果写回故事。

**两个子模式**

**D1：角色对话（Character Chat）**

```
用户选择一个 CharacterCard
  → 人物卡 → 角色系统提示（性格、口吻、欲望、恐惧）
  + 世界观 → 背景约束注入（角色不能违反世界观规则）
  + 用户指定"当前故事进度"（角色的知情边界：知道第 N 章之前发生的事）
  → 新 PlaySession（独立 thread，不与编辑 thread 混用）
  → 用户与角色自由对话
  → 有价值的互动片段可以 approve 后存入 story asset 或写入正文
```

关键设计：**知情边界**（角色不能知道未来剧情）+ **行为一致性**（符合人物卡描述）

**D2：文字游戏（Text Adventure）**

```
从 OutlineChapter + SceneCard 生成分支结构
  → 用户在场景中做选择，推进剧情
  → AI 根据 StoryState 约束生成每个选项的后续
```

第一版只做线性 + 简单分支，不做复杂游戏引擎

**外部工具对接（优先级排序）**

| 对接方式 | 难度 | 建议 |
|---------|------|------|
| 导出 TavernAI / SillyTavern 人物卡格式 | 低 | 第一版做 |
| 纯文本对话脚本导出 | 低 | 第一版做 |
| RPG Maker 事件脚本 | 高 | 不做 |
| 实时连接外部游戏引擎 | 极高 | 不做 |

---

## 5. 用户流程（端到端）

```
1. 用户打开小说文件（已有 .md / .iwt 文档）

2. 触发压缩
   → 点击"压缩为故事状态"
   → 选择压缩范围（当前章节 / 全书）
   → AI 分块提取，进度实时可见
   → 生成 StoryState 初稿（粗纲 + 人物卡 + 场景卡 + 时间线 + 世界观）

3. 用户审阅并编辑卡片
   → 在 Creative 面板或直接编辑 .iwriter/story/ 下的文件
   → 修正 AI 识别错误（人名错误、别名遗漏、场景顺序）
   → 补充 visual_prompt（或让 AI 自动生成）

4. 触发扩写
   → 选择目标章节或场景卡
   → AI 先生成 ExpansionPlan（beat sheet），用户审阅
   → 逐段生成正文，通过 HITL 审批流落地

5. 多模态生成（可选）
   → 选择人物卡 → 生成立绘
   → 选择场景卡 → 生成插图
   → 图片关联到对应 story asset

6. 进入互动模式（可选）
   → 选择角色 + 设置知情边界章节
   → 与角色对话
   → 有价值片段写回 story asset 或正文

7. 保存 / 导出
   → 正文通过现有保存机制写入文件
   → 导出 TavernAI 人物卡格式（Phase 3.2.2）
```

---

## 6. MVP 范围（Phase 3.2.1）

### 做

1. 定义并固定 StoryState schema（所有子模块字段标准化，含 `source_refs` / `confidence`）
2. 单章压缩：读取一章 → 分块提取 → 四个人工确认节点 → 保存场景卡 + 人物卡到 story assets
3. 场景卡 → 扩写一章正文（生成草稿 → 一致性校验 → 自动修订 → HITL 审批落地）
4. 用户可直接编辑 `.iwriter/story/` 下的 story asset 文件修正压缩错误

### 不做（Phase 3.2.1 明确边界）

- 全书压缩（只做单章，多章跨实体归并是 3.2.2）
- 保证逐字还原原文（扩写目标是"接近风格和剧情"）
- 角色对话 / TavernAI 导出（→ Phase 3.2.2）
- 图片 / 视频生成（→ Phase 3.2.3）
- 文字游戏（→ Phase 3.2.2）
- RPG Maker 集成（不做）
- 绕过用户审批直接写正文

---

## 7. MVP 各模块验收标准

> 设计原则：每个模块可独立验收，不要求其他模块先完成。

### M1 · schema

| # | 验收项 |
|---|--------|
| 1 | 给定符合规范的 YAML frontmatter 文件，验证器返回 pass |
| 2 | 缺少必填字段（如 `CharacterCard.name`）时，返回明确错误信息 |
| 3 | `confidence` 值超出 0–1 范围时校验失败 |
| 4 | `source_refs` 条目缺少 `file` 或 `chapter_id` 时校验失败 |
| 5 | 所有 asset 类型（CharacterCard / SceneCard / TimelineEvent / ForeshadowingEntry）均有对应模板文件 |

### M2 · ingest

| # | 验收项 |
|---|--------|
| 1 | 给定含标题结构（H1–H3）的文档，能正确识别章节边界（标题 + block 范围）|
| 2 | 每章输出：标题、字数、block 数、起止 block_id |
| 3 | 确认节点展示后，流程暂停等待用户响应，不自动继续 |
| 4 | 用户可在确认步骤中合并相邻章节或拆分过长章节 |
| 5 | 无标题结构的文档（如纯段落），按固定字数分块并提示用户手动命名 |

### M3 · compress（单章）

| # | 验收项 |
|---|--------|
| 1 | 给定单章文本，输出 ≥1 个通过 M1 schema 验证的 SceneCard |
| 2 | 给定单章文本，输出 ≥1 个通过 M1 schema 验证的 CharacterCard |
| 3 | 每张卡片的 `source_refs` 中至少有一条指向原文的有效 `block_id` |
| 4 | `confidence < 0.6` 的条目在展示时有明显低置信度标记 |
| 5 | 确认节点 2（场景切分）展示后，用户可在 UI 中调整场景边界 |
| 6 | 确认节点 3（别名归并）展示候选归并列表，用户可拆分错误归并 |
| 7 | 确认节点 4（写入确认）后，assets 正确写入 `.iwriter/story/` 目录 |
| 8 | 压缩失败（LLM 超时/格式错误）时，报错并允许重试，不写入损坏数据 |

### M4 · store

| # | 验收项 |
|---|--------|
| 1 | 写入 CharacterCard 后，文件包含完整 YAML frontmatter + Markdown 正文 |
| 2 | 写入文件可被 M1 验证器读回并通过校验 |
| 3 | 用户直接编辑 Markdown 文件后，修改在下次读取时生效 |
| 4 | 写入前 schema 校验失败时，不覆盖原有文件 |
| 5 | `list_story_assets` 能正确枚举新写入的 asset，slug 无重复 |

### M5 · expand

| # | 验收项 |
|---|--------|
| 1 | 给定有效 SceneCard + CharacterCard（不依赖 M3 先跑），能生成 ExpansionPlan |
| 2 | ExpansionPlan（beat sheet）展示后流程暂停，等待用户确认再继续 |
| 3 | 生成的段落草稿先经过 M6 validate，校验报告随提案一并展示给用户 |
| 4 | 段落提案出现在现有 EditSessionCard / HITL 审批 UI 中（复用现有组件）|
| 5 | 用户 approve 后，段落正确插入文档对应位置 |
| 6 | 用户 reject 后，不写入任何内容，可重新发起扩写 |
| 7 | StyleProfile.sample_paragraphs 存在时，ExpansionPlan 及提案 metadata 中显示"已注入 N 段风格样本"；用户在审批界面可见风格依据，并据此决定 approve 或重写 |

### M6 · validate

> MVP 阶段 validate 是 **LLM-assisted soft validator**：由 LLM 判断是否存在问题，输出建议报告，不作为自动阻断条件，不是确定性规则引擎。人物行为、世界观违反、时间线矛盾等多数情况无法通过程序规则稳定判断。

| # | 验收项 |
|---|--------|
| 1 | 给定任意文本片段 + CharacterCard，能输出人物行为问题列表（可为空）|
| 2 | 给定任意文本片段 + TimelineEvent 列表，能检测时间顺序矛盾 |
| 3 | 给定任意文本片段 + WorldbookEntry.rules，能检测规则违反项 |
| 4 | 校验报告包含：问题描述、严重程度（warning / error）、建议修改方向 |
| 5 | 校验可独立调用（不依赖 M5 expand 触发），便于对已有正文做检查 |
| 6 | 校验结果始终为建议，不自动拒绝或重生成提案；最终决定权在用户 |

---

## 8. 技术模块划分与现有框架映射

```
novel-harness/
├── ingest       # 章节切分 + 确认节点 1/2
├── compress     # 单章提取 + 确认节点 3/4
├── store        # StoryState 持久化（扩展 CreativeArtifactTools）
├── expand       # ExpansionPlan + 段落生成 + 进入 validate
├── validate     # 一致性校验（人物 / 时间线 / 世界观）
├── multimodal   # visual_prompt 生成 + 图片 Provider 接入（Phase 3.2.3）
└── play         # PlaySession + 角色对话 + 文字游戏（Phase 3.2.2）
```

### 各模块与现有代码的对应关系

| 模块 | 直接复用的现有文件 | 新增内容 |
|------|--------------------|---------|
| **ingest** | `electron/ai/tools/DocumentTools.ts`（`get_section`）<br>`src/ai/edit-agent/DocumentViewBuilder.ts`（`buildSectionView`）| 章节边界确认 IPC 事件；章节列表 UI |
| **compress** | `electron/ai/builtin-skills/`（SKILL.md 驱动模式）<br>`electron/ai/tools/CreativeArtifactTools.ts`（`save_story_asset`）<br>`electron/ai/AgentEngine.ts`（`_handleInterrupt` 用于确认节点）| 新 `compress-chapter/SKILL.md`；别名归并 orchestrator；确认节点 2/3/4 IPC |
| **store** | `electron/ai/tools/CreativeArtifactTools.ts`（整体复用）| YAML frontmatter 写入支持；写入前 schema 校验 |
| **expand** | `electron/ai/tools/EditProposalTools.ts`（提案生成）<br>`electron/ai/domain/edit/buildEditCapabilities.ts`（`interruptOn`）<br>`src/ai/edit-agent/BlockEditApplier.ts`（落地）| 新 `expand-chapter/SKILL.md`；validate-before-propose 步骤 |
| **validate** | `electron/ai/tools/DocumentTools.ts`（读取 story assets）| 新 validate 工具 / SKILL.md；结构化报告输出格式 |
| **play** | `electron/ai/AgentEngine.ts`（thread 管理）<br>`@langchain/langgraph-checkpoint-sqlite`（会话持久化）<br>`electron/ai/domain/`（domain capabilities 模式）| 新 `play` domain；`PlaySession` 类型；知情边界注入逻辑 |
| **multimodal** | `src/ai/providers/types.ts`（Provider 抽象层）<br>`electron/ai/providers/ModelFactory.ts`（Provider 工厂）| 图片 Provider 类型；async job 机制；visual_prompt 生成工具 |

### 确认节点的实现方式（基于现有 IPC）

4 个确认节点本质上是轻量 HITL，方向上复用现有 `RendererEventBridge` 推送 + `AgentEngine.resumeRun()` 接收决策的链路：

```
现有：edit_block / insert_block → approve / edit / reject
新增：chapter_boundary_confirm  → confirm / adjust
     scene_split_confirm        → confirm / merge / split
     alias_merge_confirm        → confirm / split_alias
     story_state_write_confirm  → confirm / cancel
```

但实现上不只是加事件类型。每种确认节点的 **payload 结构、renderer 展示组件、decision schema** 都不同（章节合并、场景边界调整、别名拆分的交互形态与 edit proposal 差异较大），需要额外设计。建议优先复用 interrupt/resume 通道，把新增 UI 组件和 payload 类型作为独立子任务处理。

---

## 9. 分期计划（详细版）

### Phase 3.2.1 · 压缩 + 扩写核心闭环

**目标**：走通"单章压缩 → 用户修正卡片 → 场景卡扩写 → 审批落地"完整闭环  
**M 验收范围**：M1 schema、M2 ingest、M3 compress（单章）、M4 store、M5 expand、M6 validate

#### 任务一览

**T1 · schema 基础（前置，其余模块依赖）**
- [ ] T1.1 定义 TypeScript 接口：`StoryState`、`CharacterCard`、`SceneCard`、`TimelineEvent`、`ForeshadowingEntry`、`StyleProfile`
- [ ] T1.2 为每种 asset 类型编写 YAML frontmatter 模板文件（含字段注释）
- [ ] T1.3 实现 schema 验证器（Zod 或手写，可在 Node.js / 渲染进程两侧调用）
- [ ] T1.4 验收 M1 全部条目

**T2 · store 扩展（T1 完成后）**
- [ ] T2.1 在 `CreativeArtifactTools` 基础上，支持 YAML frontmatter 结构化写入（保留 Markdown 正文）
- [ ] T2.2 写入前调用 T1.3 验证器，不通过则抛错拒绝写入
- [ ] T2.3 写入后 `list_story_assets` 能枚举新文件
- [ ] T2.4 验收 M4 全部条目

**T3 · ingest 模块（T1 完成后，与 T2 并行）**
- [ ] T3.1 基于 `DocumentTools.get_section` + `DocumentViewBuilder.buildSectionView` 实现章节切分，输出 `{title, wordCount, blockCount, startBlockId, endBlockId}[]`
- [ ] T3.2 添加确认节点 1（`chapter_boundary_confirm`）IPC 事件，流程暂停等待响应
- [ ] T3.3 渲染进程展示章节列表，支持合并/拆分操作并回传决策
- [ ] T3.4 无标题结构时，按 2000 字固定窗口分块并标注为"未命名章节 N"
- [ ] T3.5 验收 M2 全部条目

**T4 · compress 单章（T2、T3 完成后）**

**用户体验目标**：用户打开小说文档 → 点击压缩 → 确认章节边界 → 模型压缩单章 → 确认场景拆分 → 确认人物别名归并 → 确认即将写入的 story assets → 写入 `characters/`、`scenes/`、`timeline/` 等结构化文件。

**T4a · Extractor（LLM 提取核心）**
- [x] T4a.1 新建 `electron/ai/builtin-skills/compress-chapter/SKILL.md`，定义 **JSON draft** 输出格式，不要求模型直接输出 YAML
- [x] T4a.2 新建 `ChapterCompressor.extractChapter()`，输入章节正文 + blockMap + provider runtime，输出 `CompressionDraft`
- [x] T4a.3 prompt 示例中明确 `confidence` 是数字，如 `"confidence": 0.85`
- [x] T4a.4 要求所有 `source_refs[].block_id` 来自 ingest 传入的 blockMap，且为正整数
- [x] T4a.5 JSON parse → Zod schema 校验 → 失败带错误重试，最多 2 次；全部失败则抛错，不写文件
- [x] T4a.6 `confidence < 0.6` 不阻断，保留给确认节点标记"需复核"
- [x] T4a.7a 自动验收：`scripts/verify-t4a.ts` 使用 mock model 验证解析 / Zod 校验 / 重试 / block_id 约束管道
- [ ] T4a.7b 人工验收：配置真实 provider 后运行 `scripts/verify-t4a-real.ts`，确认真实章节文本可输出 ≥1 个通过 schema 的 CharacterCard draft + SceneCard draft

**T4b · ConfirmCard UI（纯确认视图）**
- [ ] T4b.1 `scene_split`：场景列表表格，展示 `seq / summary / tone / estimatedBlocks`，支持行内编辑 summary
- [ ] T4b.2 `alias_merge`：人物分组列表，展示 `canonicalName / aliases / confidence`，`confidence < 0.6` 标红，支持改 canonicalName
- [ ] T4b.3 `story_state_write`：展示即将写入的 asset 列表、数量汇总、低置信度数量、目标目录
- [ ] T4b.4 三种确认类型都通过 `adjustedPayload` 回传用户修改后的数据
- [ ] T4b.5 验收：mock payload 能触发三种视图，confirm / adjust / cancel 回传正确

**T4c · Orchestrator（完整编排）**
- [ ] T4c.1 扩展 `novel:start-compress` 参数：`{ filePath?, providerConfigId?, modelId?, thinkMode? }`
- [ ] T4c.2 `NovelHarness.startCompress()` 串联：章节边界确认（T3）→ `extractChapter()`（T4a）→ scene_split → alias_merge → story_state_write → `StoryStateStore.writeAsset()`
- [ ] T4c.3 沿用 workspace-relative story assets 根目录：`{workspace}/.iwriter/story/`
- [ ] T4c.4 alias merge 后重写 `SceneCard.characters`，把别名归一到 canonicalName / suggestedId
- [ ] T4c.5 写入采用 MVP 策略：逐条写，某条失败记录错误继续，不回滚已成功写入条目
- [ ] T4c.6 写入前对最终 `StoryAsset` 再跑一次 T1 Zod schema 校验；校验失败的条目不写入并记录错误

**T4d · 验收与样章**
- [ ] T4d.1 打开一个有标题的真实文档 → 触发 compress → 依次看到 4 个确认节点
- [ ] T4d.2 全部 confirm 后，story assets 目录生成 `.md` 文件
- [ ] T4d.3 生成文件能被 `StoryStateStore.readAsset()` 读回并通过 validator
- [ ] T4d.4 取消任一确认节点时，不写入后续未确认资产

**T5 · validate 模块（T1 完成后，与 T3/T4 并行）**
- [ ] T5.1 实现人物行为校验工具：接收 `(text, CharacterCard)` → 输出 `{issues: [{field, description, severity}]}`
- [ ] T5.2 实现时间线一致性校验：接收 `(text, TimelineEvent[])` → 检测顺序矛盾
- [ ] T5.3 实现世界观规则校验：接收 `(text, WorldbookEntry[])` → 检测规则违反
- [ ] T5.4 校验报告格式标准化（severity: `warning` / `error`，含建议修改方向）
- [ ] T5.5 验收 M6 全部条目

**T6 · expand 模块（T2、T5 完成后）**
- [ ] T6.1 新建 `electron/ai/builtin-skills/expand-chapter/SKILL.md`，定义 ExpansionPlan（beat sheet）输出格式
- [ ] T6.2 读取目标 SceneCard + 相关 CharacterCard + WorldbookEntry + StyleProfile
- [ ] T6.3 生成 beat sheet 后推送确认节点（复用现有 `interruptOn` 模式），等待用户审阅
- [ ] T6.4 用户确认 beat sheet 后，逐段生成草稿
- [ ] T6.5 每段草稿生成后调用 T5 validate，校验报告附到提案 metadata
- [ ] T6.6 校验通过（或 warning 级别）的草稿，通过 `EditProposalTools` 生成提案，走现有 HITL 审批流
- [ ] T6.7 StyleProfile.sample_paragraphs 不为空时注入 few-shot 段落
- [ ] T6.8 验收 M5 全部条目

**T7 · 集成与端到端验收**
- [ ] T7.1 端到端流程跑通：打开小说文档 → 压缩单章 → 用户修正卡片 → 扩写 → 审批落地
- [ ] T7.2 压缩中途取消（用户关闭窗口）后，已写入 assets 保留，未完成部分不产生残缺文件
- [ ] T7.3 扩写中途取消，不写入任何正文内容

---

### Phase 3.2.2 · 互动化 + 全书压缩

**目标**：角色对话可玩，TavernAI 导出可用，多章压缩走通

#### 任务一览

**T8 · 角色对话（play 模块）**
- [ ] T8.1 新增 `play` domain：在 `electron/ai/domain/` 下仿 `creative/buildCreativeCapabilities.ts` 结构创建 `play/buildPlayCapabilities.ts`
- [ ] T8.2 新增 `PlaySession` 类型：thread + 绑定的 `CharacterCard` id + 知情边界章节号
- [ ] T8.3 知情边界注入：系统提示中明确"你只知道第 N 章之前发生的事"，同时注入该范围内的 StoryState 摘要
- [ ] T8.4 新建 `character-chat/SKILL.md`：定义角色对话的行为约束和出戏检测机制
- [ ] T8.5 PlaySession 持久化（复用 SQLite checkpoint，与编辑 thread 分开存储）
- [ ] T8.6 互动片段"写回故事"：用户选中对话段落后，走现有 `CreativeArtifactTools.save_story_asset` 存为 notes
- [ ] T8.7 验收：给定人物卡，角色对话中不出现超出知情边界的剧情信息

**T9 · TavernAI 格式导出**
- [ ] T9.1 实现 `CharacterCard → TavernAI JSON` 字段映射（name / description / personality / scenario / first_mes / mes_example）
- [ ] T9.2 导出文件写到本地，用户自行导入 TavernAI / SillyTavern
- [ ] T9.3 验收：导出的 JSON 可直接在 SillyTavern 中导入并展示正确人物信息

**T10 · 多章压缩（跨章实体归并）**
- [ ] T10.1 设计跨章 alias 归并算法：基于 `CharacterCard.aliases` 列表做模糊匹配（编辑距离 + 共现上下文）
- [ ] T10.2 对已有多个章节的 CharacterCard 进行去重合并，合并结果追加 `source_refs`
- [ ] T10.3 全局时间线整合：合并多章 `TimelineEvent`，检测跨章时序矛盾
- [ ] T10.4 全局伏笔表：识别跨章埋点/兑现对
- [ ] T10.5 验收：同一人物在 3 个以上章节出现不同称呼时，压缩结果归并到单一 CharacterCard

**T11 · 文字游戏（基础分支）**
- [ ] T11.1 从 OutlineChapter + SceneCard 生成分支选择结构（每个场景 2–3 个玩家选项）
- [ ] T11.2 AI 根据玩家选择 + StoryState 约束生成选项后续
- [ ] T11.3 游戏进度存为独立 session（不污染正文）

---

### Phase 3.2.3 · 视觉化

**目标**：人物立绘 + 场景插图可生成，分镜脚本预留接口

#### 任务一览

**T12 · 图片 Provider 扩展**
- [ ] T12.1 在 `src/ai/providers/types.ts` 中扩展 Provider 类型，新增 `image` 能力标记
- [ ] T12.2 在 `ModelFactory.ts` 中支持图片生成 Provider（DALL-E / Flux / SD API）
- [ ] T12.3 图片生成走 async job（不阻塞编辑器），提供进度回调
- [ ] T12.4 生成结果写入 `.iwriter/story/assets/{asset_id}.png`

**T13 · visual_prompt 生成**
- [ ] T13.1 实现工具：`CharacterCard.appearance`（中文）→ 英文视觉 prompt（适配目标模型风格）
- [ ] T13.2 实现工具：`SceneCard`（时间 + 地点 + 基调）→ 英文场景视觉 prompt
- [ ] T13.3 用户可手动修改 visual_prompt 后再生成

**T14 · 分镜脚本（视频接口预留）**
- [ ] T14.1 多个 SceneCard → 结构化分镜 Markdown（场景编号 / 画面描述 / 人物 / 情绪 / 摄影机运动）
- [ ] T14.2 分镜文件存为 story asset（section="scenes"，特殊 slug 前缀 `storyboard-`）
- [ ] T14.3 视频生成 API 接口定义为 stub，不实现，留待后期对接

---

## 10. 可调整建议

以下每项均有"当前建议"和"可调整为"两个选项，标注调整时机。

### A · 确认节点的实现方式

- **当前建议**：通过 AI 聊天面板展示结果，用户文字确认（"confirm" / 输入修改指令）。实现成本最低，复用现有对话 UI。
- **可升级为**：专用结构化 UI（卡片列表 + 复选框 + 拖拽调整）。交互更直观，开发成本约 1–2 周额外工作量。
- **建议时机**：先用聊天面板跑通 M3 验收，收集用户反馈后再决定是否做专用 UI。

### B · 压缩粒度单位

- **当前建议**：章节为原子单位（一章一次 LLM 调用提取）。简单，API 调用次数可控。
- **可调整为**：场景为原子单位（先切场景再逐场景提取）。精度更高，API 调用次数增加约 3–5 倍。
- **建议时机**：章节级压缩在 M3 验收后，若用户反馈场景边界识别不准再切换。

### C · 一致性校验严格程度

- **当前建议**：软校验（warning 级问题展示给用户，不阻止提案）。减少误报造成的操作摩擦。
- **可调整为**：硬校验（error 级问题触发自动重试一次；重试仍失败则展示给用户）。提高正文质量，但增加 token 消耗和等待时间。
- **建议时机**：先做软校验；如果用户反馈经常需要手动拒绝低质量提案，再考虑升级硬校验。

### D · `source_refs` 粒度

- **当前建议**：block 级别（`block_id` 来自 `DocumentViewBuilder` 现有输出，零额外成本）。
- **可调整为**：字符偏移级别（`start_offset` / `end_offset` 指向 block 内具体文字，支持原文高亮定位）。
- **建议时机**：block 级别已够用于溯源，字符偏移是精化需求，在用户提出"想定位到原文具体句子"后再加。

### E · 每轮扩写范围

- **当前建议**：每轮扩写一个场景卡（token 压力小，HITL 审批粒度细）。
- **可调整为**：每轮扩写整章（一次生成更多内容，适合较短章节或用户想减少确认次数的场景）。
- **建议时机**：场景级是默认值；可作为用户选项（"快速模式"）暴露整章扩写。

### F · story asset 格式

- **当前建议**：YAML frontmatter + Markdown 正文（机器可读结构 + 人类可编辑正文）。符合本地文件优先原则。
- **可调整为**：纯 JSON（机器解析最简单，但用户直接编辑体验差）。
- **建议时机**：坚持 YAML frontmatter，不建议切换到纯 JSON。原则是用户应能直接打开文件阅读和修改。

### G · compress orchestrator 实现方式

- **当前建议（分层）**：
  - **单次提取 prompt**（每章的场景卡/人物卡提取指令）放在 SKILL.md，与现有 builtin-skills 模式一致。
  - **多步骤编排**（确认节点触发与等待、跨章合并、schema 校验、失败重试、写入事务）由 **TypeScript orchestrator** 控制。Phase 3.2.1 已包含四个确认节点 + 重试 + 写入前验证，复杂度已超出纯 SKILL.md 的合理范围。
- **不建议**：把完整压缩流程塞进单一 SKILL.md，会导致状态管理和错误处理难以追踪。
- **建议时机**：T4 开始时直接按分层方式设计，不需要先做纯 SKILL.md 版本再迁移。

---

## 11. 风险与决策点

| 风险 | 说明 | 缓解方式 |
|------|------|---------|
| Token 压力 | 百万字小说分块数量大，多轮 API 调用成本高 | Phase 3.2.1 只做单章；提供批次进度显示 |
| 实体归并质量 | 同一人物别名识别错误会导致人物卡分裂或合并错误 | 确认节点 3 强制用户核对；`aliases` 列表显式存储且可编辑 |
| schema 漂移 | SKILL.md 生成结果字段不稳定 | LLM 默认输出 JSON draft；prompt 提供完整 JSON 示例；Zod 校验失败后带错误消息重试，最终写盘由 StoryStateStore 转成 YAML frontmatter |
| 风格保留 | 扩写结果风格与原文有偏差 | `StyleProfile.sample_paragraphs` few-shot 注入；用户可手动补充样本段落 |
| 一致性校验误报 | 校验过严导致大量正常提案被标记 | 软校验优先（可调整建议 C）；校验结果为建议，不自动阻止 |
| 角色出戏 | 互动模式中角色行为偏离人物卡 | 人物卡 + 世界观强注入系统提示；每 N 轮对话后重注入 |
| 图片生成成本 | API 按次计费，成本不可控 | 用户手动触发；不自动生成；展示当前 Provider 的估算费用 |
| 互动与正文隔离 | 互动对话内容不应自动写入正文 | `PlaySession` 与编辑 thread 分开存储；写回必须经用户显式确认 |
| source_refs 失效 | 原文被用户修改后，block_id 可能变化 | `source_refs` 仅用于溯源参考，不作为强约束；失效时不报错，仅标记"来源未验证" |
