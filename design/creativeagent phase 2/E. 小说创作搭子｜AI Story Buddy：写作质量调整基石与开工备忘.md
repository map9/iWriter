# E. 写作质量调整：基石与开工备忘

> 用途：这是**下一次开工的依据**，写给下一次接手的我自己看。读完这一篇 + 底部「参考文档」即可上手，不必重跑前面的分析和实验。
> 背景一句话：iWriter 创作 agent 的正文"文字不能看"，经一系列受控实验定位到病因、定下调整原则；本篇是结论 + 下一步计划。
> 语气自律：上一轮我两次因为**过度自信、过度铺陈**被纠正。本篇及后续，结论要带证据、话别说满、别堆细分原则。

---

## 一、三条基石原则（最终版，后续所有调整以此为准）

**原则一 · 精简指令、高自由、多给可能性提示、流程清晰。**
把写给 llm 的文字分三类，区别对待：
- **约束/规则**（"每句要有功能""反义腔≤2次"这类可数戒律）→ **砍**。它逼 llm 对齐达标，写出拘谨的字。
- **可能性提示**（"开篇可制造悬念或冲突""善用对话、画面感、章末钩子"）→ **保留并作为主体**，开思路不锁死。形态参考 **D1 / D2** 里 StoryForge 的写作 prompt：短、具体、是"提示"不是"戒律"。
- **流程指令**（brief 怎么读、产物怎么交付、边界红线）→ **保留并明确细化**。流程越清楚越好，它不碰创作、不伤文笔。

**原则二 · 上下文装配交给子 agent，按流程每步严格定义 I/O。**
- 每一步明确定义：读什么、产出什么、按什么顺序。目标是"该拿到的正好拿到"，**不是"越少越好"**。
- 装配用 **tools** 做成可复用取数动作（对标 StoryForge `assembleContext`：按需取、分层、给摘要），省 token、避免 bulk-read 原文。

**原则三 · 小说对象文本只写内容，严禁指令。**
- 创意 / 提纲 / 节拍 / 细纲这些**对象文本**里只写"是什么、发生什么、谁想要什么、结果如何"；**绝不写"怎么写、强调什么、不要写什么"**。
- 因为 llm 会把对象文本里的指令**当命令去对齐**。反面教材：现有 `outline/ch001-outline.md` 里的"不做特写强调""无人核对、无人追踪"就是混进去的指令。这类"怎么写"的意图要么不写，要么挪到写作提示/评审里。
- 一句话：**对象文本是"世界的事实"，不是"给 llm 的工单"。**

> 三条关系：原则三保证喂进去的是干净事实；原则二保证每步把对的事实按对的顺序装好；原则一保证写手拿到后有自由把它写活。

---

## 二、下一步节奏（两步走，优化全部放第二步）

**第一步 · 梳理流程 + 每一步 I/O（本步不做任何优化，只画清楚）**
- 列出完整写作流程每一步：创意 → 设定/世界观 → 人物 → 大纲 → 细纲/节拍 → 正文 → 评审（→ finalize）。
- 每一步定义四项：**输入**（读哪些上下文/依赖哪些对象）、**输出**（产出哪个对象/文本）、**执行者**（main agent / 哪个子 agent）、**顺序与依赖**。
- 明确「上下文装配子 agent」在每步装配什么、按什么顺序（落实原则二）。
- 产物：一张流程 + I/O 表（或图）。

**第二步 · 重写每一个 prompt 和 skill（优化都在这一步）**
- 按**原则一**重写每个 prompt/skill：砍约束规则 → 强化"可能性提示"（形态抄 D1/D2 的 StoryForge 短提示）→ 明确细化流程指令。
- 按**原则三**清洗对象文本模板：生成创意/提纲/节拍的 prompt，产出必须是"事实内容"、零指令。
- **优化（全在此步）**：`先少后多` + **单变量对比测试**（同模型 deepseek-v4-pro）；给上下文装配加 tools 省 token；逐个 prompt/skill A/B。

---

## 三、现状 / 已做的改动

- **writer 已精简**：`electron/ai/builtin-subagents/creative/writer/agent.md` 已卸载 craft 技能——`skills` 从 `["common","creative/common","creative/reference","creative/writer"]` 改为 `["common","creative/reference"]`，正文里删了"Skills you reach for / restraint cutting test / prose-craft 调用"。保留了 `common`(document-block-tools) 和 `creative/reference`(schema+context-discipline)。（用户/linter 又微调删了"lived-in material"段和"exemplar voice"红线，属有意，不要回退。）
- **reviewer 未动**，作为对照基线。
- `restraint` / `prose-craft-by-example` 等技能**文件仍在**，只是写手不挂载（reviewer/主 agent 兜底仍用）。

---

## 四、关键结论与"已证伪"（供理解 why，别再走回头路）

- **已确认**：正文"文字不能看"的病因是 **craft 技能过载**（`prose-craft-by-example` 一路 push toward more + `restraint` 点名"不是X是Y"反而激活它）。卸载后即好。
- **已证伪（我中途的两个错判，别再犯）**：
  1. "上下文颗粒度/生料 dump 伤文笔" —— **假的**。三臂实验（蒸馏 / 超细大纲 / 20k token 生料全灌）在同模型 + 短 prompt 下**全部 3~4 tic、都能看**；唯一 14 tic 不能看的是挂了技能的重装 agent。→ **不要为文字质量去砍上下文/大纲。写手自装配生料没问题。**
  2. "网文逻辑没深度" —— 我曾用它挡掉用户"无约束文字更好"的证据，是换轴回避。约束过载确实伤文笔，用户直觉对。
- **StoryForge 的可借纪律**（非架构）：不信模型输出格式，把 schema/校验钉在**写回层**（它全程不用 response_format，靠 FIELD_REGISTRY/adopt 兜底，因此换任意模型都稳）。正文留 markdown；结构化数据靠 host 确定性校验。（这条不在本次两步范围内，记着备用。）
- **残留差距**：iWriter(精简) 与 StoryForge 那点"没那么沉静成熟"是 **register/打法差**（第一人称热开场 vs 第三人称冷开场），是小事，非"不能看"的病。

---

## 五、未来的我必须记住的

1. **别往写手加创作理论/规则/技能**（病因就是它）。
2. **别为文字质量动上下文/大纲颗粒度**（已证伪，纯浪费）。
3. **对象文本=事实，非工单**（原则三）；看到细纲里"怎么写"的指令就是要清掉的东西。
4. **关键判断先做单变量对比测试**（同模型、改一个变量），别凭理论/印象拍板；`先少后多`。
5. **语气克制**：结论带证据、别说满、别堆细分原则（被纠正两次）。
6. **两个 D 都是 prompt 参考**：D1=正向链调用+prompt，D2=下游/审校调用+prompt，都是"短提示"范本来源。

---

## 六、参考文档（同目录 design/creativeagent phase 2/）

- `D. …Storyforge 分析.md` —— StoryForge 总览（编排靠固化UI、AI单发worker、软硬分界、四层记忆）。
- `D1. …StoryForge LLM 调用与 Prompt 清单.md` —— **正向创作链**每次 LLM 调用的 prompt 原文 + 上下文装配（写作提示形态的主要参考）。
- `D2. …StoryForge LLM 调用清单（下游·审校·辅助）.md` —— **下游/提取/审校**调用的 prompt。
- `D3. …StoryForge 数据表与字段清单.md` —— 42 张表的字段（做对象模型/对象文本时对照）。
- `04.3 …Agent+Skills 详细设计.md` / `04.5 …创作流程与阶段门槛 详细设计.md` —— 本工程既有设计（第一步梳理流程时对照）。

---

## 七、测试 / 复现资产

- **小说测试项目**：`/Users/sunyafu/Desktop/私人笔记_副本/new01/`（project.md=科幻悬疑《1987》，第一人称，中篇~4000字/章）。
- **实验产出**：`new01/test/` 下 `ch001-EXP-A-distilled.md`(蒸馏)、`-EXP-B-detailed.md`(超细大纲)、`-EXP-C-rawdump.md`(生料全灌)；对照有 `ch001-human-01.md`(人类)、`test.md`(StoryForge)、`ch001-deepseek/openai-*`(iWriter 重装 agent 旧版)、`../manuscript/ch001.md`(iWriter 精简 agent)。
- **实验脚本**：`scratchpad/run_test.py`（读 env key → 两/三臂调用 deepseek → 存文件 + 数反义腔）。
- **API**：key 在 `/Users/sunyafu/zebra/iWriter/.env` 的 `DEEPSEEK_API_KEY`；endpoint `https://api.deepseek.com/chat/completions`；model **`deepseek-v4-pro`**；temperature 1.3。
- **质量代理指标**：反义腔计数 `grep -oE "不是[^。！？\n]{0,20}(——是|，是|，而是|。是)"`（越低越干净；人类/StoryForge=0，精简/实验臂=3~4，重装 agent=14~26）。仅作快速信号，最终仍要读原文判。

---

*建立日期：2026-07-22。下一次开工从「第一步：梳理流程 + I/O」起。*
