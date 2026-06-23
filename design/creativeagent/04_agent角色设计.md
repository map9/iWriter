# 小说创作智能体系统：Agent 角色设计

## 0. 关于本文档与实施阶段的关系

本文档描述的是 **目标态架构**——一个 MainAgent 协调若干专职 Sub-agent，同时承载必须贴近对话入口的状态/顾问职责。

> Phase 6 复审调整：StateAgent 与 AdvisorAgent 不再强制拆成独立 sub-agent；它们作为 MainAgent 的职责 lane 实现。WriterAgent 已拆出后，**MainAgent 不再持有正文 block edit 工具**；所有 draft 正文块级写入必须经 WriterAgent。`create_document` 暂时仍保留在 MainAgent 作为章节槽位工具，但它仍能携带正文内容，这是已知风险，后续需要收窄为只建空 stub/章节槽位。

**当前实施阶段（Phase 1）不按本文档的 sub-agent 拆分形态落地**，而是采用单 LLM 实例 + 合并 system prompt 的方式，让一个 agent 同时承担 MainAgent / WriterAgent / StateAgent 三个角色的职责。理由参见 `05_独立双线与共享脚手架设计.md §9.3`「无独立 Orchestrator（当前阶段）」——deepagents 当前没有 sub-agent 编排能力，强行拆分会引入大量额外工程负担，而 system prompt + tool schema + interruptOn HITL 已经足以覆盖 Phase 1 需求。

各 Phase 的实施映射：

| Phase | 实施形态 | 涵盖角色 |
|---|---|---|
| 1 | 单 LLM | MainAgent + WriterAgent + StateAgent 合一 |
| 2 | 单 LLM 拓展工具 | + ConsistencyAgent（通过新工具 + skill 实现，仍为单 LLM） |
| 3 | 单 LLM 拓展工具 | + AdvisorAgent |
| 4A | SubAgent 化 | PlannerAgent / ConsistencyAgent 独立上下文，专项加固逻辑质量 |
| 5+ | SubAgent 编排扩展 | ExplorerAgent / 方向探索 / 语义搜索 / git 分支 |
| 6（复审后） | Main + Writer/Planner/Consistency/Explorer 等 Sub-agent | WriterAgent 独立并独占正文 block edit；State/Advisor 保留在 MainAgent |

下面对各 sub-agent 的角色描述，应理解为 **职责切片**——同一个 LLM 在不同的对话上下文中切换角色，而不是真的存在 6 个独立实例。

---

## 1. 总体架构（目标态）

系统由一个主 Agent（面向作者）和若干专职 Sub-agent 组成。主 Agent 负责理解作者意图、维护状态入口、提供顾问视角并协调工作；Sub-agent 各自专注一个领域，通过 skills 完成具体任务。

```
作者
  ↕ 对话
MainAgent（对话界面 + 路由 + 状态守护 + 顾问 + plan 展示）
  ├─→ State lane        会话启动时：读 diff、更新 StoryBible（Main 内职责）
  ├─→ PlannerAgent      写作前：生成 plan，供作者确认
  ├─→ WriterAgent       执行写作：生成/修改正文 block proposals
  ├─→ ConsistencyAgent  写作后：一致性检查
  ├─→ Advisor lane      作者求助时：创意建议、方向探索（Main 内职责）
  └─→ ExplorerAgent     需要多方向对比时：生成探索草稿
```

每个 sub-agent 只通过 tools 访问文件和数据库，不直接操作文件系统。

---

## 2. MainAgent（主 Agent）

### 职责

- 作者的唯一对话界面
- 理解作者意图，判断路由到哪个 sub-agent
- 负责 plan-first 流程：展示 plan → 等待确认 → 触发执行
- 承担 State lane：会话启动时读取 diff / StoryBible / rebuild signal，必要时维护 StoryBible
- 承担 Advisor lane：作者卡住、求方向，或 plan 前发现更强角度时给出 2-3 个方向
- 管理章节槽位：重命名、重排、创建章节文件
- 对小任务可直接在对话中给建议文本；**任何写入 draft 正文文件的动作都必须经 WriterAgent**

### 解决的问题

作者不需要知道系统内部有多个 agent，只和 MainAgent 对话。MainAgent 决定「这件事该谁做」以及「做之前要不要先说打算」。MainAgent 不直接调用 `edit_block` / `insert_block` / `delete_block` / `replace_range` 修改正文；它只触发 WriterAgent 生成块级提案。

### 工具边界

MainAgent 保留：
- 读工具：StoryBible、章节列表、DocumentTools、搜索、session diff
- StoryBible 写工具：`patch_storybible` / `replace_storybible_section` / `rebuild_storybible` / `compress_storybible_history` / `resolve_open_question`
- Plan-first HITL：`confirm_writing_plan`
- 章节槽位：`rename_chapter` / `reorder_chapters` / `create_document`
- Advisor / exploration metadata / git / writing-style 管理工具
- `task` 触发 sub-agent

MainAgent 不持有：
- `edit_block`
- `insert_block`
- `delete_block`
- `replace_range`

`create_document` 风险：当前共享工具仍接受 `content`，因此 MainAgent 理论上仍可能用它创建带正文的新章。Phase 6 本轮先标记风险、不收窄实现；后续应改为 creative 专用的空章节 stub 工具或 schema 限制。

### 典型触发流程

```
作者说话
  → MainAgent 理解意图
  → 分类：闲聊/问题/写作任务/创意求助/方向探索
  → 如是写作任务：
      先执行 State lane（确保上下文最新）
      再触发 PlannerAgent（生成 plan）
      展示 plan，等待确认
      确认后触发 WriterAgent
      完成后触发 ConsistencyAgent（后台）
  → 如是创意求助：执行 Advisor lane
  → 如是方向探索：触发 ExplorerAgent
```

---

## 3. State lane（状态守护者，Main 内职责）

### 解决的问题

每次会话开始，agent 需要知道"上次之后发生了什么"——作者在没有 agent 的情况下可能直接编辑了文稿，或者上次会话里写的内容还没有更新到 StoryBible。State lane 负责让项目状态保持最新。它贴近 MainAgent 的路由入口，不强制拆成独立 sub-agent。

### 触发时机

- 每次会话启动时（MainAgent 最先调用）
- WriterAgent 完成写作后（增量更新）
- 累积变化超过阈值时（触发全量重建）
- 作者打 git tag（里程碑）时

### 工作流程

```
1. 调用 get_session_diff()，获取文件变化摘要
2. 读取 storybible.md 当前内容
3. 分析变化：
   - 新增内容 → 提取新事实，patch StoryBible
   - 修改内容 → 检查是否影响已有设定，更新
   - 删除内容 → 标记相关设定可能已失效
4. 更新 storybible.md
5. 若为全量重建，重读所有 draft/ 文件，重建 StoryBible
6. 返回变化摘要给 MainAgent（用于沉浸重入场景）
```

### 使用的 Skills

| Skill | 用途 |
|---|---|
| `info_extraction` | 从 prose 和对话中提取新确立的事实 |
| `story_compression` | 将已完成内容压缩为摘要，控制 StoryBible 体积 |
| `contradiction_detection` | 发现新内容与现有 StoryBible 之间的冲突 |

---

## 4. PlannerAgent（写作规划者）

### 解决的问题

写之前先想清楚——不是"作者让我写什么我就写什么"，而是"作者的目标是什么，达成这个目标最好的写法是什么，有哪些选择，我打算怎么做"。

这是 plan-first 机制的执行者。一个好的 plan 能让作者在看到正文之前就做出关键决策，避免"写了又全改"的浪费。

### 触发时机

- 任何涉及新场景或章节的写作任务
- 改写现有内容超过一段
- 涉及已确立设定的修改（人物动机、时间线、世界规则）
- 结构性调整（删除、合并、重排）

### 工作流程

```
1. 读取 StoryBible（当前约束和状态）
2. 读取相关章节内容（搜索或直接读取）
3. 理解作者意图
4. 生成 plan：
   - 我打算怎么写（具体场景/结构/方向）
   - 考量了什么（craft 层面的决策依据）
   - 有哪些备选方向（如果有）
   - 潜在的一致性风险（如果发现）
5. 输出 plan 给 MainAgent 展示给作者
```

### Plan 质量标准

- 具体而非抽象（"A 在办公室里用沉默回应了 B 的质问"，而不是"写一个冲突场景"）
- 说明 craft 层面的理由（为什么选择这个方式）
- 暴露真实的选择点（作者需要决策的地方）
- 不超过作者能轻松阅读的长度

### 使用的 Skills

| Skill | 用途 |
|---|---|
| `scene_structure` | 分析场景需要什么骨架（目标/冲突/结果） |
| `character_arc_planning` | 这场戏在角色弧光中处于什么位置，如何推进 |
| `story_logic` | 情节上前后因果是否通顺 |
| `pacing_sense` | 这个场景在整体节奏中的位置，需要快还是慢 |
| `genre_intelligence` | 类型规范：这类场景读者有什么期待 |
| `foreshadowing_placement` | 是否有机会在此埋下伏笔，或回收已有伏笔 |

---

## 5. WriterAgent（执笔者）

### 解决的问题

在 plan 确认后，真正写出好的正文。"好"的标准：角色有自己的声音、场景有质感、情节有逻辑、风格与整体一致。

WriterAgent 是系统中对 craft 要求最高的 agent，skills 最多，质量直接决定作者体验。Phase 6 后，WriterAgent 也是**唯一正文 block edit 执行者**。

### 触发时机

- PlannerAgent 的 plan 被作者确认后
- 作者明确说"帮我写/续写/改写某段"且 plan 流程已完成
- 小范围直接修订：MainAgent 判断不需要 plan approval 时，也必须通过 WriterAgent 的 quick/direct edit brief 执行

### 工作流程

```
1. 接收已确认的 plan（写什么、怎么写、约束是什么）
2. 从 StoryBible 读取：
   - 相关角色的当前状态和声音特征
   - 叙事视角和时态约束
   - 世界规则约束
   - 风格约束
3. 按需搜索 draft/ 获取相邻场景的上下文（衔接感）
4. 调用相关 writing skills 执行写作
5. 自我检查：写完后先过一遍，明显问题自行修正
6. 用 `edit_block` / `insert_block` / `delete_block` / `replace_range` 生成块级提案，交给 BlockEditReviewSurface 审批
```

### 使用的 Skills

这是 skill 最密集的 agent：

| Skill | 用途 |
|---|---|
| `deep_pov` | 紧贴视角人物，用其感知和语言过滤叙事 |
| `character_voice` | 每个角色的对话和内心有自己的辨识度 |
| `dialogue_craft` | 对话推进冲突、揭示性格，不只是交换信息 |
| `sensory_grounding` | 场景有视觉/听觉/触觉/气味锚点，读者能"在场" |
| `show_vs_tell` | 关键情感时刻用展示，过渡/背景用叙述 |
| `pacing_control` | 通过句长、段落节奏、留白控制阅读体验 |
| `foreshadowing_placement` | 自然植入伏笔，回收已有伏笔 |
| `subtext_craft` | 角色说的不是全部，行为和停顿也在说话 |

### 工具边界

WriterAgent 保留：
- `get_document_outline` / `get_section(s)` / `get_blocks` / `get_block_context` / 文档搜索
- `read_storybible`
- writing-style 只读工具
- `edit_block` / `insert_block` / `delete_block` / `replace_range`

WriterAgent 不持有：
- `create_document`（章节槽位由 MainAgent 管理）
- StoryBible 写工具
- git / exploration metadata / advisor 工具

---

## 6. ConsistencyAgent（一致性守卫）

### 解决的问题

WriterAgent 写得好不好是品质问题，ConsistencyAgent 关心的是：写的内容和已经建立起来的世界是否一致。长篇小说中，一致性问题会随规模累积，越晚发现越难修。

ConsistencyAgent 在 WriterAgent 完成后后台运行，不打断写作流程，但发现问题后及时报告。

### 触发时机

- 每次 WriterAgent 完成写作后，自动触发
- 作者主动要求对某段/某章进行一致性审查

### 工作流程

```
1. 读取刚写完的内容
2. 读取 StoryBible（当前约束和角色状态）
3. 按优先级逐项检查（见 §6.2）
4. 生成 findings，按严重程度分类：
   - 高：必须报告（POV 越界、时间线矛盾、世界规则冲突）
   - 中：建议报告（人物行为偏离、伏笔无回收计划）
   - 低：选择性报告（节奏问题、风格偏移）
5. 将 findings 写入 review_finding 表
6. 通过 MainAgent 向作者报告（高/中问题）
```

### 使用的 Skills

| Skill | 用途 |
|---|---|
| `pov_consistency_check` | 检测视角越界（POV violation） |
| `character_behavior_check` | 角色行为是否符合 StoryBible 中的性格设定 |
| `timeline_check` | 时间线逻辑是否自洽 |
| `world_rules_check` | 是否违反已确立的世界规则 |
| `foreshadowing_audit` | 已埋下的伏笔是否有对应回收计划 |
| `arc_progression_check` | 角色弧光是否在推进，速度是否合理 |
| `style_consistency_check` | 风格/基调是否与整体一致 |

### 报告原则

不追求"把所有问题都找出来"，优先找**影响读者体验的一致性问题**，而非追求完美的 style 统一。低优先级问题积累到一定数量后，可以集中汇报，而非每次都提。

---

## 7. Advisor lane（创作顾问，Main 内职责）

### 解决的问题

作者卡住了、想不清楚、需要创意输入的时候——不是让 agent 替作者决定，而是帮作者**看清楚自己的选择**。

Advisor lane 有创作直觉：能从一个点延伸出多个方向，能发现作者没注意到的主题机会，能提出"如果这样会怎样"的问题。它保留在 MainAgent 内，因为其输出通常需要立即进入主对话并影响 plan 流程。

### 触发时机

**被动触发（作者主动求助）**：
- 作者问"接下来怎么写"、"这里我没思路"
- 作者问"这段有什么问题"（偏创意层，不是一致性层）
- 作者想讨论人物或情节的可能性
- 作者明确说"给我一些想法"

**主动渗透机制**（作者给出了写作方向，但 agent 发现更好的角度）：

当作者给出明确写作方向并进入 plan 阶段时，agent 在生成 plan 之前做一次内部"扩展可能性"检查：
- 当前方向之外是否有被忽略的主题机会？
- 已确立的人物设定中是否有未被充分利用的心理维度？
- 当前情节逻辑是否有更尖锐的冲突形式，而不只是作者描述的那种？

如果发现更好的角度，**在 plan 中夹带一个 "Alternative angle worth considering" 小节**（不超过 2-3 句，每条一个方向），作者可接受可忽略，不强制走探索流程，不阻塞写作。

这条机制解决"用户给思路 agent 只在框架内打转"的问题——不等作者说"我没思路"才激活创意能力，而是在正常写作流程中保持顾问视角。

### 与 PlannerAgent 的区别

| | PlannerAgent | Advisor lane |
|---|---|---|
| 时机 | 已确定要写什么，规划怎么写 | 还没确定要写什么，探索可能性 |
| 输出 | 一个具体的执行 plan | 多个方向/想法/问题 |
| 态度 | 倾向于给出最优解 | 倾向于展开可能性，不急于收敛 |

### 工作流程

```
1. 读取 StoryBible（项目全貌）
2. 读取相关上下文（当前章节/作者的问题）
3. 分析：
   - 作者真正的困惑/需求是什么
   - 当前故事状态有哪些创作机会
   - 已确立的设定中有哪些未被充分利用的元素
4. 生成回应：
   - 如果是方向问题：给出 2-3 个有差异的方向，说明各自的代价和收益
   - 如果是技法问题：用作者能理解的语言解释，不用术语
   - 如果是卡住了：先提问题（"你更想让读者在这里感受到什么"）再给建议
5. 不替作者做决定，始终把选择权还给作者
```

### 角色深度建立机制

**问题背景**：原设计的 `character_potential` skill 触发时机是"作者感觉人物平面时"——这是事后补救。角色深度问题根源在建立期：如果角色首次进入 StoryBible 时只记录"职业 + 性格 + 关系"，后续再有多好的 skill 都是在浅基础上优化。

**新机制**：角色首次进入 StoryBible（即通过 `patch_storybible` 在 `## 角色` section 新增条目时），agent 必须触发 "depth pass"：
1. 读取 `character-complexity` skill
2. 为该角色产出**心理三角**：核心欲望（表层目标背后真正驱动行为的东西）/ 核心恐惧（他最不能承受的失去）/ 虚假信念（他对世界或自己的一个错误认知，这是弧光的根基）
3. 这三项作为正式条目写入 StoryBible，而不是"性格：内向、骄傲"这类标签

**不需要新工具**：靠 system prompt 的规则约定在"首次创建角色 section"场景下触发此机制。

### 使用的 Skills

已落地（Phase 1-2 中已建）：
| Skill | 用途 |
|---|---|
| `character-complexity` | 角色心理三角（欲望/恐惧/虚假信念），首次建角色时必读 |
| `brainstorm-quality` | 开放性创意生成时的质量基线，避开第一直觉 |
| `conflict-design` | 设计能揭示角色真实性的冲突 |
| `thematic-depth` | 识别正在发展的主题，判断整体形状的转折点 |
| `story-logic` | 情节因果连贯性 |

Phase 3 新建（仍缺失）：
| Skill | 用途 |
|---|---|
| `plot-extrapolation` | 从当前状态延伸出有意义的后续可能（主动渗透和被动求助均用） |
| `structural-diagnosis` | 识别整体结构问题（松弛的中段、力量不足的开头、节奏失衡）|
| `character-potential` | 发现角色设定中未被探索的维度和关系动态（事后补救模式）|

---

## 8. ExplorerAgent（方向探索者）

### 解决的问题

作者面临关键方向选择（悲剧还是治愈？反转还是直线推进？），凭推断很难做决定，需要"看到"两条路分别是什么样子，才能做出真正属于自己的选择。

ExplorerAgent 不是多写几个版本那么简单，它需要让每个探索方向都**真实可信**，而不是只是表面不同的变体。

### 触发时机

- 作者明确说"我想看看两种走向"
- 作者在多个选项之间摇摆，Advisor lane 建议探索时
- 高风险结构调整（改结局、调整人物弧光方向）前的预探索

### 工作流程

```
1. 接收探索参数：
   - 分叉点（从哪里开始分叉）
   - 探索方向（2-3 个，不宜更多）
   - 深度（探索多少内容，通常是 1-2 个场景的量）
2. 为每个方向触发探索写作流程（可内部参考 Planner/Writer 的技法，但写入临时探索空间）
3. 每个方向的写作在临时空间进行，不写入正式文稿
4. 生成对比报告：
   - 每个方向的核心特征
   - 对后续故事的影响（作者需要承担什么代价）
   - agent 的观察（不是"哪个更好"，而是"两者的区别在哪里"）
5. 作者选定方向后：
   - MainAgent 读取选定探索稿，把它作为 source context 交给 WriterAgent
   - WriterAgent 将选定方向转换为正式文稿的块级提案
   - 其余探索内容归档，不删除（供将来参考）
```

### 关键约束

- 探索内容不自动写入正式文稿，必须经过作者主动选择
- 探索方向不超过 3 个（防止决策疲劳）
- agent 不评判哪个方向"更好"，只描述差异

### 使用的 Skills

ExplorerAgent 本身是编排层，不直接写作。它调用：
- PlannerAgent（每个方向各生成一次 plan）
- WriterAgent（每个方向各执行一次写作）

附加 skill：

| Skill | 用途 |
|---|---|
| `branch_comparison` | 对比多个探索方向的结构、情感、后续影响 |

---

## 9. Skills 完整目录

### 9.1 写作技法 Skills（WriterAgent 使用）

| Skill | 解决的问题 | 核心能力 |
|---|---|---|
| `deep_pov` | 视角不稳定，叙事游离在角色外 | 用视角人物的感知、语言、假设过滤所有叙事 |
| `character_voice` | 所有角色说话一个味道 | 为每个角色建立独特的词汇、节奏、潜台词模式 |
| `dialogue_craft` | 对话只在交换信息，没有冲突和性格 | 对话推进冲突、揭示性格、有言外之意 |
| `sensory_grounding` | 场景抽象，读者无法"在场" | 视觉/听觉/触觉/气味/味觉锚点 |
| `show_vs_tell` | 关键时刻只是叙述，缺乏感染力 | 判断何时展示何时叙述，恰当切换 |
| `pacing_control` | 节奏平均，没有张弛 | 通过句长、段落、留白、时间压缩/扩展控制节奏 |
| `subtext_craft` | 角色把所有想法都说出来，没有层次 | 通过行为、沉默、转移话题传递未说出的内容 |
| `foreshadowing_placement` | 伏笔突兀或没有伏笔 | 自然植入伏笔，与叙事融为一体 |

### 9.2 规划技法 Skills（PlannerAgent 使用）

| Skill | 解决的问题 | 核心能力 |
|---|---|---|
| `scene_structure` | 场景没有内在结构，读完没有推进感 | 分析和设计 目标→冲突→结果/决定 骨架 |
| `character_arc_planning` | 场景孤立，不知道它在角色成长中的位置 | 判断场景在弧光中的位置，推进方式 |
| `story_logic` | 情节前后因果不通顺 | 检查事件的因果链，识别逻辑缺口 |
| `pacing_sense` | 不知道这个场景该快还是该慢 | 在整体节奏地图中定位当前场景，建议节奏策略 |
| `genre_intelligence` | 不了解类型规范，读者期待未被满足 | 内置各类型的核心约定，知道如何满足或颠覆 |

### 9.3 一致性检查 Skills（ConsistencyAgent 使用）

| Skill | 解决的问题 | 核心能力 |
|---|---|---|
| `pov_consistency_check` | 视角越界但作者没发现 | 检测非视角人物内心的直接呈现 |
| `character_behavior_check` | 角色行为与设定不符 | 对照 StoryBible 检查行为、反应、动机 |
| `timeline_check` | 时间逻辑矛盾 | 维护时间线，检测时序错误 |
| `world_rules_check` | 世界规则被违反 | 对照已确立规则检查每个涉及世界设定的描述 |
| `foreshadowing_audit` | 伏笔有始无终 | 追踪所有已埋伏笔及其回收状态 |
| `arc_progression_check` | 角色成长过快/过慢/方向偏移 | 追踪弧光推进节奏，发现偏离 |
| `style_consistency_check` | 风格/基调在章节间漂移 | 对比 StoryBible 中的风格约束 |

### 9.4 创意顾问 Skills（Advisor lane 使用）

| Skill | 解决的问题 | 核心能力 |
|---|---|---|
| `plot_extrapolation` | 作者卡住，不知道接下来写什么 | 从当前状态延伸出有意义的多条路径 |
| `theme_recognition` | 主题模糊，故事缺乏共鸣 | 识别正在发展的主题，建议如何强化 |
| `structural_diagnosis` | 整体结构有问题但不知道哪里 | 识别松弛段、力量不足的高潮、节奏失衡 |
| `character_potential` | 人物感觉平面、没有惊喜 | 发现角色设定中未被探索的维度和关系张力 |
| `conflict_design` | 冲突流于表面，没有触及人物核心 | 设计能暴露角色真实性的冲突形式 |

### 9.5 状态管理 Skills（State lane 使用）

| Skill | 解决的问题 | 核心能力 |
|---|---|---|
| `info_extraction` | StoryBible 跟不上写作进展 | 从 prose 和对话中提取新确立的事实 |
| `story_compression` | StoryBible 体积随小说膨胀 | 将已完成内容压缩为精简摘要，保留关键信息 |
| `contradiction_detection` | 新旧设定之间出现矛盾 | 对比新内容与现有 StoryBible，发现冲突 |

---

## 10. 典型工作流程（端到端示例）

**场景：作者说"帮我写第三章，A 和 B 的第一次正面冲突"**

```
MainAgent：收到意图，判断为写作任务，路由前先更新状态
  ↓
State lane：
  - 读 diff（上次会话后作者修改了第二章末尾）
  - 更新 StoryBible（B 的某个细节有新信息）
  ↓
MainAgent：状态已更新，触发规划
  ↓
PlannerAgent：
  - 读 StoryBible：A 是压抑的骄傲者，B 掌握 A 不知道的信息
  - 分析：这场冲突对 A 的弧光意义是什么
  - 调用 scene_structure：这应该是 action scene，A 有目标→遭遇阻碍→失败
  - 调用 pacing_sense：这章之前节奏偏慢，这场戏需要有张力
  - 生成 plan：
      "我打算这样写：A 主动质问 B，但 B 用 A 不知道的信息反将一军。
       A 保持表面冷静，但内心动摇了。场景在封闭空间，节奏快，
       对话短句为主。这是 A 第一次感受到自己并非全知。
       备选：如果你希望 A 在这里彻底爆发，场景会更戏剧化但会提前消耗情绪资本。
       继续这个方向吗？"
  ↓
MainAgent：展示 plan 给作者，等待确认
  ↓
作者：确认，用原方向
  ↓
WriterAgent：
  - 读 StoryBible 中 A 的声音特征："语气简洁，少用形容词，倾向反问"
  - 读上一场景末尾（衔接感）
  - 调用 deep_pov（紧贴 A 的视角）
  - 调用 character_voice（A 和 B 各自的说话方式）
  - 调用 dialogue_craft（对话要有潜台词）
  - 调用 pacing_control（短句，张力）
  - 生成正文 block proposals，等待作者在 BlockEditReviewSurface 审批
  ↓
MainAgent：审批通过后继续协调后续检查
  ↓
ConsistencyAgent（后台）：
  - 调用 pov_consistency_check：有无视角越界 → 通过
  - 调用 character_behavior_check：A 的反应和已确立性格是否一致 → 发现一处 A 的内心描写
    稍微外露，与"压抑的骄傲者"设定略有偏离
  - 调用 foreshadowing_audit：B 的信息优势可以作为第五章的伏笔 → 建议记录
  - 生成 findings，通过 MainAgent 告知作者：
      "A 有一处内心描写稍微直白，可以考虑更含蓄。另外 B 此处的信息优势
       如果后面有呼应会更好，要不要记下来？"
  ↓
State lane（后台）：
  - 提取新事实：A 和 B 的关系状态更新、B 的信息优势已确立
  - Patch StoryBible
```

---

## 11. 实施优先级

不需要所有 agent 和 skills 同时落地。建议按以下顺序实施：

**Phase 1：核心写作闭环（单 LLM 实施）**

由 **一个 deepagents 实例** 承担下列三个角色，通过合并的 system prompt + 完整工具集实现职责切换。具体落地参见 `Phase 1.md`。

- MainAgent 角色：路由 + plan 展示（plan 通过 `confirm_writing_plan` 工具 + interruptOn 体现）
- WriterAgent 角色：执行写作（`write_to_chapter` 工具）+ 核心 skills（`deep_pov` / `character_voice` / `scene_structure`）
- StateAgent 角色：会话启动时调用 `get_session_diff` + `read_storybible`，必要时 `patch_storybible` 更新

**Phase 2：规划与一致性**
- PlannerAgent 完整版
- ConsistencyAgent + 高优先级 skills（`pov_consistency_check` / `character_behavior_check`）
- WriterAgent 补充 skills（`dialogue_craft` / `pacing_control`）

**Phase 3：创意顾问**
- Advisor lane 完整版
- `plot_extrapolation` / `theme_recognition` / `structural_diagnosis`

**Phase 4A：逻辑质量加固 / SubAgent 化**
- PlannerAgent 独立 sub-agent：写作前推导角色心理、因果链、常识约束
- ConsistencyAgent 独立 sub-agent：写作后独立检查一致性与常识问题
- WriterAgent 仍由主 agent 承担，沿用 plan-first / write_to_chapter HITL 链路

**Phase 5：方向探索**
- ExplorerAgent
- State lane 全量重建机制完善

**Phase 6：Writer 独立与工具边界收敛**
- WriterAgent 拆为独立 sub-agent，并独占正文 block edit 工具
- MainAgent 移除 `edit_block` / `insert_block` / `delete_block` / `replace_range`
- `promote_exploration` 不再直接写入 `draft/`；选定探索方向后交给 WriterAgent 生成块级提案
- State lane / Advisor lane 保留在 MainAgent 内，避免无收益的额外往返
- `create_document` 暂留 MainAgent 作为章节槽位工具，但标记为待收窄风险

**持续**：每个 phase 内，skills 可以随时增补——增加一个 skill，对应维度的质量就提升一个层次，不影响整体架构。
